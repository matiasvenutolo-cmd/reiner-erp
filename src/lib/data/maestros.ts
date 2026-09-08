/**
 * Lecturas de maestros: modelo → configuración → conjunto → pieza →
 * operación. Todo lo que sale de los Excel del cliente (ver
 * docs/01-analisis.md y docs/migracion-datos.md).
 *
 * Consulta Postgres (Neon) vía Drizzle. Antes de conectar la base esto leía
 * un array en memoria cargado de fixtures JSON — la firma de cada función
 * no cambió, así que ninguna pantalla tuvo que tocarse (ver docs/01 §6).
 */
import { eq, inArray, asc, or, ilike } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  modelo,
  configuracion,
  conjunto,
  conjuntoModelo,
  proceso,
  dispositivo,
  pieza,
  piezaConfiguracion,
  operacion,
} from "@/lib/db/schema";
import type { Modelo, Configuracion, Conjunto, Pieza, Proceso } from "@/lib/db/schema";

/**
 * El modelo de una pieza no es un campo propio en la base (una pieza puede
 * compartirse entre familias, ver hallazgo de migración §3). Para mostrar
 * en la UI de qué familia es "nativa", se infiere del prefijo del código,
 * igual que scripts/migrate-excel.ts.
 */
export function modeloDeCodigo(codigo: string): "RD" | "PS" {
  return /^RD\d/i.test(codigo) ? "RD" : "PS";
}

export async function getModelos(): Promise<Modelo[]> {
  return db.select().from(modelo);
}

export async function getModelo(id: string): Promise<Modelo | undefined> {
  const [row] = await db.select().from(modelo).where(eq(modelo.id, id));
  return row;
}

export async function getConfiguraciones(modeloId?: string): Promise<Configuracion[]> {
  const query = db.select().from(configuracion);
  return modeloId ? query.where(eq(configuracion.modeloId, modeloId)) : query;
}

export async function getConfiguracion(id: string): Promise<Configuracion | undefined> {
  const [row] = await db.select().from(configuracion).where(eq(configuracion.id, id));
  return row;
}

export async function getConjuntos(modeloId?: string): Promise<Conjunto[]> {
  if (!modeloId) {
    return db.select().from(conjunto).orderBy(asc(conjunto.orden));
  }
  const rows = await db
    .select({ conjunto })
    .from(conjuntoModelo)
    .innerJoin(conjunto, eq(conjunto.id, conjuntoModelo.conjuntoId))
    .where(eq(conjuntoModelo.modeloId, modeloId))
    .orderBy(asc(conjunto.orden));
  return rows.map((r) => r.conjunto);
}

export async function getConjunto(id: string): Promise<Conjunto | undefined> {
  const [row] = await db.select().from(conjunto).where(eq(conjunto.id, id));
  return row;
}

export async function getProcesos(): Promise<Proceso[]> {
  return db.select().from(proceso).orderBy(asc(proceso.ordenFlujo));
}

export async function getProceso(id: string): Promise<Proceso | undefined> {
  const [row] = await db.select().from(proceso).where(eq(proceso.id, id));
  return row;
}

/** Piezas que aplican a una configuración dada, con su cantidad necesaria. */
export async function getPiezasPorConfiguracion(
  configuracionId: string,
): Promise<(Pieza & { cantidadNecesaria: number })[]> {
  const rows = await db
    .select({ pieza, cantidadNecesaria: piezaConfiguracion.cantidadNecesaria })
    .from(piezaConfiguracion)
    .innerJoin(pieza, eq(pieza.id, piezaConfiguracion.piezaId))
    .where(eq(piezaConfiguracion.configuracionId, configuracionId));
  return rows.map((r) => ({ ...r.pieza, cantidadNecesaria: r.cantidadNecesaria }));
}

export async function getPiezasPorConjunto(conjuntoId: string, modeloId?: string): Promise<Pieza[]> {
  if (!modeloId) {
    return db.select().from(pieza).where(eq(pieza.conjuntoId, conjuntoId));
  }
  // El modelo de una pieza no es un campo propio: se infiere por qué
  // configuraciones (y por lo tanto qué modelo) la usan.
  const rows = await db
    .select({ pieza })
    .from(pieza)
    .innerJoin(piezaConfiguracion, eq(piezaConfiguracion.piezaId, pieza.id))
    .innerJoin(configuracion, eq(configuracion.id, piezaConfiguracion.configuracionId))
    .where(eq(pieza.conjuntoId, conjuntoId));
  const filtradas = rows.map((r) => r.pieza);
  const vistos = new Set<string>();
  const unicas: Pieza[] = [];
  for (const p of filtradas) {
    if (!vistos.has(p.id)) {
      vistos.add(p.id);
      unicas.push(p);
    }
  }
  return unicas;
}

export async function getPieza(id: string): Promise<Pieza | undefined> {
  const [row] = await db.select().from(pieza).where(eq(pieza.id, id));
  return row;
}

export async function getPiezas(modeloId?: string): Promise<Pieza[]> {
  if (!modeloId) return db.select().from(pieza);
  return getPiezasPorModelo(modeloId);
}

async function getPiezasPorModelo(modeloId: string): Promise<Pieza[]> {
  const rows = await db
    .select({ pieza })
    .from(pieza)
    .innerJoin(piezaConfiguracion, eq(piezaConfiguracion.piezaId, pieza.id))
    .innerJoin(configuracion, eq(configuracion.id, piezaConfiguracion.configuracionId))
    .where(eq(configuracion.modeloId, modeloId));
  const vistos = new Set<string>();
  const unicas: Pieza[] = [];
  for (const r of rows) {
    if (!vistos.has(r.pieza.id)) {
      vistos.add(r.pieza.id);
      unicas.push(r.pieza);
    }
  }
  return unicas;
}

export type OperacionConDetalle = {
  id: string;
  secuencia: number;
  ops: number;
  proceso: Proceso;
  dispositivoNombre: string | null;
};

/** Hoja de ruta de una pieza: sus operaciones en secuencia, con el proceso resuelto. */
export async function getRoutingPieza(piezaId: string): Promise<OperacionConDetalle[]> {
  const rows = await db
    .select({ operacion, proceso, dispositivoNombre: dispositivo.nombre })
    .from(operacion)
    .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
    .leftJoin(dispositivo, eq(dispositivo.id, operacion.dispositivoId))
    .where(eq(operacion.piezaId, piezaId))
    .orderBy(asc(operacion.secuencia));
  return rows.map((r) => ({
    id: r.operacion.id,
    secuencia: r.operacion.secuencia,
    ops: r.operacion.ops ?? 1,
    proceso: r.proceso,
    dispositivoNombre: r.dispositivoNombre,
  }));
}

export async function contarPiezasPorConjunto(modeloId?: string): Promise<Record<string, number>> {
  const piezas = await getPiezas(modeloId);
  const conteo: Record<string, number> = {};
  for (const p of piezas) conteo[p.conjuntoId] = (conteo[p.conjuntoId] ?? 0) + 1;
  return conteo;
}

/** Busca piezas por código o nombre (usado en /stock). */
export async function buscarPiezas(query: string, limite = 30): Promise<Pieza[]> {
  const patron = `%${query}%`;
  return db
    .select()
    .from(pieza)
    .where(or(ilike(pieza.codigo, patron), ilike(pieza.nombre, patron)))
    .limit(limite);
}

/** Trae varias piezas de una sola consulta (evita N+1 en listados). */
export async function getPiezasPorIds(ids: string[]): Promise<Map<string, Pieza>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(pieza).where(inArray(pieza.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}
