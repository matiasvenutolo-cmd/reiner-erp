/**
 * Gestión (reorganización 30/10 §3): el jefe de planta decide quién hace qué y en qué orden. Es una lista,
 * no una grilla por días: el sistema no reparte tareas en el calendario.
 *
 * - Una fila por tarea pendiente (un paso de una pieza de una orden), ordenada por urgencia (margen, después
 *   prioridad de la orden). Las tareas salen del plan; lo que decide el jefe se guarda en `cola_tarea`.
 * - Reunión 20/11: el orden se administra por centro, tenga o no operario. Cada centro tiene su cola, que el jefe
 *   ordena arrastrando (también las que esperan el paso anterior). Lo que no se ordenó a mano va por urgencia.
 * - Asignar es elegir el operario en la fila, y no cambia el orden. El operario ve sus tareas en el orden de la
 *   cola de su centro: "Ahora te toca" es la primera que esté habilitada.
 * - La carga de trabajo es sólo para ver: llena cada cola en orden con las horas de cada día según el calendario.
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { colaTarea, usuario, usuarioCentroTrabajo, operacion, proceso, centroTrabajo, proveedor, proveedorServicio, remito, remitoItem, parametro, avisoPlanta } from "@/lib/db/schema";
import { hoyISO } from "@/lib/fecha";
import { getPlan } from "@/lib/planning/datos";
import { evaluarEntrada } from "./entrada-plan";
import { getClavesEnReproceso, getDesviosAbiertos } from "./desvios";
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
  /** Lugar en la cola de su centro, puesto a mano (null = va por urgencia, después de las ordenadas). */
  lugar: number | null;
  estado: EstadoGestion;
  motivo: string | null;
  /** Prueba 19/11: el paso salió mal y se decidió reprocesar la pieza. */
  reproceso: boolean;
  /** Mejoras 22/11: salió mal y espera la decisión (reprocesar o scrap); se decide también desde la fila. */
  desvioId: string | null;
  /** Tercerizado (§5.1): a qué proveedor se manda o dónde está, con la vuelta prevista. */
  proveedor: string | null;
  vuelta: string | null;
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

function nombreCorto(config: string | null | undefined, cliente: string | null | undefined, destino: string, referencia?: string | null): string {
  // Una orden sin máquina (pieza a medida) se nombra por su referencia: "AM-001 · Casasco".
  const maquina = (config ?? "").split(" - ")[0] || referencia || "Orden";
  return `${maquina} · ${cliente ?? (destino === "stock" ? "Stock" : "Repuesto")}`;
}

/** Una pieza que espera el envío a producción (prueba 1, 05/11: se manda sólo desde Gestión). */
export type FilaParaEnviar = {
  otPiezaId: string;
  pieza: string;
  codigo: string;
  cantidad: number;
  orden: string;
  ordenId: string;
  /** Horas de taller de toda su hoja de ruta. */
  horas: number;
  pasos: number;
  /** Por qué todavía no se puede mandar (falta material o plano); null = se puede. */
  motivo: string | null;
  holgura: number;
};

/** Un tramo de trabajo de un operario en un día (prueba 1, 05/11: la carga se ve en Gestión, por día). */
export type TramoCarga = {
  clave: string;
  otPiezaId: string;
  operarioId: string;
  centroId: string | null;
  pieza: string;
  paso: string;
  posicion: number;
  totalPasos: number;
  orden: string;
  dia: string;
  horas: number;
  totalHoras: number;
  /** Qué parte del día ocupa (0 a 1): dos tareas seguidas comparten el día sin superponerse. */
  desde: number;
  hasta: number;
};
export type CargaPorDia = {
  /** Días hábiles desde hoy (unos tres meses, para recorrerlos semana a semana o por mes). */
  dias: string[];
  tramos: TramoCarga[];
  /** Horas que puede trabajar cada operario cada día (0 = no viene o no es hábil). */
  capacidad: Record<string, Record<string, number>>;
  /** Tareas internas sin operario, por centro (en la carga se ven en gris, en el orden de la cola del centro). */
  sinAsignar: Record<string, { tareas: number; horas: number }>;
};

export type OrdenEnCurso = { id: string; codigo: string; nombre: string; finEstimado: string; avancePct: number; tareas: number; porEnviar: number };

