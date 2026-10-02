"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import { asignarTipoOperacion, crearCentro, renombrarCentro, eliminarCentro } from "@/lib/data/operaciones";

async function exigirStaff() {
  const usuario = await getUsuarioActual();
  if (usuario.rol === "operario") throw new Error("No autorizado.");
}

function revalidar() {
  for (const ruta of ["/operaciones", "/planificacion", "/centros-trabajo", "/taller", "/tercerizados", "/maestros", "/usuarios"]) {
    revalidatePath(ruta, "layout");
  }
}

async function correr(fn: () => Promise<void>) {
  await exigirStaff();
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
