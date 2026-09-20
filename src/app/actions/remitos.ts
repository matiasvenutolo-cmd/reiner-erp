"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import { generarRemito } from "@/lib/data/remitos";

export async function generarRemitoAction(formData: FormData) {
  const usuario = await getUsuarioActual();

  const piezaId = String(formData.get("piezaId") ?? "");
  const cantidad = Number(formData.get("cantidad"));
  const destino = String(formData.get("destino") ?? "").trim();
  const observacion = String(formData.get("observacion") ?? "").trim();

  if (!piezaId || !Number.isFinite(cantidad) || cantidad <= 0 || !destino) {
    throw new Error("Faltan datos: pieza, cantidad y destino son obligatorios.");
  }

  const id = await generarRemito({ piezaId, cantidad, destino, observacion: observacion || undefined, usuarioId: usuario.id });
  revalidatePath("/logistica");
  revalidatePath("/remitos");
  redirect(`/remitos/${id}`);
}
