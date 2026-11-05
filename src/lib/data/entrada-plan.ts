/**
 * Entrada automática al plan (simplificación §4.3). La liberación por tandas
 * deja de ser un paso manual obligatorio: una pieza entra al plan sola (la
 * misma "Pasar al plan" de siempre, `enviarAProduccion`) cuando
 * - la orden está confirmada (activa o en montaje),
 * - tiene material: su primer paso no es una compra pendiente y no espera el
 *   material que dejó pedido la confirmación desde el asistente,
 * - y tiene plano y revisión, sólo si ADMIN exige plano ("exigir_plano").
 *
 * Se llama cuando algo de eso cambia: al confirmar o activar una orden, al
 * reactivarla, al llegar una compra, al cargar plano o revisión y al cambiar
 * los parámetros. Con "entrada_plan = manual" en ADMIN (el modo desde la prueba 1, 05/11) no hace nada: las
 * piezas se mandan a producción a mano desde Gestión, con las mismas reglas (`evaluarEntrada`).
 */
import { and, eq, gt, inArray, isNotNull, isNull, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otPieza, otConjunto, otMaquina, pieza, parametro, operacion, proceso, registroOperacion, necesidadCompraOrden, pedidoCompra } from "@/lib/db/schema";
import { enviarAProduccion } from "./ot";
import { controlaMateriaPrima } from "./materia-prima";

export async function getModoEntrada(): Promise<{ automatica: boolean; exigirPlano: boolean }> {
  const filas = await db.select().from(parametro).where(inArray(parametro.clave, ["entrada_plan", "exigir_plano"]));
  const v = (k: string) => filas.find((f) => f.clave === k)?.valor;
  return { automatica: (v("entrada_plan") ?? "automatica") !== "manual", exigirPlano: (v("exigir_plano") ?? "si") === "si" };
}

export type ParaEnviar = {
  otPiezaId: string;
  piezaId: string;
  otMaquinaId: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  /** Por qué todavía no se puede mandar a producción (falta material o plano); null = se puede. */
  motivo: string | null;
};

/**
 * Las piezas a fabricar de órdenes confirmadas que todavía no entraron al plan, con el motivo por el que no
 * pueden entrar todavía (o null si ya pueden). Es la misma regla para la entrada automática y para el envío a
 * mano desde Gestión (prueba 1, 05/11):
 * - lo que se compra hecho no pasa por el plan del taller;
 * - con "Controlar materia prima", la pieza espera el material: la compra que dejó pedida la orden o, si su
 *   hoja de ruta empieza con Compras, que ese paso esté cerrado o el pedido haya llegado;
 * - si ADMIN exige plano, espera el plano y la revisión.
 * `materialVerificado`: el material ya se cruzó contra el stock (al confirmar desde "Lo fabrico").
 */
