/**
 * Panel de revisión de retrabajo (Release 2, paquete 7 — pedido de Horacio,
 * ver docs/05-backlog-release-2.md §3, §9). Las tareas se crean solas desde
 * `finalizarOperacion` (src/lib/data/ejecucion.ts) cuando el cierre de una
 * pieza reporta defectuosas o retrabajadas — acá sólo se listan y se
 * resuelven.
 */
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tareaRevision, otPieza, pieza, otConjunto, otMaquina } from "@/lib/db/schema";
import type { TareaRevision } from "@/lib/db/schema";

export type TareaRevisionConDetalle = TareaRevision & {
  otPiezaCodigo: string;
  piezaNombre: string;
  otMaquinaId: string;
  otMaquinaCodigo: string;
};

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
  return rows.map((r) => ({
    ...r.tarea,
    otPiezaCodigo: r.otPiezaCodigo,
    piezaNombre: r.piezaNombre,
    otMaquinaId: r.otMaquinaId,
    otMaquinaCodigo: r.otMaquinaCodigo,
  }));
}

export async function resolverTareaRevision(id: string, resolucion: string, usuarioId: string): Promise<void> {
  await db
    .update(tareaRevision)
    .set({ estado: "resuelta", resolucion, resueltoPorId: usuarioId, resolvedAt: new Date() })
    .where(eq(tareaRevision.id, id));
}
