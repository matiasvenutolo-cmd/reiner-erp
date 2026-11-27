"use server";

import { revalidatePath } from "@/lib/revalidar";
import { redirect } from "next/navigation";
import { getUsuarioDePlanta } from "@/lib/session";
import { registrarControlArmado } from "@/lib/data/armado";

export async function registrarControlArmadoAction(formData: FormData) {
  const usuario = await getUsuarioDePlanta();
  // Fallas 26/11: el cierre (control final) lo registra sólo el jefe de planta, no los operarios.
  if (usuario.rol !== "taller") throw new Error("El cierre de la orden lo registra el jefe de planta.");

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
  // Con el armado OK el conjunto entra a Productos terminados (tanda 2, 05/11).
  revalidatePath("/stock", "layout");
  revalidatePath(`/proyectos/${otMaquinaId}`);
  revalidatePath("/proyectos");
  redirect(`/proyectos/${otMaquinaId}?ok=${encodeURIComponent(resultado === "ok" ? "Control final registrado: OK." : "Control final registrado: NO OK.")}`);
}
