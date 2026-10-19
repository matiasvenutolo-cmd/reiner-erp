/**
 * Motor de planificación por proyecto (especificación de rediseño, "Motor de
 * planificación"). Funciones puras: reciben los datos ya cargados y devuelven
 * fechas, holguras y el plan propuesto. No toca la base.
 *
 * Dos pasadas, en días hábiles del calendario de planta:
 * 1. Hacia atrás, desde la entrega: montaje final → montaje de cada conjunto
 *    (en su secuencia) → fecha límite de cada pieza (montaje − margen) → cada
 *    paso de su hoja de ruta, del último al primero. Da la fecha límite, el
 *    inicio más tardío y la holgura de cada tarea, y el "pedir antes del…" de
 *    cada compra.
 * 2. Hacia adelante, contra la capacidad de los centros: las piezas se toman
 *    por holgura (y prioridad del proyecto para desempatar) y cada paso se
 *    ubica en el primer día con horas libres en su centro. De ahí sale el plan
 *    propuesto, la carga por centro y la fecha estimada de fin de cada proyecto.
 */
import { type Calendario, sumarHabiles, habilesEntre, ajustarAHabil, esHabil } from "./calendario";

export type TipoPaso = "interno" | "tercerizado" | "compras";
export type EstadoPaso = "pendiente" | "en_curso" | "pausada" | "afuera" | "terminada";

export type PasoEntrada = {
  operacionId: string;
  nombre: string;
  tipo: TipoPaso;
  centroId: string | null;
  /** Duración planificada en horas (setup + minutos por unidad × cantidad) — sólo internos. */
  horas: number;
  /** Plazo en días hábiles (tercerizado o compra). */
  plazoDias: number;
  esperaHoras: number;
  /** El tiempo sale de un valor estimado (no definido por REINER ni medido). */
  estimado: boolean;
  plazoSupuesto: boolean;
  estado: EstadoPaso;
  /** Tercerizado afuera: vuelta prevista (egreso + plazo). */
  vueltaPrevista?: string | null;
  /** Compra pedida: fecha prometida (o pedido + plazo). */
  llegadaPrevista?: string | null;
  pedido?: boolean;
};

export type PiezaEntrada = {
  otPiezaId: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  conjuntoId: string;
  liberada: boolean;
  tienePlano: boolean;
  clase: "fabricada" | "a_medida" | "comercial";
  sinRuta: boolean;
  pasos: PasoEntrada[];
  /** Pieza comercial o a medida: se compra entera. */
  compraEntera?: { plazoDias: number; plazoSupuesto: boolean; llegadaPrevista: string | null; pedido: boolean; recibida: boolean } | null;
};

export type ConjuntoEntrada = { id: string; nombre: string; orden: number; dias: number; codigo: string };

export type ProyectoEntrada = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: "maquina" | "repuesto" | "stock";
  entrega: string;
  prioridad: "normal" | "alta";
  montajeFinalDias: number;
  margenDias: number;
  conjuntos: ConjuntoEntrada[];
  piezas: PiezaEntrada[];
  piezasCubiertasConStock: number;
};

export type CentroEntrada = {
  id: string;
  nombre: string;
  horasDia: number;
  maquinas: number;
  eficiencia: number;
  operarios: { id: string; nombre: string }[];
};

export type Ajuste = { fecha: string | null; operarioId: string | null; centroId: string | null; fijada: boolean };

export type EntradaMotor = {
  hoy: string;
  calendario: Calendario;
  proyectos: ProyectoEntrada[];
  centros: CentroEntrada[];
  /** operarioId → fechas en que está ausente. */
  ausencias: Map<string, Set<string>>;
  /** "otPiezaId::operacionId" → ajuste manual. */
  ajustes: Map<string, Ajuste>;
  horizonteLiberacion: number;
  exigirPlano: boolean;
  /** "otPiezaId::operacionId" → motivo, cuando el operario marcó "No puedo hacer esta". */
  bloqueos?: Map<string, string>;
};

export type Nivel = "atrasada" | "arranca_tarde" | "urgente" | "en_plazo" | "futura";
export type EstadoTarea = "futura" | "liberada" | "lista" | "en_curso" | "pausada" | "terminada" | "trabada";

