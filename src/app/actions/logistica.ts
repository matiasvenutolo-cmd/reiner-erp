"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import { registrarIngreso, registrarEgreso } from "@/lib/data/logistica";

export async function registrarIngresoAction(formData: FormData) {
  const usuario = await getUsuarioActual();

  const piezaId = String(formData.get("piezaId") ?? "");
  const cantidad = Number(formData.get("cantidad"));
  const proveedorId = String(formData.get("proveedorId") ?? "") || undefined;
  const controlResultado = String(formData.get("controlResultado") ?? "");
  const observacion = String(formData.get("observacion") ?? "").trim();

  if (!piezaId || !Number.isFinite(cantidad) || cantidad <= 0) {
    throw new Error("Falta la pieza o la cantidad es inválida.");
  }
  if (controlResultado !== "ok" && controlResultado !== "no_ok") {
    throw new Error("Falta el resultado del control de calidad.");
  }

  await registrarIngreso({
    piezaId,
    cantidad,
    proveedorId,
    controlResultado,
    observacion: observacion || undefined,
    usuarioId: usuario.id,
  });
  revalidatePath("/logistica");
}

export async function registrarEgresoAction(formData: FormData) {
  const usuario = await getUsuarioActual();

  const piezaId = String(formData.get("piezaId") ?? "");
  const cantidad = Number(formData.get("cantidad"));
  const observacion = String(formData.get("observacion") ?? "").trim();

  if (!piezaId || !Number.isFinite(cantidad) || cantidad <= 0) {
    throw new Error("Falta la pieza o la cantidad es inválida.");
  }

  await registrarEgreso({ piezaId, cantidad, observacion: observacion || undefined, usuarioId: usuario.id });
  revalidatePath("/logistica");
}
