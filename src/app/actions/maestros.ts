"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import {
  actualizarMaterialPieza,
  actualizarDescripcionOperacion,
  actualizarTipoPieza,
  actualizarStockMinimoPieza,
  crearNotaPieza,
  getPieza,
} from "@/lib/data/maestros";

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
  const pieza = await getPieza(piezaId);
  if (pieza) revalidatePath(`/maestros/${pieza.conjuntoId}`);
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
