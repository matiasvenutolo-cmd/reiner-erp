/**
 * Sesión de demo: qué usuario está "logueado", guardado en una cookie.
 *
 * No es autenticación real — es el selector de rol para navegar el mockup
 * como cada perfil (RF-12). Auth.js v5 con roles reales es tarea de
 * conexión a Postgres, no de esta etapa (ver docs/01-analisis.md §5).
 */
import { cookies } from "next/headers";
import { getUsuario, USUARIOS_DEMO } from "@/lib/data/usuarios";
import type { Usuario } from "@/lib/db/schema";

const COOKIE = "reiner_usuario_id";

export async function getUsuarioActual(): Promise<Usuario> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  const usuario = id ? await getUsuario(id) : undefined;
  return usuario ?? USUARIOS_DEMO[0];
}

export async function setUsuarioActualCookie(id: string) {
  const jar = await cookies();
  jar.set(COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 30 });
}