export type Tarea = {
  clave: string;
  proyectoId: string;
  proyectoCodigo: string;
  proyectoTipo: ProyectoEntrada["tipo"];
  conjuntoId: string;
  otPiezaId: string;
  operacionId: string;
  piezaCodigo: string;
  piezaNombre: string;
  cantidad: number;
  paso: string;
  posicion: number;
  totalPasos: number;
  tipo: TipoPaso;
  centroId: string | null;
  horas: number;
  dias: number;
  fechaLimite: string;
  inicioMasTardio: string;
  holgura: number;
  nivel: Nivel;
  estado: EstadoTarea;
  motivoTraba: string | null;
  estimado: boolean;
  plazoSupuesto: boolean;
  /** Plan propuesto (o ajustado a mano). */
  fechaPlan: string | null;
  finPlan: string | null;
  operarioId: string | null;
  fijada: boolean;
  movida: boolean;
  tarde: boolean;
  /** Horas que ocupa en cada día del plan (puede repartirse en varios días). */
  horasPorDia: Record<string, number>;
};

export type Compra = {
  clave: string;
  proyectoId: string;
  proyectoCodigo: string;
  proyectoTipo: ProyectoEntrada["tipo"];
  otPiezaId: string;
  operacionId: string | null;
  piezaCodigo: string;
  piezaNombre: string;
  cantidad: number;
  esMaterial: boolean;
  llegadaNecesaria: string;
  pedirAntes: string;
  plazoDias: number;
  plazoSupuesto: boolean;
  pedido: boolean;
  llegadaPrevista: string | null;
  holgura: number;
};

export type ConjuntoPlan = {
  id: string;
  nombre: string;
  codigo: string;
  orden: number;
  dias: number;
  montajeInicioLimite: string;
  montajeFinLimite: string;
  /** Cuándo estarían todas sus piezas, según el plan. */
  piezasListas: string;
  montajeInicioEstimado: string;
  montajeFinEstimado: string;
  /** Días hábiles de atraso del montaje estimado contra el límite. */
  atrasoDias: number;
  motivoAtraso: string | null;
  fabricacionDesde: string | null;
  piezas: { total: number; terminadas: number; enCurso: number; listas: number; trabadas: number; futuras: number };
};

export type ProyectoPlan = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: ProyectoEntrada["tipo"];
  prioridad: ProyectoEntrada["prioridad"];
  entrega: string;
  montajeFinalLimite: string;
  finEstimado: string;
  /** Días hábiles entre la entrega y el fin estimado: positivo = llega tarde. */
  diferenciaDias: number;
  horasTotales: number;
  horasHechas: number;
  avancePct: number;
  pctEstimado: number;
  conjuntos: ConjuntoPlan[];
  piezasCubiertasConStock: number;
  piezasSinRuta: number;
};

export type ResultadoMotor = {
  tareas: Tarea[];
  compras: Compra[];
  proyectos: ProyectoPlan[];
  /** centroId → fecha → horas planificadas. */
  carga: Map<string, Map<string, number>>;
  /** centroId → fecha → horas disponibles (con ausencias descontadas). */
  capacidad: Map<string, Map<string, number>>;
  /** Piezas no liberadas cuyo primer paso entra en el horizonte. */
  tandas: { proyectoId: string; otPiezaIds: string[]; sinPlano: string[] }[];
};

export const CENTRO_POR_DEFECTO = "TALLER";

export function nivelDe(holgura: number): Nivel {
  if (holgura < 0) return "atrasada";
  if (holgura <= 3) return "urgente";
  if (holgura <= 10) return "en_plazo";
  return "futura";
}

/** Duración en días hábiles de un paso interno: horas ÷ (horas por día × eficiencia), mínimo 1. */
export function diasDePaso(horas: number, centro: CentroEntrada | undefined): number {
  const porDia = (centro?.horasDia ?? 8) * (centro?.eficiencia ?? 0.85);
  return Math.max(1, Math.ceil(horas / Math.max(0.5, porDia)));
}

const esperaEnDias = (horas: number) => (horas > 0 ? Math.ceil(horas / 24) : 0);

// ── Paso 1: hacia atrás ───────────────────────────────────────────────────

type Atras = {
  conjuntos: Map<string, { inicio: string; fin: string }>;
  montajeFinalInicio: string;
  pasos: Map<string, { fechaLimite: string; inicioMasTardio: string; dias: number }>;
  piezaLimite: Map<string, string>;
  compras: { pieza: PiezaEntrada; operacionId: string | null; llegadaNecesaria: string; plazo: number; supuesto: boolean; esMaterial: boolean; pedido: boolean; llegadaPrevista: string | null }[];
};

