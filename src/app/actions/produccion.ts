"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getUsuarioActual } from "@/lib/session";
import { reordenarCola } from "@/lib/data/produccion";
import { db } from "@/lib/db/client";
import { usuario } from "@/lib/db/schema";

/** Reordena la cola de "disponible ahora" de un centro a partir de un
 * arrastre en la UI (Release 3 — reemplaza las flechas de subir/bajar de
 * Release 2, ver docs/06-backlog-release-3.md §13: "se consideró incómodo
 * ese mecanismo"). Recibe la lista completa ya reordenada, no un solo paso. */
export async function reordenarColaAction(centroTrabajoId: string, ordenOtPiezaIds: string[]) {
  await getUsuarioActual(); // exige sesión válida
  if (!centroTrabajoId || ordenOtPiezaIds.length === 0) return;
  await reordenarCola(centroTrabajoId, ordenOtPiezaIds);
  revalidatePath("/centros-trabajo");
}

/** Asigna a qué centro de trabajo está "parado" un operario (docs/05-backlog-release-2.md §5). */
export async function asignarCentroTrabajoAction(formData: FormData) {
  await getUsuarioActual();
  const usuarioId = String(formData.get("usuarioId") ?? "");
  const centroTrabajoId = String(formData.get("centroTrabajoId") ?? "") || null;
  if (!usuarioId) throw new Error("Falta el usuario.");
  await db.update(usuario).set({ centroTrabajoId, updatedAt: new Date() }).where(eq(usuario.id, usuarioId));
  revalidatePath("/usuarios");
}