export async function evaluarEntrada(
  filtro: { otMaquinaId?: string; otPiezaIds?: string[]; piezaId?: string },
  opciones: { materialVerificado?: boolean; exigirPlano?: boolean } = {},
): Promise<ParaEnviar[]> {
  if (filtro.otPiezaIds && !filtro.otPiezaIds.length) return [];
  const exigirPlano = opciones.exigirPlano ?? (await getModoEntrada()).exigirPlano;

  const condiciones: SQL[] = [isNull(otPieza.enviadaProduccionAt), gt(otPieza.cantidadAFabricar, 0), inArray(otMaquina.estadoProyecto, ["activo", "en_montaje"])];
  if (filtro.otMaquinaId) condiciones.push(eq(otMaquina.id, filtro.otMaquinaId));
  if (filtro.otPiezaIds) condiciones.push(inArray(otPieza.id, filtro.otPiezaIds));
  if (filtro.piezaId) condiciones.push(eq(otPieza.piezaId, filtro.piezaId));
  const candidatas = await db
    .select({
      id: otPieza.id,
      piezaId: otPieza.piezaId,
      otMaquinaId: otMaquina.id,
      codigo: pieza.codigo,
      nombre: pieza.nombre,
      cantidad: otPieza.cantidadAFabricar,
      clase: pieza.clase,
      tipo: pieza.tipo,
      plano: pieza.numeroPlano,
      revision: pieza.revision,
    })
    .from(otPieza)
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .where(and(...condiciones));
  // Sólo lo que se fabrica: lo que se compra hecho (o tiene una hoja de ruta sólo de Compras) no pasa por el plan del taller.
  const porTipo = candidatas.filter((c) => (c.clase ?? "fabricada") === "fabricada" && c.tipo === "fabricada");
  if (!porTipo.length) return [];
  const rutas = await db
    .select({ piezaId: operacion.piezaId, id: operacion.id, secuencia: operacion.secuencia, tipo: proceso.tipo })
    .from(operacion)
    .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
    .where(inArray(operacion.piezaId, [...new Set(porTipo.map((c) => c.piezaId))]));
  const fabricadas = porTipo.filter((c) => {
    const ruta = rutas.filter((r) => r.piezaId === c.piezaId);
    return !ruta.length || ruta.some((r) => r.tipo !== "compras");
  });
  if (!fabricadas.length) return [];

  const motivo = new Map<string, string>();
  if (exigirPlano) for (const c of fabricadas) if (!c.plano || !c.revision) motivo.set(c.id, "Falta plano");

  // Sin control de materia prima (§2.2) el material no frena la entrada al plan.
  if (!opciones.materialVerificado && (await controlaMateriaPrima())) {
    const ids = fabricadas.map((c) => c.id);
    const [cerrados, esperan, llegaron, omitidas] = await Promise.all([
      db.select({ otPiezaId: registroOperacion.otPiezaId, operacionId: registroOperacion.operacionId }).from(registroOperacion).where(and(inArray(registroOperacion.otPiezaId, ids), isNotNull(registroOperacion.fin))),
      db
        .select({ otPiezaId: necesidadCompraOrden.otPiezaId })
        .from(necesidadCompraOrden)
        .where(and(inArray(necesidadCompraOrden.otPiezaId, ids), eq(necesidadCompraOrden.tipo, "material"), eq(necesidadCompraOrden.omitida, false))),
      db.select({ otPiezaId: pedidoCompra.otPiezaId }).from(pedidoCompra).where(and(inArray(pedidoCompra.otPiezaId, ids), isNotNull(pedidoCompra.recibidoAt))),
      db.select({ otPiezaId: necesidadCompraOrden.otPiezaId }).from(necesidadCompraOrden).where(and(inArray(necesidadCompraOrden.otPiezaId, ids), eq(necesidadCompraOrden.omitida, true))),
    ]);
    const sinCompra = new Set(omitidas.map((x) => x.otPiezaId));
    const llego = new Set(llegaron.map((x) => x.otPiezaId));
    const esperaMaterial = new Set(esperan.map((x) => x.otPiezaId).filter((x) => !llego.has(x)));
    const cerrado = new Set(cerrados.map((x) => `${x.otPiezaId}::${x.operacionId}`));
    for (const c of fabricadas) {
      if (sinCompra.has(c.id)) continue; // "No comprar": el material se consigue por otro lado
      const primero = rutas.filter((r) => r.piezaId === c.piezaId).sort((a, b) => a.secuencia - b.secuencia)[0];
      // Primer paso de Compras sin cerrar: el material todavía no llegó.
      if (esperaMaterial.has(c.id) || (primero?.tipo === "compras" && !cerrado.has(`${c.id}::${primero.id}`) && !llego.has(c.id))) motivo.set(c.id, "Falta material");
    }
  }
  return fabricadas.map((c) => ({ otPiezaId: c.id, piezaId: c.piezaId, otMaquinaId: c.otMaquinaId, codigo: c.codigo, nombre: c.nombre, cantidad: c.cantidad, motivo: motivo.get(c.id) ?? null }));
}

/**
 * Pasa al plan las piezas que ya pueden entrar (sólo con la entrada automática). Devuelve cuántas entraron.
 */
export async function entrarAlPlanSolas(
  filtro: { otMaquinaId?: string; otPiezaIds?: string[]; piezaId?: string },
  usuarioId: string,
  opciones: { materialVerificado?: boolean } = {},
): Promise<number> {
  const modo = await getModoEntrada();
  if (!modo.automatica) return 0;
  const listas = (await evaluarEntrada(filtro, { ...opciones, exigirPlano: modo.exigirPlano })).filter((c) => !c.motivo);
  return enviarAProduccion(
    listas.map((c) => c.otPiezaId),
    usuarioId,
  );
}