export function haciaAtras(p: ProyectoEntrada, centros: Map<string, CentroEntrada>, cal: Calendario): Atras {
  const entrega = ajustarAHabil(p.entrega, cal, true);
  const esMaquina = p.tipo === "maquina";
  const montajeFinalInicio = esMaquina ? sumarHabiles(entrega, -p.montajeFinalDias, cal) : entrega;
  const conjuntos = new Map<string, { inicio: string; fin: string }>();
  // Conjuntos con el mismo orden comparten el lugar en la secuencia (alternativos, como C09 / C23):
  // se montan en el mismo tramo y el tramo dura lo del más largo.
  const tramos = [...Map.groupBy(p.conjuntos, (c) => c.orden).entries()].sort(([a], [b]) => a - b);
  let fin = montajeFinalInicio;
  for (let i = tramos.length - 1; i >= 0; i--) {
    const grupo = tramos[i][1];
    const dias = esMaquina ? Math.max(...grupo.map((c) => c.dias)) : 0;
    const inicio = sumarHabiles(fin, -dias, cal);
    for (const c of grupo) conjuntos.set(c.id, { inicio, fin });
    fin = inicio;
  }
  const pasos = new Map<string, { fechaLimite: string; inicioMasTardio: string; dias: number }>();
  const piezaLimite = new Map<string, string>();
  const compras: Atras["compras"] = [];
  for (const pz of p.piezas) {
    const montaje = conjuntos.get(pz.conjuntoId)?.inicio ?? montajeFinalInicio;
    const limitePieza = esMaquina ? sumarHabiles(montaje, -p.margenDias, cal) : entrega;
    piezaLimite.set(pz.otPiezaId, limitePieza);
    if (pz.compraEntera && !pz.compraEntera.recibida) {
      compras.push({ pieza: pz, operacionId: null, llegadaNecesaria: limitePieza, plazo: pz.compraEntera.plazoDias, supuesto: pz.compraEntera.plazoSupuesto, esMaterial: false, pedido: pz.compraEntera.pedido, llegadaPrevista: pz.compraEntera.llegadaPrevista });
    }
    let limite = limitePieza;
    for (let i = pz.pasos.length - 1; i >= 0; i--) {
      const paso = pz.pasos[i];
      let dias: number;
      let inicio: string;
      if (paso.tipo === "compras") {
        dias = 0;
        inicio = sumarHabiles(limite, -paso.plazoDias, cal); // pedir antes del…
        if (paso.estado !== "terminada") {
          compras.push({ pieza: pz, operacionId: paso.operacionId, llegadaNecesaria: limite, plazo: paso.plazoDias, supuesto: paso.plazoSupuesto, esMaterial: true, pedido: !!paso.pedido, llegadaPrevista: paso.llegadaPrevista ?? null });
        }
      } else if (paso.tipo === "tercerizado") {
        dias = paso.plazoDias;
        inicio = sumarHabiles(limite, -(paso.plazoDias + 1), cal); // + 1 día de logística
      } else {
        dias = diasDePaso(paso.horas, centros.get(paso.centroId ?? CENTRO_POR_DEFECTO)) + esperaEnDias(paso.esperaHoras);
        inicio = sumarHabiles(limite, -(dias + 1), cal); // + 1 día de cola
      }
      pasos.set(`${pz.otPiezaId}::${paso.operacionId}`, { fechaLimite: limite, inicioMasTardio: inicio, dias });
      limite = inicio;
    }
  }
  return { conjuntos, montajeFinalInicio, pasos, piezaLimite, compras };
}

// ── Capacidad ─────────────────────────────────────────────────────────────

