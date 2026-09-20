"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import { actualizarMaterialPieza, crearNotaPieza } from "@/lib/data/maestros";

export async function actualizarMaterialAction(formData: FormData) {
  await getUsuarioActual(); // exige sesión válida
  const piezaId = String(formData.get("piezaId") ?? "");
  const material = String(formData.get("material") ?? "").trim();
  if (!piezaId) throw new Error("Falta la pieza.");

  await actualizarMaterialPieza(piezaId, material);
  revalidatePath(`/maestros/pieza/${piezaId}`);
}

export async function crearNotaPiezaAction(formData: FormData) {
  const usuario = await getUsuarioActual();
  const piezaId = String(formData.get("piezaId") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const texto = String(formData.get("texto") ?? "").trim();

  if (!piezaId || (tipo !== "ingenieria" && tipo !== "produccion") || !texto) {
    throw new Error("Faltan datos: tipo de nota y texto.");
  }

  await crearNotaPieza({ piezaId, tipo, texto, usuarioId: usuario.id });
  revalidatePath(`/maestros/pieza/${piezaId}`);
}
