"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "@/lib/revalidar";
import {
  iniciarOperacion,
  pausarOperacion,
  reanudarOperacion,
  finalizarOperacion,
  esUltimaOperacion,
} from "@/lib/data/ejecucion";
import { getUsuarioDePlanta } from "@/lib/session";

/** Vuelve a la ficha de la pieza: con el motivo si se rechazó (más piezas de las
 * que llegaron, otra operación en curso…), o limpia si salió bien — así no
 * queda colgado el mensaje de un intento anterior. */
async function enLaFicha(otPiezaId: string, fn: () => Promise<void>) {
  let error: string | null = null;
  try {
    await fn();
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo guardar.";
  }
  if (error) redirect(`/taller/${otPiezaId}?error=${encodeURIComponent(error)}`);
  revalidatePath("/taller", "layout");
  revalidatePath("/avance");
  revalidatePath("/inicio");
  revalidatePath("/ot", "layout");
  redirect(`/taller/${otPiezaId}`);
}

export async function iniciarOperacionAction(formData: FormData): Promise<void> {
  const usuario = await getUsuarioDePlanta();
  const otPiezaId = String(formData.get("otPiezaId") ?? "");
  const operacionId = String(formData.get("operacionId") ?? "");
  const tipo = String(formData.get("tipo") ?? "ejecucion") as "setup" | "ejecucion";

  // Las reglas (una sola en curso, paso que sigue, centro o asignación del
  // operario) se validan en el servidor, no sólo ocultando botones.
  await enLaFicha(otPiezaId, async () => {
    const resultado = await iniciarOperacion({ otPiezaId, operacionId, usuarioId: usuario.id, tipo });
    if (!resultado.ok) throw new Error(resultado.error);
  });
}

export async function pausarOperacionAction(formData: FormData) {
  const usuario = await getUsuarioDePlanta();
  const otPiezaId = String(formData.get("otPiezaId") ?? "");
  const registroOperacionId = String(formData.get("registroOperacionId") ?? "");
  const tipoParadaId = String(formData.get("tipoParadaId") ?? "");
  await enLaFicha(otPiezaId, () => pausarOperacion(registroOperacionId, tipoParadaId, usuario.id));
}

export async function reanudarOperacionAction(formData: FormData) {
  const usuario = await getUsuarioDePlanta();
  const otPiezaId = String(formData.get("otPiezaId") ?? "");
  const registroOperacionId = String(formData.get("registroOperacionId") ?? "");
  await enLaFicha(otPiezaId, () => reanudarOperacion(registroOperacionId, usuario.id));
}

export async function finalizarOperacionAction(formData: FormData) {
  const usuario = await getUsuarioDePlanta();
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

  await enLaFicha(otPiezaId, () =>
    finalizarOperacion({ registroOperacionId, usuarioId: usuario.id, piezasOk, piezasRechazadas, observacion, cierrePieza }),
  );
}