class Capacidad {
  usado = new Map<string, Map<string, number>>();
  disponible = new Map<string, Map<string, number>>();
  porOperario = new Map<string, Map<string, number>>();
  constructor(
    private centros: Map<string, CentroEntrada>,
    private ausencias: Map<string, Set<string>>,
    private cal: Calendario,
  ) {}
  total(centroId: string, dia: string): number {
    let m = this.disponible.get(centroId);
    if (!m) this.disponible.set(centroId, (m = new Map()));
    let v = m.get(dia);
    if (v === undefined) {
      const c = this.centros.get(centroId);
      const base = (c?.horasDia ?? 8) * (c?.maquinas ?? 1) * (c?.eficiencia ?? 0.85);
      const ops = c?.operarios ?? [];
      const ausentes = ops.filter((o) => this.ausencias.get(o.id)?.has(dia)).length;
      v = esHabil(dia, this.cal) ? (ops.length ? (base * (ops.length - ausentes)) / ops.length : base) : 0;
      m.set(dia, v);
    }
    return v;
  }
  libre(centroId: string, dia: string): number {
    return this.total(centroId, dia) - (this.usado.get(centroId)?.get(dia) ?? 0);
  }
  usar(centroId: string, dia: string, horas: number) {
    let m = this.usado.get(centroId);
    if (!m) this.usado.set(centroId, (m = new Map()));
    m.set(dia, (m.get(dia) ?? 0) + horas);
  }
  /** Operario habilitado con menos carga ese día (sin ausentes). */
  operario(centroId: string, dia: string, horas: number, fijo: string | null): string | null {
    const ops = this.centros.get(centroId)?.operarios ?? [];
    const presentes = ops.filter((o) => !this.ausencias.get(o.id)?.has(dia));
    const elegido = fijo ?? [...presentes].sort((a, b) => (this.porOperario.get(a.id)?.get(dia) ?? 0) - (this.porOperario.get(b.id)?.get(dia) ?? 0))[0]?.id ?? null;
    if (elegido) {
      let m = this.porOperario.get(elegido);
      if (!m) this.porOperario.set(elegido, (m = new Map()));
      m.set(dia, (m.get(dia) ?? 0) + horas);
    }
    return elegido;
  }
}

// ── Motor completo ────────────────────────────────────────────────────────

