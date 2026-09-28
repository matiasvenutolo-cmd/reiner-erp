/**
 * Revisión de retrabajo. Las tareas se crean solas desde `finalizarOperacion`
 * (src/lib/data/ejecucion.ts) cuando el cierre de una pieza reporta
 * defectuosas o retrabajadas — acá sólo se listan y se resuelven.
 *
 * Release 2 (paquete 7) las mostraba en una pantalla `/revision`
 * independiente. El cliente pidió sacarla (Release 3, docs/06-backlog-
 * release-3.md §10): "no tendría sentido que el usuario tenga que ir a un
 * módulo independiente... debería poder registrarse directamente dentro
 * del seguimiento de esa pieza/OT". Ahora viven en la propia ficha de la OT
 * de pieza (`/ot/[id]/pieza/[otPiezaId]`) — este archivo sigue siendo el
 * único lugar que lee/escribe `tarea_revision`, sólo cambió quién lo llama.
 */
import { eq, desc, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tareaRevision, otPieza, pieza, otConjunto, otMaquina } from "@/lib/db/schema";
import type { TareaRevision } from "@/lib/db/schema";

export type TareaRevisionConDetalle = TareaRevision & {
  otPiezaCodigo: string;
  piezaNombre: string;
  otMaquinaId: string;
  otMaquinaCodigo: string;
};

function mapFila(r: {
  tarea: TareaRevision;
  otPiezaCodigo: string;
  piezaNombre: string;
  otMaquinaId: string;
  otMaquinaCodigo: string;
}): TareaRevisionConDetalle {
  return { ...r.tarea, otPiezaCodigo: r.otPiezaCodigo, piezaNombre: r.piezaNombre, otMaquinaId: r.otMaquinaId, otMaquinaCodigo: r.otMaquinaCodigo };
}

/** Todas las tareas, opcionalmente filtradas por estado — para la home. */
export async function getTareasRevision(estado?: "pendiente" | "resuelta"): Promise<TareaRevisionConDetalle[]> {
  const rows = await db
    .select({
      tarea: tareaRevision,
      otPiezaCodigo: otPieza.codigo,
      piezaNombre: pieza.nombre,
      otMaquinaId: otMaquina.id,
      otMaquinaCodigo: otMaquina.codigo,
    })
    .from(tareaRevision)
    .innerJoin(otPieza, eq(otPieza.id, tareaRevision.otPiezaId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .where(estado ? eq(tareaRevision.estado, estado) : undefined)
    .orderBy(desc(tareaRevision.createdAt));
  return rows.map(mapFila);
}

/** Las de UNA pieza puntual — lo que muestra su ficha de OT de pieza. */
export async function getTareasRevisionDePieza(otPiezaId: string): Promise<TareaRevisionConDetalle[]> {
  const rows = await db
    .select({
      tarea: tareaRevision,
      otPiezaCodigo: otPieza.codigo,
      piezaNombre: pieza.nombre,
      otMaquinaId: otMaquina.id,
      otMaquinaCodigo: otMaquina.codigo,
    })
    .from(tareaRevision)
    .innerJoin(otPieza, eq(otPieza.id, tareaRevision.otPiezaId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .where(eq(tareaRevision.otPiezaId, otPiezaId))
    .orderBy(desc(tareaRevision.createdAt));
  return rows.map(mapFila);
}

/** IDs de OT de pieza con revisión pendiente, para marcarlas en el listado de
 * la OT de máquina sin tener que abrir cada una. */
export async function getOtPiezaIdsConRevisionPendiente(otMaquinaId: string): Promise<Set<string>> {
  const rows = await db
    .select({ otPiezaId: tareaRevision.otPiezaId })
    .from(tareaRevision)
    .innerJoin(otPieza, eq(otPieza.id, tareaRevision.otPiezaId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .where(and(eq(otConjunto.otMaquinaId, otMaquinaId), eq(tareaRevision.estado, "pendiente")));
  return new Set(rows.map((r) => r.otPiezaId));
}

export async function resolverTareaRevision(id: string, resolucion: string, usuarioId: string): Promise<void> {
  await db
    .update(tareaRevision)
    .set({ estado: "resuelta", resolucion, resueltoPorId: usuarioId, resolvedAt: new Date() })
    .where(eq(tareaRevision.id, id));
}
