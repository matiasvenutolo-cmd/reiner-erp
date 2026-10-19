"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tareaBloqueo, tareaAdelanto, avisoPlanta, otPieza, otConjunto, proyectoEvento, usuario, pieza } from "@/lib/db/schema";
import { getUsuarioDePlanta } from "@/lib/session";
import { iniciarOperacion, pausarOperacion, reanudarOperacion, finalizarOperacion, esUltimaOperacion, deshacerFinalizar } from "@/lib/data/ejecucion";
import { MOTIVO_BLOQUEO } from "@/lib/planning/datos";

/**
 * Acciones de la vista del operario (mejoras de usabilidad §3): un botón por
 * paso, con mensajes en lenguaje de la planta. `como` permite que la pantalla
 * fija de un centro (§3.7) registre a nombre del operario que eligió.
 */
const t = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Math.max(0, Math.round(Number(fd.get(k) ?? 0) || 0));
const cuando = (fd: FormData) => (t(fd, "cuando") ? new Date(t(fd, "cuando")) : undefined);

async function quien(fd: FormData): Promise<string> {
  const u = await getUsuarioDePlanta();
  const como = t(fd, "como");
  if (!como || como === u.id) return u.id;
  const [otro] = await db.select().from(usuario).where(eq(usuario.id, como));
  if (!otro || !otro.activo || otro.rol !== "operario") throw new Error("Elegí un operario de la lista.");
  return otro.id;
}

async function correr(fd: FormData, fn: (usuarioId: string) => Promise<string | void>, destino?: (usuarioId: string) => string) {
  const volver = t(fd, "volver") || "/taller";
  const sep = volver.includes("?") ? "&" : "?";
  let error: string | null = null;
  let ok: string | void = undefined;
  let usuarioId = "";
  try {
    usuarioId = await quien(fd);
    ok = await fn(usuarioId);
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo guardar. Revisá la conexión y probá de nuevo.";
  }
  if (error) redirect(`${volver}${sep}error=${encodeURIComponent(error)}`);
  for (const r of ["/taller", "/inicio", "/planificacion", "/proyectos", "/llegamos"]) revalidatePath(r, "layout");
  redirect(destino ? destino(usuarioId) : ok ? `${volver}${sep}ok=${encodeURIComponent(ok)}` : volver);
}

export async function empezarAction(fd: FormData) {
  await correr(fd, async (u) => {
    const r = await iniciarOperacion({ otPiezaId: t(fd, "otPiezaId"), operacionId: t(fd, "operacionId"), usuarioId: u, tipo: t(fd, "tipo") === "setup" ? "setup" : "ejecucion", cuando: cuando(fd) });
    if (!r.ok) throw new Error(r.error);
  });
}

/** "Terminé el setup": cierra el setup y arranca la fabricación en el mismo toque. */
export async function terminarSetupAction(fd: FormData) {
  await correr(fd, async (u) => {
    const momento = cuando(fd);
    await finalizarOperacion({ registroOperacionId: t(fd, "registroId"), usuarioId: u, piezasOk: 0, piezasRechazadas: 0, cuando: momento });
    const r = await iniciarOperacion({ otPiezaId: t(fd, "otPiezaId"), operacionId: t(fd, "operacionId"), usuarioId: u, tipo: "ejecucion", cuando: momento });
    if (!r.ok) throw new Error(r.error);
  });
}

export async function pararAction(fd: FormData) {
  await correr(fd, (u) => pausarOperacion(t(fd, "registroId"), t(fd, "tipoParadaId"), u, cuando(fd)));
}

export async function seguirAction(fd: FormData) {
  await correr(fd, (u) => reanudarOperacion(t(fd, "registroId"), u, cuando(fd)));
}

/** Terminar: cantidad OK y rechazada (con motivo si hay rechazos). Después muestra "Listo. Ahora te toca…". */
export async function terminarAction(fd: FormData) {
  const registroId = t(fd, "registroId");
  const volver = t(fd, "volver") || "/taller";
  await correr(
    fd,
    async (u) => {
      const ok = num(fd, "piezasOk");
      const rechazadas = num(fd, "piezasRechazadas");
      if (rechazadas > 0 && !t(fd, "motivoRechazo")) throw new Error("Elegí el motivo del rechazo.");
      const ultima = await esUltimaOperacion(t(fd, "otPiezaId"), t(fd, "operacionId"));
      await finalizarOperacion({
        registroOperacionId: registroId,
        usuarioId: u,
        piezasOk: ok,
        piezasRechazadas: rechazadas,
        motivoRechazo: t(fd, "motivoRechazo") || undefined,
        observacion: t(fd, "observacion") || undefined,
        cuando: cuando(fd),
        cierrePieza: ultima ? { piezasNoOk: rechazadas, piezasDefectuosas: num(fd, "piezasDefectuosas"), piezasRetrabajadas: num(fd, "piezasRetrabajadas") } : undefined,
      });
    },
    () => `${volver}${volver.includes("?") ? "&" : "?"}listo=${registroId}`,
  );
}

