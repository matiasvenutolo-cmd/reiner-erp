"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/session";
import { generarRemito, type GenerarRemitoInput } from "@/lib/data/remitos";
import { buscarPiezas } from "@/lib/data/maestros";

/** Búsqueda de piezas para armar un remito — llamada directo desde el
 * cliente (ArmadoRemito), no desde un <form>. */
export async function buscarPiezasParaRemitoAction(query: string) {
  const q = query.trim();
  if (!q) return [];
  const piezas = await buscarPiezas(q);
  return piezas.slice(0, 15).map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre }));
}

export async function generarRemitoAction(input: Omit<GenerarRemitoInput, "usuarioId">): Promise<string> {
  const usuario = await getUsuarioActual();

  if (!input.destino.trim() || input.items.length === 0) {
    throw new Error("Faltan datos: destino y al menos una pieza son obligatorios.");
  }

  const id = await generarRemito({ ...input, usuarioId: usuario.id });
  revalidatePath("/tercerizados");
  revalidatePath("/remitos");
  return id;
}
