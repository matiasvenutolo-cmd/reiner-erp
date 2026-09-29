/**
 * Vercel Blob — adjuntos de ingeniería (Release 3, devolución del cliente:
 * "ingeniería debe poder... agregar un plano y/o imágenes").
 *
 * Se pasa `token` explícito en cada llamada: el SDK intenta autenticar por
 * OIDC si detecta `VERCEL_OIDC_TOKEN` en el entorno (lo trae `vercel env
 * pull`), y ese modo falla en "development" si el proyecto no lo tiene
 * habilitado para ese entorno — BLOB_READ_WRITE_TOKEN es el que realmente
 * funciona acá.
 *
 * Nunca se guarda la URL completa que devuelve `put()`, sólo el `pathname`
 * (ver runbook §A5) — `urlDeAdjunto` la reconstruye en runtime con
 * BLOB_PUBLIC_BASE_URL, la única env var que hay que tocar el día que
 * cambie el store (traspaso a la cuenta de REINER).
 */
import { put, del } from "@vercel/blob";

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

export function urlDeAdjunto(pathname: string): string {
  const base = process.env.BLOB_PUBLIC_BASE_URL;
  if (!base) throw new Error("Falta BLOB_PUBLIC_BASE_URL en el entorno.");
  return `${base}/${pathname}`;
}

export async function subirAdjunto(carpeta: string, nombreArchivo: string, archivo: File): Promise<{ pathname: string }> {
  const pathnameSugerido = `${carpeta}/${crypto.randomUUID()}-${nombreArchivo}`;
  const blob = await put(pathnameSugerido, archivo, { access: "public", token: TOKEN });
  return { pathname: blob.pathname };
}

export async function eliminarAdjunto(pathname: string): Promise<void> {
  await del(pathname, { token: TOKEN });
}
