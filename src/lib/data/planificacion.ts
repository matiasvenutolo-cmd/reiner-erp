/**
 * Planificación semanal (Release 3, docs/06-backlog-release-3.md §4):
 * "asignar un trabajo específico a una persona, para un día determinado,
 * con anticipación (ej. planificar toda la semana siguiente)". Asigna una
 * OT de pieza completa a un operario para un día — no se borra sola si la
 * pieza avanza de etapa antes de esa fecha, queda como referencia de que
 * alguien se comprometió a mirarla ese día.
 */
import { eq, and, gte, lte, inArray, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { asignacionTrabajo, otPieza, pieza, otConjunto, otMaquina, usuario } from "@/lib/db/schema";

export type AsignacionConDetalle = {
  id: string;
  fecha: string;
  otPiezaId: string;
  otPiezaCodigo: string;
  piezaNombre: string;
  otMaquinaCodigo: string;
  operarioId: string;
  operarioNombre: string;
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
    })
    .from(asignacionTrabajo)
    .innerJoin(otPieza, eq(otPieza.id, asignacionTrabajo.otPiezaId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .innerJoin(usuario, eq(usuario.id, asignacionTrabajo.operarioId))
    .where(and(gte(asignacionTrabajo.fecha, desde), lte(asignacionTrabajo.fecha, hasta)));
}

export async function getAsignacionesDeHoy(operarioId: string): Promise<AsignacionConDetalle[]> {
  const hoy = new Date().toISOString().slice(0, 10);
  const todas = await getAsignacionesRango(hoy, hoy);
  return todas.filter((a) => a.operarioId === operarioId);
}

export async function asignarTrabajo(input: {
  otPiezaId: string;
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
  const hoy = new Date().toISOString().slice(0, 10);
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
