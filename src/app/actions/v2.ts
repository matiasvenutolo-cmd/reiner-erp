"use server";

import { redirect } from "next/navigation";
import { plural } from "@/lib/formato";
import { revalidatePath, revalidateTag } from "@/lib/revalidar";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  otMaquina, planAjuste, asignacionTrabajo, proyectoEvento, proceso, centroTrabajo, feriado, ausencia, montajeConjunto, configuracion,
  parametro, pieza, operacion, pedidoCompra, proveedor, proveedorServicio, reservaStock, articuloStock, otPieza, tareaLote, semanaConfirmada,
} from "@/lib/db/schema";
import { getUsuarioActual, getUsuarioDePlanta } from "@/lib/session";
import { enviarAProduccion } from "@/lib/data/ot";
import { entrarAlPlanSolas } from "@/lib/data/entrada-plan";
import { getPlan, construirPlan } from "@/lib/planning/datos";
import { proximosHabiles } from "@/lib/planning/calendario";
import { registrarLlegadaPedido } from "@/lib/data/compras";
import { getEstadoYOperacionActual } from "@/lib/data/ot";
import { sembrarEstimaciones, cargarDemo, borrarDemo, migrarOrdenesExistentes } from "@/lib/data/v2-semillas";
import { hoyISO } from "@/lib/fecha";

const t = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string) => {
  const v = t(fd, k).replace(",", ".");
  return v === "" ? null : Number(v);
};

/** Vuelve a la pantalla con lo que pasó (o el motivo del rechazo) y recalcula todo lo que mira el plan. */
async function correr(volver: string, fn: () => Promise<string | void>) {
  let error: string | null = null;
  let ok: string | void = undefined;
  try {
    ok = await fn();
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo guardar. Revisá la conexión y probá de nuevo.";
  }
  const [base, ancla] = volver.split("#");
  const sep = base.includes("?") ? "&" : "?";
  const con = (q: string) => `${base}${sep}${q}${ancla ? `#${ancla}` : ""}`;
  if (error) redirect(con(`error=${encodeURIComponent(error)}`));
  for (const r of ["/inicio", "/planificacion", "/proyectos", "/llegamos", "/pedir", "/liberacion", "/taller", "/stock", "/admin", "/operaciones", "/maestros", "/tercerizados"])
    revalidatePath(r, "layout");
  revalidateTag("contadores", { expire: 0 });
  redirect(ok ? con(`ok=${encodeURIComponent(ok)}`) : volver);
}

// ── Liberación y plan ─────────────────────────────────────────────────────

export async function liberarAction(fd: FormData) {
  const u = await getUsuarioDePlanta();
  const ids = fd.getAll("otPiezaId").map(String).filter(Boolean);
  await correr(t(fd, "volver") || "/liberacion", async () => {
    if (!ids.length) throw new Error("Tildá al menos una pieza.");
    const nLib = await enviarAProduccion(ids, u.id);
    return `${nLib} pieza${nLib === 1 ? "" : "s"} entr${nLib === 1 ? "ó" : "aron"} al plan de la semana.`;
  });
}

/** "otPiezaId::operacionId" o, para un lote, "otPiezaId::operacionId::L2" (el ajuste del lote se guarda aparte del resto). */
function partirClave(clave: string) {
  const [otPiezaId, ...resto] = clave.split("::");
  return { otPiezaId, operacionId: resto.join("::"), operacionBase: resto[0] };
}

/** Partir una tarea grande en lotes (mejoras de usabilidad §1.6): cada lote se planifica, mueve y termina por separado. 0 = sin lotes. */
export async function partirEnLotesAction(fd: FormData) {
  await getUsuarioDePlanta();
  const { otPiezaId, operacionBase } = partirClave(t(fd, "clave"));
  await correr(t(fd, "volver") || "/planificacion", async () => {
    const tamano = Math.max(0, Math.round(n(fd, "tamano") ?? 0));
    await db.insert(tareaLote).values({ otPiezaId, operacionId: operacionBase, tamano }).onConflictDoUpdate({ target: [tareaLote.otPiezaId, tareaLote.operacionId], set: { tamano } });
    return tamano ? `Tarea partida en lotes de ${tamano}.` : "La tarea volvió a ser una sola.";
  });
}

