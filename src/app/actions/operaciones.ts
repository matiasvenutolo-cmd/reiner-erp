"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import { puedeEditarMaestros } from "@/lib/permisos";
import { asignarTipoOperacion, crearCentro, renombrarCentro, eliminarCentro } from "@/lib/data/operaciones";

// Tipos de operación y centros son maestros: sólo ingeniería y dirección (ver src/lib/permisos.ts).
async function exigirEditorMaestros() {
  const usuario = await getUsuarioActual();
  if (!puedeEditarMaestros(usuario.rol)) throw new Error("No tenés permiso para modificar maestros.");
}

function revalidar() {
  for (const ruta of ["/operaciones", "/planificacion", "/centros-trabajo", "/taller", "/tercerizados", "/maestros", "/usuarios"]) {
    revalidatePath(ruta, "layout");
  }
}

async function correr(fn: () => Promise<void>) {
  await exigirEditorMaestros();
  try {
    await fn();
  } catch (e) {
    redirect(`/operaciones?error=${encodeURIComponent(e instanceof Error ? e.message : "No se pudo guardar.")}`);
  }
  revalidar();
}

export async function asignarTipoOperacionAction(formData: FormData) {
  await correr(() => asignarTipoOperacion(String(formData.get("procesoId") ?? ""), String(formData.get("destino") ?? "")));
}

export async function crearCentroAction(formData: FormData) {
  await correr(() => crearCentro(String(formData.get("nombre") ?? "")));
}

export async function renombrarCentroAction(formData: FormData) {
  await correr(() => renombrarCentro(String(formData.get("id") ?? ""), String(formData.get("nombre") ?? "")));
}

export async function eliminarCentroAction(formData: FormData) {
  await correr(() => eliminarCentro(String(formData.get("id") ?? "")));
}