export async function getGestion() {
  const plan = await getPlan();
  const { resultado: r, entrada, proyectosInfo } = plan;
  // Lo que todavía no entró al plan (paso "futura") no se asigna: espera el envío a producción, arriba.
  const tareas = r.tareas.filter((t) => t.estado !== "terminada" && t.tipo !== "compras" && t.estado !== "futura");
  const opIds = [...new Set(tareas.map((t) => t.operacionId))];
  const [cola, operarios, habilitaciones, ops, centros] = await Promise.all([
    db.select().from(colaTarea),
    db.select({ id: usuario.id, nombre: usuario.nombre }).from(usuario).where(and(eq(usuario.rol, "operario"), eq(usuario.activo, true))).orderBy(asc(usuario.nombre)),
    db.select().from(usuarioCentroTrabajo),
    opIds.length ? db.select({ id: operacion.id, procesoId: operacion.procesoId, proveedorId: operacion.proveedorId }).from(operacion).where(inArray(operacion.id, opIds)) : Promise.resolve([]),
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
  // Tercerizados (§5.1): el proveedor del paso (o el habitual del proceso) para mandar; el del remito si ya salió.
  const tercerizadas = tareas.filter((t) => t.tipo === "tercerizado");
  const [provs, habituales, remitos] = tercerizadas.length
    ? await Promise.all([
        db.select({ id: proveedor.id, nombre: proveedor.razonSocial }).from(proveedor),
        db.select({ procesoId: proveedorServicio.procesoId, proveedorId: proveedorServicio.proveedorId }).from(proveedorServicio).where(eq(proveedorServicio.habitual, true)),
        db
          .select({ otPiezaId: remitoItem.otPiezaId, destino: remito.destino })
          .from(remitoItem)
          .innerJoin(remito, eq(remito.id, remitoItem.remitoId))
          .where(inArray(remitoItem.otPiezaId, [...new Set(tercerizadas.map((t) => t.otPiezaId))]))
          .orderBy(desc(remito.fecha)),
      ])
    : [[], [], []];
  const nombreProv = new Map(provs.map((p) => [p.id, p.nombre]));
  const habitualDe = new Map(habituales.map((h) => [h.procesoId, h.proveedorId]));
  const proveedorPaso = new Map(ops.map((o) => [o.id, o.proveedorId ?? habitualDe.get(o.procesoId) ?? null]));
  const destinoRemito = new Map<string, string>();
  for (const x of remitos) if (x.otPiezaId && !destinoRemito.has(x.otPiezaId)) destinoRemito.set(x.otPiezaId, x.destino);
  const compatibles = new Map<string, Set<string>>();
  for (const p of procs) compatibles.set(p.id, new Set(p.centroId ? [p.centroId] : []));
  for (const u of usos) if (u.centroId) compatibles.get(u.procesoId)?.add(u.centroId);

  const [enReproceso, desvios] = await Promise.all([getClavesEnReproceso(), getDesviosAbiertos()]);
  const desvioDe = new Map(desvios.map((d) => [clave(d.otPiezaId, d.operacionId), d.id]));
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
      orden: nombreCorto(info?.configuracion, info?.cliente, proy?.tipo ?? "maquina", info?.referencia),
      ordenId: t.proyectoId,
      paso: t.paso,
      posicion: t.posicion,
      totalPasos: t.totalPasos,
      tipo: t.tipo,
      centroId,
      centros: t.tipo === "interno" ? [...set] : [],
      horas: t.horas,
      operarioId: c?.operarioId ?? null,
      lugar: c?.posicion ?? null,
      estado,
      motivo: t.motivoTraba,
      reproceso: enReproceso.has(t.clave),
      desvioId: desvioDe.get(t.clave) ?? null,
      proveedor:
        t.tipo !== "tercerizado"
          ? null
          : estado === "afuera"
            ? (destinoRemito.get(t.otPiezaId) ?? null)
            : (nombreProv.get(proveedorPaso.get(t.operacionId) ?? "") ?? null),
      vuelta: t.tipo === "tercerizado" && estado === "afuera" ? t.finPlan : null,
      nivel: t.nivel,
      holgura: t.holgura,
      prioridadAlta: prioridad.get(t.proyectoId) === "alta",
    };
  });
  // Urgencia: margen, después prioridad de la orden. Encima, el orden puesto a mano en la cola de cada centro.
  filas.sort((a, b) => a.holgura - b.holgura || Number(b.prioridadAlta) - Number(a.prioridadAlta) || a.orden.localeCompare(b.orden));
  filas.sort((a, b) => (a.lugar ?? 1e9) - (b.lugar ?? 1e9));

  const centrosDe = new Map<string, string[]>();
  for (const h of habilitaciones) centrosDe.set(h.usuarioId, [...(centrosDe.get(h.usuarioId) ?? []), h.centroTrabajoId]);
  const carga = cargaPorPersona(
    operarios.map((o) => ({ ...o, centros: centrosDe.get(o.id) ?? [] })),
    filas,
    entrada,
  );
  // Para enviar a producción: las piezas a fabricar que no entraron al plan, por urgencia de su primer paso.
  const evaluadas = await evaluarEntrada({});
  const pasosDe = new Map<string, Tarea[]>();
  for (const t of r.tareas) if (t.tipo !== "compras") pasosDe.set(t.otPiezaId, [...(pasosDe.get(t.otPiezaId) ?? []), t]);
  const paraEnviar: FilaParaEnviar[] = evaluadas
    .map((x) => {
      const ps = (pasosDe.get(x.otPiezaId) ?? []).sort((a, b) => a.posicion - b.posicion);
      const info = proyectosInfo.get(x.otMaquinaId);
      const proy = entrada.proyectos.find((p) => p.id === x.otMaquinaId);
      return {
        otPiezaId: x.otPiezaId,
        pieza: x.nombre,
        codigo: x.codigo,
        cantidad: x.cantidad,
        orden: nombreCorto(info?.configuracion, info?.cliente, proy?.tipo ?? "maquina", info?.referencia),
        ordenId: x.otMaquinaId,
        horas: ps.reduce((n, t) => n + t.horas, 0),
        pasos: ps.length,
        motivo: x.motivo,
        holgura: ps[0]?.holgura ?? 0,
      };
    })
    .sort((a, b) => Number(!!a.motivo) - Number(!!b.motivo) || a.holgura - b.holgura || a.orden.localeCompare(b.orden));
  const operariosConCentros = operarios.map((o) => ({ ...o, centros: centrosDe.get(o.id) ?? [] }));
  const cargaDia = cargaPorDia(operariosConCentros, filas, entrada, new Map(r.tareas.map((t) => [t.clave, t])), await queQuedaDeHoy(entrada.hoy));

  // Arriba de Gestión (prueba 1, 05/11): cada orden en curso con su fecha estimada de finalización, que se va
  // corriendo con lo que pasa en el taller. No es un compromiso: es lo que da el plan hoy.
  const ordenes: OrdenEnCurso[] = r.proyectos
    .filter((p) => filas.some((f) => f.ordenId === p.id) || paraEnviar.some((x) => x.ordenId === p.id))
    .map((p) => {
      const info = proyectosInfo.get(p.id);
      const proy = entrada.proyectos.find((x) => x.id === p.id);
      return {
        id: p.id,
        codigo: p.codigo,
        nombre: nombreCorto(info?.configuracion, info?.cliente, proy?.tipo ?? "maquina", info?.referencia),
        finEstimado: p.finEstimado,
        avancePct: p.avancePct,
        tareas: filas.filter((f) => f.ordenId === p.id).length,
        porEnviar: paraEnviar.filter((x) => x.ordenId === p.id).length,
      };
    })
    .sort((a, b) => a.finEstimado.localeCompare(b.finEstimado));
  return { filas, paraEnviar, ordenes, operarios: operariosConCentros, centros, carga, cargaDia, hoy: entrada.hoy };
}

