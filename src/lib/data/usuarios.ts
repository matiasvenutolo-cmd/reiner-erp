/**
 * Usuarios. REINER todavía no envió su listado real de operarios y puestos
 * (insumo pendiente #11 del PDF de reunión) — los cuatro usuarios de demo
 * (Adrián, Julián, Horacio, Nico) están sembrados en la base por
 * scripts/seed-db.ts, con los cuatro roles mínimos de RF-12.
 *
 * Desde la devolución del cliente del 2026-09-19 (docs/05-backlog-release-2.md
 * §5, §6), estos usuarios tienen credenciales reales (contraseña o PIN) y
 * `/usuarios` permite administrar altas y roles — antes era sólo un selector
 * de wayfinding sin autenticación.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { usuario } from "@/lib/db/schema";
import type { Usuario } from "@/lib/db/schema";
import { hashSecret } from "@/lib/auth/hash";

export async function getUsuario(id: string): Promise<Usuario | undefined> {
  const [row] = await db.select().from(usuario).where(eq(usuario.id, id));
  return row;
}

export async function getUsuarioPorEmail(email: string): Promise<Usuario | undefined> {
  const [row] = await db.select().from(usuario).where(eq(usuario.email, email.trim().toLowerCase()));
  return row;
}

export async function getUsuarios(): Promise<Usuario[]> {
  return db.select().from(usuario);
}

export async function getUsuariosPorRol(rol: Usuario["rol"]): Promise<Usuario[]> {
  return db.select().from(usuario).where(eq(usuario.rol, rol));
}

// Marcas diacríticas combinantes que deja `normalize("NFD")` (tildes, etc.).
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

function slugId(nombre: string): string {
  const base = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export type NuevoUsuarioInput = {
  nombre: string;
  rol: Usuario["rol"];
  email?: string;
  secreto: string; // contraseña (staff) o PIN (operario), en texto plano — se hashea acá
};

export async function crearUsuario(input: NuevoUsuarioInput): Promise<Usuario> {
  const hash = await hashSecret(input.secreto);
  const [nuevo] = await db
    .insert(usuario)
    .values({
      id: slugId(input.nombre),
      nombre: input.nombre,
      email: input.email?.trim().toLowerCase() || null,
      rol: input.rol,
      passwordHash: input.rol === "operario" ? null : hash,
      pinHash: input.rol === "operario" ? hash : null,
    })
    .returning();
  return nuevo;
}

export async function actualizarRolUsuario(id: string, rol: Usuario["rol"]): Promise<void> {
  await db.update(usuario).set({ rol, updatedAt: new Date() }).where(eq(usuario.id, id));
}

export async function actualizarActivoUsuario(id: string, activo: boolean): Promise<void> {
  await db.update(usuario).set({ activo, updatedAt: new Date() }).where(eq(usuario.id, id));
}

/** Restablece contraseña (staff) o PIN (operario) según el rol actual del usuario. */
export async function restablecerCredencial(id: string, secreto: string): Promise<void> {
  const existente = await getUsuario(id);
  if (!existente) throw new Error("Usuario inexistente");
  const hash = await hashSecret(secreto);
  const campo = existente.rol === "operario" ? { pinHash: hash } : { passwordHash: hash };
  await db.update(usuario).set({ ...campo, updatedAt: new Date() }).where(eq(usuario.id, id));
}
