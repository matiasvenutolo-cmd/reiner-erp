/**
 * v2 — Vista del operario (mejoras de usabilidad §3): su cola del día y todo lo
 * que necesita saber de cada tarea para no tener que preguntar.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  asignacionTrabajo, semanaConfirmada, tareaAdelanto, registroOperacion, operacion, proceso, dispositivo, pieza, piezaAdjunto, piezaNota, otPieza,
} from "@/lib/db/schema";
import { getPlan, getCalendario } from "@/lib/planning/datos";
import { ajustarAHabil, lunesDe } from "@/lib/planning/calendario";
import { urlDeAdjunto } from "@/lib/blob";
import { hoyISO, fechaISO } from "@/lib/fecha";
import type { Tarea } from "@/lib/planning/motor";

/** Horas que un operario puede planificarse por día: las del calendario × eficiencia (8 h × 85 %). */
export const HORAS_OPERARIO_DIA = 6.8;

export type ColaOperario = {
  hoy: string;
  /** El jefe de planta confirmó la semana: la cola es la confirmada. Si no, es la propuesta (§1.8). */
  confirmada: boolean;
  tareas: Tarea[];
  hechas: number;
  horasHechas: number;
  horasTotales: number;
  /** Tareas que el operario adelantó hoy ("Hacer esta antes"). */
  adelantadas: Set<string>;
};

/**
 * Cola del operario para hoy. Con la semana confirmada: lo que le asignó el
 * plan confirmado (lo que no terminó ayer sigue). Sin confirmar: la cola
 * propuesta por el motor, para que la planta no se frene un lunes a la mañana.
 * Si tiene varios centros, la cola los junta en el orden del plan (§3.6).
 */
export async function getColaOperario(usuarioId: string): Promise<ColaOperario> {
  const hoy = ajustarAHabil(hoyISO(), await getCalendario());
  const lunes = lunesDe(hoy);
  // "Hecho hoy" cuenta desde las 0 h del día real (un sábado de prueba también suma).
  const desdeHoy = new Date(`${hoyISO()}T00:00:00-03:00`);
  const [plan, [semana], asignadas, adelantos, cerradosHoy] = await Promise.all([
    getPlan(),
    db.select().from(semanaConfirmada).where(eq(semanaConfirmada.lunes, lunes)),
    db
      .select()
      .from(asignacionTrabajo)
      .where(and(eq(asignacionTrabajo.operarioId, usuarioId), eq(asignacionTrabajo.dePlanConfirmado, true), gte(asignacionTrabajo.fecha, lunes), lte(asignacionTrabajo.fecha, hoy))),
    db
      .select()
      .from(tareaAdelanto)
      .where(and(eq(tareaAdelanto.usuarioId, usuarioId), gte(tareaAdelanto.createdAt, desdeHoy)))
      .orderBy(desc(tareaAdelanto.createdAt)),
    db
      .select({ otPiezaId: registroOperacion.otPiezaId, operacionId: registroOperacion.operacionId })
      .from(registroOperacion)
      .where(and(eq(registroOperacion.usuarioId, usuarioId), eq(registroOperacion.tipo, "ejecucion"), isNotNull(registroOperacion.fin), gte(registroOperacion.fin, desdeHoy))),
  ]);
  const porClave = new Map(plan.resultado.tareas.map((t) => [t.clave, t]));
  const confirmada = !!semana || asignadas.length > 0;
  let tareas: Tarea[];
  if (confirmada) {
    tareas = [...new Set(asignadas.map((a) => `${a.otPiezaId}::${a.operacionId}`))].map((c) => porClave.get(c)).filter((t): t is Tarea => !!t);
  } else {
    tareas = plan.resultado.tareas.filter((t) => t.tipo === "interno" && t.operarioId === usuarioId && t.fechaPlan && t.fechaPlan <= hoy && !["terminada", "futura"].includes(t.estado));
  }
  tareas = tareas.filter((t) => t.estado !== "terminada");
  const ordenAdelanto = new Map<string, number>();
  adelantos.forEach((a, i) => {
    const c = `${a.otPiezaId}::${a.operacionId}`;
    if (!ordenAdelanto.has(c)) ordenAdelanto.set(c, i);
  });
  // Primero lo que el operario adelantó (el último adelanto arriba), después lo que se puede hacer ya, en el orden del plan.
  tareas.sort(
    (a, b) =>
      (ordenAdelanto.get(a.clave) ?? 1e9) - (ordenAdelanto.get(b.clave) ?? 1e9) ||
      Number(b.estado === "lista" || b.estado === "en_curso" || b.estado === "pausada") - Number(a.estado === "lista" || a.estado === "en_curso" || a.estado === "pausada") ||
      (a.fechaPlan ?? "").localeCompare(b.fechaPlan ?? "") ||
      a.holgura - b.holgura,
  );
  const hechasClaves = [...new Set(cerradosHoy.map((r) => `${r.otPiezaId}::${r.operacionId}`))];
  const horasDe = (t: Tarea) => t.horasPorDia[hoy] ?? t.horas;
  const horasHechas = hechasClaves.reduce((s, c) => s + (porClave.get(c)?.horas ?? 0), 0);
  return {
    hoy,
    confirmada,
    tareas,
    hechas: hechasClaves.length,
    horasHechas,
    horasTotales: horasHechas + tareas.reduce((s, t) => s + horasDe(t), 0),
    adelantadas: new Set(ordenAdelanto.keys()),
  };
}

