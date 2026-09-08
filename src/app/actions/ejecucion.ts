"use server";

import { revalidatePath } from "next/cache";
import {
  iniciarOperacion,
  pausarOperacion,
  reanudarOperacion,
  finalizarOperacion,
  esUltimaOperacion,
} from "@/lib/data/ejecucion";
import { getUsuarioActual } from "@/lib/session";

export async function iniciarOperacionAction(formData: FormData): Promise<void> {
  const usuario = await getUsuarioActual();
  const otPiezaId = String(formData.get("otPiezaId") ?? "");
  const operacionId = String(formData.get("operacionId") ?? "");
  const tipo = String(formData.get("tipo") ?? "ejecucion") as "setup" | "ejecucion";

  // El guard de "una sola operación abierta por operario" ya se aplica en el
  // render de /taller/[otPiezaId] (no se muestran los botones de iniciar si
  // hay una abierta en otra pieza); acá sólo se usa como defensa adicional.
  const resultado = await iniciarOperacion({ otPiezaId, operacionId, usuarioId: usuario.id, tipo });
  if (!resultado.ok) {
    throw new Error(resultado.error);
  }
  revalidatePath("/taller");
}

export async function pausarOperacionAction(formData: FormData) {
  const registroOperacionId = String(formData.get("registroOperacionId") ?? "");
  const tipoParadaId = String(formData.get("tipoParadaId") ?? "");
  await pausarOperacion(registroOperacionId, tipoParadaId);
  revalidatePath("/taller");
}

export async function reanudarOperacionAction(formData: FormData) {
  const registroOperacionId = String(formData.get("registroOperacionId") ?? "");
  await reanudarOperacion(registroOperacionId);
  revalidatePath("/taller");
}

export async function finalizarOperacionAction(formData: FormData) {
  const registroOperacionId = String(formData.get("registroOperacionId") ?? "");
  const otPiezaId = String(formData.get("otPiezaId") ?? "");
  const operacionId = String(formData.get("operacionId") ?? "");
  const piezasOk = Number(formData.get("piezasOk") ?? 0);
  const piezasRechazadas = Number(formData.get("piezasRechazadas") ?? 0);
  const observacion = String(formData.get("observacion") ?? "").trim() || undefined;

  const esUltima = await esUltimaOperacion(otPiezaId, operacionId);
  let cierrePieza: { piezasNoOk: number; piezasDefectuosas: number; piezasRetrabajadas: number } | undefined;
  if (esUltima) {
    cierrePieza = {
      piezasNoOk: Number(formData.get("piezasNoOk") ?? 0),
      piezasDefectuosas: Number(formData.get("piezasDefectuosas") ?? 0),
      piezasRetrabajadas: Number(formData.get("piezasRetrabajadas") ?? 0),
    };
  }

  await finalizarOperacion({ registroOperacionId, piezasOk, piezasRechazadas, observacion, cierrePieza });
  revalidatePath("/taller");
  revalidatePath("/avance");
  revalidatePath("/ot");
}
