"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { generarOtMaquina, actualizarCantidadAFabricar, completarOtConjunto, generarOtPiezaSuelta } from "@/lib/data/ot";

export async function crearOtMaquinaAction(formData: FormData) {
  const configuracionId = String(formData.get("configuracionId") ?? "");
  const numeroSerie = String(formData.get("numeroSerie") ?? "").trim();
  const clienteId = String(formData.get("clienteId") ?? "").trim();
  const ordenCompra = String(formData.get("ordenCompra") ?? "").trim();
  const plazoEntrega = String(formData.get("plazoEntrega") ?? "").trim();
  const emitidoPor = String(formData.get("emitidoPor") ?? "").trim();

  if (!configuracionId || !numeroSerie || !clienteId || !emitidoPor) {
    throw new Error("Faltan datos obligatorios: configuración, número de serie, cliente y emitido por.");
  }

  const id = await generarOtMaquina({
    configuracionId,
    numeroSerie,
    clienteId,
    ordenCompra: ordenCompra || undefined,
    plazoEntrega: plazoEntrega || undefined,
    emitidoPor,
  });

  revalidatePath("/ot");
  redirect(`/ot/${id}`);
}

export async function actualizarCantidadAction(formData: FormData) {
  const otPiezaId = String(formData.get("otPiezaId") ?? "");
  const cantidad = Number(formData.get("cantidad") ?? 0);
  const otMaquinaId = String(formData.get("otMaquinaId") ?? "");
  await actualizarCantidadAFabricar(otPiezaId, cantidad);
  revalidatePath(`/ot/${otMaquinaId}`);
}

export async function completarOtConjuntoAction(formData: FormData) {
  const otMaquinaId = String(formData.get("otMaquinaId") ?? "");
  const otConjuntoId = String(formData.get("otConjuntoId") ?? "");
  if (!otMaquinaId || !otConjuntoId) throw new Error("Faltan datos.");

  await completarOtConjunto(otConjuntoId);
  revalidatePath(`/ot/${otMaquinaId}`);
}

export async function agregarPiezaSueltaAction(formData: FormData) {
  const otMaquinaId = String(formData.get("otMaquinaId") ?? "");
  const otConjuntoId = String(formData.get("otConjuntoId") ?? "");
  const piezaId = String(formData.get("piezaId") ?? "");
  const cantidad = Number(formData.get("cantidad"));

  if (!otMaquinaId || !otConjuntoId || !piezaId || !Number.isFinite(cantidad) || cantidad <= 0) {
    throw new Error("Faltan datos o la cantidad es inválida.");
  }

  await generarOtPiezaSuelta({ otConjuntoId, piezaId, cantidadAFabricar: cantidad });
  revalidatePath(`/ot/${otMaquinaId}`);
}