export async function deshacerTerminarAction(fd: FormData) {
  await correr(fd, async (u) => {
    await deshacerFinalizar(t(fd, "registroId"), u);
    return "Listo, se deshizo: la tarea sigue en curso.";
  });
}

/** "No puedo hacer esta": la tarea queda trabada con el motivo y aparece en "Qué está trabado" del jefe de planta. */
export async function noPuedoAction(fd: FormData) {
  await correr(fd, async (u) => {
    const motivo = t(fd, "motivo");
    if (!MOTIVO_BLOQUEO[motivo]) throw new Error("Elegí un motivo.");
    const otPiezaId = t(fd, "otPiezaId"), operacionId = t(fd, "operacionId");
    const [abierto] = await db.select().from(tareaBloqueo).where(and(eq(tareaBloqueo.otPiezaId, otPiezaId), eq(tareaBloqueo.operacionId, operacionId), isNull(tareaBloqueo.resueltoAt)));
    if (!abierto) await db.insert(tareaBloqueo).values({ otPiezaId, operacionId, motivo, texto: t(fd, "texto") || null, usuarioId: u });
    if (motivo === "falta_plano") {
      const [pz] = await db.select({ nombre: pieza.nombre, codigo: pieza.codigo }).from(otPieza).innerJoin(pieza, eq(pieza.id, otPieza.piezaId)).where(eq(otPieza.id, otPiezaId));
      await db.insert(avisoPlanta).values({ tipo: "falta_plano", texto: `Falta el plano de ${pz?.nombre ?? "una pieza"} (${pz?.codigo ?? ""}), o está mal.`, otPiezaId, usuarioId: u });
    }
    return "Avisado. La tarea quedó trabada y pasás a la siguiente.";
  });
}

/** Aviso al jefe de planta o a ingeniería, desde la planta. */
export async function avisarAction(fd: FormData) {
  await correr(fd, async (u) => {
    const tipo = t(fd, "tipo") || "otro";
    await db.insert(avisoPlanta).values({ tipo, texto: t(fd, "texto") || "Aviso desde la planta", otPiezaId: t(fd, "otPiezaId") || null, usuarioId: u });
    return tipo === "falta_plano" ? "Listo, ingeniería ya tiene el aviso." : "Listo, el jefe de planta ya tiene el aviso.";
  });
}

/** "Hacer esta antes": cambia el orden de la cola, con motivo; queda en la bitácora del proyecto. */
export async function adelantarAction(fd: FormData) {
  await correr(fd, async (u) => {
    const motivo = t(fd, "motivo");
    if (!motivo) throw new Error("Elegí el motivo.");
    const otPiezaId = t(fd, "otPiezaId");
    await db.insert(tareaAdelanto).values({ usuarioId: u, otPiezaId, operacionId: t(fd, "operacionId"), motivo });
    const [x] = await db
      .select({ otMaquinaId: otConjunto.otMaquinaId, nombre: pieza.nombre, operario: usuario.nombre })
      .from(otPieza)
      .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
      .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
      .innerJoin(usuario, eq(usuario.id, u))
      .where(eq(otPieza.id, otPiezaId));
    if (x) await db.insert(proyectoEvento).values({ otMaquinaId: x.otMaquinaId, tipo: "orden_operario", texto: `${x.operario} adelantó ${x.nombre}: ${motivo}`, usuarioId: u });
    return "Listo, quedó primera en tu cola.";
  });
}

/** Destrabar una tarea marcada por el operario (jefe de planta, compras o ingeniería). */
export async function destrabarAction(fd: FormData) {
  const u = await getUsuarioDePlanta();
  await db.update(tareaBloqueo).set({ resueltoAt: new Date(), resueltoPorId: u.id }).where(eq(tareaBloqueo.id, t(fd, "id")));
  for (const r of ["/inicio", "/taller", "/planificacion"]) revalidatePath(r, "layout");
  redirect(`${t(fd, "volver") || "/inicio"}?ok=${encodeURIComponent("Tarea destrabada: vuelve a la cola del operario.")}`);
}

export async function resolverAvisoAction(fd: FormData) {
  await getUsuarioDePlanta();
  await db.update(avisoPlanta).set({ resueltoAt: new Date() }).where(eq(avisoPlanta.id, t(fd, "id")));
  revalidatePath("/inicio", "layout");
  revalidatePath("/admin", "layout");
  redirect(`${t(fd, "volver") || "/inicio"}?ok=${encodeURIComponent("Aviso resuelto.")}`);
}
