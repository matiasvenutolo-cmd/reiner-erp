/**
 * Gestión de Compras (Fase 3.2) — el circuito que pidió el cliente para Lucio:
 *
 *   necesidad (de una OT, o compra general) → cotizaciones → se elige una →
 *   compra prevista (programada) → confirmada al proveedor → recibida → pagada
 *
 * Reglas que vienen del cliente y no se inventan acá:
 * - Varias cotizaciones por compra para comparar; la elige Compras a mano, el
 *   sistema no adjudica solo (ni por precio ni por plazo).
 * - Sólo la elegida cuenta como compra prevista: las alternativas no se suman
 *   a los gastos futuros.
 * - Un gasto es efectuado cuando se paga (no al cotizar, confirmar, recibir ni
 *   facturar). Por eso los pagos se registran aparte.
 * - Cada fecha es un concepto distinto: necesidad del material, compra
 *   prevista, confirmación, entrega prevista (confirmación + plazo cotizado),
 *   recepción y pago.
 *
 * Una necesidad de OT no copia los datos de la orden: cuelga de la OT de pieza.
 * Al confirmarla se crea su pedido en Stock → Compras y la llegada se sigue
 * registrando como siempre (cierra el paso de Compras o suma al almacén).
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, max, min, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  solicitudCompra,
  cotizacionCompra,
  pagoCompra,
  recepcionCompra,
  pedidoCompra,
  proveedor,
  otPieza,
  otConjunto,
  otMaquina,
  pieza,
  movimientoStock,
  asignacionTrabajo,
  necesidadCompraOrden,
  conjunto,
} from "@/lib/db/schema";
import type { SolicitudCompra, CotizacionCompra, PagoCompra } from "@/lib/db/schema";
import { getPiezasCompraPendientes, type ItemCompraPendiente } from "./produccion";
import { registrarLlegadaPedido } from "./compras";
import { getEstadoYOperacionActual } from "./ot";
import { getTipoCambioOficial, type MonedaExtranjera } from "@/lib/tipo-cambio";
import { fechaISO, hoyISO, sumarDias, diasEntre } from "@/lib/fecha";

export type Moneda = "ARS" | "USD" | "EUR";
export const MONEDAS: Moneda[] = ["ARS", "USD", "EUR"];

// ── Importes ──────────────────────────────────────────────────────────────

export type Importe = {
  moneda: Moneda;
  total: number;
  /** El mismo importe en la otra moneda, con el tipo de cambio guardado en la cotización. */
  equivalente: { moneda: Moneda; total: number } | null;
  /** Total en pesos (el original si es en pesos) — para sumar compras en distintas monedas. */
  enPesos: number | null;
};

const redondear = (n: number) => Math.round(n * 100) / 100;

export function importeDeCotizacion(c: CotizacionCompra): Importe {
  const total = redondear(c.cantidad * c.precioUnitario);
  if (!c.tipoCambio || !c.tipoCambioMoneda) return { moneda: c.moneda, total, equivalente: null, enPesos: c.moneda === "ARS" ? total : null };
  if (c.moneda === "ARS") {
    return { moneda: "ARS", total, equivalente: { moneda: c.tipoCambioMoneda, total: redondear(total / c.tipoCambio) }, enPesos: total };
  }
  const enPesos = redondear(total * c.tipoCambio);
  return { moneda: c.moneda, total, equivalente: { moneda: "ARS", total: enPesos }, enPesos };
}

/** Un importe parcial (ej. el saldo) en pesos, con el tipo de cambio de la cotización elegida. */
function aPesos(valor: number, c: CotizacionCompra): number | null {
  if (c.moneda === "ARS") return valor;
  return c.tipoCambio ? redondear(valor * c.tipoCambio) : null;
}

// ── Estado de una solicitud ──────────────────────────────────────────────

export type EstadoSolicitud = "anulada" | "sin_cotizar" | "cotizando" | "a_confirmar" | "en_camino" | "recibida";

export const ESTADO_LABEL: Record<EstadoSolicitud, string> = {
  anulada: "Anulada",
  sin_cotizar: "Sin cotizaciones",
  cotizando: "Para elegir cotización",
  a_confirmar: "Para confirmar al proveedor",
  en_camino: "Esperando entrega",
  recibida: "Recibida",
};

export type OrigenOt = {
  otPiezaId: string;
  otPiezaCodigo: string;
  piezaCodigo: string;
  piezaNombre: string;
  piezaTipo: "fabricada" | "comprada";
  material: string | null;
  otMaquinaCodigo: string;
  referencia: string;
};

export type CotizacionConProveedor = CotizacionCompra & { proveedorNombre: string; importe: Importe };

export type Entrega = { fecha: string; resultado: "ok" | "no_ok"; observacion: string | null };

export type SolicitudDetalle = SolicitudCompra & {
  estado: EstadoSolicitud;
  ot: OrigenOt | null;
  cotizaciones: CotizacionConProveedor[];
  elegida: CotizacionConProveedor | null;
  pagos: PagoCompra[];
  pagado: number;
  saldo: number | null;
  entregas: Entrega[];
  /** Fecha de la entrega OK (la que da la compra por recibida). */
  fechaRecepcion: string | null;
  /** Confirmación + plazo de entrega de la cotización elegida. */
  entregaPrevista: string | null;
  /** Primera operación de esa OT de pieza que Producción ya planificó — referencia para la fecha de necesidad. */
  primeraPlanificada: string | null;
};

