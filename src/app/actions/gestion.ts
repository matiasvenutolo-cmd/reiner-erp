"use server";

// Gestión no cambia el plan (no reparte fechas): sólo se refrescan Gestión y la tablet del operario.
import { revalidatePath } from "next/cache";
import { getUsuarioDePlanta } from "@/lib/session";
import { asignarTareas, cambiarCentro, moverEnCola, ordenarPorUrgencia, getGestion } from "@/lib/data/gestion";
import { evaluarEntrada } from "@/lib/data/entrada-plan";
import { enviarAProduccion } from "@/lib/data/ot";
import { revalidatePath as revalidarConPlan } from "@/lib/revalidar";

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

/**
 * Mandar a producción desde Gestión (prueba 1, 05/11): es el único lugar donde se hace. Sólo entran las que ya
 * pueden (con material y, si ADMIN lo exige, con plano); las otras se informan y quedan esperando.
 */
export async function enviarAProduccionAction(otPiezaIds: string[]): Promise<{ ok: true; enviadas: number; esperan: number } | { ok: false; error: string }> {
  try {
    const u = await getUsuarioDePlanta();
    if (u.rol === "operario") throw new Error("No autorizado.");
    if (!otPiezaIds.length) throw new Error("Elegí al menos una pieza.");
    const evaluadas = await evaluarEntrada({ otPiezaIds });
    const listas = evaluadas.filter((x) => !x.motivo).map((x) => x.otPiezaId);
    const enviadas = await enviarAProduccion(listas, u.id);
    // Entrar al plan cambia el plan: se invalida entero.
    for (const r of ["/gestion", "/proyectos", "/ot", "/taller", "/indicadores", "/llegamos"]) revalidarConPlan(r, "layout");
    return { ok: true, enviadas, esperan: evaluadas.length - listas.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { ok: false, error: !msg || msg.startsWith("Failed query") ? "No se pudo guardar. Probá de nuevo." : msg };
  }
}
