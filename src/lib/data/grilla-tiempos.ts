import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pieza, piezaConfiguracion, operacion, proceso } from "@/lib/db/schema";

export type PasoGrilla = {
  id: string;
  secuencia: number;
  proceso: string;
  tipo: "interno" | "tercerizado" | "compras";
  setupMin: number | null;
  minPorUnidad: number | null;
  defSetup: number | null;
  defMin: number | null;
  plazo: number | null;
  origen: string | null;
};
export type PiezaGrilla = { id: string; codigo: string; nombre: string; clase: string; pasos: PasoGrilla[] };

/** Piezas de una configuración (y opcionalmente un conjunto) con su ruta y los tiempos propios y heredados de cada paso. */
export async function getGrillaTiempos(configuracionId: string, conjuntoId?: string | null): Promise<PiezaGrilla[]> {
  const piezas = await db
    .select({ id: pieza.id, codigo: pieza.codigo, nombre: pieza.nombre, clase: pieza.clase })
    .from(pieza)
    .innerJoin(piezaConfiguracion, eq(piezaConfiguracion.piezaId, pieza.id))
    .where(conjuntoId ? and(eq(piezaConfiguracion.configuracionId, configuracionId), eq(pieza.conjuntoId, conjuntoId)) : eq(piezaConfiguracion.configuracionId, configuracionId))
    .orderBy(asc(pieza.codigo));
  if (!piezas.length) return [];
  const ops = await db
    .select({ o: operacion, nombre: proceso.nombre, tipo: proceso.tipo, ds: proceso.setupMin, dm: proceso.minPorUnidad, dp: proceso.plazoDias })
    .from(operacion)
    .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
    .where(inArray(operacion.piezaId, piezas.map((p) => p.id)))
    .orderBy(asc(operacion.secuencia));
  return piezas.map((p) => ({
    ...p,
    pasos: ops
      .filter((x) => x.o.piezaId === p.id)
      .map((x) => ({
        id: x.o.id,
        secuencia: x.o.secuencia,
        proceso: x.o.descripcion ? `${x.nombre} · ${x.o.descripcion}` : x.nombre,
        tipo: x.tipo,
        setupMin: x.o.setupMin,
        minPorUnidad: x.o.minPorUnidad,
        defSetup: x.ds,
        defMin: x.dm,
        plazo: x.o.plazoTercerizadoDias ?? x.dp,
        origen: x.o.tiempoOrigen,
      })),
  }));
}
