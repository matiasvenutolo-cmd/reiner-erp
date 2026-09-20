/**
 * Firma y verificación del token de sesión (JWT stateless en cookie httpOnly).
 *
 * No usamos Auth.js/next-auth: al momento de construir esto, Next.js 16
 * acababa de renombrar `middleware.ts` a `proxy.ts` (ver AGENTS.md y
 * node_modules/next/dist/docs/.../proxy.md) y la compatibilidad de next-auth
 * v5 con esa convención nueva no está verificada. El patrón de abajo es el
 * que la propia guía de Next.js recomienda para auth casera (sesión firmada
 * con `jose` + cookie httpOnly + Proxy) — mismas propiedades de seguridad,
 * sin depender de que una librería de terceros ya soporte Next 16. Decisión
 * documentada en docs/05-backlog-release-2.md §9.
 */
import "server-only";
import { SignJWT, jwtVerify } from "jose";
import type { Usuario } from "@/lib/db/schema";

const SECRET = process.env.AUTH_SECRET;
if (!SECRET) {
  throw new Error("Falta AUTH_SECRET en el entorno — ver .env.example");
}
const encodedKey = new TextEncoder().encode(SECRET);

export type SesionPayload = { usuarioId: string; rol: Usuario["rol"] };

export async function firmarSesion(payload: SesionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(encodedKey);
}

/** Sólo decodifica y valida la firma — no toca la base. Uso en proxy.ts. */
export async function verificarSesion(token: string | undefined): Promise<SesionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ["HS256"] });
    if (typeof payload.usuarioId !== "string" || typeof payload.rol !== "string") return null;
    return { usuarioId: payload.usuarioId, rol: payload.rol as Usuario["rol"] };
  } catch {
    return null;
  }
}
