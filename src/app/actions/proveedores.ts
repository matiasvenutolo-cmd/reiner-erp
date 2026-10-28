"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "@/lib/revalidar";
import { getUsuarioActual } from "@/lib/session";
import { crearProveedor, actualizarProveedor, CAMPOS_PROVEEDOR, type DatosProveedor } from "@/lib/data/logistica";

function datos(formData: FormData): DatosProveedor {
  const d: DatosProveedor = { razonSocial: String(formData.get("razonSocial") ?? "") };
  // Sólo los campos que vinieron en el formulario: la edición rápida no borra los demás.
  for (const c of CAMPOS_PROVEEDOR) if (formData.has(c)) d[c] = String(formData.get(c) ?? "");
  return d;
}

/** Mismo acceso que antes (ingeniería, dirección y taller) más el perfil Compras. */
async function correr(fn: () => Promise<string | void>, volverA: (id?: string) => string) {
  const usuario = await getUsuarioActual();
  if (usuario.rol === "operario") throw new Error("No autorizado.");
  let error: string | null = null;
  let id: string | void = undefined;
  try {
    id = await fn();
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo guardar.";
  }
  if (error) redirect(`${volverA()}?error=${encodeURIComponent(error)}`);
  revalidatePath("/proveedores", "layout");
  revalidatePath("/tercerizados");
  revalidatePath("/stock", "layout");
  revalidatePath("/compras", "layout");
  redirect(`${volverA(id || undefined)}?guardado=1`);
}

export async function crearProveedorAction(formData: FormData) {
  await correr(
    () => crearProveedor(datos(formData)),
    (id) => (id ? `/proveedores/${id}` : "/proveedores"),
  );
}

export async function actualizarProveedorAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await correr(
    () => actualizarProveedor(id, datos(formData)),
    () => `/proveedores/${id}`,
  );
}
