"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import { reordenarCola, asignarCentrosTrabajo } from "@/lib/data/produccion";

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

/**
 * Asigna a qué centro(s) de trabajo está "parado" un operario (docs/05-
 * backlog-release-2.md §5) — de varios a varios desde la 2ª ronda de
 * devolución de Fase 2 (pregunta 4): "un operario puede ocupar dos puestos,
 * un puesto de trabajo puede ser ocupado por dos operarios también". Manda
 * siempre la lista final completa (reemplaza, no suma/resta).
 */
export async function asignarCentroTrabajoAction(formData: FormData) {
  await getUsuarioActual();
  const usuarioId = String(formData.get("usuarioId") ?? "");
  const centroTrabajoIds = formData.getAll("centroTrabajoId").map(String).filter(Boolean);
  if (!usuarioId) throw new Error("Falta el usuario.");
  await asignarCentrosTrabajo(usuarioId, centroTrabajoIds);
  revalidatePath("/usuarios");
}
