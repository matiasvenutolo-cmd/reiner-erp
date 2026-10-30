"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "@/lib/revalidar";
import { getUsuarioDePlanta } from "@/lib/session";
import { ajustarStock, retirarStock, cargarPiezaTerminada } from "@/lib/data/stock";
import { marcarPedido, cancelarPedido, registrarLlegadaPedido } from "@/lib/data/compras";

/**
 * Gateado a rol "taller" (Horacio) — lectura literal del pedido del cliente:
 * "esto solo lo podria hacer horacio digamos". Es una asunción, no una
 * confirmación: dejar afuera a ingeniería/dirección es un permiso inusual,
 * documentado como pregunta abierta en docs/05-backlog-release-2.md §9.
 */
async function exigirTaller() {
  const usuario = await getUsuarioDePlanta();
  if (usuario.rol !== "taller") throw new Error("Sólo taller puede ajustar el stock.");
  return usuario;
}

async function exigirStaff() {
  const usuario = await getUsuarioDePlanta();
  if (usuario.rol === "operario") throw new Error("No autorizado.");
  return usuario;
}

function volverCon(destino: string, error: unknown): never {
  const mensaje = error instanceof Error ? error.message : "No se pudo guardar.";
  redirect(`${destino}${destino.includes("?") ? "&" : "?"}error=${encodeURIComponent(mensaje)}`);
}

function revalidarStock() {
  revalidatePath("/stock", "layout");
  revalidatePath("/centros-trabajo");
  revalidatePath("/tercerizados");
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
  revalidarStock();
}

export async function retirarStockAction(formData: FormData) {
  const usuario = await exigirStaff();
  const piezaId = String(formData.get("piezaId") ?? "");
  const destino = `/stock/pieza/${piezaId}`;
  try {
    const cantidad = Number(formData.get("cantidad"));
    if (!piezaId || !Number.isInteger(cantidad) || cantidad <= 0) throw new Error("Cantidad inválida.");
    await retirarStock({
      piezaId,
      cantidad,
      otMaquinaId: String(formData.get("otMaquinaId") ?? "") || undefined,
      observacion: String(formData.get("observacion") ?? "").trim() || undefined,
      usuarioId: usuario.id,
    });
  } catch (e) {
    volverCon(destino, e);
  }
  revalidarStock();
  redirect(`${destino}?ok=retiro`);
}

export async function marcarPedidoAction(formData: FormData) {
  const usuario = await exigirStaff();
  const destino = "/stock/compras";
  try {
    const cantidad = Number(formData.get("cantidad"));
    if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error("Cantidad inválida.");
    await marcarPedido({
      otPiezaId: String(formData.get("otPiezaId") ?? ""),
      cantidad,
      proveedorId: String(formData.get("proveedorId") ?? "") || undefined,
      observacion: String(formData.get("observacion") ?? "").trim() || undefined,
      usuarioId: usuario.id,
    });
  } catch (e) {
    volverCon(destino, e);
  }
  revalidarStock();
}

export async function cancelarPedidoAction(formData: FormData) {
  await exigirStaff();
  try {
    await cancelarPedido(String(formData.get("pedidoId") ?? ""));
  } catch (e) {
    volverCon("/stock/compras", e);
  }
  revalidarStock();
}

export async function registrarLlegadaAction(formData: FormData) {
  const usuario = await exigirStaff();
  const destino = "/stock/compras";
  try {
    const controlResultado = String(formData.get("controlResultado") ?? "");
    if (controlResultado !== "ok" && controlResultado !== "no_ok") throw new Error("Falta el control de calidad.");
    await registrarLlegadaPedido({
      pedidoId: String(formData.get("pedidoId") ?? ""),
      controlResultado,
      operacionCompraId: String(formData.get("operacionCompraId") ?? "") || undefined,
      observacion: String(formData.get("observacion") ?? "").trim() || undefined,
      usuarioId: usuario.id,
    });
  } catch (e) {
    volverCon(destino, e);
  }
  revalidarStock();
  revalidatePath("/avance");
}

/** Cargar a mano una pieza terminada, con motivo (reorganización 30/10 §5.3). Mismo permiso que corregir el conteo. */
export async function cargarPiezaTerminadaAction(formData: FormData) {
  const usuario = await exigirTaller();
  const piezaId = String(formData.get("piezaId") ?? "").trim();
  const cantidad = Number(formData.get("cantidad"));
  const motivo = String(formData.get("motivo") ?? "").trim();
  const volver = "/stock/finalizado?tipo=fabricada";
  try {
    if (!piezaId) throw new Error("Elegí la pieza.");
    await cargarPiezaTerminada({ piezaId, cantidad, motivo, usuarioId: usuario.id });
  } catch (e) {
    redirect(`${volver}&error=${encodeURIComponent(e instanceof Error ? e.message : "No se pudo cargar.")}`);
  }
  revalidarStock();
  redirect(`${volver}&ok=${encodeURIComponent("Pieza cargada en Piezas terminadas.")}`);
}
