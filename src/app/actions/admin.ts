"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "@/lib/revalidar";
import { getUsuarioDePlanta } from "@/lib/session";
import { seccionesConfigurables } from "@/lib/nav";
import { guardarVisibilidadSecciones } from "@/lib/data/secciones";
import { archivarConfiguracion, archivarOrden, desarchivarOrden } from "@/lib/data/archivo";

/** Mostrar u ocultar secciones del menú (reorganización 30/10 §1). Se guarda lo tildado de cada una. */
export async function guardarSeccionesAction(fd: FormData) {
  await getUsuarioDePlanta();
  const visibles = new Set(fd.getAll("visible").map(String));
  const v: Record<string, boolean> = {};
  // Se guarda sólo lo que difiere del valor por defecto, así un cambio de menú futuro no queda pisado.
  for (const s of seccionesConfigurables()) if (visibles.has(s.href) === s.ocultaPorDefecto) v[s.href] = visibles.has(s.href);
  await guardarVisibilidadSecciones(v);
  revalidatePath("/", "layout");
  redirect(`/admin/secciones?ok=${encodeURIComponent("Menú guardado.")}`);
}

/** Archivar o desarchivar una configuración de máquina o una orden (§6.1). No se borra nada. */
export async function archivoAction(fd: FormData) {
  const u = await getUsuarioDePlanta();
  const que = String(fd.get("que") ?? "");
  const id = String(fd.get("id") ?? "");
  const archivar = String(fd.get("archivar") ?? "") === "1";
  if (!id) throw new Error("Falta qué archivar.");
  if (que === "configuracion") await archivarConfiguracion(id, archivar);
  else if (que === "orden") await (archivar ? archivarOrden(id, u.id) : desarchivarOrden(id, u.id));
  else throw new Error("No sé qué archivar.");
  revalidatePath("/", "layout");
  redirect(`/admin/archivados?ok=${encodeURIComponent(archivar ? "Archivado: ya no se ve ni se calcula." : "Desarchivado: vuelve a verse igual que estaba.")}`);
}
