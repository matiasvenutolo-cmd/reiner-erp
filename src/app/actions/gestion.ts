"use server";

// Gestión no cambia el plan (no reparte fechas): sólo se refrescan Gestión y la tablet del operario.
import { revalidatePath } from "next/cache";
import { getUsuarioDePlanta } from "@/lib/session";
import { asignarTareas, cambiarCentro, ordenarCentro, ordenarCentroPorUrgencia } from "@/lib/data/gestion";
import { evaluarEntrada, marcarMaterialDisponible } from "@/lib/data/entrada-plan";
import { reprocesar, scrapYRehacer } from "@/lib/data/desvios";
import { redirect } from "next/navigation";
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

/** Reunión 20/11: el orden de la cola de un centro, después de arrastrar una tarea. */
export async function ordenarCentroAction(claves: string[]): Promise<Res> {
  return correr((u) => ordenarCentro(claves, u));
}

export async function ordenarCentroPorUrgenciaAction(claves: string[]): Promise<Res> {
  return correr(() => ordenarCentroPorUrgencia(claves));
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

/** Mover una tarea a otro día en la carga (tanda 2, 05/11). Cambia el plan: se invalida entero. */
/** Desvío (prueba 19/11): reprocesar la pieza o mandarla a scrap y rehacerla. Desde el aviso de Gestión. */
export async function decidirDesvioAction(fd: FormData) {
  const u = await getUsuarioDePlanta();
  if (u.rol === "operario") throw new Error("No autorizado.");
  const id = String(fd.get("id") ?? "");
  const decision = String(fd.get("decision") ?? "");
  let msg: string;
  try {
    msg = decision === "scrap" ? await scrapYRehacer(id, u.id) : await reprocesar(id, u.id);
  } catch (e) {
    redirect(`/gestion?error=${encodeURIComponent(e instanceof Error ? e.message : "No se pudo guardar.")}`);
  }
  for (const r of ["/gestion", "/proyectos", "/ot", "/taller", "/compras", "/indicadores"]) revalidarConPlan(r, "layout");
  redirect(`/gestion?ok=${encodeURIComponent(msg)}`);
}

/** "Ya tengo el material" desde Para enviar a producción (prueba 19/11). */
export async function materialDisponibleAction(otPiezaId: string): Promise<Res> {
  try {
    const u = await getUsuarioDePlanta();
    if (u.rol === "operario") throw new Error("No autorizado.");
    await marcarMaterialDisponible(otPiezaId, u.id);
    for (const r of ["/gestion", "/proyectos", "/ot", "/compras"]) revalidarConPlan(r, "layout");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { ok: false, error: !msg || msg.startsWith("Failed query") ? "No se pudo guardar. Probá de nuevo." : msg };
  }
}
