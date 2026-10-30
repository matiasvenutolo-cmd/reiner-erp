/**
 * Gestión (reorganización 30/10 §3): el jefe de planta decide quién hace qué y en qué orden. Es una lista,
 * no una grilla por días: el sistema no reparte tareas en el calendario.
 *
 * - Una fila por tarea pendiente (un paso de una pieza de una orden), ordenada por urgencia (margen, después
 *   prioridad de la orden). Las tareas salen del plan; lo que decide el jefe se guarda en `cola_tarea`.
 * - Asignar es elegir el operario en la fila. La cola de cada operario es el orden en que la va a hacer, y es
 *   exactamente lo que ve en su tablet: "Ahora te toca" es la primera de la cola que esté habilitada.
 * - Las tareas que esperan el paso anterior se ven en gris y también se pueden asignar por adelantado.
 * - La carga por persona es sólo informativa: llena la cola en orden con las horas del operario según el calendario.
 */
import { and, asc, eq, inArray, isNotNull, max } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { colaTarea, usuario, usuarioCentroTrabajo, operacion, proceso, centroTrabajo } from "@/lib/db/schema";
import { getPlan } from "@/lib/planning/datos";
import { esHabil } from "@/lib/planning/calendario";
import type { Tarea, Nivel } from "@/lib/planning/motor";

export type EstadoGestion = "sin_asignar" | "asignada" | "en_curso" | "espera" | "afuera" | "para_mandar" | "trabada";

export type FilaGestion = {
  clave: string;
  otPiezaId: string;
  operacionId: string;
  pieza: string;
  codigo: string;
  cantidad: number;
  orden: string;
  ordenId: string;
  paso: string;
  posicion: number;
  totalPasos: number;
  tipo: Tarea["tipo"];
  centroId: string | null;
  /** Centros donde se puede hacer este paso. */
  centros: string[];
  horas: number;
  operarioId: string | null;
  /** Lugar en la cola del operario. */
  lugar: number | null;
  estado: EstadoGestion;
  motivo: string | null;
  nivel: Nivel;
  holgura: number;
  prioridadAlta: boolean;
};

export type CargaOperario = {
  id: string;
  nombre: string;
  centros: string[];
  horasPendientes: number;
  tareas: number;
  /** Horas disponibles y ocupadas esta semana (desde hoy) y la próxima. */
  esta: { disponibles: number; ocupadas: number };
  proxima: { disponibles: number; ocupadas: number };
  texto: string;
};

const clave = (otPiezaId: string, operacionId: string) => `${otPiezaId}::${operacionId}`;

function nombreCorto(config: string | null | undefined, cliente: string | null | undefined, destino: string): string {
  const maquina = (config ?? "").split(" - ")[0] || "Orden";
  return `${maquina} · ${cliente ?? (destino === "stock" ? "Stock" : "Repuesto")}`;
}