export function planificar(e: EntradaMotor): ResultadoMotor {
  const cal = e.calendario;
  const hoy = ajustarAHabil(e.hoy, cal);
  const centros = new Map(e.centros.map((c) => [c.id, c]));
  const cap = new Capacidad(centros, e.ausencias, cal);
  const tareas: Tarea[] = [];
  const compras: Compra[] = [];
  const tandas: ResultadoMotor["tandas"] = [];
  const atrasPorProyecto = new Map<string, Atras>();

  // Paso 1 y estados.
  for (const p of e.proyectos) {
    const atras = haciaAtras(p, centros, cal);
    atrasPorProyecto.set(p.id, atras);
    const tanda: string[] = [];
    const sinPlano: string[] = [];
    for (const pz of p.piezas) {
      const actual = pz.pasos.findIndex((x) => x.estado !== "terminada");
      if (!pz.liberada && pz.pasos.length) {
        const primero = atras.pasos.get(`${pz.otPiezaId}::${pz.pasos[0].operacionId}`)!;
        if (habilesEntre(hoy, primero.inicioMasTardio, cal) <= e.horizonteLiberacion) {
          if (e.exigirPlano && !pz.tienePlano) sinPlano.push(pz.otPiezaId);
          else tanda.push(pz.otPiezaId);
        }
      }
      pz.pasos.forEach((paso, i) => {
        const a = atras.pasos.get(`${pz.otPiezaId}::${paso.operacionId}`)!;
        const holgura = habilesEntre(hoy, a.inicioMasTardio, cal);
        let estado: EstadoTarea;
        let motivo: string | null = null;
        if (paso.estado === "terminada") estado = "terminada";
        else if (paso.estado === "en_curso") estado = "en_curso";
        else if (paso.estado === "pausada") estado = "pausada";
        else if (!pz.liberada) {
          estado = "futura";
          if (e.exigirPlano && !pz.tienePlano && habilesEntre(hoy, a.inicioMasTardio, cal) <= e.horizonteLiberacion) {
            estado = "trabada";
            motivo = "Falta plano";
          }
        } else if (i !== actual) estado = "liberada";
        else if (paso.tipo === "compras") {
          estado = "liberada";
          motivo = "Esperando material";
          if (!paso.pedido && habilesEntre(hoy, a.inicioMasTardio, cal) < 0) {
            estado = "trabada";
            motivo = "Falta material";
          }
        } else if (paso.tipo === "tercerizado" && paso.estado === "afuera") {
          estado = "en_curso";
          if (paso.vueltaPrevista && paso.vueltaPrevista < hoy) {
            estado = "trabada";
            motivo = "Tercerizado demorado";
          }
        } else estado = "lista";
        const bloqueo = e.bloqueos?.get(`${pz.otPiezaId}::${paso.operacionId}`);
        if (bloqueo && estado !== "terminada" && estado !== "en_curso") {
          estado = "trabada";
          motivo = bloqueo;
        }
        tareas.push({
          clave: `${pz.otPiezaId}::${paso.operacionId}`,
          proyectoId: p.id,
          proyectoCodigo: p.codigo,
          proyectoTipo: p.tipo,
          conjuntoId: pz.conjuntoId,
          otPiezaId: pz.otPiezaId,
          operacionId: paso.operacionId,
          piezaCodigo: pz.codigo,
          piezaNombre: pz.nombre,
          cantidad: pz.cantidad,
          paso: paso.nombre,
          posicion: i + 1,
          totalPasos: pz.pasos.length,
          tipo: paso.tipo,
          centroId: paso.tipo === "interno" ? (paso.centroId ?? CENTRO_POR_DEFECTO) : null,
          horas: paso.tipo === "interno" ? paso.horas : 0,
          dias: a.dias,
          fechaLimite: a.fechaLimite,
          inicioMasTardio: a.inicioMasTardio,
          holgura,
          nivel: nivelDe(holgura),
          estado,
          motivoTraba: motivo,
          estimado: paso.estimado,
          plazoSupuesto: paso.plazoSupuesto,
          fechaPlan: null,
          finPlan: null,
          operarioId: null,
          fijada: false,
          movida: false,
          tarde: false,
          horasPorDia: {},
        });
      });
    }
    if (tanda.length || sinPlano.length) tandas.push({ proyectoId: p.id, otPiezaIds: tanda, sinPlano });
    for (const c of atras.compras) {
      const pedirAntes = sumarHabiles(c.llegadaNecesaria, -c.plazo, cal);
      compras.push({
        clave: `${c.pieza.otPiezaId}::${c.operacionId ?? "compra"}`,
        proyectoId: p.id,
        proyectoCodigo: p.codigo,
        proyectoTipo: p.tipo,
        otPiezaId: c.pieza.otPiezaId,
        operacionId: c.operacionId,
        piezaCodigo: c.pieza.codigo,
        piezaNombre: c.pieza.nombre,
        cantidad: c.pieza.cantidad,
        esMaterial: c.esMaterial,
        llegadaNecesaria: c.llegadaNecesaria,
        pedirAntes,
        plazoDias: c.plazo,
        plazoSupuesto: c.supuesto,
        pedido: c.pedido,
        llegadaPrevista: c.llegadaPrevista,
        holgura: habilesEntre(hoy, pedirAntes, cal),
      });
    }
  }

  // Paso 4: hacia adelante. Primero las fijadas reservan su lugar.
  const porClave = new Map(tareas.map((t) => [t.clave, t]));
  for (const [clave, aj] of e.ajustes) {
    const t = porClave.get(clave);
    if (!t || !aj.fecha || t.tipo !== "interno" || t.estado === "terminada" || !aj.fijada) continue;
    ubicarInterno(t, ajustarAHabil(aj.fecha < hoy ? hoy : aj.fecha, cal), aj.centroId ?? t.centroId!, aj.operarioId, cap, cal, true);
    t.fijada = true;
  }

  const prioridad = new Map(e.proyectos.map((p) => [p.id, p.prioridad]));
  const piezas = e.proyectos.flatMap((p) => p.piezas.map((pz) => ({ p, pz })));
  const holguraActual = (pz: PiezaEntrada) => {
    const t = tareas.find((x) => x.otPiezaId === pz.otPiezaId && x.estado !== "terminada");
    return t ? t.holgura : Infinity;
  };
  // Primero las liberadas (son las que se pueden hacer); después las que todavía no entraron al plan.
  piezas.sort(
    (a, b) =>
      Number(!a.pz.liberada) - Number(!b.pz.liberada) ||
      holguraActual(a.pz) - holguraActual(b.pz) ||
      Number(prioridad.get(b.p.id) === "alta") - Number(prioridad.get(a.p.id) === "alta"),
  );

  const finPieza = new Map<string, string>();
  for (const { p, pz } of piezas) {
    let desde = hoy;
    if (!pz.liberada) {
      // Una pieza no liberada no ocupa el plan de esta semana: arranca cuando entraría en la tanda
      // (horizonte de liberación) y, como pronto, la semana que viene — liberarla es una decisión.
      const primero = tareas.find((x) => x.otPiezaId === pz.otPiezaId);
      const semanaQueViene = sumarHabiles(hoy, 5, cal);
      if (semanaQueViene > desde) desde = semanaQueViene;
      if (primero) {
        const libera = sumarHabiles(primero.inicioMasTardio, -e.horizonteLiberacion, cal);
        if (libera > desde) desde = libera;
      }
    }
    if (pz.compraEntera && !pz.compraEntera.recibida) {
      const llega = pz.compraEntera.llegadaPrevista ?? sumarHabiles(desde, pz.compraEntera.plazoDias, cal);
      finPieza.set(pz.otPiezaId, llega > hoy ? llega : hoy);
      continue;
    }
    let ultimoFin = hoy;
    for (const t of tareas.filter((x) => x.otPiezaId === pz.otPiezaId)) {
      if (t.estado === "terminada") continue;
      const paso = pz.pasos[t.posicion - 1];
      if (t.tipo === "compras") {
        const compra = compras.find((c) => c.clave === t.clave);
        const llega = paso.llegadaPrevista ?? sumarHabiles(compra && compra.pedirAntes > desde ? compra.pedirAntes : desde, paso.plazoDias, cal);
        t.fechaPlan = desde;
        t.finPlan = llega < hoy ? hoy : llega;
        desde = sumarHabiles(t.finPlan, 1, cal);
      } else if (t.tipo === "tercerizado") {
        const salida = paso.estado === "afuera" ? hoy : desde;
        const vuelta = paso.vueltaPrevista ?? sumarHabiles(salida, paso.plazoDias, cal);
        t.fechaPlan = salida;
        t.finPlan = vuelta < hoy ? hoy : vuelta;
        desde = sumarHabiles(t.finPlan, 1, cal);
      } else {
        if (!t.fijada) {
          const aj = e.ajustes.get(t.clave);
          const inicio = aj?.fecha && aj.fecha >= desde ? ajustarAHabil(aj.fecha, cal) : desde;
          ubicarInterno(t, inicio, aj?.centroId ?? t.centroId!, aj?.operarioId ?? null, cap, cal, !!aj?.fecha);
          t.movida = !!aj?.fecha || !!aj?.operarioId;
        }
        desde = sumarHabiles(t.finPlan!, 1, cal);
      }
      t.tarde = !!t.finPlan && t.finPlan > t.fechaLimite;
      ultimoFin = t.finPlan!;
    }
    finPieza.set(pz.otPiezaId, ultimoFin);
  }

  // Proyectos: montaje hacia adelante y fecha estimada de fin.
  const proyectos: ProyectoPlan[] = e.proyectos.map((p) => {
    const atras = atrasPorProyecto.get(p.id)!;
    const esMaquina = p.tipo === "maquina";
    const orden = [...p.conjuntos].sort((a, b) => a.orden - b.orden);
    const tareasP = tareas.filter((t) => t.proyectoId === p.id);
    let finAnterior = hoy;
    const conjuntos: ConjuntoPlan[] = orden.map((c) => {
      const piezasC = p.piezas.filter((x) => x.conjuntoId === c.id);
      const listas = piezasC.map((x) => finPieza.get(x.otPiezaId) ?? hoy).sort().at(-1) ?? hoy;
      const inicioEst = [esMaquina ? sumarHabiles(listas, p.margenDias, cal) : listas, finAnterior].sort().at(-1)!;
      const finEst = sumarHabiles(inicioEst, esMaquina ? c.dias : 0, cal);
      finAnterior = finEst;
      const lim = atras.conjuntos.get(c.id)!;
      const atraso = habilesEntre(lim.inicio, inicioEst, cal);
      const tc = tareasP.filter((t) => t.conjuntoId === c.id);
      const tarde = tc.filter((t) => t.tarde);
      const motivo =
        atraso <= 0
          ? null
          : tarde.some((t) => t.tipo === "compras")
            ? "Compra"
            : tarde.some((t) => t.tipo === "tercerizado")
              ? "Tercerizado"
              : tarde.length
                ? `Capacidad de ${tarde[0].centroId ?? "un centro"}`
                : "Secuencia de montaje";
      const estadoPieza = (x: PiezaEntrada) => {
        const ts = tc.filter((t) => t.otPiezaId === x.otPiezaId);
        if (ts.every((t) => t.estado === "terminada")) return "terminadas";
        if (ts.some((t) => t.estado === "trabada")) return "trabadas";
        if (ts.some((t) => t.estado === "en_curso" || t.estado === "pausada")) return "enCurso";
        if (ts.some((t) => t.estado === "lista")) return "listas";
        return ts.some((t) => t.estado === "liberada") ? "listas" : "futuras";
      };
      const resumen = { total: piezasC.length, terminadas: 0, enCurso: 0, listas: 0, trabadas: 0, futuras: 0 };
      for (const x of piezasC) resumen[estadoPieza(x) as keyof typeof resumen]++;
      const desdeFab = tc.map((t) => t.fechaPlan).filter((f): f is string => !!f).sort()[0] ?? null;
      return {
        id: c.id,
        nombre: c.nombre,
        codigo: c.codigo,
        orden: c.orden,
        dias: c.dias,
        montajeInicioLimite: lim.inicio,
        montajeFinLimite: lim.fin,
        piezasListas: listas,
        montajeInicioEstimado: inicioEst,
        montajeFinEstimado: finEst,
        atrasoDias: atraso,
        motivoAtraso: motivo,
        fabricacionDesde: desdeFab,
        piezas: resumen,
      };
    });
    const finEstimado = esMaquina ? sumarHabiles(finAnterior, p.montajeFinalDias, cal) : finAnterior;
    const internas = tareasP.filter((t) => t.tipo === "interno");
    const horasTotales = internas.reduce((s, t) => s + t.horas, 0);
    const horasHechas = internas.filter((t) => t.estado === "terminada").reduce((s, t) => s + t.horas, 0);
    return {
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      tipo: p.tipo,
      prioridad: p.prioridad,
      entrega: p.entrega,
      montajeFinalLimite: atras.montajeFinalInicio,
      finEstimado,
      diferenciaDias: habilesEntre(ajustarAHabil(p.entrega, cal, true), finEstimado, cal),
      horasTotales,
      horasHechas,
      avancePct: horasTotales ? Math.round((horasHechas / horasTotales) * 100) : 0,
      pctEstimado: internas.length ? Math.round((internas.filter((t) => t.estimado).length / internas.length) * 100) : 0,
      conjuntos,
      piezasCubiertasConStock: p.piezasCubiertasConStock,
      piezasSinRuta: p.piezas.filter((x) => x.sinRuta).length,
    };
  });

  // Capacidad de todos los centros para los próximos 60 días hábiles (para la carga y las grillas).
  for (let k = 0, d = hoy; k < 60; k++, d = sumarHabiles(d, 1, cal)) for (const c of e.centros) cap.total(c.id, d);
  return { tareas, compras, proyectos, carga: cap.usado, capacidad: cap.disponible, tandas };
}