export async function moverTareaAction(fd: FormData) {
  const u = await getUsuarioDePlanta();
  const { otPiezaId, operacionId } = partirClave(t(fd, "clave"));
  const fecha = t(fd, "fecha") || null;
  const operarioId = t(fd, "operarioId") || null;
  await correr(t(fd, "volver") || "/planificacion", async () => {
    await db
      .insert(planAjuste)
      .values({ otPiezaId, operacionId, fecha, operarioId, fijada: fd.has("fijar"), usuarioId: u.id })
      .onConflictDoUpdate({
        target: [planAjuste.otPiezaId, planAjuste.operacionId],
        set: { fecha, operarioId, ...(fd.has("fijar") ? { fijada: true } : {}), usuarioId: u.id, updatedAt: new Date() },
      });
    return "Tarea movida.";
  });
}

/** Mover con arrastre (desde el cliente): misma regla que el formulario. */
export async function moverTareaDirecto(clave: string, fecha: string): Promise<{ ok: boolean; error?: string }> {
  const u = await getUsuarioDePlanta();
  const { otPiezaId, operacionId } = partirClave(clave);
  await db
    .insert(planAjuste)
    .values({ otPiezaId, operacionId, fecha, usuarioId: u.id })
    .onConflictDoUpdate({ target: [planAjuste.otPiezaId, planAjuste.operacionId], set: { fecha, usuarioId: u.id, updatedAt: new Date() } });
  revalidatePath("/planificacion", "layout");
  revalidatePath("/inicio");
  revalidateTag("contadores", { expire: 0 });
  return { ok: true };
}

export async function fijarTareaAction(fd: FormData) {
  const u = await getUsuarioDePlanta();
  const { otPiezaId, operacionId } = partirClave(t(fd, "clave"));
  const fijar = t(fd, "fijar") === "1";
  await correr(t(fd, "volver") || "/planificacion", async () => {
    const plan = await getPlan();
    const tarea = plan.resultado.tareas.find((x) => x.clave === t(fd, "clave"));
    await db
      .insert(planAjuste)
      .values({ otPiezaId, operacionId, fecha: tarea?.fechaPlan ?? null, operarioId: tarea?.operarioId ?? null, fijada: fijar, usuarioId: u.id })
      .onConflictDoUpdate({
        target: [planAjuste.otPiezaId, planAjuste.operacionId],
        set: { fijada: fijar, fecha: tarea?.fechaPlan ?? null, operarioId: tarea?.operarioId ?? null, usuarioId: u.id, updatedAt: new Date() },
      });
    return fijar ? "Tarea fijada: el próximo recálculo no la mueve." : "Tarea liberada del candado.";
  });
}

/** Recalcular: descarta los movimientos manuales que no están fijados. */
export async function recalcularAction(fd: FormData) {
  await getUsuarioDePlanta();
  await correr(t(fd, "volver") || "/planificacion", async () => {
    await db.delete(planAjuste).where(eq(planAjuste.fijada, false));
    return "Plan recalculado. Las tareas fijadas con candado no se movieron.";
  });
}

/** Confirmar semana: publica el plan en las pantallas de los operarios. Sólo el jefe de planta (perfil Taller). */
export async function confirmarSemanaAction(fd: FormData) {
  const u = await getUsuarioDePlanta();
  const lunes = t(fd, "lunes");
  await correr(`/planificacion?semana=${lunes}`, async () => {
    if (u.rol !== "taller") throw new Error("Sólo el jefe de planta confirma la semana. Los demás perfiles ven el plan propuesto.");
    const plan = await getPlan();
    const dias = proximosHabiles(lunes, 5, plan.entrada.calendario);
    const desde = dias[0], hasta = dias.at(-1)!;
    // Sólo lo liberado: una pieza sin liberar no la puede empezar el operario.
    const tareas = plan.resultado.tareas.filter(
      (x) => x.tipo === "interno" && x.estado !== "terminada" && x.estado !== "futura" && x.operarioId && x.fechaPlan && x.fechaPlan >= desde && x.fechaPlan <= hasta && !x.operacionId.startsWith("fabricar-"),
    );
    await db.transaction(async (tx) => {
      await tx.delete(asignacionTrabajo).where(and(eq(asignacionTrabajo.dePlanConfirmado, true), gte(asignacionTrabajo.fecha, desde), lte(asignacionTrabajo.fecha, hasta)));
      if (tareas.length)
        await tx.insert(asignacionTrabajo).values(
          tareas.map((x) => ({ otPiezaId: x.otPiezaId, operacionId: x.operacionId, operarioId: x.operarioId!, fecha: x.fechaPlan!, asignadoPorId: u.id, dePlanConfirmado: true })),
        );
    });
    await db.insert(semanaConfirmada).values({ lunes, usuarioId: u.id, tareas: tareas.length }).onConflictDoUpdate({ target: semanaConfirmada.lunes, set: { usuarioId: u.id, confirmadaAt: new Date(), tareas: tareas.length } });
    return `Semana confirmada: ${plural(tareas.length, "tarea")} publicada${tareas.length === 1 ? "" : "s"} en "Mi próxima tarea" de cada operario.`;
  });
}

