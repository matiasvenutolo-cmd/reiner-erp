/**
 * Stock y WIP por etapa de proceso (hallazgo 3.1 de docs/01-analisis.md).
 *
 * `stockPieza` = lo que está "Finalizado" (disponible para armar) — se
 * actualiza con cada ajuste manual de taller (Release 2, ajustarStock).
 *
 * El WIP "en proceso" YA NO sale de la tabla `wip_pieza`: esa tabla es la
 * foto fija que trajo la migración del Excel en Fase 1 y ningún flujo de la
 * app la volvió a tocar nunca (ver `wipPieza` en schema.ts) — cerrar una
 * operación en taller no la actualiza. Con meses de OT generadas y
 * ejecutadas desde entonces, mostrarla como si fuera el estado actual es
 * exactamente el problema que reportó el cliente en la reunión de Release 3
 * (docs/06-backlog-release-3.md §11): "aparecen números... que no permiten
 * entender fácilmente qué representan". En cambio, se calcula EN VIVO a
 * partir de la misma ejecución real que ya usan /avance y /centros-trabajo
 * (`registro_operacion` + la hoja de ruta) — una sola base para stock,
 * avance y tableros, tal como pidió el cliente.
 *
 * `wip_pieza` queda sin usar en la UI, no se borra: puede representar stock
 * físico genérico en planta sin atar a una OT puntual (trabajo que ya
 * estaba en curso antes de este sistema) — a confirmar con Julián/Horacio
 * antes de eliminar la tabla del todo (ver pregunta abierta en el backlog).
 */
import { asc, eq, and, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stockPieza, pieza, proceso, movimientoStock, otPieza, operacion, registroOperacion } from "@/lib/db/schema";

export async function getStockDisponible(piezaId: string): Promise<number> {
  const [row] = await db
    .select({ cantidad: stockPieza.cantidadDisponible })
    .from(stockPieza)
    .where(eq(stockPieza.piezaId, piezaId));
  return row?.cantidad ?? 0;
}

export type WipEtapa = { procesoNombre: string; cantidad: number };

/** WIP en vivo de UNA pieza puntual — para la búsqueda de /stock. Sin riesgo
 * de N+1: una pieza tiene a lo sumo un puñado de OT de pieza abiertas. */
export async function getWipEnCursoDePieza(piezaId: string): Promise<WipEtapa[]> {
  const rutaRows = await db
    .select({ id: operacion.id, secuencia: operacion.secuencia, procesoId: proceso.id, procesoNombre: proceso.nombre })
    .from(operacion)
    .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
    .where(eq(operacion.piezaId, piezaId))
    .orderBy(asc(operacion.secuencia));
  if (rutaRows.length === 0) return [];

  const otPiezas = await db.select().from(otPieza).where(eq(otPieza.piezaId, piezaId));
  if (otPiezas.length === 0) return [];

  const otPiezaIds = otPiezas.map((p) => p.id);
  const completadasRows = await db
    .select({ otPiezaId: registroOperacion.otPiezaId, operacionId: registroOperacion.operacionId })
    .from(registroOperacion)
    .where(
      and(inArray(registroOperacion.otPiezaId, otPiezaIds), eq(registroOperacion.tipo, "ejecucion"), isNotNull(registroOperacion.fin)),
    );

  const completadasPorOtPieza = new Map<string, Set<string>>();
  for (const c of completadasRows) {
    const set = completadasPorOtPieza.get(c.otPiezaId) ?? new Set<string>();
    set.add(c.operacionId);
    completadasPorOtPieza.set(c.otPiezaId, set);
  }

  const acumulado = new Map<string, WipEtapa>();
  for (const otp of otPiezas) {
    const completadas = completadasPorOtPieza.get(otp.id) ?? new Set<string>();
    if (completadas.size >= rutaRows.length) continue; // terminada — ya pasó a stock "Finalizado"
    const actual = rutaRows.find((op) => !completadas.has(op.id));
    if (!actual) continue;
    const acc = acumulado.get(actual.procesoId) ?? { procesoNombre: actual.procesoNombre, cantidad: 0 };
    acc.cantidad += otp.cantidadAFabricar;
    acumulado.set(actual.procesoId, acc);
  }
  return [...acumulado.values()];
}

export async function getWipTotalEnCursoDePieza(piezaId: string): Promise<number> {
  const etapas = await getWipEnCursoDePieza(piezaId);
  return etapas.reduce((sum, e) => sum + e.cantidad, 0);
}

export type WipEtapaResumen = { procesoId: string; procesoNombre: string; piezas: number; unidades: number };

/**
 * Mismo cálculo que getColaPorCentroTrabajo (src/lib/data/produccion.ts) —
 * 3 consultas siempre, sin importar cuántas OT de pieza haya — pero
 * agrupado por proceso/etapa en vez de por centro de trabajo, y quedándose
 * sólo con la etapa ACTUAL de cada OT (no toda la ruta restante).
 */