/** Ubica un paso interno desde `inicio` en su centro: consume horas día por día hasta completar la duración. */
function ubicarInterno(t: Tarea, inicio: string, centroId: string, operarioFijo: string | null, cap: Capacidad, cal: Calendario, forzarInicio: boolean) {
  let dia = inicio;
  let resto = t.horas;
  t.horasPorDia = {};
  t.centroId = centroId;
  // Si la fecha no está forzada, se busca el primer día con lugar.
  if (!forzarInicio) for (let k = 0; k < 400 && cap.libre(centroId, dia) <= 0.01; k++) dia = sumarHabiles(dia, 1, cal);
  t.fechaPlan = dia;
  for (let k = 0; k < 400 && resto > 0.001; k++) {
    // Forzada (movida o fijada a mano): va ese día aunque sobrecargue el centro — el plan lo marca en rojo.
    const usa = forzarInicio ? Math.min(resto, cap.total(centroId, dia) || resto) : Math.min(resto, Math.max(0, cap.libre(centroId, dia)));
    if (usa > 0) {
      cap.usar(centroId, dia, usa);
      t.horasPorDia[dia] = (t.horasPorDia[dia] ?? 0) + usa;
      t.operarioId = cap.operario(centroId, dia, usa, operarioFijo ?? t.operarioId);
      resto -= usa;
    }
    if (resto > 0.001) dia = sumarHabiles(dia, 1, cal);
  }
  t.finPlan = dia;
}
