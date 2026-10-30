/**
 * Mostrar u ocultar secciones (reorganización 30/10 §1) y las opciones del sistema que se tocan desde
 * ADMIN. Lo que se elige se guarda en `parametro` y pisa el valor por defecto de cada sección (NAV_ITEMS).
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { parametro } from "@/lib/db/schema";

const CLAVE = "secciones_visibles";

export async function getVisibilidadSecciones(): Promise<Record<string, boolean>> {
  const [fila] = await db.select({ valor: parametro.valor }).from(parametro).where(eq(parametro.clave, CLAVE));
  if (!fila) return {};
  try {
    const v = JSON.parse(fila.valor);
    return v && typeof v === "object" ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export async function guardarVisibilidadSecciones(v: Record<string, boolean>): Promise<void> {
  const valor = JSON.stringify(v);
  await db.insert(parametro).values({ clave: CLAVE, valor, nota: "Secciones del menú mostradas u ocultas desde ADMIN" }).onConflictDoUpdate({ target: parametro.clave, set: { valor } });
}
