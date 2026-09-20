"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getUsuarioActual } from "@/lib/session";
import { moverPrioridad } from "@/lib/data/produccion";
import { db } from "@/lib/db/client";
import { usuario } from "@/lib/db/schema";

export async function moverPrioridadAction(formData: FormData) {
  await getUsuarioActual(); // exige sesión válida
  const otPiezaId = String(formData.get("otPiezaId") ?? "");
  const centroTrabajoId = String(formData.get("centroTrabajoId") ?? "");
  const direccion = String(formData.get("direccion") ?? "");
  if (!otPiezaId || !centroTrabajoId || (direccion !== "subir" && direccion !== "bajar")) {
    throw new Error("Datos inválidos.");
  }
  await moverPrioridad(otPiezaId, centroTrabajoId, direccion);
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
