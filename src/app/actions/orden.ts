"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "@/lib/revalidar";
import { getUsuarioActual, getUsuarioDePlanta } from "@/lib/session";
import { tildarPasoInformativo } from "@/lib/data/orden-detalle";
import { eliminarOrden } from "@/lib/data/eliminar-orden";

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

/** Eliminar una orden con todo lo que cuelga de ella (prueba 1, 05/11): sólo dirección. */
export async function eliminarOrdenAction(fd: FormData) {
  const u = await getUsuarioActual();
  if (u.rol !== "direccion") throw new Error("Sólo dirección puede eliminar una orden.");
  const { codigo } = await eliminarOrden(String(fd.get("otMaquinaId") ?? ""));
  for (const r of ["/proyectos", "/ot", "/gestion", "/indicadores", "/llegamos", "/compras", "/stock", "/taller", "/tercerizados"]) revalidatePath(r, "layout");
  redirect(`/proyectos?ok=${encodeURIComponent(`Orden ${codigo} eliminada, con todo lo que tenía cargado.`)}`);
}