// ── Proyectos ─────────────────────────────────────────────────────────────

export async function activarProyectoAction(fd: FormData) {
  const u = await getUsuarioDePlanta();
  const id = t(fd, "id");
  // Plan factible (§1.4): antes de activar, se calcula hacia adelante desde hoy. Si no llega, se pregunta.
  const entregaPedida = t(fd, "fechaEntrega");
  if (entregaPedida && !fd.has("confirmado")) {
    const prioridad = t(fd, "prioridad") === "alta" ? "alta" : "normal";
    const sim = await construirPlan({ id, entrega: entregaPedida, prioridad });
    const pp = sim.resultado.proyectos.find((x) => x.id === id);
    if (pp && pp.diferenciaDias > 0) {
      const causas = [...pp.causas.map((c) => c.causa)];
      for (const c of pp.conjuntos.filter((x) => x.causa && x.atrasoDias > 0).sort((a, b) => b.atrasoDias - a.atrasoDias)) {
        if (causas.length >= 3) break;
        if (!causas.some((k) => JSON.stringify(k) === JSON.stringify(c.causa))) causas.push(c.causa!);
      }
      const q = new URLSearchParams({ temprana: pp.finEstimado, entrega: entregaPedida, prioridad, causas: JSON.stringify(causas.slice(0, 3)), quitar: fd.getAll("quitarOtPiezaId").map(String).join(",") });
      redirect(`/proyectos/${id}?${q}`);
    }
  }
  await correr(`/proyectos/${id}`, async () => {
    const entrega = t(fd, "fechaEntrega");
    if (!entrega) throw new Error("La fecha de entrega comprometida es obligatoria para confirmar la orden.");
    const quitar = [...fd.getAll("quitarOtPiezaId").map(String), ...t(fd, "quitar").split(",")].filter(Boolean);
    if (quitar.length) await db.update(otPieza).set({ cantidadAFabricar: 0 }).where(inArray(otPieza.id, quitar));
    await db
      .update(otMaquina)
      .set({ fechaEntrega: entrega, prioridad: t(fd, "prioridad") === "alta" ? "alta" : "normal", estadoProyecto: "activo", fechaInicioProyecto: hoyISO(), destino: (t(fd, "destino") as "maquina") || undefined })
      .where(eq(otMaquina.id, id));
    await db.insert(proyectoEvento).values({ otMaquinaId: id, tipo: "activado", texto: `Activado con entrega ${entrega}${quitar.length ? ` · ${plural(quitar.length, "pieza")} destildada${quitar.length === 1 ? "" : "s"} (variantes)` : ""}`, usuarioId: u.id });
    const alPlan = await entrarAlPlanSolas({ otMaquinaId: id }, u.id);
    return `Orden activa: ya tiene tareas y compras con fecha${alPlan ? ` · ${plural(alPlan, "pieza")} con material entr${alPlan === 1 ? "ó" : "aron"} al plan` : ""}.`;
  });
}

export async function cambiarEntregaAction(fd: FormData) {
  const u = await getUsuarioDePlanta();
  const id = t(fd, "id");
  await correr(`/proyectos/${id}`, async () => {
    const fecha = t(fd, "fechaEntrega");
    const motivo = t(fd, "motivo");
    if (!fecha) throw new Error("Falta la nueva fecha.");
    if (!motivo) throw new Error("El cambio de fecha de entrega pide un motivo: queda en la bitácora de la orden.");
    const [p] = await db.select({ f: otMaquina.fechaEntrega }).from(otMaquina).where(eq(otMaquina.id, id));
    await db.update(otMaquina).set({ fechaEntrega: fecha }).where(eq(otMaquina.id, id));
    await db.insert(proyectoEvento).values({ otMaquinaId: id, tipo: "fecha", texto: `Entrega ${p?.f ?? "—"} → ${fecha}. Motivo: ${motivo}`, usuarioId: u.id });
    return "Fecha de entrega cambiada y plan recalculado.";
  });
}

export async function pausarProyectoAction(fd: FormData) {
  const u = await getUsuarioDePlanta();
  const id = t(fd, "id");
  const pausar = t(fd, "pausar") === "1";
  await correr(`/proyectos/${id}`, async () => {
    const motivo = t(fd, "motivo");
    if (pausar && !motivo) throw new Error("Para pausar una orden hace falta un motivo.");
    await db.update(otMaquina).set({ estadoProyecto: pausar ? "pausado" : "activo" }).where(eq(otMaquina.id, id));
    await db.insert(proyectoEvento).values({ otMaquinaId: id, tipo: pausar ? "pausa" : "reactivado", texto: pausar ? `Pausado: ${motivo}` : "Reactivado", usuarioId: u.id });
    if (!pausar) await entrarAlPlanSolas({ otMaquinaId: id }, u.id);
    return pausar ? "Orden pausada: sus tareas salen del plan." : "Orden reactivada.";
  });
}

