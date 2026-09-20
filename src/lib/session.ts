/**
 * Sesión real (RF-12): cookie httpOnly con un JWT firmado (ver
 * src/lib/auth/jwt.ts), verificada contra la base en cada lectura de
 * `getUsuarioActual`. Reemplaza el selector de rol sin credenciales de
 * Fase 1 — ver docs/05-backlog-release-2.md §6.
 *
 * `getUsuarioActual` mantiene la misma firma que antes (`Promise<Usuario>`)
 * a propósito: todas las pantallas que ya la llamaban (taller, OT, avance…)
 * siguen funcionando sin tocarlas. La diferencia es que ahora, sin sesión
 * válida, redirige a /login en vez de devolver el primer usuario de la base.
 */
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUsuario } from "@/lib/data/usuarios";
import { firmarSesion, verificarSesion } from "@/lib/auth/jwt";
import type { Usuario } from "@/lib/db/schema";

const COOKIE = "reiner_sesion";
const MAX_AGE_SEG = 60 * 60 * 24 * 30;

export async function crearSesion(usuario: Usuario) {
  const token = await firmarSesion({ usuarioId: usuario.id, rol: usuario.rol });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEG,
  });
}

export async function destruirSesion() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Sesión + usuario real, cacheado por render. Redirige a /login si no hay
 * sesión válida o el usuario fue desactivado. */
export const getUsuarioActual = cache(async (): Promise<Usuario> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  const payload = await verificarSesion(token);
  const usuario = payload ? await getUsuario(payload.usuarioId) : undefined;
  if (!usuario || !usuario.activo) redirect("/login");
  return usuario;
});
