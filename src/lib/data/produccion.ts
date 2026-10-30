/**
 * Cola de producción por centro de trabajo (Release 2, pedido de Horacio —
 * docs/05-backlog-release-2.md §1, §3): "visualización por centros de
 * trabajo, cantidad de tareas disponibles al momento y futuras tareas
 * disponibles (que dependen de un proceso anterior finalizado), que puedan
 * ser ordenadas según cuál se quiere hacer primero".
 *
 * Regla de "ahora" vs "a futuro": para cada OT de pieza abierta se ubica su
 * operación actual (ver getEstadoYOperacionActual en ./ot) dentro de su hoja
 * de ruta. El centro de esa operación la tiene "disponible ahora"; el centro
 * de cualquier operación posterior en la misma hoja de ruta la tiene "a
 * futuro" (todavía depende de que termine lo que viene antes).
 */
import { ordenNoArchivada } from "./archivo";
import { controlaMateriaPrima, pasosQueBloquean } from "./materia-prima";
import { asc, eq, and, inArray, isNotNull, isNull, like, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  centroTrabajo,
  usuarioCentroTrabajo,
  otPieza,
  otConjunto,
  otMaquina,
  pieza,
  conjunto,
  operacion,
  proceso,
  registroOperacion,
  stockPieza,
  remito,
  remitoItem,
  movimientoStock,
  tareaLote,
} from "@/lib/db/schema";
import type { CentroTrabajo, OtPieza } from "@/lib/db/schema";

export async function getCentrosTrabajo(): Promise<CentroTrabajo[]> {
  return db.select().from(centroTrabajo).orderBy(asc(centroTrabajo.orden));
}

export async function getCentroTrabajo(id: string): Promise<CentroTrabajo | undefined> {
  const [row] = await db.select().from(centroTrabajo).where(eq(centroTrabajo.id, id));
  return row;
}

/**
 * Centros de trabajo de un operario — reemplaza el viejo `usuario.centroTrabajoId`
 * (FK único). Devolución del cliente (2ª ronda, pregunta 4 de Fase 2): "un
 * operario puede ocupar dos puestos, un puesto de trabajo puede ser ocupado
 * por dos operarios también" — de varios a varios, no 1 a 1.
 */
export async function getCentrosDeUsuario(usuarioId: string): Promise<CentroTrabajo[]> {
  const rows = await db
    .select({ centro: centroTrabajo })
    .from(usuarioCentroTrabajo)
    .innerJoin(centroTrabajo, eq(centroTrabajo.id, usuarioCentroTrabajo.centroTrabajoId))
    .where(eq(usuarioCentroTrabajo.usuarioId, usuarioId))
    .orderBy(asc(centroTrabajo.orden));
  return rows.map((r) => r.centro);
}

/** Batcheado para pantallas con varios usuarios a la vez (ej. /usuarios) — evita N+1. */
export async function getCentrosDeUsuariosBatch(usuarioIds: string[]): Promise<Map<string, CentroTrabajo[]>> {
  const resultado = new Map<string, CentroTrabajo[]>();
  if (usuarioIds.length === 0) return resultado;
  const rows = await db
    .select({ usuarioId: usuarioCentroTrabajo.usuarioId, centro: centroTrabajo })
    .from(usuarioCentroTrabajo)
    .innerJoin(centroTrabajo, eq(centroTrabajo.id, usuarioCentroTrabajo.centroTrabajoId))
    .where(inArray(usuarioCentroTrabajo.usuarioId, usuarioIds))
    .orderBy(asc(centroTrabajo.orden));
  for (const r of rows) {
    const arr = resultado.get(r.usuarioId) ?? [];
    arr.push(r.centro);
    resultado.set(r.usuarioId, arr);
  }
  return resultado;
}

/** Reemplaza el conjunto completo de centros asignados a un operario — la
 * pantalla de /usuarios manda siempre la lista final marcada, no altas/bajas
 * puntuales, así que "borrar todo e insertar de nuevo" es más simple y
 * correcto que diffear. */