// ── Pedir esta semana ─────────────────────────────────────────────────────

/** Marca como pedidas varias líneas a un mismo proveedor, con la fecha que promete. */
export async function marcarPedidoGrupoAction(fd: FormData) {
  const u = await getUsuarioActual();
  if (u.rol === "operario") throw new Error("No autorizado.");
  // Cada línea es "otPiezaId|cantidad"; una línea que suma el mismo material de varias piezas trae varias, separadas por coma.
  const lineas = fd.getAll("linea").map(String).filter(Boolean).flatMap((l) => l.split(","));
  const proveedorId = t(fd, "proveedorId") || null;
  const prometida = t(fd, "fechaPrometida") || null;
  if (!lineas.length) redirect(`/pedir?error=${encodeURIComponent("Tildá al menos un artículo.")}`);
  const creados: string[] = [];
  for (const l of lineas) {
    const [otPiezaId, cant] = l.split("|");
    const [abierto] = await db.select({ id: pedidoCompra.id }).from(pedidoCompra).where(and(eq(pedidoCompra.otPiezaId, otPiezaId), sql`${pedidoCompra.recibidoAt} is null`));
    if (abierto) continue;
    const [nuevo] = await db
      .insert(pedidoCompra)
      .values({ otPiezaId, cantidad: Math.max(1, Math.round(Number(cant) || 1)), proveedorId, fechaPrometida: prometida, usuarioId: u.id, observacion: "Pedido desde Pedir esta semana" })
      .returning({ id: pedidoCompra.id });
    creados.push(nuevo.id);
  }
  for (const r of ["/pedir", "/inicio", "/proyectos", "/llegamos", "/planificacion"]) revalidatePath(r, "layout");
  revalidateTag("contadores", { expire: 0 });
  const msg = `${plural(creados.length, "línea")} marcada${creados.length === 1 ? "" : "s"} como pedida${creados.length === 1 ? "" : "s"}${prometida ? `, llegada prometida ${prometida.split("-").reverse().join("/")}` : ""}.`;
  // Con "Deshacer" unos segundos (§2.5), por si se tocó sin querer.
  redirect(`/pedir?ok=${encodeURIComponent(msg)}&deshacer=${creados.join(",")}`);
}

/** Deshacer "Marcar pedido" en los segundos siguientes: borra sólo esos pedidos, si siguen sin recibir. */
export async function deshacerPedidosAction(fd: FormData) {
  const u = await getUsuarioActual();
  if (u.rol === "operario") throw new Error("No autorizado.");
  const ids = t(fd, "ids").split(",").filter(Boolean);
  await correr("/pedir", async () => {
    if (ids.length) await db.delete(pedidoCompra).where(and(inArray(pedidoCompra.id, ids), sql`${pedidoCompra.recibidoAt} is null`, sql`${pedidoCompra.fechaPedido} > now() - interval '10 minutes'`));
    return "Listo, se deshizo: vuelven a la lista para pedir.";
  });
}

/** "Confirmar Aceros SA como proveedor habitual" (§2.5): lo guarda para todos esos artículos de una vez. */
export async function confirmarProveedorHabitualAction(fd: FormData) {
  const u = await getUsuarioActual();
  if (u.rol === "operario") throw new Error("No autorizado.");
  const proveedorId = t(fd, "proveedorId");
  const piezas = t(fd, "piezas").split(",").filter(Boolean);
  await correr("/pedir", async () => {
    if (!proveedorId || !piezas.length) throw new Error("Faltan datos.");
    await db.update(pieza).set({ proveedorHabitualId: proveedorId }).where(and(inArray(pieza.id, piezas), sql`${pieza.proveedorHabitualId} is null`));
    const [p] = await db.select({ n: proveedor.razonSocial }).from(proveedor).where(eq(proveedor.id, proveedorId));
    return `${p?.n ?? "El proveedor"} quedó como proveedor habitual de ${plural(piezas.length, "artículo")}.`;
  });
}

