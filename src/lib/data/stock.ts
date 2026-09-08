/**
 * Stock y WIP por etapa de proceso (hallazgo 3.1 de docs/01-analisis.md).
 *
 * `stockPieza` = lo que está "Finalizado" (disponible para armar).
 * `wipPieza`   = lo que está en curso en alguna etapa intermedia.
 * Ninguna de las dos es la foto completa por sí sola: para saber cuánto
 * existe TOTAL de una pieza (disponible + en proceso) hay que sumar ambas.
 */
import { FIXTURES } from "./fixtures-loader";
import { getProceso } from "./maestros";

export async function getStockDisponible(piezaId: string): Promise<number> {
  return FIXTURES.stockPieza.find((s) => s.piezaId === piezaId)?.cantidadDisponible ?? 0;
}

export type WipEtapa = { procesoId: string; procesoNombre: string; cantidad: number };

export async function getWipPorPieza(piezaId: string): Promise<WipEtapa[]> {
  const filas = FIXTURES.wipPieza.filter((w) => w.piezaId === piezaId);
  const conNombre = await Promise.all(
    filas.map(async (f) => ({
      procesoId: f.procesoId,
      procesoNombre: (await getProceso(f.procesoId))?.nombre ?? f.procesoId,
      cantidad: f.cantidad,
    })),
  );
  return conNombre;
}

export async function getWipTotalPorPieza(piezaId: string): Promise<number> {
  return FIXTURES.wipPieza.filter((w) => w.piezaId === piezaId).reduce((acc, w) => acc + w.cantidad, 0);
}

/** Piezas con stock disponible por debajo de su mínimo (RF sugerido, Fase 2). */
export async function getPiezasStockBajo(): Promise<{ piezaId: string; disponible: number; minimo: number }[]> {
  return FIXTURES.piezas
    .filter((p) => p.stockMinimo > 0)
    .map((p) => ({
      piezaId: p.id,
      disponible: FIXTURES.stockPieza.find((s) => s.piezaId === p.id)?.cantidadDisponible ?? 0,
      minimo: p.stockMinimo,
    }))
    .filter((r) => r.disponible < r.minimo);
}

/** Resumen de WIP agrupado por proceso, para un tablero general (todas las piezas). */
export async function getResumenWipPorProceso(): Promise<{ procesoId: string; procesoNombre: string; piezas: number; unidades: number }[]> {
  const porProceso = new Map<string, { piezas: number; unidades: number }>();
  for (const w of FIXTURES.wipPieza) {
    const acc = porProceso.get(w.procesoId) ?? { piezas: 0, unidades: 0 };
    acc.piezas += 1;
    acc.unidades += w.cantidad;
    porProceso.set(w.procesoId, acc);
  }
  const resultado = await Promise.all(
    [...porProceso.entries()].map(async ([procesoId, v]) => ({
      procesoId,
      procesoNombre: (await getProceso(procesoId))?.nombre ?? procesoId,
      ...v,
    })),
  );
  return resultado;
}