export async function getGestion() {
  const plan = await getPlan();
  const { resultado: r, entrada, proyectosInfo } = plan;
  const tareas = r.tareas.filter((t) => t.estado !== "terminada" && t.tipo !== "compras");
  const opIds = [...new Set(tareas.map((t) => t.operacionId))];
  const [cola, operarios, habilitaciones, ops, centros] = await Promise.all([
    db.select().from(colaTarea),
    db.select({ id: usuario.id, nombre: usuario.nombre }).from(usuario).where(and(eq(usuario.rol, "operario"), eq(usuario.activo, true))).orderBy(asc(usuario.nombre)),
    db.select().from(usuarioCentroTrabajo),
    opIds.length ? db.select({ id: operacion.id, procesoId: operacion.procesoId }).from(operacion).where(inArray(operacion.id, opIds)) : Promise.resolve([]),
    db.select({ id: centroTrabajo.id, nombre: centroTrabajo.nombre }).from(centroTrabajo).orderBy(asc(centroTrabajo.orden)),
  ]);
  // Centros compatibles con cada proceso: el suyo y los que ya lo hacen en alguna hoja de ruta.
  const procesoDe = new Map(ops.map((o) => [o.id, o.procesoId]));
  const procesos = [...new Set(ops.map((o) => o.procesoId))];
  const [usos, procs] = procesos.length
    ? await Promise.all([
        db.selectDistinct({ procesoId: operacion.procesoId, centroId: operacion.centroTrabajoId }).from(operacion).where(and(inArray(operacion.procesoId, procesos), isNotNull(operacion.centroTrabajoId))),
        db.select({ id: proceso.id, centroId: proceso.centroTrabajoId }).from(proceso).where(inArray(proceso.id, procesos)),
      ])
    : [[], []];
  const compatibles = new Map<string, Set<string>>();
  for (const p of procs) compatibles.set(p.id, new Set(p.centroId ? [p.centroId] : []));
  for (const u of usos) if (u.centroId) compatibles.get(u.procesoId)?.add(u.centroId);

  const porClave = new Map(cola.map((c) => [clave(c.otPiezaId, c.operacionId), c]));
  const prioridad = new Map(entrada.proyectos.map((p) => [p.id, p.prioridad]));
  const filas: FilaGestion[] = tareas.map((t) => {
    const c = porClave.get(t.clave);
    const info = proyectosInfo.get(t.proyectoId);
    const proy = entrada.proyectos.find((p) => p.id === t.proyectoId);
    const centroId = c?.centroId ?? t.centroId;
    const set = new Set(compatibles.get(procesoDe.get(t.operacionId) ?? "") ?? []);
    if (t.centroId) set.add(t.centroId);
    if (centroId) set.add(centroId);
    let estado: EstadoGestion;
    if (t.tipo === "tercerizado") estado = t.estado === "en_curso" ? "afuera" : t.estado === "lista" ? "para_mandar" : t.estado === "trabada" ? "trabada" : "espera";
    else if (t.estado === "en_curso" || t.estado === "pausada") estado = "en_curso";
    else if (t.estado === "trabada") estado = "trabada";
    else if (t.estado !== "lista") estado = "espera";
    else estado = c?.operarioId ? "asignada" : "sin_asignar";
    return {
      clave: t.clave,
      otPiezaId: t.otPiezaId,
      operacionId: t.operacionId,
      pieza: t.piezaNombre,
      codigo: t.piezaCodigo,
      cantidad: t.cantidad,
      orden: nombreCorto(info?.configuracion, info?.cliente, proy?.tipo ?? "maquina"),
      ordenId: t.proyectoId,
      paso: t.paso,
      posicion: t.posicion,
      totalPasos: t.totalPasos,
      tipo: t.tipo,
      centroId,
      centros: t.tipo === "interno" ? [...set] : [],
      horas: t.horas,
      operarioId: c?.operarioId ?? null,
      lugar: c?.operarioId ? (c.posicion ?? null) : null,
      estado,
      motivo: t.motivoTraba,
      nivel: t.nivel,
      holgura: t.holgura,
      prioridadAlta: prioridad.get(t.proyectoId) === "alta",
    };
  });
  // Urgencia: margen, después prioridad de la orden.
  filas.sort((a, b) => a.holgura - b.holgura || Number(b.prioridadAlta) - Number(a.prioridadAlta) || a.orden.localeCompare(b.orden));

  const centrosDe = new Map<string, string[]>();
  for (const h of habilitaciones) centrosDe.set(h.usuarioId, [...(centrosDe.get(h.usuarioId) ?? []), h.centroTrabajoId]);
  const carga = cargaPorPersona(
    operarios.map((o) => ({ ...o, centros: centrosDe.get(o.id) ?? [] })),
    filas,
    entrada,
  );
  return { filas, operarios: operarios.map((o) => ({ ...o, centros: centrosDe.get(o.id) ?? [] })), centros, carga, hoy: entrada.hoy };
}

/** Horas que el operario puede trabajar en un día: las del plan (calendario × eficiencia), 0 si falta o no es hábil. */
function horasDelDia(operarioId: string, fecha: string, entrada: Awaited<ReturnType<typeof getPlan>>["entrada"]): number {
  if (!esHabil(fecha, entrada.calendario)) return 0;
  if (entrada.ausencias.get(operarioId)?.has(fecha)) return 0;
  return entrada.horasOperarioDia ?? 6.8;
}