function estadoDe(s: SolicitudCompra, cantCotizaciones: number, recibida: boolean): EstadoSolicitud {
  if (s.anuladaAt) return "anulada";
  if (recibida) return "recibida";
  if (s.confirmadaAt) return "en_camino";
  if (s.cotizacionElegidaId) return "a_confirmar";
  return cantCotizaciones > 0 ? "cotizando" : "sin_cotizar";
}

/** Todas las solicitudes (o una), con lo necesario para la bandeja, la ficha y los gastos — en pocas consultas. */
export async function listarSolicitudes(soloId?: string): Promise<SolicitudDetalle[]> {
  const solicitudes = await db
    .select()
    .from(solicitudCompra)
    .where(soloId ? eq(solicitudCompra.id, soloId) : undefined)
    .orderBy(desc(solicitudCompra.numero));
  if (solicitudes.length === 0) return [];
  const ids = solicitudes.map((s) => s.id);
  const otPiezaIds = solicitudes.map((s) => s.otPiezaId).filter((x): x is string => !!x);
  const pedidoIds = solicitudes.map((s) => s.pedidoCompraId).filter((x): x is string => !!x);

  const [cotizaciones, pagos, recepciones, origenes, pedidos, llegadas, planificadas] = await Promise.all([
    db
      .select({ c: cotizacionCompra, proveedorNombre: proveedor.razonSocial })
      .from(cotizacionCompra)
      .innerJoin(proveedor, eq(proveedor.id, cotizacionCompra.proveedorId))
      .where(inArray(cotizacionCompra.solicitudId, ids))
      .orderBy(asc(cotizacionCompra.createdAt)),
    db.select().from(pagoCompra).where(inArray(pagoCompra.solicitudId, ids)).orderBy(asc(pagoCompra.fecha)),
    db.select().from(recepcionCompra).where(inArray(recepcionCompra.solicitudId, ids)).orderBy(asc(recepcionCompra.fecha)),
    otPiezaIds.length
      ? db
          .select({
            otPiezaId: otPieza.id,
            otPiezaCodigo: otPieza.codigo,
            piezaCodigo: pieza.codigo,
            piezaNombre: pieza.nombre,
            piezaTipo: pieza.tipo,
            material: sql<string | null>`coalesce(${otPieza.material}, ${pieza.material})`,
            otMaquinaCodigo: otMaquina.codigo,
            referencia: otMaquina.numeroSerie,
          })
          .from(otPieza)
          .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
          .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
          .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
          .where(inArray(otPieza.id, otPiezaIds))
      : Promise.resolve([] as OrigenOt[]),
    pedidoIds.length ? db.select().from(pedidoCompra).where(inArray(pedidoCompra.id, pedidoIds)) : Promise.resolve([]),
    // Llegadas registradas de esos pedidos (OK y NO OK): son movimientos de ingreso de la OT de pieza con control.
    otPiezaIds.length
      ? db
          .select({ otPiezaId: movimientoStock.otPiezaId, fecha: movimientoStock.fecha, resultado: movimientoStock.controlResultado, observacion: movimientoStock.observacion })
          .from(movimientoStock)
          .where(
            and(
              inArray(movimientoStock.otPiezaId, otPiezaIds),
              eq(movimientoStock.tipo, "ingreso"),
              isNotNull(movimientoStock.controlResultado),
              sql`(${movimientoStock.observacion} like 'Compra recibida%' or ${movimientoStock.observacion} like 'Material recibido%')`,
            ),
          )
          .orderBy(asc(movimientoStock.fecha))
      : Promise.resolve([]),
    otPiezaIds.length
      ? db
          .select({ otPiezaId: asignacionTrabajo.otPiezaId, fecha: min(asignacionTrabajo.fecha) })
          .from(asignacionTrabajo)
          .where(inArray(asignacionTrabajo.otPiezaId, otPiezaIds))
          .groupBy(asignacionTrabajo.otPiezaId)
      : Promise.resolve([]),
  ]);

  return solicitudes.map((s) => {
    const cots: CotizacionConProveedor[] = cotizaciones
      .filter((c) => c.c.solicitudId === s.id)
      .map((c) => ({ ...c.c, proveedorNombre: c.proveedorNombre, importe: importeDeCotizacion(c.c) }));
    const elegida = cots.find((c) => c.id === s.cotizacionElegidaId) ?? null;
    const pagosDe = pagos.filter((p) => p.solicitudId === s.id);
    const pagado = redondear(pagosDe.reduce((t, p) => t + p.importe, 0));
    const pedido = pedidos.find((p) => p.id === s.pedidoCompraId);

    let entregas: Entrega[];
    let fechaRecepcion: string | null;
    if (s.origen === "orden_trabajo") {
      // Sólo las llegadas posteriores a la confirmación de esta compra.
      entregas = s.confirmadaAt
        ? llegadas
            .filter((l) => l.otPiezaId === s.otPiezaId && fechaISO(l.fecha) >= fechaISO(s.confirmadaAt!))
            .map((l) => ({ fecha: fechaISO(l.fecha), resultado: l.resultado!, observacion: l.observacion }))
        : [];
      fechaRecepcion = pedido?.recibidoAt ? fechaISO(pedido.recibidoAt) : null;
    } else {
      entregas = recepciones.filter((r) => r.solicitudId === s.id).map((r) => ({ fecha: r.fecha, resultado: r.resultado, observacion: r.observacion }));
      fechaRecepcion = entregas.find((e) => e.resultado === "ok")?.fecha ?? null;
    }

    const confirmada = s.confirmadaAt ? fechaISO(s.confirmadaAt) : null;
    return {
      ...s,
      estado: estadoDe(s, cots.length, fechaRecepcion !== null),
      ot: origenes.find((o) => o.otPiezaId === s.otPiezaId) ?? null,
      cotizaciones: cots,
      elegida,
      pagos: pagosDe,
      pagado,
      saldo: elegida ? redondear(elegida.importe.total - pagado) : null,
      entregas,
      fechaRecepcion,
      entregaPrevista: elegida?.tiempoEntregaDias != null && confirmada ? sumarDias(confirmada, elegida.tiempoEntregaDias) : null,
      primeraPlanificada: planificadas.find((p) => p.otPiezaId === s.otPiezaId)?.fecha ?? null,
    };
  });
}