export async function asignarCentrosTrabajo(usuarioId: string, centroTrabajoIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(usuarioCentroTrabajo).where(eq(usuarioCentroTrabajo.usuarioId, usuarioId));
    if (centroTrabajoIds.length > 0) {
      await tx.insert(usuarioCentroTrabajo).values(centroTrabajoIds.map((centroTrabajoId) => ({ usuarioId, centroTrabajoId })));
    }
  });
}

export type ItemCola = {
  otPieza: OtPieza;
  piezaNombre: string;
  piezaCodigo: string;
  conjuntoNombre: string;
  otMaquinaId: string;
  otMaquinaCodigo: string;
  procesoNombre: string;
  operacionSecuencia: number;
  totalOperaciones: number;
};

export type ColaCentro = { centro: CentroTrabajo; disponibleAhora: ItemCola[]; aFuturo: ItemCola[] };

type PasoRuta = {
  id: string;
  secuencia: number;
  procesoNombre: string;
  /** Detalle de la operación si ingeniería lo cargó (ej. "CNC – desbaste"), si no el proceso. */
  nombre: string;
  centroTrabajoId: string | null;
  tipo: "interno" | "tercerizado" | "compras";
};

/** Cierre de un paso con lo que se declaró al terminarlo. */
export type CierrePaso = { operacionId: string; piezasOk: number | null; piezasRechazadas: number | null };

/**
 * Cuántas piezas entran a un paso de la hoja de ruta: al primero, la cantidad
 * a fabricar; a cada uno de los siguientes, las OK que dejó el anterior (las
 * rechazadas ya no siguen). Un paso cerrado sin declarar ninguna pieza (0 OK y
 * 0 rechazadas — cierres anteriores a este control) no corta la cadena: pasa
 * la misma cantidad que había entrado. Observación del cliente en Fase 3: el
 * operario tiene que saber cuántas piezas procesa y no poder declarar más.
 */
export function cantidadQueEntraAlPaso(rutaIds: string[], idx: number, cantidadAFabricar: number, cierres: CierrePaso[]): number {
  let cantidad = cantidadAFabricar;
  for (let j = 0; j < idx; j++) {
    const delPaso = cierres.filter((c) => c.operacionId === rutaIds[j]);
    const declaradas = delPaso.reduce((s, c) => s + (c.piezasOk ?? 0) + (c.piezasRechazadas ?? 0), 0);
    if (declaradas > 0) cantidad = delPaso.reduce((s, c) => s + (c.piezasOk ?? 0), 0);
  }
  return cantidad;
}

/**
 * ¿Puede un operario trabajar este paso? Misma regla para la lista de /taller,
 * la ficha de la pieza y el inicio en el servidor (antes sólo la lista
 * filtraba: al terminar un paso, la ficha ofrecía el siguiente aunque fuera de
 * otro centro — caso de Fede con el Roscado de Taller después del CNC).
 * Manda la asignación de Planificación para hoy; si no, el paso tiene que ser
 * interno y de alguno de sus centros (sin centros asignados ve todo, como
 * desde Release 2).
 */
export function pasoHabilitadoParaOperario(
  paso: { id: string; tipo: "interno" | "tercerizado" | "compras"; centroTrabajoId: string | null },
  otPiezaId: string,
  centrosDelOperario: Set<string>,
  asignadasHoy: { otPiezaId: string; operacionId: string | null }[],
): boolean {
  if (asignadasHoy.some((a) => a.otPiezaId === otPiezaId && (a.operacionId === null || a.operacionId === paso.id))) return true;
  if (paso.tipo !== "interno") return false;
  if (centrosDelOperario.size === 0) return true;
  return paso.centroTrabajoId !== null && centrosDelOperario.has(paso.centroTrabajoId);
}

type FilaOtPieza = {
  otPieza: OtPieza;
  piezaNombre: string;
  piezaCodigo: string;
  conjuntoNombre: string;
  otMaquinaId: string;
  otMaquinaCodigo: string;
};