export async function recibirPedidoAction(fd: FormData) {
  const u = await getUsuarioActual();
  if (u.rol === "operario") throw new Error("No autorizado.");
  await correr("/pedir?vista=llegar", async () => {
    const resultado = t(fd, "controlResultado");
    if (resultado !== "ok" && resultado !== "no_ok") throw new Error("Indicá el control: OK o NO OK.");
    const [p] = await db.select().from(pedidoCompra).where(eq(pedidoCompra.id, t(fd, "pedidoId")));
    if (!p) throw new Error("Pedido inexistente.");
    const [op] = await db.select().from(otPieza).where(eq(otPieza.id, p.otPiezaId));
    const { operacionActual } = op ? await getEstadoYOperacionActual(op) : { operacionActual: null };
    await registrarLlegadaPedido({ pedidoId: p.id, controlResultado: resultado, usuarioId: u.id, operacionCompraId: operacionActual?.proceso.tipo === "compras" ? operacionActual.id : undefined });
    return resultado === "ok" ? "Recibido con control OK: la pieza sigue en el plan." : "Recibido NO OK: queda registrado y el pedido sigue abierto.";
  });
}

// ── Admin ─────────────────────────────────────────────────────────────────

export async function guardarProcesoAction(fd: FormData) {
  await getUsuarioDePlanta();
  await correr("/operaciones?vista=tiempos", async () => {
    await db
      .update(proceso)
      .set({ setupMin: n(fd, "setupMin"), minPorUnidad: n(fd, "minPorUnidad"), plazoDias: n(fd, "plazoDias"), tiempoOrigen: "definido" })
      .where(eq(proceso.id, t(fd, "id")));
    return "Tiempos del proceso guardados (definidos por REINER).";
  });
}

export async function guardarCapacidadAction(fd: FormData) {
  await getUsuarioDePlanta();
  await correr("/operaciones?vista=capacidad", async () => {
    const efic = n(fd, "eficiencia");
    await db
      .update(centroTrabajo)
      .set({ horasDia: n(fd, "horasDia") ?? 8, maquinas: n(fd, "maquinas") ?? 1, eficiencia: efic == null ? 0.85 : efic > 1 ? efic / 100 : efic, capacidadOrigen: "definido" })
      .where(eq(centroTrabajo.id, t(fd, "id")));
    return "Capacidad guardada.";
  });
}

export async function agregarFeriadoAction(fd: FormData) {
  await getUsuarioDePlanta();
  await correr("/admin/calendario", async () => {
    if (!t(fd, "fecha") || !t(fd, "nombre")) throw new Error("Fecha y nombre.");
    await db.insert(feriado).values({ fecha: t(fd, "fecha"), nombre: t(fd, "nombre"), tipo: t(fd, "tipo") || "cierre" }).onConflictDoNothing();
    return "Día agregado al calendario.";
  });
}

export async function quitarFeriadoAction(fd: FormData) {
  await getUsuarioDePlanta();
  await correr("/admin/calendario", async () => {
    await db.delete(feriado).where(eq(feriado.fecha, t(fd, "fecha")));
    return "Día quitado.";
  });
}

export async function agregarAusenciaAction(fd: FormData) {
  await getUsuarioDePlanta();
  await correr("/admin/calendario", async () => {
    const desde = t(fd, "desde"), hasta = t(fd, "hasta") || t(fd, "desde");
    if (!t(fd, "usuarioId") || !desde) throw new Error("Operario y fecha.");
    if (hasta < desde) throw new Error("La fecha hasta es anterior a la fecha desde.");
    await db.insert(ausencia).values({ usuarioId: t(fd, "usuarioId"), desde, hasta, motivo: t(fd, "motivo") || null });
    return "Ausencia cargada: resta capacidad a su centro.";
  });
}

export async function quitarAusenciaAction(fd: FormData) {
  await getUsuarioDePlanta();
  await correr("/admin/calendario", async () => {
    await db.delete(ausencia).where(eq(ausencia.id, t(fd, "id")));
    return "Ausencia quitada.";
  });
}

export async function moverMontajeAction(fd: FormData) {
  await getUsuarioDePlanta();
  const cfg = t(fd, "configuracionId");
  await correr(`/admin/montaje?config=${cfg}`, async () => {
    const filas = await db.select().from(montajeConjunto).where(eq(montajeConjunto.configuracionId, cfg)).orderBy(montajeConjunto.orden);
    const [dir, conjuntoId] = t(fd, "mover").split("|");
    // Se mueve el tramo entero: los alternativos (mismo orden) van juntos.
    const ordenes = [...new Set(filas.map((f) => f.orden))].sort((a, b) => a - b);
    const actual = filas.find((f) => f.conjuntoId === conjuntoId)?.orden;
    const i = actual == null ? -1 : ordenes.indexOf(actual);
    const j = dir === "arriba" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ordenes.length) return;
    const [a, b] = [ordenes[i], ordenes[j]];
    const conOrden = (o: number) => filas.filter((f) => f.orden === o).map((f) => f.conjuntoId);
    const deA = conOrden(a), deB = conOrden(b);
    for (const c of deA) await db.update(montajeConjunto).set({ orden: b }).where(and(eq(montajeConjunto.configuracionId, cfg), eq(montajeConjunto.conjuntoId, c)));
    for (const c of deB) await db.update(montajeConjunto).set({ orden: a }).where(and(eq(montajeConjunto.configuracionId, cfg), eq(montajeConjunto.conjuntoId, c)));
    await db.update(configuracion).set({ montajeOrigen: "definido" }).where(eq(configuracion.id, cfg));
  });
}