export async function getResumenWipEnCursoPorProceso(): Promise<WipEtapaResumen[]> {
  const filas = await db.select({ otPieza, piezaId: pieza.id }).from(otPieza).innerJoin(pieza, eq(pieza.id, otPieza.piezaId));
  if (filas.length === 0) return [];

  const piezaIds = [...new Set(filas.map((f) => f.piezaId))];
  const otPiezaIds = filas.map((f) => f.otPieza.id);

  const [rutaRows, completadasRows] = await Promise.all([
    db
      .select({
        piezaId: operacion.piezaId,
        id: operacion.id,
        secuencia: operacion.secuencia,
        procesoId: proceso.id,
        procesoNombre: proceso.nombre,
      })
      .from(operacion)
      .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
      .where(inArray(operacion.piezaId, piezaIds))
      .orderBy(asc(operacion.piezaId), asc(operacion.secuencia)),
    db
      .select({ otPiezaId: registroOperacion.otPiezaId, operacionId: registroOperacion.operacionId })
      .from(registroOperacion)
      .where(
        and(inArray(registroOperacion.otPiezaId, otPiezaIds), eq(registroOperacion.tipo, "ejecucion"), isNotNull(registroOperacion.fin)),
      ),
  ]);

  const rutaPorPieza = new Map<string, { id: string; procesoId: string; procesoNombre: string }[]>();
  for (const r of rutaRows) {
    const arr = rutaPorPieza.get(r.piezaId) ?? [];
    arr.push({ id: r.id, procesoId: r.procesoId, procesoNombre: r.procesoNombre });
    rutaPorPieza.set(r.piezaId, arr);
  }

  const completadasPorOtPieza = new Map<string, Set<string>>();
  for (const c of completadasRows) {
    const set = completadasPorOtPieza.get(c.otPiezaId) ?? new Set<string>();
    set.add(c.operacionId);
    completadasPorOtPieza.set(c.otPiezaId, set);
  }

  const acumulado = new Map<string, { procesoNombre: string; piezas: Set<string>; unidades: number }>();
  for (const fila of filas) {
    const routing = rutaPorPieza.get(fila.piezaId) ?? [];
    if (routing.length === 0) continue;
    const completadas = completadasPorOtPieza.get(fila.otPieza.id) ?? new Set<string>();
    if (completadas.size >= routing.length) continue;
    const actual = routing.find((op) => !completadas.has(op.id));
    if (!actual) continue;

    const acc = acumulado.get(actual.procesoId) ?? { procesoNombre: actual.procesoNombre, piezas: new Set<string>(), unidades: 0 };
    acc.piezas.add(fila.piezaId);
    acc.unidades += fila.otPieza.cantidadAFabricar;
    acumulado.set(actual.procesoId, acc);
  }

  return [...acumulado.entries()].map(([procesoId, v]) => ({
    procesoId,
    procesoNombre: v.procesoNombre,
    piezas: v.piezas.size,
    unidades: v.unidades,
  }));
}

/**
 * Ajuste manual del stock disponible ("Finalizado") de una pieza — pedido de
 * Horacio en la devolución del 2026-09-19 ("que Horacio también pueda
 * modificar el stock de ser necesario", docs/05-backlog-release-2.md §3).
 *
 * Es el primer lugar de toda la app que escribe en `stock_pieza` y
 * `movimiento_stock` — hasta ahora ambas tablas sólo se leían: el stock
 * migrado de los Excel es una foto fija, cerrar una operación en taller
 * todavía no la actualiza (eso es la próxima pieza natural de este backlog,
 * no estaba pedida todavía). El ajuste no reemplaza el número sin dejar
 * rastro: guarda el delta en `movimiento_stock` (tipo "ajuste") para que
 * quede quién lo cambió y por qué, y recién después actualiza el saldo.
 */
export async function ajustarStock(input: {
  piezaId: string;
  cantidadNueva: number;
  observacion?: string;
  usuarioId: string;
}): Promise<void> {
  const actual = await getStockDisponible(input.piezaId);
  const delta = input.cantidadNueva - actual;
  if (delta === 0) return;

  await db.transaction(async (tx) => {
    await tx
      .insert(stockPieza)
      .values({ piezaId: input.piezaId, cantidadDisponible: input.cantidadNueva })
      .onConflictDoUpdate({ target: stockPieza.piezaId, set: { cantidadDisponible: input.cantidadNueva, updatedAt: new Date() } });
    await tx.insert(movimientoStock).values({
      piezaId: input.piezaId,
      tipo: "ajuste",
      cantidad: delta,
      usuarioId: input.usuarioId,
      observacion: input.observacion,
    });
  });
}

export type PiezaStockBajo = { piezaId: string; piezaCodigo: string; piezaNombre: string; disponible: number; minimo: number };

/** Piezas con stock disponible por debajo de su mínimo (RF sugerido, Fase 2). */
export async function getPiezasStockBajo(): Promise<PiezaStockBajo[]> {
  return db
    .select({
      piezaId: pieza.id,
      piezaCodigo: pieza.codigo,
      piezaNombre: pieza.nombre,
      disponible: stockPieza.cantidadDisponible,
      minimo: pieza.stockMinimo,
    })
    .from(pieza)
    .innerJoin(stockPieza, eq(stockPieza.piezaId, pieza.id))
    .where(lt(stockPieza.cantidadDisponible, pieza.stockMinimo));
}
