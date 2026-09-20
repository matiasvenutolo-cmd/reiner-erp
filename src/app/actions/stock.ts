"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import { ajustarStock } from "@/lib/data/stock";

/**
 * Gateado a rol "taller" (Horacio) — lectura literal del pedido del cliente:
 * "esto solo lo podria hacer horacio digamos". Es una asunción, no una
 * confirmación: dejar afuera a ingeniería/dirección es un permiso inusual,
 * documentado como pregunta abierta en docs/05-backlog-release-2.md §9.
 */
async function exigirTaller() {
  const usuario = await getUsuarioActual();
  if (usuario.rol !== "taller") throw new Error("Sólo taller puede ajustar el stock.");
  return usuario;
}

export async function ajustarStockAction(formData: FormData) {
  const usuario = await exigirTaller();

  const piezaId = String(formData.get("piezaId") ?? "");
  const cantidadNueva = Number(formData.get("cantidadNueva"));
  const observacion = String(formData.get("observacion") ?? "").trim();

  if (!piezaId || !Number.isFinite(cantidadNueva) || cantidadNueva < 0) {
    throw new Error("Cantidad inválida.");
  }

  await ajustarStock({ piezaId, cantidadNueva, observacion: observacion || undefined, usuarioId: usuario.id });
  revalidatePath("/stock");
}
