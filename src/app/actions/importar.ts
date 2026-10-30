"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "@/lib/revalidar";
import { getUsuarioDePlanta } from "@/lib/session";
import { puedeEditarMaestros } from "@/lib/permisos";
import { leerArchivo, aplicarImportacion } from "@/lib/data/importar";
import { plural } from "@/lib/formato";

async function exigirEditor() {
  const u = await getUsuarioDePlanta();
  if (!puedeEditarMaestros(u.rol)) throw new Error("No tenés permiso para modificar piezas y hojas de ruta.");
  return u;
}

/** Sube el Excel y lleva a la vista previa. Todavía no guarda nada en los maestros. */
export async function subirExcelAction(fd: FormData) {
  const u = await exigirEditor();
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) redirect(`/maestros/importar?error=${encodeURIComponent("Elegí el archivo Excel.")}`);
  let id: string;
  try {
    id = await leerArchivo((archivo as File).name, await (archivo as File).arrayBuffer(), u.id);
  } catch (e) {
    redirect(`/maestros/importar?error=${encodeURIComponent(e instanceof Error ? e.message : "No se pudo leer el archivo.")}`);
  }
  redirect(`/maestros/importar?id=${id!}`);
}

/** Confirma la importación: guarda piezas y hojas de ruta. */
export async function confirmarImportacionAction(fd: FormData) {
  await exigirEditor();
  const id = String(fd.get("id") ?? "");
  let r: Record<string, number>;
  try {
    r = await aplicarImportacion(id);
  } catch (e) {
    redirect(`/maestros/importar?id=${id}&error=${encodeURIComponent(e instanceof Error ? e.message : "No se pudo guardar.")}`);
  }
  for (const ruta of ["/maestros", "/ot/nueva", "/proyectos"]) revalidatePath(ruta, "layout");
  const partes = [
    r!.piezasNuevas && `${plural(r!.piezasNuevas, "pieza nueva", "piezas nuevas")}`,
    r!.piezasActualizadas && `${plural(r!.piezasActualizadas, "pieza actualizada", "piezas actualizadas")}`,
    r!.pasosNuevos && `${plural(r!.pasosNuevos, "paso nuevo", "pasos nuevos")}`,
    r!.pasosActualizados && `${plural(r!.pasosActualizados, "paso actualizado", "pasos actualizados")}`,
  ].filter(Boolean);
  redirect(`/maestros/importar?ok=${encodeURIComponent(`Importación guardada: ${partes.join(" · ") || "sin cambios"}.`)}`);
}