/**
 * Trae TODO lo que hace falta en 3 queries (independiente de cuántas OT de
 * pieza haya) y ubica, para cada OT de pieza todavía abierta, en qué paso de
 * su hoja de ruta está parada. La primera versión de `getColaPorCentroTrabajo`
 * llamaba a `getEstadoYOperacionActual` una vez por pieza dentro de un
 * for-loop — con los cientos de OT de pieza que ya hay sembradas, eso
 * tardaba más de 60s y hacía fallar el build (Next intenta prerenderizar la
 * página en build time). Evitar el N+1 acá importa tanto para el build como
 * para que las pantallas que la usan (`getColaPorCentroTrabajo` y
 * `getPiezasCompraPendientes`) carguen rápido en producción.
 */
async function getFilasConPosicionActual(): Promise<{ fila: FilaOtPieza; routing: PasoRuta[]; posActual: number; cantidadActual: number }[]> {
  const filas = await db
    .select({
      otPieza,
      piezaNombre: pieza.nombre,
      piezaCodigo: pieza.codigo,
      conjuntoNombre: conjunto.nombre,
      otMaquinaId: otMaquina.id,
      otMaquinaCodigo: otMaquina.codigo,
    })
    .from(otPieza)
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(conjunto, eq(conjunto.id, pieza.conjuntoId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .where(ordenNoArchivada)
    .orderBy(asc(otPieza.prioridad), asc(otPieza.createdAt));

  if (filas.length === 0) return [];

  const piezaIds = [...new Set(filas.map((f) => f.otPieza.piezaId))];
  const otPiezaIds = filas.map((f) => f.otPieza.id);

  const [rutaRows, completadasRows] = await Promise.all([
    db
      .select({
        piezaId: operacion.piezaId,
        id: operacion.id,
        secuencia: operacion.secuencia,
        procesoNombre: proceso.nombre,
        descripcion: operacion.descripcion,
        // El de esta pieza si se cambió en Maestros; si no, el del tipo de operación.
        centroTrabajoId: sql<string | null>`coalesce(${operacion.centroTrabajoId}, ${proceso.centroTrabajoId})`,
        tipo: proceso.tipo,
      })
      .from(operacion)
      .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
      .where(inArray(operacion.piezaId, piezaIds))
      .orderBy(asc(operacion.piezaId), asc(operacion.secuencia)),
    db
      .select({
        otPiezaId: registroOperacion.otPiezaId,
        operacionId: registroOperacion.operacionId,
        piezasOk: registroOperacion.piezasOk,
        piezasRechazadas: registroOperacion.piezasRechazadas,
      })
      .from(registroOperacion)
      .where(
        and(
          inArray(registroOperacion.otPiezaId, otPiezaIds),
          eq(registroOperacion.tipo, "ejecucion"),
          isNotNull(registroOperacion.fin),
        ),
      ),
  ]);

  // Sin control de materia prima (§2.2), el paso de Compras es informativo: no es la posición de la pieza, no
  // genera necesidad de material en Compras y no frena el tercerizado que venga después.
  const mp = await controlaMateriaPrima();
  const rutaPorPieza = new Map<string, PasoRuta[]>();
  for (const r of rutaRows) {
    const arr = rutaPorPieza.get(r.piezaId) ?? [];
    arr.push({
      id: r.id,
      secuencia: r.secuencia,
      procesoNombre: r.procesoNombre,
      nombre: r.descripcion?.trim() || r.procesoNombre,
      centroTrabajoId: r.centroTrabajoId,
      tipo: r.tipo,
    });
    rutaPorPieza.set(r.piezaId, arr);
  }
  for (const [piezaId, ruta] of rutaPorPieza) rutaPorPieza.set(piezaId, pasosQueBloquean(ruta, (x) => x.tipo, mp));

  const completadasPorOtPieza = new Map<string, Set<string>>();
  const cierresPorOtPieza = new Map<string, CierrePaso[]>();
  for (const c of completadasRows) {
    const set = completadasPorOtPieza.get(c.otPiezaId) ?? new Set<string>();
    set.add(c.operacionId);
    completadasPorOtPieza.set(c.otPiezaId, set);
    cierresPorOtPieza.set(c.otPiezaId, [...(cierresPorOtPieza.get(c.otPiezaId) ?? []), c]);
  }

  const resultado: { fila: FilaOtPieza; routing: PasoRuta[]; posActual: number; cantidadActual: number }[] = [];
  for (const fila of filas) {
    const routing = rutaPorPieza.get(fila.otPieza.piezaId) ?? [];
    if (routing.length === 0) continue; // sin hoja de ruta — no aparece en ninguna cola

    const completadas = completadasPorOtPieza.get(fila.otPieza.id) ?? new Set<string>();
    if (completadas.size >= routing.length) continue; // terminada

    const posActual = routing.findIndex((op) => !completadas.has(op.id));
    if (posActual === -1) continue;

    const cantidadActual = cantidadQueEntraAlPaso(
      routing.map((op) => op.id),
      posActual,
      fila.otPieza.cantidadAFabricar,
      cierresPorOtPieza.get(fila.otPieza.id) ?? [],
    );
    resultado.push({ fila, routing, posActual, cantidadActual });
  }
  return resultado;
}

export async function getColaPorCentroTrabajo(): Promise<ColaCentro[]> {
  const centros = await getCentrosTrabajo();
  const porCentro = new Map<string, ColaCentro>(centros.map((c) => [c.id, { centro: c, disponibleAhora: [], aFuturo: [] }]));

  // Sólo lo que ingeniería ya envió a producción: lo demás todavía no es trabajo de taller.
  const filasConPosicion = (await getFilasConPosicionActual()).filter(({ fila }) => fila.otPieza.enviadaProduccionAt);

  for (const { fila, routing, posActual } of filasConPosicion) {
    for (let i = posActual; i < routing.length; i++) {
      const op = routing[i];
      if (!op.centroTrabajoId) continue; // proceso sin centro asignado — no aparece en ninguna cola
      const cola = porCentro.get(op.centroTrabajoId);
      if (!cola) continue; // centro borrado o inconsistente — se ignora, no rompe la pantalla

      // Una hoja de ruta puede pasar dos veces por el mismo centro (ej. un
      // repaso de Torno más adelante) — no listar la pieza dos veces en la
      // misma cola, sólo en su primera aparición.
      const destino = i === posActual ? cola.disponibleAhora : cola.aFuturo;
      if (destino.some((it) => it.otPieza.id === fila.otPieza.id)) continue;

      destino.push({
        otPieza: fila.otPieza,
        piezaNombre: fila.piezaNombre,
        piezaCodigo: fila.piezaCodigo,
        conjuntoNombre: fila.conjuntoNombre,
        otMaquinaId: fila.otMaquinaId,
        otMaquinaCodigo: fila.otMaquinaCodigo,
        procesoNombre: op.procesoNombre,
        operacionSecuencia: op.secuencia,
        totalOperaciones: routing.length,
      });
    }
  }

  return centros.map((c) => porCentro.get(c.id)!);
}

/** Reordena la cola completa de "disponible ahora" de un centro a partir del
 * arrastre en la UI (Release 3 — reemplaza las flechas de subir/bajar de
 * Release 2, pedido explícito del cliente: "sería mucho mejor poder agarrar
 * y arrastrar los elementos para modificar el orden de prioridad"). Se
 * renumera toda la lista como enteros secuenciales en el orden recibido —
 * así el cambio se nota aunque haya empates de prioridad, que es el caso
 * normal (todas las piezas arrancan en 0). */
export async function reordenarCola(centroTrabajoId: string, ordenOtPiezaIds: string[]): Promise<void> {
  void centroTrabajoId; // la prioridad es global por OT de pieza, no por centro — se mantiene el parámetro por claridad de la acción que la llama
  await Promise.all(ordenOtPiezaIds.map((id, i) => db.update(otPieza).set({ prioridad: i }).where(eq(otPieza.id, id))));
}

export type ItemCompraPendiente = {
  otPiezaId: string;
  otPiezaCodigo: string;
  piezaCodigo: string;
  piezaNombre: string;
  conjuntoNombre: string;
  otMaquinaId: string;
  otMaquinaCodigo: string;
  detalle: string;
  /** Unidades a comprar (pieza comprada) o a abastecer de material (fabricada). */
  cantidad: number;
  /** Paso de Compras a cerrar cuando llega el material — null si es una pieza comprada entera. */
  operacionCompraId: string | null;
};

/**
 * Piezas de compra (Release 3, docs/06-backlog-release-3.md §13, y la
 * devolución del cliente sobre no confundir Compras con tercerizados): junta
 * dos casos, distintos pero con el mismo problema de visibilidad — ninguno
 * de los dos tiene centro de trabajo, así que ninguno aparecía en ningún
 * lado antes de esto.
 *
 * 1. Piezas enteras `comprada` (nunca se fabrican) cuyo stock actual todavía
 *    no alcanza lo que su OT necesita.
 * 2. Piezas `fabricada` cuyo paso ACTUAL de la hoja de ruta es un proceso
 *    `compras` (ej. falta comprar la materia prima antes de arrancar el
 *    mecanizado) — se apoya en `getFilasConPosicionActual`, la misma base
 *    que usa `getColaPorCentroTrabajo`.
 */
export async function getPiezasCompraPendientes(): Promise<ItemCompraPendiente[]> {
  const filasCompradas = await db
    .select({
      otPiezaId: otPieza.id,
      otPiezaCodigo: otPieza.codigo,
      piezaCodigo: pieza.codigo,
      piezaNombre: pieza.nombre,
      conjuntoNombre: conjunto.nombre,
      otMaquinaId: otMaquina.id,
      otMaquinaCodigo: otMaquina.codigo,
      cantidadNecesaria: otPieza.cantidadNecesaria,
      disponible: stockPieza.cantidadDisponible,
    })
    .from(otPieza)
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(conjunto, eq(conjunto.id, pieza.conjuntoId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .leftJoin(stockPieza, eq(stockPieza.piezaId, pieza.id))
    .where(and(eq(pieza.tipo, "comprada"), ordenNoArchivada))
    .orderBy(asc(otMaquina.codigo));

  const piezasComprada: ItemCompraPendiente[] = filasCompradas
    .map((f) => ({ ...f, disponible: f.disponible ?? 0 }))
    .filter((f) => f.disponible < f.cantidadNecesaria)
    .map((f) => ({
      otPiezaId: f.otPiezaId,
      otPiezaCodigo: f.otPiezaCodigo,
      piezaCodigo: f.piezaCodigo,
      piezaNombre: f.piezaNombre,
      conjuntoNombre: f.conjuntoNombre,
      otMaquinaId: f.otMaquinaId,
      otMaquinaCodigo: f.otMaquinaCodigo,
      detalle: `faltan ${f.cantidadNecesaria - f.disponible} de ${f.cantidadNecesaria}`,
      cantidad: f.cantidadNecesaria - f.disponible,
      operacionCompraId: null,
    }));

  const filasConPosicion = await getFilasConPosicionActual();
  const piezasMaterialPendiente: ItemCompraPendiente[] = filasConPosicion
    .filter(({ routing, posActual }) => routing[posActual].tipo === "compras")
    .map(({ fila, routing, posActual }) => ({
      otPiezaId: fila.otPieza.id,
      otPiezaCodigo: fila.otPieza.codigo,
      piezaCodigo: fila.piezaCodigo,
      piezaNombre: fila.piezaNombre,
      conjuntoNombre: fila.conjuntoNombre,
      otMaquinaId: fila.otMaquinaId,
      otMaquinaCodigo: fila.otMaquinaCodigo,
      detalle: `${fila.otPieza.cantidadAFabricar} u. esperando compra de material para arrancar`,
      cantidad: fila.otPieza.cantidadAFabricar,
      operacionCompraId: routing[posActual].id,
    }));

  return [...piezasComprada, ...piezasMaterialPendiente];
}

export type ItemAfueraTercerizado = {
  otPiezaId: string;
  otPiezaCodigo: string;
  piezaId: string;
  piezaCodigo: string;
  piezaNombre: string;
  otMaquinaId: string;
  otMaquinaCodigo: string;
  procesoNombre: string;
  operacionId: string;
  /** Piezas que llegaron a este paso (las OK del paso anterior). */
  cantidad: number;
  /** Mandadas con remito en este paso y vueltas ya registradas (OK o NO OK). */
  cantidadEnviada: number;
  cantidadRecibida: number;
  /** Remito con el que salió a este paso tercerizado — null si todavía está en planta, lista para mandar. */
  remito: { id: string; numero: number; fecha: Date; destino: string } | null;
};

/** OT de pieza cuyo paso actual es un proceso tercerizado: o lista para
 * mandar (sin remito todavía) o afuera esperando volver. Una fila por OT de
 * pieza para poder mandar y registrar la vuelta de cada una. Salió si hay un
 * remito con esa OT de pieza posterior a que llegara a este paso. */
export async function getPiezasAfueraTercerizado(): Promise<ItemAfueraTercerizado[]> {
  const filas = (await getFilasConPosicionActual()).filter(({ routing, posActual }) => routing[posActual].tipo === "tercerizado");
  if (filas.length === 0) return [];
  const ids = filas.map((f) => f.fila.otPieza.id);
  const [remitos, cierres, vueltas] = await Promise.all([
    db
      .select({
        otPiezaId: remitoItem.otPiezaId,
        cantidad: remitoItem.cantidad,
        id: remito.id,
        numero: remito.numero,
        fecha: remito.fecha,
        destino: remito.destino,
      })
      .from(remitoItem)
      .innerJoin(remito, eq(remito.id, remitoItem.remitoId))
      .where(inArray(remitoItem.otPiezaId, ids)),
    db
      .select({ otPiezaId: registroOperacion.otPiezaId, fin: registroOperacion.fin })
      .from(registroOperacion)
      .where(and(inArray(registroOperacion.otPiezaId, ids), isNotNull(registroOperacion.fin))),
    db
      .select({ otPiezaId: movimientoStock.otPiezaId, cantidad: movimientoStock.cantidad, fecha: movimientoStock.fecha })
      .from(movimientoStock)
      .where(
        and(
          inArray(movimientoStock.otPiezaId, ids),
          eq(movimientoStock.tipo, "ingreso"),
          // Sólo vueltas de tercerizado, no la llegada de una compra de la misma OT de pieza.
          like(movimientoStock.observacion, "Vuelta de tercerizado%"),
        ),
      ),
  ]);
  const llegoAlPaso = new Map<string, number>();
  for (const c of cierres) llegoAlPaso.set(c.otPiezaId, Math.max(llegoAlPaso.get(c.otPiezaId) ?? 0, c.fin!.getTime()));

  return filas.map(({ fila, routing, posActual, cantidadActual }) => {
    const desde = llegoAlPaso.get(fila.otPieza.id) ?? 0;
    const remitosDelPaso = remitos.filter((r) => r.otPiezaId === fila.otPieza.id && r.fecha.getTime() >= desde);
    return {
      otPiezaId: fila.otPieza.id,
      otPiezaCodigo: fila.otPieza.codigo,
      piezaId: fila.otPieza.piezaId,
      piezaCodigo: fila.piezaCodigo,
      piezaNombre: fila.piezaNombre,
      otMaquinaId: fila.otMaquinaId,
      otMaquinaCodigo: fila.otMaquinaCodigo,
      procesoNombre: routing[posActual].procesoNombre,
      operacionId: routing[posActual].id,
      cantidad: cantidadActual,
      cantidadEnviada: remitosDelPaso.reduce((s, r) => s + r.cantidad, 0),
      cantidadRecibida: vueltas
        .filter((v) => v.otPiezaId === fila.otPieza.id && v.fecha.getTime() >= desde)
        .reduce((s, v) => s + v.cantidad, 0),
      remito:
        remitosDelPaso
          .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
          .map(({ id, numero, fecha, destino }) => ({ id, numero, fecha, destino }))[0] ?? null,
    };
  });
}

export type CandidataTaller = {
  otPieza: OtPieza;
  piezaNombre: string;
  conjuntoNombre: string;
  pasoActual: { id: string; nombre: string; tipo: "interno" | "tercerizado" | "compras"; centroTrabajoId: string | null };
  /** Piezas que llegan al paso actual — lo que el operario tiene que procesar. */
  cantidadActual: number;
  estado: "pendiente" | "en_curso";
  pasos: number;
};

/**
 * Lo que puede aparecer en `/taller`: OT de pieza abiertas, con el centro de
 * su paso actual. Antes la pantalla calculaba el estado pieza por pieza
 * (2-4 consultas por cada una de las ~500 OT de pieza) y tardaba 30-60s en
 * abrir — la pantalla del operario, la más usada de todas. Ahora son las
 * mismas 3 consultas batcheadas de `getFilasConPosicionActual` + 1 más.
 */
export async function getCandidatasTaller(): Promise<CandidataTaller[]> {
  const filas = (await getFilasConPosicionActual()).filter(({ fila }) => fila.otPieza.enviadaProduccionAt);
  if (filas.length === 0) return [];
  const abiertas = await db
    .select({ otPiezaId: registroOperacion.otPiezaId })
    .from(registroOperacion)
    .where(and(inArray(registroOperacion.otPiezaId, filas.map((f) => f.fila.otPieza.id)), isNull(registroOperacion.fin)));
  const conAbierta = new Set(abiertas.map((a) => a.otPiezaId));
  return filas.map(({ fila, routing, posActual, cantidadActual }) => {
    const derivado = posActual > 0 || conAbierta.has(fila.otPieza.id) ? "en_curso" : "pendiente";
    const paso = routing[posActual];
    return {
      otPieza: fila.otPieza,
      piezaNombre: fila.piezaNombre,
      conjuntoNombre: fila.conjuntoNombre,
      pasoActual: { id: paso.id, nombre: paso.nombre, tipo: paso.tipo, centroTrabajoId: paso.centroTrabajoId },
      cantidadActual,
      estado: derivado,
      pasos: routing.length,
    };
  });
}

export type PendienteDePlanificar = {
  otPiezaId: string;
  otPiezaCodigo: string;
  piezaNombre: string;
  otMaquinaId: string;
  otMaquinaCodigo: string;
  operacionId: string;
  operacionNombre: string;
  /** null = el tipo de operación todavía no tiene centro de trabajo asignado. */
  centroTrabajoId: string | null;
  cantidad: number;
  /** null si se puede hacer ya; si no, el paso anterior que tiene que terminar antes. */
  despuesDe: string | null;
};

/**
 * Lo que falta planificar: cada operación interna pendiente de cada OT de
 * pieza enviada a producción — la actual ("se puede hacer ya") y las que
 * vienen después ("después de …"), para poder planificar los días siguientes.
 * Una operación con asignación de hoy en adelante ya no aparece; si la
 * asignación quedó en un día pasado sin hacerse, vuelve a aparecer.
 */
export async function getPendientesDePlanificar(asignadas: Set<string>): Promise<PendienteDePlanificar[]> {
  const filas = (await getFilasConPosicionActual()).filter(({ fila }) => fila.otPieza.enviadaProduccionAt);
  const resultado: PendienteDePlanificar[] = [];
  for (const { fila, routing, posActual, cantidadActual } of filas) {
    for (let i = posActual; i < routing.length; i++) {
      const paso = routing[i];
      if (paso.tipo !== "interno") continue;
      if (asignadas.has(`${fila.otPieza.id}::${paso.id}`)) continue;
      resultado.push({
        otPiezaId: fila.otPieza.id,
        otPiezaCodigo: fila.otPieza.codigo,
        piezaNombre: fila.piezaNombre,
        otMaquinaId: fila.otMaquinaId,
        otMaquinaCodigo: fila.otMaquinaCodigo,
        operacionId: paso.id,
        operacionNombre: paso.nombre,
        centroTrabajoId: paso.centroTrabajoId,
        cantidad: cantidadActual,
        despuesDe: i === posActual ? null : routing[i - 1].nombre,
      });
    }
  }
  return resultado;
}

/** Piezas enviadas a producción cuyo paso actual es una operación interna sin centro asignado. */
export async function contarPiezasSinCentro(): Promise<number> {
  const filas = (await getFilasConPosicionActual()).filter(({ fila }) => fila.otPieza.enviadaProduccionAt);
  return filas.filter(({ routing, posActual }) => routing[posActual].tipo === "interno" && !routing[posActual].centroTrabajoId).length;
}

/**
 * v2 — Avance con lotes (mejoras de usabilidad §1.6). Sin lotes, igual que
 * siempre: un cierre completa el paso. Desde el primer paso con lotes, cada
 * paso se completa recién cuando se declaró todo lo que le entró, y el paso
 * siguiente ya puede arrancar con las piezas OK del lote terminado.
 */
export function avancePasos(
  rutaIds: string[],
  cantidadAFabricar: number,
  cierres: CierrePaso[],
  conLote: Set<string>,
): { completados: Set<string>; disponibles: string[] } {
  const completados = new Set<string>();
  const declaradas = (id: string) => cierres.filter((c) => c.operacionId === id).reduce((s, c) => s + (c.piezasOk ?? 0) + (c.piezasRechazadas ?? 0), 0);
  const ok = (id: string) => cierres.filter((c) => c.operacionId === id).reduce((s, c) => s + (c.piezasOk ?? 0), 0);
  let flujo = false;
  const enFlujo: boolean[] = [];
  let anteriorHecho = true;
  rutaIds.forEach((id, j) => {
    flujo = flujo || conLote.has(id);
    enFlujo[j] = flujo;
    const cerrado = cierres.some((c) => c.operacionId === id);
    let hecho: boolean;
    if (!flujo) hecho = cerrado;
    else {
      const entra = cantidadQueEntraAlPaso(rutaIds, j, cantidadAFabricar, cierres);
      hecho = anteriorHecho && (entra > 0 ? declaradas(id) >= entra : cerrado);
    }
    if (hecho) completados.add(id);
    anteriorHecho = hecho;
  });
  const disponibles: string[] = [];
  const primero = rutaIds.findIndex((id) => !completados.has(id));
  if (primero >= 0) {
    disponibles.push(rutaIds[primero]);
    for (let k = primero + 1; k < rutaIds.length; k++) {
      const previo = rutaIds[k - 1];
      if (completados.has(rutaIds[k]) || !enFlujo[k - 1]) continue;
      if (ok(previo) > declaradas(rutaIds[k])) disponibles.push(rutaIds[k]);
      else break;
    }
  }
  return { completados, disponibles };
}

/** Pasos con lotes de cada orden de pieza: el lote elegido a mano en el plan, o el de la pieza si la cantidad lo supera. */
export async function getPasosConLote(piezas: { id: string; piezaId: string; cantidadAFabricar: number }[]): Promise<Map<string, Set<string>>> {
  const res = new Map<string, Set<string>>();
  if (!piezas.length) return res;
  const ids = piezas.map((p) => p.id);
  const piezaIds = [...new Set(piezas.map((p) => p.piezaId))];
  const [manuales, pzs] = await Promise.all([
    db.select().from(tareaLote).where(inArray(tareaLote.otPiezaId, ids)),
    db.select({ id: pieza.id, lote: pieza.tamanoLote }).from(pieza).where(inArray(pieza.id, piezaIds)),
  ]);
  // Las operaciones sólo hacen falta si alguna pieza tiene lote por defecto (lo normal es que ninguna).
  const conLotePieza = pzs.filter((x) => x.lote).map((x) => x.id);
  const ops = conLotePieza.length ? await db.select({ id: operacion.id, piezaId: operacion.piezaId }).from(operacion).where(inArray(operacion.piezaId, conLotePieza)) : [];
  if (!manuales.length && !ops.length) return res;
  for (const p of piezas) {
    const set = new Set<string>();
    const lotePieza = pzs.find((x) => x.id === p.piezaId)?.lote;
    if (lotePieza && p.cantidadAFabricar > lotePieza) for (const o of ops.filter((x) => x.piezaId === p.piezaId)) set.add(o.id);
    for (const m of manuales.filter((x) => x.otPiezaId === p.id)) {
      if (m.tamano > 0 && m.tamano < p.cantidadAFabricar) set.add(m.operacionId);
      else set.delete(m.operacionId);
    }
    if (set.size) res.set(p.id, set);
  }
  return res;
}
