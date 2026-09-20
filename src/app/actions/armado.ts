"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import { registrarControlArmado } from "@/lib/data/armado";

export async function registrarControlArmadoAction(formData: FormData) {
  const usuario = await getUsuarioActual();

  const otMaquinaId = String(formData.get("otMaquinaId") ?? "");
  const otConjuntoId = String(formData.get("otConjuntoId") ?? "");
  const procedimientoId = String(formData.get("procedimientoId") ?? "") || undefined;
  const resultado = String(formData.get("resultado") ?? "");
  const observacion = String(formData.get("observacion") ?? "").trim();

  if (!otMaquinaId || !otConjuntoId || (resultado !== "ok" && resultado !== "no_ok")) {
    throw new Error("Faltan datos o el resultado es inválido.");
  }

  await registrarControlArmado({
    otConjuntoId,
    procedimientoId,
    resultado,
    observacion: observacion || undefined,
    usuarioId: usuario.id,
  });
  revalidatePath(`/ot/${otMaquinaId}`);
}
