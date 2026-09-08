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
import { stockPieza, wipPieza, pieza, proceso } from "@/lib/db/schema";

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
