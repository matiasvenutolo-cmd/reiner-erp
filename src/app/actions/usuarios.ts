"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import {
  crearUsuario,
  actualizarRolUsuario,
  actualizarActivoUsuario,
  restablecerCredencial,
} from "@/lib/data/usuarios";
import type { Usuario } from "@/lib/db/schema";

const ROLES_VALIDOS: Usuario["rol"][] = ["operario", "taller", "ingenieria", "direccion"];

/** Gestión de accesos (docs/05-backlog-release-2.md §5, §6): "operario" queda
 * afuera aunque proxy.ts ya lo bloquea por ruta — cada Server Action valida
 * su propia autorización, no sólo el gate de navegación. */
async function exigirGestorDeAccesos() {
  const usuario = await getUsuarioActual();
  if (usuario.rol === "operario") throw new Error("No autorizado.");
  return usuario;
}

export async function crearUsuarioAction(formData: FormData) {
  await exigirGestorDeAccesos();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const rol = String(formData.get("rol") ?? "") as Usuario["rol"];
  const email = String(formData.get("email") ?? "").trim();
  const secreto = String(formData.get("secreto") ?? "").trim();

  if (!nombre || !ROLES_VALIDOS.includes(rol) || !secreto) {
    throw new Error("Faltan datos obligatorios: nombre, rol y contraseña/PIN.");
  }
  if (rol !== "operario" && !email) {
    throw new Error("Ingeniería, dirección y taller necesitan email para entrar.");
  }

  await crearUsuario({ nombre, rol, email: rol === "operario" ? undefined : email, secreto });
  revalidatePath("/usuarios");
}

export async function actualizarRolAction(formData: FormData) {
  await exigirGestorDeAccesos();
  const id = String(formData.get("usuarioId") ?? "");
  const rol = String(formData.get("rol") ?? "") as Usuario["rol"];
  if (!id || !ROLES_VALIDOS.includes(rol)) throw new Error("Datos inválidos.");
  await actualizarRolUsuario(id, rol);
  revalidatePath("/usuarios");
}

export async function alternarActivoAction(formData: FormData) {
  await exigirGestorDeAccesos();
  const id = String(formData.get("usuarioId") ?? "");
  const activo = formData.get("activo") === "true";
  if (!id) throw new Error("Datos inválidos.");
  await actualizarActivoUsuario(id, activo);
  revalidatePath("/usuarios");
}

export async function restablecerCredencialAction(formData: FormData) {
  await exigirGestorDeAccesos();
  const id = String(formData.get("usuarioId") ?? "");
  const secreto = String(formData.get("secreto") ?? "").trim();
  if (!id || !secreto) throw new Error("Falta la nueva contraseña/PIN.");
  await restablecerCredencial(id, secreto);
  revalidatePath("/usuarios");
}