export async function guardarMontajeAction(fd: FormData) {
  await getUsuarioDePlanta();
  const cfg = t(fd, "configuracionId");
  await correr(`/admin/montaje?config=${cfg}`, async () => {
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("dias_")) continue;
      await db.update(montajeConjunto).set({ dias: Math.max(0, Number(v) || 0) }).where(and(eq(montajeConjunto.configuracionId, cfg), eq(montajeConjunto.conjuntoId, k.slice(5))));
    }
    await db
      .update(configuracion)
      .set({ montajeFinalDias: n(fd, "montajeFinalDias") ?? 5, margenMontajeDias: n(fd, "margenMontajeDias") ?? 3, montajeOrigen: "definido" })
      .where(eq(configuracion.id, cfg));
    return "Secuencia de montaje guardada (definida por REINER).";
  });
}

export async function guardarParametroAction(fd: FormData) {
  const u = await getUsuarioDePlanta();
  await correr(t(fd, "volver") || "/admin/demo", async () => {
    await db.insert(parametro).values({ clave: t(fd, "clave"), valor: t(fd, "valor") }).onConflictDoUpdate({ target: parametro.clave, set: { valor: t(fd, "valor") } });
    // Si ahora la entrada es automática (o ya no se exige plano), entra lo que estaba esperando.
    const alPlan = await entrarAlPlanSolas({}, u.id);
    return alPlan ? `Parámetro guardado: ${plural(alPlan, "pieza")} entr${alPlan === 1 ? "ó" : "aron"} al plan.` : "Parámetro guardado.";
  });
}

export async function aprobarReclasificacionAction(fd: FormData) {
  await getUsuarioDePlanta();
  const ids = fd.getAll("piezaId").map(String);
  await correr("/admin/completitud", async () => {
    if (!ids.length) throw new Error("Tildá al menos una pieza.");
    await db.update(pieza).set({ clase: "comercial", claseSugerida: null }).where(inArray(pieza.id, ids));
    return `${ids.length} pieza${ids.length === 1 ? "" : "s"} pasaron a Comercial: se compran con su plazo, sin hoja de ruta interna.`;
  });
}

export async function descartarReclasificacionAction(fd: FormData) {
  await getUsuarioDePlanta();
  const ids = fd.getAll("piezaId").map(String);
  await correr("/admin/completitud", async () => {
    await db.update(pieza).set({ claseSugerida: null }).where(inArray(pieza.id, ids));
    return "Propuesta descartada para esas piezas.";
  });
}

export async function demoAction(fd: FormData) {
  const u = await getUsuarioDePlanta();
  await correr("/admin/demo", async () => {
    const que = t(fd, "que");
    if (que === "borrar") return (await borrarDemo()).join(" · ");
    if (que === "estimaciones") return [...(await sembrarEstimaciones()), ...(await migrarOrdenesExistentes())].join(" · ");
    return (await cargarDemo(u.id)).join(" · ");
  });
}

// ── Ingeniería: tiempos, tipo de artículo y materia prima ─────────────────

/** Grilla de tiempos: guarda los minutos por unidad (y setup) de cada paso editado. */
export async function guardarGrillaAction(fd: FormData) {
  await getUsuarioDePlanta();
  await correr(t(fd, "volver") || "/maestros/tiempos", async () => {
    let cambios = 0;
    for (const [k, v] of fd.entries()) {
      const m = /^(min|setup)__(.+)$/.exec(k);
      if (!m) continue;
      const val = String(v).trim().replace(",", ".");
      const campo = m[1] === "min" ? { minPorUnidad: val === "" ? null : Number(val) } : { setupMin: val === "" ? null : Math.round(Number(val)) };
      const original = String(fd.get(`orig_${k}`) ?? "");
      if (original === String(v)) continue;
      await db.update(operacion).set({ ...campo, tiempoOrigen: val === "" ? null : "definido" }).where(eq(operacion.id, m[2]));
      cambios++;
    }
    return `${cambios} tiempo${cambios === 1 ? "" : "s"} guardado${cambios === 1 ? "" : "s"}.`;
  });
}

