/**
 * Stock y WIP por etapa de proceso (hallazgo 3.1 de docs/01-analisis.md).
 *
 * `stockPieza` = lo que está "Finalizado" (disponible para armar).
 * `wipPieza`   = lo que está en curso en alguna etapa intermedia.
 * Ninguna de las dos es la foto completa por sí sola: para saber cuánto
 * existe TOTAL de una pieza (disponible + en proceso) hay que sumar ambas.
 */
import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stockPieza, wipPieza, pieza, proceso, movimientoStock } from "@/lib/db/schema";

export async function getStockDisponible(piezaId: string): Promise<number> {
  const [row] = await db
    .select({ cantidad: stockPieza.cantidadDisponible })
    .from(stockPieza)
    .where(eq(stockPieza.piezaId, piezaId));
  return row?.cantidad ?? 0;
}

export type WipEtapa = { procesoId: string; procesoNombre: string; cantidad: number };

export async function getWipPorPieza(piezaId: string): Promise<WipEtapa[]> {
  const rows = await db
    .select({ procesoId: wipPieza.procesoId, procesoNombre: proceso.nombre, cantidad: wipPieza.cantidad })
    .from(wipPieza)
    .innerJoin(proceso, eq(proceso.id, wipPieza.procesoId))
    .where(eq(wipPieza.piezaId, piezaId));
  return rows;
}

export async function getWipTotalPorPieza(piezaId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${wipPieza.cantidad}), 0)`.mapWith(Number) })
    .from(wipPieza)
    .where(eq(wipPieza.piezaId, piezaId));
  return row?.total ?? 0;
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

/** Piezas con stock disponible por debajo de su mínimo (RF sugerido, Fase 2). */
export async function getPiezasStockBajo(): Promise<{ piezaId: string; disponible: number; minimo: number }[]> {
  const rows = await db
    .select({ piezaId: pieza.id, disponible: stockPieza.cantidadDisponible, minimo: pieza.stockMinimo })
    .from(pieza)
    .innerJoin(stockPieza, eq(stockPieza.piezaId, pieza.id))
    .where(lt(stockPieza.cantidadDisponible, pieza.stockMinimo));
  return rows.map((r) => ({ piezaId: r.piezaId, disponible: r.disponible, minimo: r.minimo }));
}

/** Resumen de WIP agrupado por proceso, para un tablero general (todas las piezas). */
export async function getResumenWipPorProceso(): Promise<
  { procesoId: string; procesoNombre: string; piezas: number; unidades: number }[]
> {
  const rows = await db
    .select({
      procesoId: wipPieza.procesoId,
      procesoNombre: proceso.nombre,
      piezas: sql<number>`count(distinct ${wipPieza.piezaId})`.mapWith(Number),
      unidades: sql<number>`coalesce(sum(${wipPieza.cantidad}), 0)`.mapWith(Number),
    })
    .from(wipPieza)
    .innerJoin(proceso, eq(proceso.id, wipPieza.procesoId))
    .groupBy(wipPieza.procesoId, proceso.nombre);
  return rows;
}