function cargaPorPersona(operarios: { id: string; nombre: string; centros: string[] }[], filas: FilaGestion[], entrada: Awaited<ReturnType<typeof getPlan>>["entrada"]): CargaOperario[] {
  const hoy = entrada.hoy;
  // Esta semana: de hoy al viernes. La próxima: lunes a viernes.
  const d = new Date(`${hoy}T12:00:00Z`).getUTCDay();
  const quedan = d >= 1 && d <= 5 ? 6 - d : 0;
  const lunesProximo = (() => {
    const x = new Date(`${hoy}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() + ((8 - (d || 7)) % 7 || 7));
    return x.toISOString().slice(0, 10);
  })();
  const semana = (desde: string, n: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const x = new Date(`${desde}T12:00:00Z`);
      x.setUTCDate(x.getUTCDate() + i);
      out.push(x.toISOString().slice(0, 10));
    }
    return out;
  };
  const estaDias = semana(hoy, quedan);
  const proxDias = semana(lunesProximo, 5);
  return operarios.map((o) => {
    const mias = filas.filter((f) => f.operarioId === o.id && f.estado !== "afuera");
    const pendientes = mias.reduce((s, f) => s + f.horas, 0);
    const capEsta = estaDias.reduce((s, f) => s + horasDelDia(o.id, f, entrada), 0);
    const capProx = proxDias.reduce((s, f) => s + horasDelDia(o.id, f, entrada), 0);
    const ocupEsta = Math.min(pendientes, capEsta);
    const ocupProx = Math.min(Math.max(0, pendientes - capEsta), capProx);
    const resto = Math.max(0, pendientes - capEsta - capProx);
    const h = (n: number) => `${Math.round(n)} h`;
    const texto =
      pendientes === 0
        ? "sin tareas asignadas"
        : pendientes <= capEsta
          ? `esta semana: ${h(ocupEsta)} de ${h(capEsta)}`
          : resto === 0
            ? `esta semana completa y ${h(ocupProx)} de la próxima`
            : `esta semana y la próxima completas, y ${h(resto)} más`;
    return {
      id: o.id,
      nombre: o.nombre,
      centros: o.centros,
      horasPendientes: pendientes,
      tareas: mias.length,
      esta: { disponibles: capEsta, ocupadas: ocupEsta },
      proxima: { disponibles: capProx, ocupadas: ocupProx },
      texto,
    };
  });
}

// ── Lo que se modifica desde Gestión ─────────────────────────────────────

function partir(c: string) {
  const [otPiezaId, ...resto] = c.split("::");
  return { otPiezaId, operacionId: resto.join("::") };
}

/** Asigna una o varias tareas a un operario (al final de su cola), o las deja sin asignar (operarioId null). */
export async function asignarTareas(claves: string[], operarioId: string | null, por: string): Promise<void> {
  if (!claves.length) return;
  let siguiente = 0;
  if (operarioId) {
    const [m] = await db.select({ n: max(colaTarea.posicion) }).from(colaTarea).where(eq(colaTarea.operarioId, operarioId));
    siguiente = m?.n ?? 0;
  }
  for (const c of claves) {
    const { otPiezaId, operacionId } = partir(c);
    const [actual] = await db.select().from(colaTarea).where(and(eq(colaTarea.otPiezaId, otPiezaId), eq(colaTarea.operacionId, operacionId)));
    if (actual?.operarioId === operarioId && operarioId) continue; // ya estaba en su cola: no cambia de lugar
    const posicion = operarioId ? ++siguiente : null;
    await db
      .insert(colaTarea)
      .values({ otPiezaId, operacionId, operarioId, posicion, asignadoPorId: por })
      .onConflictDoUpdate({ target: [colaTarea.otPiezaId, colaTarea.operacionId], set: { operarioId, posicion, asignadoPorId: por, updatedAt: new Date() } });
  }
}

/** Cambia el centro de una tarea. Si el operario asignado no está habilitado para el centro nuevo, queda sin asignar. */
export async function cambiarCentro(c: string, centroId: string, por: string): Promise<void> {
  const { otPiezaId, operacionId } = partir(c);
  const [actual] = await db.select().from(colaTarea).where(and(eq(colaTarea.otPiezaId, otPiezaId), eq(colaTarea.operacionId, operacionId)));
  let operarioId = actual?.operarioId ?? null;
  if (operarioId) {
    const centros = await db.select({ c: usuarioCentroTrabajo.centroTrabajoId }).from(usuarioCentroTrabajo).where(eq(usuarioCentroTrabajo.usuarioId, operarioId));
    if (centros.length && !centros.some((x) => x.c === centroId)) operarioId = null;
  }
  await db
    .insert(colaTarea)
    .values({ otPiezaId, operacionId, centroId, operarioId, posicion: operarioId ? actual?.posicion : null, asignadoPorId: por })
    .onConflictDoUpdate({ target: [colaTarea.otPiezaId, colaTarea.operacionId], set: { centroId, operarioId, posicion: operarioId ? (actual?.posicion ?? null) : null, asignadoPorId: por, updatedAt: new Date() } });
}

/** Mueve una tarea un lugar arriba o abajo en la cola de su operario. */
export async function moverEnCola(c: string, direccion: "arriba" | "abajo"): Promise<void> {
  const { otPiezaId, operacionId } = partir(c);
  const [t] = await db.select().from(colaTarea).where(and(eq(colaTarea.otPiezaId, otPiezaId), eq(colaTarea.operacionId, operacionId)));
  if (!t?.operarioId) return;
  const cola = await db.select().from(colaTarea).where(eq(colaTarea.operarioId, t.operarioId)).orderBy(asc(colaTarea.posicion));
  const i = cola.findIndex((x) => x.id === t.id);
  const j = direccion === "arriba" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= cola.length) return;
  [cola[i], cola[j]] = [cola[j], cola[i]];
  await renumerar(cola.map((x) => x.id));
}

/** Vuelve a ordenar la cola de un operario por urgencia (el orden sugerido). */
export async function ordenarPorUrgencia(operarioId: string, filas: FilaGestion[]): Promise<void> {
  const cola = await db.select().from(colaTarea).where(eq(colaTarea.operarioId, operarioId));
  const orden = new Map(filas.map((f, i) => [f.clave, i]));
  cola.sort((a, b) => (orden.get(clave(a.otPiezaId, a.operacionId)) ?? 1e9) - (orden.get(clave(b.otPiezaId, b.operacionId)) ?? 1e9));
  await renumerar(cola.map((x) => x.id));
}

async function renumerar(ids: string[]) {
  if (!ids.length) return;
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) await tx.update(colaTarea).set({ posicion: i + 1 }).where(eq(colaTarea.id, ids[i]));
  });
}

/** La cola de un operario, en orden (para su tablet). */
export async function getColaDe(operarioId: string) {
  return db.select().from(colaTarea).where(eq(colaTarea.operarioId, operarioId)).orderBy(asc(colaTarea.posicion));
}