export type DetalleTarea = {
  detalle: string | null;
  dispositivo: string | null;
  material: string | null;
  setupMin: number;
  minPorUnidad: number;
  estimadoHoras: number;
  vieneDe: { paso: string; fin: string | null } | null;
  despues: string | null;
  planos: { nombre: string; url: string }[];
  notas: string[];
};

/** Lo que muestra la tarjeta del operario (§3.2), en orden de importancia. */
export async function getDetalleTarea(t: Pick<Tarea, "otPiezaId" | "operacionId" | "piezaCodigo" | "cantidad" | "posicion">): Promise<DetalleTarea> {
  const [ruta, [pz], adj, notas] = await Promise.all([
    db
      .select({ o: operacion, nombre: proceso.nombre, ds: proceso.setupMin, dm: proceso.minPorUnidad, disp: dispositivo.nombre })
      .from(operacion)
      .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
      .leftJoin(dispositivo, eq(dispositivo.id, operacion.dispositivoId))
      .where(eq(operacion.piezaId, t.piezaCodigo))
      .orderBy(asc(operacion.secuencia)),
    db.select({ material: pieza.material }).from(pieza).where(eq(pieza.id, t.piezaCodigo)),
    db.select().from(piezaAdjunto).where(and(eq(piezaAdjunto.piezaId, t.piezaCodigo), inArray(piezaAdjunto.tipo, ["plano"]))),
    db
      .select()
      .from(piezaNota)
      .where(and(eq(piezaNota.piezaId, t.piezaCodigo), sql`${piezaNota.createdAt} > now() - interval '60 days'`))
      .orderBy(desc(piezaNota.createdAt))
      .limit(2),
  ]);
  const i = ruta.findIndex((x) => x.o.id === t.operacionId);
  const actual = ruta[i];
  const anterior = i > 0 ? ruta[i - 1] : null;
  let finAnterior: string | null = null;
  if (anterior) {
    const [r] = await db
      .select({ fin: registroOperacion.fin })
      .from(registroOperacion)
      .where(and(eq(registroOperacion.otPiezaId, t.otPiezaId), eq(registroOperacion.operacionId, anterior.o.id), isNotNull(registroOperacion.fin)))
      .orderBy(desc(registroOperacion.fin))
      .limit(1);
    finAnterior = r?.fin ? fechaISO(r.fin) : null;
  }
  const setup = actual?.o.setupMin ?? actual?.ds ?? 30;
  const porUnidad = actual?.o.minPorUnidad ?? actual?.dm ?? 15;
  const nombre = (x: (typeof ruta)[number] | null | undefined) => (x ? (x.o.descripcion ? `${x.nombre} · ${x.o.descripcion}` : x.nombre) : null);
  return {
    detalle: actual?.o.descripcion ?? null,
    dispositivo: actual?.disp ?? null,
    material: pz?.material ?? null,
    setupMin: setup,
    minPorUnidad: porUnidad,
    estimadoHoras: (setup + porUnidad * t.cantidad) / 60,
    vieneDe: anterior ? { paso: nombre(anterior)!, fin: finAnterior } : null,
    despues: nombre(ruta[i + 1]),
    planos: adj.map((a) => ({ nombre: a.nombreArchivo, url: urlDeAdjunto(a.pathname) })),
    notas: notas.map((n) => n.texto),
  };
}