/** Importar CSV de la grilla: operacionId;setup;min_por_unidad. */
export async function importarTiemposCsvAction(fd: FormData) {
  await getUsuarioDePlanta();
  await correr(t(fd, "volver") || "/maestros/tiempos", async () => {
    const archivo = fd.get("archivo");
    if (!(archivo instanceof File) || !archivo.size) throw new Error("Elegí el archivo CSV.");
    const lineas = (await archivo.text()).split(/\r?\n/).slice(1).filter((l) => l.trim());
    let cambios = 0;
    for (const l of lineas) {
      const [opId, , , , setup, min] = l.split(";").map((x) => x.trim().replace(/^"|"$/g, ""));
      if (!opId) continue;
      await db
        .update(operacion)
        .set({ setupMin: setup === "" ? null : Math.round(Number(setup.replace(",", "."))), minPorUnidad: min === "" ? null : Number(min.replace(",", ".")), tiempoOrigen: setup || min ? "definido" : null })
        .where(eq(operacion.id, opId));
      cambios++;
    }
    return `${plural(cambios, "paso")} actualizado${cambios === 1 ? "" : "s"} desde el CSV.`;
  });
}

/** Copia la hoja de ruta y los tiempos de una pieza a otras (por ejemplo, de Freno tipo D a Freno tipo B). */
export async function copiarRutaAction(fd: FormData) {
  await getUsuarioDePlanta();
  const origen = t(fd, "origen");
  const destinos = fd.getAll("destino").map(String).filter((d) => d && d !== origen);
  await correr(t(fd, "volver") || "/maestros/tiempos", async () => {
    if (!destinos.length) throw new Error("Elegí a qué piezas copiar.");
    const ruta = await db.select().from(operacion).where(eq(operacion.piezaId, origen)).orderBy(operacion.secuencia);
    if (!ruta.length) throw new Error("La pieza de origen no tiene hoja de ruta.");
    for (const d of destinos) {
      const trabajadas = await db.execute<{ n: number }>(sql`select count(*)::int n from registro_operacion r join operacion o on o.id = r.operacion_id where o.pieza_id = ${d}`);
      if (trabajadas[0].n > 0) throw new Error(`${d} ya tiene trabajo registrado: no se le reemplaza la ruta.`);
      await db.delete(operacion).where(eq(operacion.piezaId, d));
      await db.insert(operacion).values(ruta.map((o) => ({ ...o, id: `${d}-op-${crypto.randomUUID().slice(0, 8)}`, piezaId: d })));
    }
    return `Hoja de ruta y tiempos copiados a ${destinos.length} pieza${destinos.length === 1 ? "" : "s"}.`;
  });
}

export async function usarTiempoMedidoAction(fd: FormData) {
  await getUsuarioDePlanta();
  await correr(t(fd, "volver") || "/maestros", async () => {
    await db.update(operacion).set({ minPorUnidad: n(fd, "minPorUnidad"), setupMin: n(fd, "setupMin"), tiempoOrigen: "medido" }).where(eq(operacion.id, t(fd, "operacionId")));
    return "Se usa el tiempo medido para este paso.";
  });
}

export async function guardarArticuloPiezaAction(fd: FormData) {
  await getUsuarioDePlanta();
  const id = t(fd, "piezaId");
  await correr(`/maestros/pieza/${id}`, async () => {
    const clase = t(fd, "clase");
    await db
      .update(pieza)
      .set({
        clase: ["fabricada", "a_medida", "comercial"].includes(clase) ? clase : "fabricada",
        claseSugerida: null,
        material: t(fd, "material") || null,
        materialCantidad: n(fd, "materialCantidad"),
        materialUnidad: t(fd, "materialUnidad") || null,
        materialDeStock: fd.has("materialDeStock"),
        proveedorHabitualId: t(fd, "proveedorHabitualId") || null,
        plazoCompraDias: n(fd, "plazoCompraDias"),
      })
      .where(eq(pieza.id, id));
    return "Tipo de artículo y materia prima guardados.";
  });
}

// ── Proveedores y servicios ───────────────────────────────────────────────

