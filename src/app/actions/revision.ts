"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import {
  resolverTareaRevision,
  agregarItemTareaRevision,
  iniciarItemTareaRevision,
  detenerItemTareaRevision,
  eliminarItemTareaRevision,
  getItemAbiertoDeTarea,
} from "@/lib/data/revision";

export async function resolverTareaRevisionAction(formData: FormData) {
  const usuario = await getUsuarioActual();
  const id = String(formData.get("id") ?? "");
  const resolucion = String(formData.get("resolucion") ?? "").trim();
  const otMaquinaId = String(formData.get("otMaquinaId") ?? "");
  const otPiezaId = String(formData.get("otPiezaId") ?? "");
  if (!id || !resolucion) throw new Error("Falta la resolución.");

  await resolverTareaRevision(id, resolucion, usuario.id);
  if (otMaquinaId && otPiezaId) revalidatePath(`/ot/${otMaquinaId}/pieza/${otPiezaId}`);
  if (otMaquinaId) revalidatePath(`/ot/${otMaquinaId}`);
  revalidatePath("/inicio");
}

function revalidarFichaPieza(formData: FormData) {
  const otMaquinaId = String(formData.get("otMaquinaId") ?? "");
  const otPiezaId = String(formData.get("otPiezaId") ?? "");
  if (otMaquinaId && otPiezaId) revalidatePath(`/ot/${otMaquinaId}/pieza/${otPiezaId}`);
}

export async function agregarItemTareaRevisionAction(formData: FormData) {
  await getUsuarioActual(); // exige sesión válida
  const tareaRevisionId = String(formData.get("tareaRevisionId") ?? "");
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  if (!tareaRevisionId || !descripcion) throw new Error("Falta la descripción de la tarea.");

  await agregarItemTareaRevision({ tareaRevisionId, descripcion });
  revalidarFichaPieza(formData);
}

export async function iniciarItemTareaRevisionAction(formData: FormData) {
  const usuario = await getUsuarioActual();
  const id = String(formData.get("id") ?? "");
  const tareaRevisionId = String(formData.get("tareaRevisionId") ?? "");
  if (!id) throw new Error("Falta la tarea.");

  const abierto = await getItemAbiertoDeTarea(tareaRevisionId);
  if (abierto && abierto.id !== id) throw new Error("Ya hay una tarea en curso en este retrabajo — detenela antes de iniciar otra.");

  await iniciarItemTareaRevision(id, usuario.id);
  revalidarFichaPieza(formData);
}

export async function detenerItemTareaRevisionAction(formData: FormData) {
  await getUsuarioActual(); // exige sesión válida
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Falta la tarea.");

  await detenerItemTareaRevision(id);
  revalidarFichaPieza(formData);
}

export async function eliminarItemTareaRevisionAction(formData: FormData) {
  await getUsuarioActual(); // exige sesión válida
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Falta la tarea.");

  await eliminarItemTareaRevision(id);
  revalidarFichaPieza(formData);
}