/** Pieza y orden de un registro (para el "Listo. Ahora te toca…"). */
export async function getNombreDeRegistro(registroId: string): Promise<string | null> {
  const [r] = await db
    .select({ nombre: pieza.nombre })
    .from(registroOperacion)
    .innerJoin(otPieza, eq(otPieza.id, registroOperacion.otPiezaId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .where(eq(registroOperacion.id, registroId));
  return r?.nombre ?? null;
}

/**
 * La tarea de una pieza para la vista de planta: la del plan si la pieza está
 * en un proyecto activo; si no (una orden vieja, sin fecha), se arma con lo
 * que hay en la base para que el operario igual pueda trabajarla.
 */
export async function getTareaDePieza(otPiezaId: string, operacionId?: string): Promise<Tarea | null> {
  const plan = await getPlan();
  const delPlan = plan.resultado.tareas.filter((t) => t.otPiezaId === otPiezaId);
  const t = operacionId ? delPlan.find((x) => x.operacionId === operacionId) : delPlan.find((x) => x.estado !== "terminada");
  if (t) return t;
  const [op] = await db
    .select({ op: otPieza, nombre: pieza.nombre, codigo: pieza.codigo })
    .from(otPieza)
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .where(eq(otPieza.id, otPiezaId));
  if (!op) return null;
  const ruta = await db
    .select({ o: operacion, nombre: proceso.nombre, tipo: proceso.tipo, centro: proceso.centroTrabajoId })
    .from(operacion)
    .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
    .where(eq(operacion.piezaId, op.op.piezaId))
    .orderBy(asc(operacion.secuencia));
  const cerrados = await db
    .select({ operacionId: registroOperacion.operacionId })
    .from(registroOperacion)
    .where(and(eq(registroOperacion.otPiezaId, otPiezaId), eq(registroOperacion.tipo, "ejecucion"), isNotNull(registroOperacion.fin)));
  const hechos = new Set(cerrados.map((c) => c.operacionId));
  const i = operacionId ? ruta.findIndex((x) => x.o.id === operacionId) : ruta.findIndex((x) => !hechos.has(x.o.id));
  const paso = ruta[i];
  if (!paso) return null;
  const hoy = hoyISO();
  return {
    clave: `${otPiezaId}::${paso.o.id}`, proyectoId: "", proyectoCodigo: "", proyectoTipo: "repuesto", conjuntoId: "", otPiezaId, operacionId: paso.o.id,
    piezaCodigo: op.codigo, piezaNombre: op.nombre, cantidad: op.op.cantidadAFabricar, paso: paso.o.descripcion || paso.nombre, posicion: i + 1, totalPasos: ruta.length,
    tipo: paso.tipo, centroId: paso.o.centroTrabajoId ?? paso.centro, horas: 0, dias: 1, fechaLimite: hoy, inicioMasTardio: hoy, holgura: 10, nivel: "en_plazo",
    estado: "lista", motivoTraba: null, estimado: true, plazoSupuesto: false, fechaPlan: null, finPlan: null, operarioId: null, fijada: false, movida: false, tarde: false, horasPorDia: {},
  };
}