export async function guardarProveedorPlanAction(fd: FormData) {
  const u = await getUsuarioActual();
  if (u.rol === "operario") throw new Error("No autorizado.");
  const id = t(fd, "id");
  await correr(`/proveedores/${id}`, async () => {
    const estado = t(fd, "estadoProveedor") || "activo";
    if (estado === "bloqueado" && !t(fd, "motivoBloqueo")) throw new Error("Para bloquear un proveedor hace falta un motivo.");
    await db
      .update(proveedor)
      .set({
        plazoDias: n(fd, "plazoDias"),
        tipoProveedor: t(fd, "tipoProveedor") || null,
        procesos: t(fd, "procesos") || null,
        estadoProveedor: estado,
        motivoBloqueo: t(fd, "motivoBloqueo") || null,
        monedaHabitual: t(fd, "monedaHabitual") || "ARS",
        telefono: t(fd, "telefono") || null,
        email: t(fd, "email") || null,
        updatedAt: new Date(),
      })
      .where(eq(proveedor.id, id));
    return "Datos de planificación del proveedor guardados.";
  });
}

export async function agregarServicioAction(fd: FormData) {
  const u = await getUsuarioActual();
  if (u.rol === "operario") throw new Error("No autorizado.");
  await correr(t(fd, "volver") || "/tercerizados?vista=servicios", async () => {
    if (!t(fd, "proveedorId") || !t(fd, "procesoId")) throw new Error("Proveedor y proceso.");
    if (fd.has("habitual")) await db.update(proveedorServicio).set({ habitual: false }).where(eq(proveedorServicio.procesoId, t(fd, "procesoId")));
    await db.insert(proveedorServicio).values({
      proveedorId: t(fd, "proveedorId"), procesoId: t(fd, "procesoId"), precio: n(fd, "precio"), unidadPrecio: t(fd, "unidadPrecio") || "pieza",
      moneda: t(fd, "moneda") || "ARS", plazoDias: n(fd, "plazoDias"), loteMinimo: n(fd, "loteMinimo"), vigenteHasta: t(fd, "vigenteHasta") || null, habitual: fd.has("habitual"),
    });
    return "Condición de servicio cargada.";
  });
}

// ── Stock: asignar, liberar y traspasar ───────────────────────────────────

export async function moverReservaAction(fd: FormData) {
  await getUsuarioDePlanta();
  const piezaId = t(fd, "piezaId");
  await correr(`/stock/pieza/${piezaId}`, async () => {
    const accion = t(fd, "accion");
    const cantidad = Math.round(n(fd, "cantidad") ?? 0);
    if (cantidad <= 0) throw new Error("La cantidad tiene que ser mayor a cero.");
    if (accion === "liberar" || accion === "traspasar") {
      const [r] = await db.select().from(reservaStock).where(eq(reservaStock.id, t(fd, "reservaId")));
      if (!r || r.cantidad < cantidad) throw new Error("Esa reserva no tiene tantas unidades.");
      await db.update(reservaStock).set({ cantidad: r.cantidad - cantidad }).where(eq(reservaStock.id, r.id));
      if (accion === "traspasar") {
        if (!t(fd, "motivo")) throw new Error("El traspaso entre órdenes pide un motivo.");
        await db.insert(reservaStock).values({ otMaquinaId: t(fd, "destinoOtMaquinaId"), piezaId, cantidad });
      }
      return accion === "liberar" ? `${plural(cantidad, "unidad", "unidades")} liberada${cantidad === 1 ? "" : "s"}.` : `${plural(cantidad, "unidad", "unidades")} traspasada${cantidad === 1 ? "" : "s"}.`;
    }
    const [{ libre }] = await db.execute<{ libre: number }>(
      sql`select coalesce((select cantidad_disponible from stock_pieza where pieza_id = ${piezaId}), 0) - coalesce((select sum(cantidad) from reserva_stock where pieza_id = ${piezaId}), 0) libre`,
    );
    if (cantidad > Number(libre)) throw new Error(`Sólo hay ${libre} unidades libres.`);
    if (!t(fd, "destinoOtMaquinaId")) throw new Error("Elegí la orden.");
    await db.insert(reservaStock).values({ otMaquinaId: t(fd, "destinoOtMaquinaId"), piezaId, cantidad });
    return `${plural(cantidad, "unidad", "unidades")} asignada${cantidad === 1 ? "" : "s"}.`;
  });
}

export async function retirarArticuloAction(fd: FormData) {
  await getUsuarioDePlanta();
  await correr(`/stock/${t(fd, "vista") || "consumibles"}`, async () => {
    const cant = n(fd, "cantidad") ?? 0;
    const [a] = await db.select().from(articuloStock).where(eq(articuloStock.id, t(fd, "id")));
    if (!a || cant <= 0 || cant > a.cantidad) throw new Error("Cantidad inválida.");
    await db.update(articuloStock).set({ cantidad: a.cantidad - cant }).where(eq(articuloStock.id, a.id));
    return `Retiro registrado: ${cant} ${a.unidad} de ${a.nombre}.`;
  });
}

