"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import { registrarIngreso } from "@/lib/data/logistica";
import { registrarVueltaTercerizado } from "@/lib/data/compras";

function revalidar() {
  revalidatePath("/tercerizados");
  revalidatePath("/stock", "layout");
  revalidatePath("/avance");
  revalidatePath("/centros-trabajo");
}

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
  revalidar();
}

export async function registrarVueltaAction(formData: FormData) {
  const usuario = await getUsuarioActual();
  if (usuario.rol === "operario") throw new Error("No autorizado.");
  try {
    const cantidad = Number(formData.get("cantidad"));
    const controlResultado = String(formData.get("controlResultado") ?? "");
    if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error("Cantidad inválida.");
    if (controlResultado !== "ok" && controlResultado !== "no_ok") throw new Error("Falta el control de calidad.");
    await registrarVueltaTercerizado({
      otPiezaId: String(formData.get("otPiezaId") ?? ""),
      operacionId: String(formData.get("operacionId") ?? ""),
      cantidad,
      proveedorId: String(formData.get("proveedorId") ?? "") || undefined,
      controlResultado,
      observacion: String(formData.get("observacion") ?? "").trim() || undefined,
      usuarioId: usuario.id,
    });
  } catch (e) {
    redirect(`/tercerizados?error=${encodeURIComponent(e instanceof Error ? e.message : "No se pudo guardar.")}`);
  }
  revalidar();
}
