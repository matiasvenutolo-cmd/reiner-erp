"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import { crearProveedor, actualizarProveedor, type DatosProveedor } from "@/lib/data/logistica";

function datos(formData: FormData): DatosProveedor {
  return {
    razonSocial: String(formData.get("razonSocial") ?? ""),
    rubro: String(formData.get("rubro") ?? ""),
    condicion: String(formData.get("condicion") ?? ""),
  };
}

async function correr(fn: () => Promise<void>) {
  const usuario = await getUsuarioActual();
  if (usuario.rol === "operario") throw new Error("No autorizado.");
  let error: string | null = null;
  try {
    await fn();
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo guardar.";
  }
  if (error) redirect(`/proveedores?error=${encodeURIComponent(error)}`);
  revalidatePath("/proveedores");
  revalidatePath("/tercerizados");
  revalidatePath("/stock", "layout");
  redirect("/proveedores"); // limpia el mensaje de un intento anterior
}

export async function crearProveedorAction(formData: FormData) {
  await correr(() => crearProveedor(datos(formData)));
}

export async function actualizarProveedorAction(formData: FormData) {
  await correr(() => actualizarProveedor(String(formData.get("id") ?? ""), datos(formData)));
}
