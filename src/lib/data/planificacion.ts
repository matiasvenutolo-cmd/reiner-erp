/**
 * Planificación semanal (Release 3, docs/06-backlog-release-3.md §4):
 * "asignar un trabajo específico a una persona, para un día determinado,
 * con anticipación (ej. planificar toda la semana siguiente)". Desde la
 * revisión del 2026-10-02 se asigna una operación puntual de la OT de pieza
 * (de ahí sale el centro de trabajo y la carga por centro × día).
 */
import { hoyISO } from "@/lib/fecha";
import { eq, and, gte, lte, inArray, asc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { asignacionTrabajo, otPieza, pieza, otConjunto, otMaquina, usuario, operacion, proceso, centroTrabajo } from "@/lib/db/schema";

export type AsignacionConDetalle = {
  id: string;
  fecha: string;
  otPiezaId: string;
  otPiezaCodigo: string;
  piezaNombre: string;
  otMaquinaCodigo: string;
  operarioId: string;
  operarioNombre: string;
  operacionId: string | null;
  operacionNombre: string | null;
  centroTrabajoId: string | null;
  centroNombre: string | null;
};

export async function getAsignacionesRango(desde: string, hasta: string): Promise<AsignacionConDetalle[]> {
  return db
    .select({
      id: asignacionTrabajo.id,
      fecha: asignacionTrabajo.fecha,
      otPiezaId: otPieza.id,
      otPiezaCodigo: otPieza.codigo,
      piezaNombre: pieza.nombre,
      otMaquinaCodigo: otMaquina.codigo,
      operarioId: usuario.id,
      operarioNombre: usuario.nombre,
      operacionId: asignacionTrabajo.operacionId,
      operacionNombre: sql<string | null>`coalesce(nullif(trim(${operacion.descripcion}), ''), ${proceso.nombre})`,
      centroTrabajoId: centroTrabajo.id,
      centroNombre: centroTrabajo.nombre,
    })
    .from(asignacionTrabajo)
    .innerJoin(otPieza, eq(otPieza.id, asignacionTrabajo.otPiezaId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .innerJoin(usuario, eq(usuario.id, asignacionTrabajo.operarioId))
    .leftJoin(operacion, eq(operacion.id, asignacionTrabajo.operacionId))
    .leftJoin(proceso, eq(proceso.id, operacion.procesoId))
    .leftJoin(centroTrabajo, eq(centroTrabajo.id, proceso.centroTrabajoId))
    .where(and(gte(asignacionTrabajo.fecha, desde), lte(asignacionTrabajo.fecha, hasta)))
    .orderBy(asc(asignacionTrabajo.createdAt));
}

/** "otPiezaId::operacionId" de lo asignado de hoy en adelante — lo que ya no está pendiente de planificar. */
export async function getClavesAsignadasDesdeHoy(): Promise<Set<string>> {
  const filas = await db
    .select({ otPiezaId: asignacionTrabajo.otPiezaId, operacionId: asignacionTrabajo.operacionId })
    .from(asignacionTrabajo)
    .where(gte(asignacionTrabajo.fecha, hoyISO()));
  return new Set(filas.filter((f) => f.operacionId).map((f) => `${f.otPiezaId}::${f.operacionId}`));
}

export async function getAsignacionesDeHoy(operarioId: string): Promise<AsignacionConDetalle[]> {
  const hoy = hoyISO();
  const todas = await getAsignacionesRango(hoy, hoy);
  return todas.filter((a) => a.operarioId === operarioId);
}

export async function asignarTrabajo(input: {
  otPiezaId: string;
  operacionId: string;
  operarioId: string;
  fecha: string;
  asignadoPorId: string;
}): Promise<void> {
  await db.insert(asignacionTrabajo).values(input);
}

export async function eliminarAsignacion(id: string): Promise<void> {
  await db.delete(asignacionTrabajo).where(eq(asignacionTrabajo.id, id));
}

export type AsignacionVigente = { fecha: string; operarioNombre: string };

/**
 * Asignación vigente (hoy o a futuro) de cada OT de pieza — batcheado para
 * usar en /centros-trabajo (pedido del cliente: poder ver de un vistazo "si
 * está asignada, quién la tiene asignada" — docs/06-backlog-release-3.md
 * §13). Si una pieza tiene varias asignaciones futuras se queda con la más
 * próxima; una asignación vencida (de un día ya pasado) no cuenta como
 * vigente.
 */
export async function getAsignacionesVigentesBatch(otPiezaIds: string[]): Promise<Map<string, AsignacionVigente>> {
  if (otPiezaIds.length === 0) return new Map();
  const hoy = hoyISO();
  const filas = await db
    .select({
      otPiezaId: asignacionTrabajo.otPiezaId,
      fecha: asignacionTrabajo.fecha,
      operarioNombre: usuario.nombre,
    })
    .from(asignacionTrabajo)
    .innerJoin(usuario, eq(usuario.id, asignacionTrabajo.operarioId))
    .where(and(inArray(asignacionTrabajo.otPiezaId, otPiezaIds), gte(asignacionTrabajo.fecha, hoy)))
    .orderBy(asc(asignacionTrabajo.fecha));

  const map = new Map<string, AsignacionVigente>();
  for (const f of filas) {
    if (!map.has(f.otPiezaId)) map.set(f.otPiezaId, { fecha: f.fecha, operarioNombre: f.operarioNombre });
  }
  return map;
}
