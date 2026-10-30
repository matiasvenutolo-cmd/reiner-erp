"use server";

// Gestión no cambia el plan (no reparte fechas): sólo se refrescan Gestión y la tablet del operario.
import { revalidatePath } from "next/cache";
import { getUsuarioDePlanta } from "@/lib/session";
import { asignarTareas, cambiarCentro, moverEnCola, ordenarPorUrgencia, getGestion } from "@/lib/data/gestion";

type Res = { ok: true } | { ok: false; error: string };

async function correr(fn: (usuarioId: string) => Promise<void>): Promise<Res> {
  try {
    const u = await getUsuarioDePlanta();
    if (u.rol === "operario") throw new Error("No autorizado.");
    await fn(u.id);
    revalidatePath("/gestion");
    revalidatePath("/taller", "layout");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    // Un error de la base no se muestra crudo: se pide reintentar.
    return { ok: false, error: !msg || msg.startsWith("Failed query") ? "No se pudo guardar. Probá de nuevo." : msg };
  }
}

/** Asignar una o varias tareas a un operario (o dejarlas sin asignar). Se guarda al instante. */
export async function asignarTareasAction(claves: string[], operarioId: string | null): Promise<Res> {
  return correr((u) => asignarTareas(claves, operarioId, u));
}

export async function cambiarCentroAction(clave: string, centroId: string): Promise<Res> {
  return correr((u) => cambiarCentro(clave, centroId, u));
}

export async function moverEnColaAction(clave: string, direccion: "arriba" | "abajo"): Promise<Res> {
  return correr(() => moverEnCola(clave, direccion));
}

export async function ordenarPorUrgenciaAction(operarioId: string): Promise<Res> {
  return correr(async () => ordenarPorUrgencia(operarioId, (await getGestion()).filas));
}
