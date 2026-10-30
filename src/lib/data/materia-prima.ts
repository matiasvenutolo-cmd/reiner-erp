/**
 * "Controlar materia prima" (reorganización 30/10 §2.2), en ADMIN, desactivado por defecto. Con el stock en
 * cero y muchas hojas de ruta que empiezan con "Compras", si la materia prima bloqueara, todas las piezas
 * quedarían "Falta material" y sus tareas se correrían semanas. Desactivado:
 * - el paso "Compras" de la hoja de ruta no bloquea el siguiente ni corre fechas: es informativo y el jefe de
 *   planta lo puede tildar como hecho;
 * - en "Qué hace falta" las piezas fabricadas van a "Lo fabrico" (sin separar tengo / falta material);
 * - los artículos comerciales se siguen comprando (y generan la necesidad en Compras), pero no frenan la
 *   fabricación de las otras piezas.
 * Activado, todo funciona como antes.
 */
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { parametro } from "@/lib/db/schema";

export const CLAVE_MATERIA_PRIMA = "controlar_materia_prima";

export const controlaMateriaPrima = cache(async (): Promise<boolean> => {
  const [fila] = await db.select({ valor: parametro.valor }).from(parametro).where(eq(parametro.clave, CLAVE_MATERIA_PRIMA));
  return fila?.valor === "si";
});

/**
 * Los pasos que marcan el avance de la pieza: sin control de materia prima, el paso de Compras no cuenta.
 * Salvo que la hoja de ruta sea sólo "Compras": entonces es la compra de la pieza misma, y sí cuenta.
 */
export function pasosQueBloquean<T>(ruta: T[], tipoDe: (x: T) => string, controla: boolean): T[] {
  if (controla) return ruta;
  const sinCompras = ruta.filter((x) => tipoDe(x) !== "compras");
  return sinCompras.length ? sinCompras : ruta;
}

/** ¿Este paso de Compras es sólo informativo? (sin control de materia prima y con otros pasos en la ruta). */
export function compraInformativa(tipo: string, ruta: { tipo: string }[], controla: boolean): boolean {
  return !controla && tipo === "compras" && ruta.some((x) => x.tipo !== "compras");
}
