"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import {
  actualizarMaterialPieza,
  actualizarDescripcionOperacion,
  actualizarTipoPieza,
  actualizarStockMinimoPieza,
  crearNotaPieza,
  crearAdjuntoPieza,
  getAdjuntoPieza,
  eliminarAdjuntoPieza,
} from "@/lib/data/maestros";
import { subirAdjunto, eliminarAdjunto } from "@/lib/blob";

export async function actualizarMaterialAction(formData: FormData) {
  await getUsuarioActual(); // exige sesión válida
  const piezaId = String(formData.get("piezaId") ?? "");
  const material = String(formData.get("material") ?? "").trim();
  if (!piezaId) throw new Error("Falta la pieza.");

  await actualizarMaterialPieza(piezaId, material);
  revalidatePath(`/maestros/pieza/${piezaId}`);
}

export async function actualizarTipoPiezaAction(formData: FormData) {
  await getUsuarioActual(); // exige sesión válida
  const piezaId = String(formData.get("piezaId") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  if (!piezaId || (tipo !== "fabricada" && tipo !== "comprada")) throw new Error("Datos inválidos.");

  await actualizarTipoPieza(piezaId, tipo);
  revalidatePath(`/maestros/pieza/${piezaId}`);
  // Se revalida todo el árbol de Maestros: una pieza puede aparecer en más
  // de una máquina/conjunto (compra/fabricación es un atributo de la pieza,
  // no de dónde se la ve — ver `getResumenConjuntosDeConfiguracion`).
  revalidatePath("/maestros", "layout");
}

export async function actualizarStockMinimoAction(formData: FormData) {
  await getUsuarioActual(); // exige sesión válida
  const piezaId = String(formData.get("piezaId") ?? "");
  const stockMinimo = Number(formData.get("stockMinimo"));
  if (!piezaId || !Number.isFinite(stockMinimo) || stockMinimo < 0) throw new Error("Datos inválidos.");

  await actualizarStockMinimoPieza(piezaId, stockMinimo);
  revalidatePath(`/maestros/pieza/${piezaId}`);
  revalidatePath("/stock");
}

export async function actualizarDescripcionOperacionAction(formData: FormData) {
  await getUsuarioActual(); // exige sesión válida
  const operacionId = String(formData.get("operacionId") ?? "");
  const piezaId = String(formData.get("piezaId") ?? "");
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  if (!operacionId || !piezaId) throw new Error("Falta la operación.");

  await actualizarDescripcionOperacion(operacionId, descripcion);
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

const TAMANO_MAXIMO_ADJUNTO = 15 * 1024 * 1024; // 15 MB — de sobra para un plano o una foto de celular

export async function subirAdjuntoPiezaAction(formData: FormData) {
  const usuario = await getUsuarioActual();
  const piezaId = String(formData.get("piezaId") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const archivo = formData.get("archivo");

  if (!piezaId || (tipo !== "plano" && tipo !== "foto")) throw new Error("Datos inválidos.");
  if (!(archivo instanceof File) || archivo.size === 0) throw new Error("Elegí un archivo.");
  if (archivo.size > TAMANO_MAXIMO_ADJUNTO) throw new Error("El archivo no puede superar los 15 MB.");

  const { pathname } = await subirAdjunto(`piezas/${piezaId}`, archivo.name, archivo);
  await crearAdjuntoPieza({ piezaId, tipo, nombreArchivo: archivo.name, pathname, usuarioId: usuario.id });
  revalidatePath(`/maestros/pieza/${piezaId}`);
}

export async function eliminarAdjuntoPiezaAction(formData: FormData) {
  await getUsuarioActual(); // exige sesión válida
  const id = String(formData.get("id") ?? "");
  const piezaId = String(formData.get("piezaId") ?? "");
  if (!id || !piezaId) throw new Error("Falta el adjunto.");

  const adjunto = await getAdjuntoPieza(id);
  if (!adjunto) return;

  await eliminarAdjunto(adjunto.pathname);
  await eliminarAdjuntoPieza(id);
  revalidatePath(`/maestros/pieza/${piezaId}`);
}
