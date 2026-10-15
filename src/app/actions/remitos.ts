"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioDePlanta } from "@/lib/session";
import { generarRemito, type GenerarRemitoInput } from "@/lib/data/remitos";
import { buscarPiezas } from "@/lib/data/maestros";

/** Búsqueda de piezas para armar un remito — llamada directo desde el
 * cliente (ArmadoRemito), no desde un <form>. */
export async function buscarPiezasParaRemitoAction(query: string) {
  await getUsuarioDePlanta();
  const q = query.trim();
  if (!q) return [];
  const piezas = await buscarPiezas(q);
  return piezas.slice(0, 15).map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre }));
}

/** Devuelve el motivo en vez de tirar el error: en producción Next oculta el
 * mensaje de un error lanzado desde una server action llamada por el cliente. */
export async function generarRemitoAction(
  input: Omit<GenerarRemitoInput, "usuarioId">,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const usuario = await getUsuarioDePlanta();
  if (usuario.rol === "operario") return { ok: false, error: "No autorizado." };

  if (!input.destino.trim() || input.items.length === 0) {
    return { ok: false, error: "Faltan datos: destino y al menos una pieza son obligatorios." };
  }

  let id: string;
  try {
    id = await generarRemito({ ...input, usuarioId: usuario.id });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo generar el remito." };
  }
  revalidatePath("/tercerizados");
  revalidatePath("/remitos");
  return { ok: true, id };
}