/**
 * Las colas repartidas en los días (prueba 1, 05/11; reunión 20/11). Cada operario hace sus tareas en el orden de la
 * cola de su centro, cada día con las horas que tiene según el calendario y sus ausencias. Lo que todavía no tiene
 * operario se reparte igual, en gris, en una fila por centro (como si lo hiciera una persona). Una tarea larga ocupa
 * varios días seguidos. Una tarea que espera el paso anterior no se toma hasta que ese paso termina; mientras, se
 * sigue con lo siguiente de la cola. Es sólo para ver: no se mueve nada desde acá.
 */
function cargaPorDia(
  operarios: { id: string; nombre: string; centros: string[] }[],
  filas: FilaGestion[],
  entrada: Awaited<ReturnType<typeof getPlan>>["entrada"],
  tareaDe: Map<string, Tarea>,
  queda: number,
): CargaPorDia {
  const cal = entrada.calendario;
  const dias: string[] = [];
  for (let d = entrada.hoy; dias.length < 65; d = siguienteDia(d)) if (esHabil(d, cal)) dias.push(d);
  // Se simula un poco más allá de lo que se muestra, para que una tarea larga no quede cortada en el borde.
  const horizonte: string[] = [...dias];
  for (let d = siguienteDia(dias.at(-1)!); horizonte.length < 130; d = siguienteDia(d)) if (esHabil(d, cal)) horizonte.push(d);

  const capacidad: CargaPorDia["capacidad"] = {};
  for (const o of operarios) capacidad[o.id] = Object.fromEntries(dias.map((d, i) => [d, horasDelDia(o.id, d, entrada) * (i === 0 ? queda : 1)]));

  // Mejoras 22/11: lo que no tiene operario se ubica en su turno dentro de la cola del centro, como si lo hiciera
  // quien se libere primero ahí (el operario del centro con menos horas en cola), y se dibuja en gris. Sólo si el
  // centro no tiene a nadie habilitado va en una fila gris propia. Es una simulación: no asigna nada.
  const internas = filas.filter((f) => f.tipo === "interno");
  const horasDe = new Map(operarios.map((o) => [o.id, internas.filter((f) => f.operarioId === o.id).reduce((n, f) => n + f.horas, 0)]));
  const simuladoPor = new Map<string, string>(); // clave → operario que la "hace" en la simulación
  for (const f of internas) {
    if (f.operarioId || !f.centroId) continue;
    const delCentro = operarios.filter((o) => o.centros.includes(f.centroId!));
    if (!delCentro.length) continue;
    const quien = delCentro.reduce((a, b) => ((horasDe.get(b.id) ?? 0) < (horasDe.get(a.id) ?? 0) ? b : a));
    simuladoPor.set(f.clave, quien.id);
    horasDe.set(quien.id, (horasDe.get(quien.id) ?? 0) + f.horas);
  }
  // Las filas ya vienen en el orden de la cola de cada centro.
  const colas: { id: string; operarioId: string; tareas: FilaGestion[]; horas: (i: number) => number }[] = [
    ...operarios.map((o) => ({ id: o.id, operarioId: o.id, tareas: internas.filter((f) => (f.operarioId ?? simuladoPor.get(f.clave)) === o.id), horas: (i: number) => horasDelDia(o.id, horizonte[i], entrada) * (i === 0 ? queda : 1) })),
    ...[...new Set(internas.filter((f) => !f.operarioId && f.centroId && !simuladoPor.has(f.clave)).map((f) => f.centroId!))].map((c) => ({
      id: `sin:${c}`,
      operarioId: "",
      tareas: internas.filter((f) => !f.operarioId && f.centroId === c && !simuladoPor.has(f.clave)),
      horas: (i: number) => (esHabil(horizonte[i], cal) ? horasProductivas(entrada, [c]) : 0) * (i === 0 ? queda : 1),
    })),
  ];

  // Como en la tablet: cada día se sigue con la que está empezada y, si no, se toma la primera de la cola que ya se
  // pueda hacer. Un paso se puede hacer cuando terminó el anterior de la misma pieza: si ese anterior también está en
  // alguna cola se usa el día en que termina acá; si no, la fecha que le da el plan.
  const tramos: TramoCarga[] = [];
  const claveDePaso = new Map(filas.map((f) => [`${f.otPiezaId}#${f.posicion}`, f.clave]));
  const simuladas = new Set(colas.flatMap((c) => c.tareas.map((f) => f.clave)));
  const terminaEn = new Map<string, number>(); // clave → índice del día en que termina
  const resto = new Map(colas.flatMap((c) => c.tareas.map((f) => [f.clave, f.horas] as const)));
  const empezada = new Map<string, string | null>();
  const puedeEl = (f: FilaGestion, i: number): boolean => {
    if (f.estado !== "espera") return true;
    const anterior = claveDePaso.get(`${f.otPiezaId}#${f.posicion - 1}`);
    if (anterior && simuladas.has(anterior)) {
      const fin = terminaEn.get(anterior);
      return fin !== undefined && fin < i;
    }
    const desde = tareaDe.get(f.clave)?.fechaPlan;
    return !desde || horizonte[i] >= desde;
  };
  for (let i = 0; i < horizonte.length; i++) {
    for (const c of colas) {
      // Hoy cuenta sólo lo que queda de la jornada (tanda 2: asignar a las 19 h no ocupa la mañana que ya pasó).
      const delDia = c.horas(i);
      let libre = delDia;
      while (libre > 0.01) {
        const actual = empezada.get(c.id);
        const f = actual ? c.tareas.find((x) => x.clave === actual) : c.tareas.find((x) => (resto.get(x.clave) ?? 0) > 0.01 && puedeEl(x, i));
        if (!f) break;
        const toma = Math.min(libre, resto.get(f.clave)!);
        if (i < dias.length && delDia > 0)
          tramos.push({
            clave: f.clave, otPiezaId: f.otPiezaId, operarioId: f.operarioId ?? "", centroId: f.centroId, pieza: f.pieza, paso: f.paso, posicion: f.posicion, totalPasos: f.totalPasos,
            orden: f.orden, dia: horizonte[i], horas: toma, totalHoras: f.horas, desde: (delDia - libre) / delDia, hasta: (delDia - libre + toma) / delDia,
          });
        libre -= toma;
        resto.set(f.clave, resto.get(f.clave)! - toma);
        if (resto.get(f.clave)! <= 0.01) {
          terminaEn.set(f.clave, i);
          empezada.set(c.id, null);
        } else empezada.set(c.id, f.clave);
      }
    }
  }
  const sinAsignar: CargaPorDia["sinAsignar"] = {};
  for (const f of filas)
    if (f.tipo === "interno" && !f.operarioId && f.centroId) {
      const x = (sinAsignar[f.centroId] ??= { tareas: 0, horas: 0 });
      x.tareas += 1;
      x.horas += f.horas;
    }
  return { dias, tramos, capacidad, sinAsignar };
}

