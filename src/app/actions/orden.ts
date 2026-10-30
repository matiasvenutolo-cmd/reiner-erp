"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "@/lib/revalidar";
import { getUsuarioDePlanta } from "@/lib/session";
import { tildarPasoInformativo } from "@/lib/data/orden-detalle";

/** Tildar como hecho un paso de Compras informativo (reorganización 30/10 §2.2). */
export async function tildarPasoInformativoAction(fd: FormData) {
  const u = await getUsuarioDePlanta();
  const otPiezaId = String(fd.get("otPiezaId") ?? "");
  const operacionId = String(fd.get("operacionId") ?? "");
  const volver = String(fd.get("volver") ?? "/proyectos");
  if (!otPiezaId || !operacionId) throw new Error("Faltan datos.");
  await tildarPasoInformativo(otPiezaId, operacionId, u.id);
  revalidatePath(volver.split("?")[0]);
  redirect(volver);
}
