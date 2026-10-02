"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import { asignarTrabajo, eliminarAsignacion } from "@/lib/data/planificacion";

export async function asignarTrabajoAction(formData: FormData) {
  const usuario = await getUsuarioActual();
  const otPiezaId = String(formData.get("otPiezaId") ?? "");
  const operacionId = String(formData.get("operacionId") ?? "");
  const operarioId = String(formData.get("operarioId") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  if (!otPiezaId || !operacionId || !operarioId || !fecha) {
    throw new Error("Faltan datos: pieza, operación, operario y fecha son obligatorios.");
  }

  await asignarTrabajo({ otPiezaId, operacionId, operarioId, fecha, asignadoPorId: usuario.id });
  revalidatePath("/planificacion", "layout");
  revalidatePath("/taller");
}

export async function eliminarAsignacionAction(formData: FormData) {
  await getUsuarioActual();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Falta la asignación.");

  await eliminarAsignacion(id);
  revalidatePath("/planificacion", "layout");
  revalidatePath("/taller");
}
