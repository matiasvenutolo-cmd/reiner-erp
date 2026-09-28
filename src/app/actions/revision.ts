"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import { resolverTareaRevision } from "@/lib/data/revision";

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