export async function getSolicitud(id: string): Promise<SolicitudDetalle | null> {
  return (await listarSolicitudes(id))[0] ?? null;
}

async function exigirSolicitud(id: string): Promise<SolicitudDetalle> {
  const s = await getSolicitud(id);
  if (!s) throw new Error("Esa compra no existe.");
  if (s.estado === "anulada") throw new Error("Esa compra está anulada.");
  return s;
}

async function siguienteNumero(): Promise<number> {
  const [fila] = await db.select({ n: max(solicitudCompra.numero) }).from(solicitudCompra);
  return (fila?.n ?? 0) + 1;
}

// ── Necesidades que llegan de Producción ─────────────────────────────────

export type NecesidadProduccion = ItemCompraPendiente & {
  primeraPlanificada: string | null;
  /** Necesidad que dejó una orden confirmada desde el asistente: qué comprar, ya redactado. */
  descripcion?: string;
  observacion?: string | null;
  esMaterial?: boolean;
};

/**
 * Lo que las órdenes de trabajo necesitan comprar y todavía no tomó Compras:
 * piezas de compra que el stock no cubre y material de piezas cuyo paso actual
 * es Compras (la misma lista que Stock → Compras). Se excluye lo que ya tiene
 * una solicitud abierta o un pedido sin recibir hecho desde Stock.
 */
export async function getNecesidadesProduccion(): Promise<NecesidadProduccion[]> {
  const [pendientes, conSolicitud, conPedido, deOrden, recibidas] = await Promise.all([
    getPiezasCompraPendientes(),
    db.select({ otPiezaId: solicitudCompra.otPiezaId }).from(solicitudCompra).where(and(isNotNull(solicitudCompra.otPiezaId), isNull(solicitudCompra.anuladaAt))),
    db.select({ otPiezaId: pedidoCompra.otPiezaId }).from(pedidoCompra).where(isNull(pedidoCompra.recibidoAt)),
    getNecesidadesDeOrden(),
    db.select({ otPiezaId: pedidoCompra.otPiezaId }).from(pedidoCompra).where(isNotNull(pedidoCompra.recibidoAt)),
  ]);
  const tomadas = new Set([...conSolicitud.map((s) => s.otPiezaId), ...conPedido.map((p) => p.otPiezaId)]);
  // Lo que dejó una orden confirmada desde el asistente reemplaza a lo calculado para esa pieza
  // (incluido "No comprar"); una vez recibida su compra, deja de ser necesidad.
  const conRegistro = new Set(deOrden.map((n) => n.otPiezaId));
  const yaRecibidas = new Set(recibidas.map((r) => r.otPiezaId));
  const libres = [
    ...pendientes.filter((p) => !conRegistro.has(p.otPiezaId)),
    ...deOrden.filter((n) => !n.omitida && !yaRecibidas.has(n.otPiezaId)),
  ].filter((p) => !tomadas.has(p.otPiezaId));
  if (!libres.length) return [];
  const planificadas = await db
    .select({ otPiezaId: asignacionTrabajo.otPiezaId, fecha: min(asignacionTrabajo.fecha) })
    .from(asignacionTrabajo)
    .where(inArray(asignacionTrabajo.otPiezaId, libres.map((l) => l.otPiezaId)))
    .groupBy(asignacionTrabajo.otPiezaId);
  return libres.map((l) => ({ ...l, primeraPlanificada: planificadas.find((p) => p.otPiezaId === l.otPiezaId)?.fecha ?? null }));
}