/**
 * Qué parte de la jornada de hoy queda (0 a 1), según el horario del taller de ADMIN (7 a 16 h por defecto).
 * Si el "hoy" del plan no es hoy (fin de semana), el día está entero.
 */
async function queQuedaDeHoy(hoyPlan: string): Promise<number> {
  if (hoyPlan !== hoyISO()) return 1;
  const filas = await db.select().from(parametro).where(inArray(parametro.clave, ["jornada_desde", "jornada_hasta"]));
  const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const desde = min(filas.find((f) => f.clave === "jornada_desde")?.valor ?? "07:00");
  const hasta = min(filas.find((f) => f.clave === "jornada_hasta")?.valor ?? "16:00");
  const ahora = min(new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" }));
  if (hasta <= desde) return 1;
  return Math.max(0, Math.min(1, (hasta - Math.max(ahora, desde)) / (hasta - desde)));
}

function siguienteDia(f: string): string {
  const x = new Date(`${f}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}

/** Horas que el operario puede trabajar en un día: las del plan (calendario × eficiencia), 0 si falta o no es hábil. */
function horasDelDia(operarioId: string, fecha: string, entrada: Awaited<ReturnType<typeof getPlan>>["entrada"]): number {
  if (!esHabil(fecha, entrada.calendario)) return 0;
  if (entrada.ausencias.get(operarioId)?.has(fecha)) return 0;
  return horasProductivas(entrada, entrada.centros.filter((c) => c.operarios.some((o) => o.id === operarioId)).map((c) => c.id));
}

/**
 * Mejoras 22/11: horas productivas por día según la capacidad cargada en Ingeniería → Centros y procesos
 * (horas por día × eficiencia de los centros donde trabaja). Sin centros, el valor general del plan.
 */
function horasProductivas(entrada: Awaited<ReturnType<typeof getPlan>>["entrada"], centroIds: string[]): number {
  const caps = entrada.centros.filter((c) => centroIds.includes(c.id)).map((c) => c.horasDia * c.eficiencia);
  return caps.length ? Math.max(...caps) : (entrada.horasOperarioDia ?? 6.8);
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

/**
 * Asigna una o varias tareas a un operario, o las deja sin asignar (operarioId null). Reunión 20/11: no cambia el
 * lugar de la tarea en la cola de su centro.
 */
export async function asignarTareas(claves: string[], operarioId: string | null, por: string): Promise<void> {
  if (!claves.length) return;
  if (operarioId) await resolverAvisosAlAsignar(claves, operarioId);
  for (const c of claves) {
    const { otPiezaId, operacionId } = partir(c);
    await db
      .insert(colaTarea)
      .values({ otPiezaId, operacionId, operarioId, asignadoPorId: por })
      .onConflictDoUpdate({ target: [colaTarea.otPiezaId, colaTarea.operacionId], set: { operarioId, asignadoPorId: por, updatedAt: new Date() } });
  }
}

/**
 * Prueba 19/11: los avisos que pedían asignar algo se resuelven solos al asignarlo. "Volvió del tercerizado" de esa
 * pieza, y "Se quedó sin tareas" del operario que recibe la tarea. "Listo, resuelto" queda para el resto.
 */
async function resolverAvisosAlAsignar(claves: string[], operarioId: string): Promise<void> {
  const piezas = [...new Set(claves.map((c) => partir(c).otPiezaId))];
  const ahora = new Date();
  await db
    .update(avisoPlanta)
    .set({ resueltoAt: ahora })
    .where(and(isNull(avisoPlanta.resueltoAt), eq(avisoPlanta.tipo, "volvio_tercerizado"), inArray(avisoPlanta.otPiezaId, piezas)));
  await db.update(avisoPlanta).set({ resueltoAt: ahora }).where(and(isNull(avisoPlanta.resueltoAt), eq(avisoPlanta.tipo, "sin_tareas"), eq(avisoPlanta.usuarioId, operarioId)));
}

/**
 * Cambia el centro de una tarea. Si el operario asignado no está habilitado para el centro nuevo, queda sin asignar.
 * En la cola del centro nuevo entra por urgencia (sin lugar puesto a mano).
 */
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
    .values({ otPiezaId, operacionId, centroId, operarioId, posicion: null, asignadoPorId: por })
    .onConflictDoUpdate({ target: [colaTarea.otPiezaId, colaTarea.operacionId], set: { centroId, operarioId, posicion: null, asignadoPorId: por, updatedAt: new Date() } });
}

/**
 * Reunión 20/11: el nuevo orden de la cola de un centro, como queda después de arrastrar. Las claves vienen en
 * orden (todas las del centro); cada una queda con su lugar, tenga o no operario.
 */
export async function ordenarCentro(claves: string[], por: string): Promise<void> {
  if (!claves.length) return;
  await db.transaction(async (tx) => {
    for (let i = 0; i < claves.length; i++) {
      const { otPiezaId, operacionId } = partir(claves[i]);
      await tx
        .insert(colaTarea)
        .values({ otPiezaId, operacionId, posicion: i + 1, asignadoPorId: por })
        .onConflictDoUpdate({ target: [colaTarea.otPiezaId, colaTarea.operacionId], set: { posicion: i + 1, updatedAt: new Date() } });
    }
  });
}

/** Vuelve la cola de un centro al orden sugerido (por urgencia): se sacan los lugares puestos a mano. */
export async function ordenarCentroPorUrgencia(claves: string[]): Promise<void> {
  for (const c of claves) {
    const { otPiezaId, operacionId } = partir(c);
    await db.update(colaTarea).set({ posicion: null, updatedAt: new Date() }).where(and(eq(colaTarea.otPiezaId, otPiezaId), eq(colaTarea.operacionId, operacionId)));
  }
}

/**
 * Las tareas de un operario, en el orden en que las hace (para su tablet): el de la cola de su centro, y lo que no
 * se ordenó a mano, por urgencia (igual que en Gestión).
 */
export async function getColaDe(operarioId: string) {
  const [cola, { resultado: r, entrada }] = await Promise.all([db.select().from(colaTarea).where(eq(colaTarea.operarioId, operarioId)), getPlan()]);
  const tarea = new Map(r.tareas.map((t) => [t.clave, t]));
  const alta = new Set(entrada.proyectos.filter((p) => p.prioridad === "alta").map((p) => p.id));
  const urgencia = (c: (typeof cola)[number]) => {
    const t = tarea.get(clave(c.otPiezaId, c.operacionId));
    return { holgura: t?.holgura ?? 1e9, alta: t ? alta.has(t.proyectoId) : false };
  };
  return cola.sort((a, b) => {
    const ua = urgencia(a);
    const ub = urgencia(b);
    return (a.posicion ?? 1e9) - (b.posicion ?? 1e9) || ua.holgura - ub.holgura || Number(ub.alta) - Number(ua.alta);
  });
}