/** Necesidades que dejaron las órdenes confirmadas desde el asistente, con su orden y pieza de origen. */
async function getNecesidadesDeOrden(): Promise<(ItemCompraPendiente & { omitida: boolean; descripcion: string; observacion: string | null; esMaterial: boolean })[]> {
  const filas = await db
    .select({ n: necesidadCompraOrden, otPiezaCodigo: otPieza.codigo, piezaCodigo: pieza.codigo, piezaNombre: pieza.nombre, conjuntoNombre: conjunto.nombre, otMaquinaCodigo: otMaquina.codigo })
    .from(necesidadCompraOrden)
    .innerJoin(otPieza, eq(otPieza.id, necesidadCompraOrden.otPiezaId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(conjunto, eq(conjunto.id, otConjunto.conjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, necesidadCompraOrden.otMaquinaId))
    .where(inArray(otMaquina.estadoProyecto, ["activo", "en_montaje"]));
  return filas.map((f) => ({
    otPiezaId: f.n.otPiezaId,
    otPiezaCodigo: f.otPiezaCodigo,
    piezaCodigo: f.piezaCodigo,
    piezaNombre: f.piezaNombre,
    conjuntoNombre: f.conjuntoNombre,
    otMaquinaId: f.n.otMaquinaId,
    otMaquinaCodigo: f.otMaquinaCodigo,
    detalle: f.n.descripcion,
    cantidad: f.n.cantidad,
    operacionCompraId: null,
    omitida: f.n.omitida,
    descripcion: f.n.descripcion,
    observacion: f.n.observacion,
    esMaterial: f.n.tipo === "material",
  }));
}

export async function crearSolicitudDesdeNecesidad(otPiezaId: string, usuarioId: string): Promise<string> {
  const necesidad = (await getNecesidadesProduccion()).find((n) => n.otPiezaId === otPiezaId);
  if (!necesidad) throw new Error("Esa necesidad ya no está pendiente: ya tiene una compra abierta o un pedido.");
  if (necesidad.descripcion) {
    const [nueva] = await db
      .insert(solicitudCompra)
      .values({
        numero: await siguienteNumero(),
        origen: "orden_trabajo",
        otPiezaId,
        descripcion: necesidad.descripcion,
        cantidad: necesidad.cantidad,
        unidad: necesidad.esMaterial ? "piezas a fabricar" : "u.",
        observacion: necesidad.observacion ?? null,
        creadoPorId: usuarioId,
      })
      .returning({ id: solicitudCompra.id });
    return nueva.id;
  }
  const [p] = await db
    .select({ material: sql<string | null>`coalesce(${otPieza.material}, ${pieza.material})`, tipo: pieza.tipo })
    .from(otPieza)
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .where(eq(otPieza.id, otPiezaId));
  const esMaterial = necesidad.operacionCompraId !== null;
  const descripcion = esMaterial
    ? `Material para fabricar ${necesidad.piezaNombre} (${necesidad.piezaCodigo})${p?.material ? ` — ${p.material}` : ""}`
    : `${necesidad.piezaNombre} (${necesidad.piezaCodigo})`;
  const [nueva] = await db
    .insert(solicitudCompra)
    .values({
      numero: await siguienteNumero(),
      origen: "orden_trabajo",
      otPiezaId,
      descripcion,
      cantidad: necesidad.cantidad,
      unidad: esMaterial ? "piezas a fabricar" : "u.",
      creadoPorId: usuarioId,
    })
    .returning({ id: solicitudCompra.id });
  return nueva.id;
}

export async function crearSolicitudGeneral(input: {
  descripcion: string;
  cantidad: number;
  unidad?: string;
  fechaNecesidad?: string;
  observacion?: string;
  usuarioId: string;
}): Promise<string> {
  const descripcion = input.descripcion.trim();
  if (!descripcion) throw new Error("Falta qué hay que comprar.");
  if (!(input.cantidad > 0)) throw new Error("La cantidad tiene que ser mayor a cero.");
  const [nueva] = await db
    .insert(solicitudCompra)
    .values({
      numero: await siguienteNumero(),
      origen: "general",
      descripcion,
      cantidad: input.cantidad,
      unidad: input.unidad?.trim() || null,
      fechaNecesidad: input.fechaNecesidad || null,
      observacion: input.observacion?.trim() || null,
      creadoPorId: input.usuarioId,
    })
    .returning({ id: solicitudCompra.id });
  return nueva.id;
}

/** Datos de la solicitud y su programación. Qué y cuánto se fija hasta confirmar la compra. */
export async function actualizarSolicitud(
  id: string,
  datos: {
    descripcion?: string;
    cantidad?: number;
    unidad?: string;
    observacion?: string;
    fechaNecesidad?: string;
    fechaCompraPrevista?: string;
    fechaPagoPrevista?: string;
  },
): Promise<void> {
  const s = await exigirSolicitud(id);
  if (s.confirmadaAt && (datos.descripcion !== undefined || datos.cantidad !== undefined || datos.unidad !== undefined)) {
    throw new Error("La compra ya se confirmó al proveedor: qué y cuánto ya no se cambian.");
  }
  if (datos.descripcion !== undefined && !datos.descripcion.trim()) throw new Error("Falta qué hay que comprar.");
  if (datos.cantidad !== undefined && !(datos.cantidad > 0)) throw new Error("La cantidad tiene que ser mayor a cero.");
  const cambios: Partial<SolicitudCompra> = {};
  if (datos.descripcion !== undefined) cambios.descripcion = datos.descripcion.trim();
  if (datos.cantidad !== undefined) cambios.cantidad = datos.cantidad;
  if (datos.unidad !== undefined) cambios.unidad = datos.unidad.trim() || null;
  if (datos.observacion !== undefined) cambios.observacion = datos.observacion.trim() || null;
  if (datos.fechaNecesidad !== undefined) cambios.fechaNecesidad = datos.fechaNecesidad || null;
  if (datos.fechaCompraPrevista !== undefined) cambios.fechaCompraPrevista = datos.fechaCompraPrevista || null;
  if (datos.fechaPagoPrevista !== undefined) cambios.fechaPagoPrevista = datos.fechaPagoPrevista || null;
  await db.update(solicitudCompra).set(cambios).where(eq(solicitudCompra.id, id));
}

/** Sólo antes de confirmarla al proveedor: después ya hay un pedido de por medio. */
export async function anularSolicitud(id: string): Promise<void> {
  const s = await exigirSolicitud(id);
  if (s.confirmadaAt) throw new Error("La compra ya se confirmó al proveedor: no se puede anular desde acá.");
  await db.update(solicitudCompra).set({ anuladaAt: new Date() }).where(eq(solicitudCompra.id, id));
}

// ── Cotizaciones ─────────────────────────────────────────────────────────

export type DatosCotizacion = {
  proveedorId: string;
  cantidad: number;
  precioUnitario: number;
  moneda: Moneda;
  tiempoEntregaDias?: number | null;
  condicionPago?: string;
  observaciones?: string;
  fechaConfirmacionPosible?: string;
  fecha?: string;
};

/** Tipo de cambio oficial para la fecha de la cotización: de la moneda extranjera cotizada, o del dólar si es en pesos. */
async function tipoCambioPara(moneda: Moneda, fecha: string) {
  const extranjera: MonedaExtranjera = moneda === "EUR" ? "EUR" : "USD";
  return getTipoCambioOficial(extranjera, fecha);
}

export async function agregarCotizacion(solicitudId: string, datos: DatosCotizacion, usuarioId: string): Promise<{ sinTipoCambio: boolean }> {
  const s = await exigirSolicitud(solicitudId);
  if (s.confirmadaAt) throw new Error("La compra ya se confirmó: no se agregan más cotizaciones.");
  if (!datos.proveedorId) throw new Error("Elegí el proveedor.");
  if (!(datos.cantidad > 0)) throw new Error("La cantidad cotizada tiene que ser mayor a cero.");
  if (!(datos.precioUnitario > 0)) throw new Error("Falta el precio.");
  if (!MONEDAS.includes(datos.moneda)) throw new Error("Moneda inválida.");
  if (datos.tiempoEntregaDias != null && (!Number.isInteger(datos.tiempoEntregaDias) || datos.tiempoEntregaDias < 0)) {
    throw new Error("El tiempo de entrega va en días (un número entero).");
  }
  const fecha = datos.fecha || hoyISO();
  const tc = await tipoCambioPara(datos.moneda, fecha);
  await db.insert(cotizacionCompra).values({
    solicitudId,
    proveedorId: datos.proveedorId,
    cantidad: datos.cantidad,
    precioUnitario: datos.precioUnitario,
    moneda: datos.moneda,
    tipoCambio: tc?.valor ?? null,
    tipoCambioMoneda: tc?.moneda ?? null,
    tipoCambioFecha: tc?.fecha ?? null,
    tipoCambioFuente: tc?.fuente ?? null,
    tiempoEntregaDias: datos.tiempoEntregaDias ?? null,
    condicionPago: datos.condicionPago?.trim() || null,
    observaciones: datos.observaciones?.trim() || null,
    fechaConfirmacionPosible: datos.fechaConfirmacionPosible || null,
    fecha,
    usuarioId,
  });
  return { sinTipoCambio: !tc };
}

/** Si al cargarla la fuente oficial no respondió: se completa a pedido, con la cotización de la fecha de la cotización. */
export async function completarTipoCambio(cotizacionId: string): Promise<boolean> {
  const [c] = await db.select().from(cotizacionCompra).where(eq(cotizacionCompra.id, cotizacionId));
  if (!c || c.tipoCambio) return false;
  const tc = await tipoCambioPara(c.moneda, c.fecha);
  if (!tc) return false;
  await db
    .update(cotizacionCompra)
    .set({ tipoCambio: tc.valor, tipoCambioMoneda: tc.moneda, tipoCambioFecha: tc.fecha, tipoCambioFuente: tc.fuente })
    .where(eq(cotizacionCompra.id, cotizacionId));
  return true;
}

export async function eliminarCotizacion(cotizacionId: string): Promise<string> {
  const [c] = await db.select().from(cotizacionCompra).where(eq(cotizacionCompra.id, cotizacionId));
  if (!c) throw new Error("Esa cotización no existe.");
  const s = await exigirSolicitud(c.solicitudId);
  if (s.cotizacionElegidaId === c.id && s.confirmadaAt) throw new Error("Es la cotización de una compra ya confirmada.");
  await db.transaction(async (tx) => {
    if (s.cotizacionElegidaId === c.id) await tx.update(solicitudCompra).set({ cotizacionElegidaId: null }).where(eq(solicitudCompra.id, s.id));
    await tx.delete(cotizacionCompra).where(eq(cotizacionCompra.id, c.id));
  });
  return s.id;
}

/**
 * Decisión de compra: la toma Compras, eligiendo una cotización (o
 * deshaciendo la elección mientras no esté confirmada). Si la solicitud no
 * tiene fecha de compra prevista, toma la posible fecha de confirmación que
 * informó el proveedor — se puede cambiar.
 */
export async function elegirCotizacion(solicitudId: string, cotizacionId: string | null): Promise<void> {
  const s = await exigirSolicitud(solicitudId);
  if (s.confirmadaAt) throw new Error("La compra ya se confirmó al proveedor con la cotización elegida.");
  if (s.pagado > 0) throw new Error("Ya hay pagos registrados con la cotización elegida.");
  if (cotizacionId === null) {
    await db.update(solicitudCompra).set({ cotizacionElegidaId: null }).where(eq(solicitudCompra.id, solicitudId));
    return;
  }
  const c = s.cotizaciones.find((x) => x.id === cotizacionId);
  if (!c) throw new Error("Esa cotización no es de esta compra.");
  await db
    .update(solicitudCompra)
    .set({ cotizacionElegidaId: c.id, fechaCompraPrevista: s.fechaCompraPrevista ?? c.fechaConfirmacionPosible })
    .where(eq(solicitudCompra.id, solicitudId));
}

// ── Confirmación, recepción y pago ───────────────────────────────────────

/** Compra confirmada al proveedor. Si es una necesidad de OT, queda como pedido en Stock → Compras. */
export async function confirmarCompra(solicitudId: string, fecha: string, usuarioId: string): Promise<void> {
  const s = await exigirSolicitud(solicitudId);
  if (s.confirmadaAt) throw new Error("Esta compra ya está confirmada.");
  if (!s.elegida) throw new Error("Primero elegí la cotización con la que se compra.");
  const cuando = new Date(`${fecha || hoyISO()}T12:00:00-03:00`);
  if (s.origen === "orden_trabajo" && s.otPiezaId) {
    const [abierto] = await db
      .select({ id: pedidoCompra.id })
      .from(pedidoCompra)
      .where(and(eq(pedidoCompra.otPiezaId, s.otPiezaId), isNull(pedidoCompra.recibidoAt)));
    if (abierto) throw new Error("Esa pieza ya tiene un pedido sin recibir, hecho desde Stock → Compras.");
    await db.transaction(async (tx) => {
      const [pedido] = await tx
        .insert(pedidoCompra)
        .values({
          otPiezaId: s.otPiezaId!,
          proveedorId: s.elegida!.proveedorId,
          cantidad: Math.max(1, Math.round(s.elegida!.cantidad)),
          observacion: `Compra Nº ${s.numero}`,
          usuarioId,
          fechaPedido: cuando,
        })
        .returning({ id: pedidoCompra.id });
      await tx.update(solicitudCompra).set({ confirmadaAt: cuando, pedidoCompraId: pedido.id }).where(eq(solicitudCompra.id, s.id));
    });
  } else {
    await db.update(solicitudCompra).set({ confirmadaAt: cuando }).where(eq(solicitudCompra.id, s.id));
  }
}

/** Entrega con su control. En una necesidad de OT es la misma llegada de Stock → Compras (cierra el paso o suma al almacén). */
export async function registrarRecepcion(
  solicitudId: string,
  datos: { resultado: "ok" | "no_ok"; fecha: string; observacion?: string },
  usuarioId: string,
): Promise<void> {
  const s = await exigirSolicitud(solicitudId);
  if (!s.confirmadaAt) throw new Error("Primero confirmá la compra al proveedor.");
  if (s.fechaRecepcion) throw new Error("Esta compra ya se recibió.");
  if (s.origen === "orden_trabajo") {
    if (!s.pedidoCompraId) throw new Error("No se encontró el pedido de esta compra.");
    let operacionCompraId: string | undefined;
    if (s.otPiezaId) {
      const [op] = await db.select().from(otPieza).where(eq(otPieza.id, s.otPiezaId));
      const { operacionActual } = op ? await getEstadoYOperacionActual(op) : { operacionActual: null };
      if (operacionActual?.proceso.tipo === "compras") operacionCompraId = operacionActual.id;
    }
    await registrarLlegadaPedido({ pedidoId: s.pedidoCompraId, controlResultado: datos.resultado, observacion: datos.observacion, operacionCompraId, usuarioId });
    return;
  }
  await db.insert(recepcionCompra).values({
    solicitudId,
    fecha: datos.fecha || hoyISO(),
    resultado: datos.resultado,
    observacion: datos.observacion?.trim() || null,
    usuarioId,
  });
}

/** Pago (total o parcial) en la moneda de la cotización elegida. Recién acá el gasto es efectuado. */
export async function registrarPago(solicitudId: string, datos: { fecha: string; importe: number; observacion?: string }, usuarioId: string): Promise<void> {
  const s = await exigirSolicitud(solicitudId);
  if (!s.elegida || s.saldo === null) throw new Error("Primero elegí la cotización con la que se compra.");
  if (!(datos.importe > 0)) throw new Error("El importe pagado tiene que ser mayor a cero.");
  if (redondear(datos.importe) > s.saldo) throw new Error(`El saldo a pagar es ${s.saldo.toLocaleString("es-AR")} ${s.elegida.moneda}.`);
  await db.insert(pagoCompra).values({
    solicitudId,
    fecha: datos.fecha || hoyISO(),
    importe: redondear(datos.importe),
    moneda: s.elegida.moneda,
    observacion: datos.observacion?.trim() || null,
    usuarioId,
  });
}

export async function eliminarPago(pagoId: string): Promise<string> {
  const [p] = await db.select().from(pagoCompra).where(eq(pagoCompra.id, pagoId));
  if (!p) throw new Error("Ese pago no existe.");
  await db.delete(pagoCompra).where(eq(pagoCompra.id, pagoId));
  return p.solicitudId;
}

// ── Gastos futuros y pagos ───────────────────────────────────────────────

export type GastoFuturo = {
  solicitud: SolicitudDetalle;
  /** Lo que falta pagar, en la moneda de la cotización y en pesos (con su tipo de cambio guardado). */
  saldo: number;
  saldoEnPesos: number | null;
};

/**
 * Compromisos: compras con cotización elegida y saldo sin pagar. Una
 * cotización alternativa no elegida nunca se suma; lo ya pagado tampoco (es
 * gasto efectuado). Se agrupan por la fecha de pago prevista que cargó
 * Compras — sin esa fecha no se adivina un mes.
 */
export function calcularGastosFuturos(solicitudes: SolicitudDetalle[]) {
  const gastos: GastoFuturo[] = solicitudes
    .filter((s) => s.estado !== "anulada" && s.elegida && (s.saldo ?? 0) > 0)
    .map((s) => ({ solicitud: s, saldo: s.saldo!, saldoEnPesos: aPesos(s.saldo!, s.elegida!) }));
  const enCotizacion = solicitudes.filter((s) => s.estado === "cotizando");
  return { gastos, enCotizacion };
}

export type PagoRealizado = PagoCompra & { solicitudNumero: number; descripcion: string; proveedorNombre: string | null; enPesos: number | null };

export function pagosRealizados(solicitudes: SolicitudDetalle[]): PagoRealizado[] {
  return solicitudes
    .flatMap((s) =>
      s.pagos.map((p) => ({
        ...p,
        solicitudNumero: s.numero,
        descripcion: s.descripcion,
        proveedorNombre: s.elegida?.proveedorNombre ?? null,
        enPesos: s.elegida ? aPesos(p.importe, s.elegida) : p.moneda === "ARS" ? p.importe : null,
      })),
    )
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// ── Desempeño del proveedor ──────────────────────────────────────────────

export type EntregaProveedor = { fecha: string; resultado: "ok" | "no_ok"; detalle: string; tipo: "compra" | "tercerizado" | "ingreso" };
export type PlazoProveedor = {
  solicitudNumero: number;
  descripcion: string;
  confirmada: string;
  acordadaDias: number;
  entregaAcordada: string;
  recibida: string;
  /** Días reales menos días acordados: positivo = llegó tarde. */
  diferenciaDias: number;
};

/**
 * Los dos aspectos que definió el cliente, con datos reales y trazables:
 * - Calidad: cada entrega registrada con control OK / NO OK (llegadas de
 *   compras, vueltas de tercerizados, ingresos con control y entregas de
 *   compras generales).
 * - Plazos: para las compras confirmadas con plazo de entrega cotizado y ya
 *   recibidas, días acordados contra días reales. Sin esos datos no se mide.
 * No se arma un puntaje general: el cliente no definió cómo ponderar.
 */
export async function getDesempenoProveedor(proveedorId: string): Promise<{ entregas: EntregaProveedor[]; plazos: PlazoProveedor[] }> {
  const [movs, solicitudes] = await Promise.all([
    db
      .select({ fecha: movimientoStock.fecha, resultado: movimientoStock.controlResultado, observacion: movimientoStock.observacion, piezaNombre: pieza.nombre })
      .from(movimientoStock)
      .innerJoin(pieza, eq(pieza.id, movimientoStock.piezaId))
      .where(and(eq(movimientoStock.proveedorId, proveedorId), eq(movimientoStock.tipo, "ingreso"), isNotNull(movimientoStock.controlResultado)))
      .orderBy(desc(movimientoStock.fecha)),
    listarSolicitudes(),
  ]);
  const deEste = solicitudes.filter((s) => s.elegida?.proveedorId === proveedorId);

  const entregas: EntregaProveedor[] = [
    ...movs.map((m) => {
      const obs = m.observacion ?? "";
      const tipo: EntregaProveedor["tipo"] = obs.startsWith("Vuelta de tercerizado")
        ? "tercerizado"
        : obs.startsWith("Compra recibida") || obs.startsWith("Material recibido")
          ? "compra"
          : "ingreso";
      return { fecha: fechaISO(m.fecha), resultado: m.resultado!, detalle: m.piezaNombre, tipo };
    }),
    ...deEste
      .filter((s) => s.origen === "general")
      .flatMap((s) => s.entregas.map((e) => ({ fecha: e.fecha, resultado: e.resultado, detalle: `Compra Nº ${s.numero} — ${s.descripcion}`, tipo: "compra" as const }))),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  const plazos: PlazoProveedor[] = deEste
    .filter((s) => s.confirmadaAt && s.fechaRecepcion && s.elegida?.tiempoEntregaDias != null)
    .map((s) => {
      const confirmada = fechaISO(s.confirmadaAt!);
      const acordadaDias = s.elegida!.tiempoEntregaDias!;
      return {
        solicitudNumero: s.numero,
        descripcion: s.descripcion,
        confirmada,
        acordadaDias,
        entregaAcordada: sumarDias(confirmada, acordadaDias),
        recibida: s.fechaRecepcion!,
        diferenciaDias: diasEntre(confirmada, s.fechaRecepcion!) - acordadaDias,
      };
    });
  return { entregas, plazos };
}

/** Entregas OK / NO OK por proveedor, para el listado (mismas fuentes que `getDesempenoProveedor`). */
export async function getResumenEntregasProveedores(): Promise<Map<string, { ok: number; noOk: number }>> {
  const [movs, generales] = await Promise.all([
    db.execute<{ proveedor_id: string; ok: number; no_ok: number }>(sql`
      select proveedor_id, count(*) filter (where control_resultado = 'ok')::int as ok, count(*) filter (where control_resultado = 'no_ok')::int as no_ok
      from movimiento_stock where tipo = 'ingreso' and control_resultado is not null and proveedor_id is not null group by proveedor_id`),
    db.execute<{ proveedor_id: string; ok: number; no_ok: number }>(sql`
      select c.proveedor_id, count(*) filter (where r.resultado = 'ok')::int as ok, count(*) filter (where r.resultado = 'no_ok')::int as no_ok
      from recepcion_compra r join solicitud_compra s on s.id = r.solicitud_id join cotizacion_compra c on c.id = s.cotizacion_elegida_id
      group by c.proveedor_id`),
  ]);
  const res = new Map<string, { ok: number; noOk: number }>();
  for (const f of [...movs, ...generales]) {
    const r = res.get(f.proveedor_id) ?? { ok: 0, noOk: 0 };
    res.set(f.proveedor_id, { ok: r.ok + f.ok, noOk: r.noOk + f.no_ok });
  }
  return res;
}

/** Necesidades de OT que Compras ya está gestionando (abiertas y sin confirmar) — para avisarlo en Stock → Compras. */
export async function getSolicitudesAbiertasPorOtPieza(): Promise<Map<string, number>> {
  const filas = await db
    .select({ otPiezaId: solicitudCompra.otPiezaId, numero: solicitudCompra.numero })
    .from(solicitudCompra)
    .where(and(isNotNull(solicitudCompra.otPiezaId), isNull(solicitudCompra.anuladaAt), isNull(solicitudCompra.confirmadaAt)));
  return new Map(filas.map((f) => [f.otPiezaId!, f.numero]));
}

/**
 * Piezas de una orden que se confirmaron en "Falta material" y cuyo material todavía no llegó
 * (simplificación §4.2): con qué texto mostrarlo. "No comprar" no cuenta: se decidió no pedirlo.
 */
export async function getEsperaMaterialDeOrden(otMaquinaId: string): Promise<Map<string, string>> {
  const [necesidades, recibidas, solicitudes] = await Promise.all([
    db
      .select({ otPiezaId: necesidadCompraOrden.otPiezaId })
      .from(necesidadCompraOrden)
      .where(and(eq(necesidadCompraOrden.otMaquinaId, otMaquinaId), eq(necesidadCompraOrden.tipo, "material"), eq(necesidadCompraOrden.omitida, false))),
    db.select({ otPiezaId: pedidoCompra.otPiezaId }).from(pedidoCompra).where(isNotNull(pedidoCompra.recibidoAt)),
    db.select({ otPiezaId: solicitudCompra.otPiezaId, confirmada: solicitudCompra.confirmadaAt }).from(solicitudCompra).where(and(isNotNull(solicitudCompra.otPiezaId), isNull(solicitudCompra.anuladaAt))),
  ]);
  const llego = new Set(recibidas.map((r) => r.otPiezaId));
  const enCompras = new Map(solicitudes.map((s) => [s.otPiezaId, s.confirmada]));
  const r = new Map<string, string>();
  for (const n of necesidades) {
    if (llego.has(n.otPiezaId)) continue;
    r.set(n.otPiezaId, enCompras.has(n.otPiezaId) ? (enCompras.get(n.otPiezaId) ? "Material: pedido al proveedor" : "Material: Compras lo está cotizando") : "Material: falta pedir");
  }
  return r;
}

/** Piezas de una orden con "No comprar" (paso 2 del asistente): no esperan ninguna compra. */
export async function getNoComprarDeOrden(otMaquinaId: string): Promise<Set<string>> {
  const filas = await db
    .select({ otPiezaId: necesidadCompraOrden.otPiezaId })
    .from(necesidadCompraOrden)
    .where(and(eq(necesidadCompraOrden.otMaquinaId, otMaquinaId), eq(necesidadCompraOrden.omitida, true)));
  return new Set(filas.map((f) => f.otPiezaId));
}
