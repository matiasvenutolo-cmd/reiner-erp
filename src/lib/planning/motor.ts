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
  /** v2 — partes del tiempo, para partir la tarea en lotes (setup por lote + minutos por unidad). */
  setupHoras?: number;
  porUnidadHoras?: number;
  /** v2 — tamaño de lote (si es menor que la cantidad, la tarea se parte). */
  lote?: number | null;
  /** v2 — piezas ya declaradas (OK + rechazadas) en este paso, para saber qué lotes terminaron. */
  declaradas?: number;
  /** v2 — piezas OK ya hechas en este paso (las que pueden pasar al siguiente). */
  hechasOk?: number;
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
  /** v2 — fecha de alta del proyecto: lo que ya venía tarde al nacer "arranca tarde" o "pedir ya", no "atrasado". */
  inicio?: string;
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
  /** v2 — tareas que estaban en un plan confirmado de un día anterior y no se empezaron (pasan de "arranca tarde" a atrasada). */
  asignadasAntes?: Set<string>;
  /** v2 — horas que se le pueden planificar a un operario por día (calendario × eficiencia). */
  horasOperarioDia?: number;
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
  /** v2 — lote de una tarea partida: "lote 2 de 5". */
  lote?: { n: number; de: number } | null;
  /** v2 — nació con margen negativo (al dar de alta el proyecto ya no llegaba). */
  nacioTarde?: boolean;
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
  /** v2 — el "pedir antes del" ya había pasado cuando se generó: "Pedir ya" (naranja), no "Vencida" (rojo). */
  pedirYa?: boolean;
};

/** v2 — La causa raíz de un atraso (mejoras de usabilidad §1.5): la que, si se resuelve, corre las demás. */
export type Causa =
  | { tipo: "compra"; conjunto: string; pieza: string; pedirAntes: string; pedido: boolean; llegada: string | null; pedirYa: boolean }
  | { tipo: "comercial"; conjunto: string; pieza: string; pedirAntes: string; pedido: boolean; llegada: string | null; pedirYa: boolean }
  | { tipo: "tercerizado"; conjunto: string; pieza: string; paso: string; vuelta: string }
  | { tipo: "capacidad"; conjunto: string; pieza: string; centroId: string; centro: string; desde: string }
  | { tipo: "sin_liberar"; conjunto: string; pieza: string };

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
  /** v2 — se atrasa sólo porque espera al conjunto anterior en la secuencia (se muestra en gris). */
  esperaA?: { codigo: string; nombre: string } | null;
  /** v2 — si se atrasa por sus propias piezas, por qué. */
  causa?: Causa | null;
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
  /** v2 — hasta 2 causas raíz independientes, ordenadas por días de atraso. */
  causas: { causa: Causa; dias: number }[];
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
  /** v2 — operarioId → fecha → horas planificadas (§1.7). */
  cargaOperario: Map<string, Map<string, number>>;
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
    /** v2 — horas por operario por día (mejoras de usabilidad §1.7). */
    private horasOperario: number,
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
  cargaOperario(id: string, dia: string): number {
    return this.porOperario.get(id)?.get(dia) ?? 0;
  }
  libreOperario(id: string, dia: string): number {
    if (this.ausencias.get(id)?.has(dia) || !esHabil(dia, this.cal)) return 0;
    return this.horasOperario - this.cargaOperario(id, dia);
  }
  /**
   * Operario para ese día: el fijado a mano, o el habilitado (presente) con más
   * horas libres. Si un operario está en dos centros, sus horas se reparten
   * entre los dos: nunca se le planifica más que su día (§1.7).
   */
  elegirOperario(centroId: string, dia: string, fijo: string | null): { id: string | null; libre: number } {
    const ops = this.centros.get(centroId)?.operarios ?? [];
    if (fijo) return { id: fijo, libre: this.libreOperario(fijo, dia) };
    if (!ops.length) return { id: null, libre: Infinity };
    const mejor = [...ops].map((o) => ({ id: o.id, libre: this.libreOperario(o.id, dia) })).sort((a, b) => b.libre - a.libre)[0];
    return mejor;
  }
  asignarOperario(id: string | null, dia: string, horas: number) {
    if (!id) return;
    let m = this.porOperario.get(id);
    if (!m) this.porOperario.set(id, (m = new Map()));
    m.set(dia, (m.get(dia) ?? 0) + horas);
  }
}

// ── Motor completo ────────────────────────────────────────────────────────

/** Nivel de margen de una tarea, con la regla de "arranca tarde" (§1.4): lo que nació tarde es naranja, no rojo, hasta que alguien no lo empezó a tiempo. */
function nivelTarea(holgura: number, nacioTarde: boolean, noSeEmpezo: boolean): Nivel {
  const n = nivelDe(holgura);
  return n === "atrasada" && nacioTarde && !noSeEmpezo ? "arranca_tarde" : n;
}

export function planificar(e: EntradaMotor): ResultadoMotor {
  const cal = e.calendario;
  const hoy = ajustarAHabil(e.hoy, cal);
  const centros = new Map(e.centros.map((c) => [c.id, c]));
  const cap = new Capacidad(centros, e.ausencias, cal, e.horasOperarioDia ?? 6.8);
  const tareas: Tarea[] = [];
  const compras: Compra[] = [];
  const tandas: ResultadoMotor["tandas"] = [];
  const atrasPorProyecto = new Map<string, Atras>();

  // Paso 1 y estados.
  for (const p of e.proyectos) {
    const atras = haciaAtras(p, centros, cal);
    atrasPorProyecto.set(p.id, atras);
    const inicioProyecto = p.inicio ? ajustarAHabil(p.inicio, cal) : null;
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
        // Con lotes, el paso siguiente puede arrancar con las piezas del lote terminado.
        const anterior = i > 0 ? pz.pasos[i - 1] : null;
        const flujoDeLote = !!anterior?.lote && (anterior.hechasOk ?? 0) > (paso.declaradas ?? 0);
        if (paso.estado === "terminada") estado = "terminada";
        else if (paso.estado === "en_curso") estado = "en_curso";
        else if (paso.estado === "pausada") estado = "pausada";
        else if (!pz.liberada) {
          estado = "futura";
          if (e.exigirPlano && !pz.tienePlano && habilesEntre(hoy, a.inicioMasTardio, cal) <= e.horizonteLiberacion) {
            estado = "trabada";
            motivo = "Falta plano";
          }
        } else if (i !== actual && !(flujoDeLote && paso.tipo === "interno")) estado = "liberada";
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
        const claveBase = `${pz.otPiezaId}::${paso.operacionId}`;
        const bloqueo = e.bloqueos?.get(claveBase);
        if (bloqueo && estado !== "terminada" && estado !== "en_curso") {
          estado = "trabada";
          motivo = bloqueo;
        }
        const nacioTarde = !!inicioProyecto && a.inicioMasTardio < inicioProyecto;
        const base: Tarea = {
          clave: claveBase,
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
          nivel: nivelTarea(holgura, nacioTarde, !!e.asignadasAntes?.has(claveBase)),
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
          lote: null,
          nacioTarde,
        };
        // Tareas grandes partidas en lotes (§1.6): cada lote es una tarjeta propia, con su setup.
        const lote = paso.tipo === "interno" && paso.lote && paso.lote < pz.cantidad ? paso.lote : null;
        if (!lote) {
          tareas.push(base);
          return;
        }
        const de = Math.ceil(pz.cantidad / lote);
        const declaradas = paso.declaradas ?? 0;
        let primeroPendiente = true;
        for (let n = 1; n <= de; n++) {
          const cant = n < de ? lote : pz.cantidad - lote * (de - 1);
          const hechoHasta = lote * (n - 1) + cant;
          const terminado = declaradas >= hechoHasta;
          let est: EstadoTarea = terminado ? "terminada" : estado;
          if (!terminado) {
            if (primeroPendiente) primeroPendiente = false;
            else if (est === "lista" || est === "en_curso" || est === "pausada") est = "liberada";
          }
          // El lote n del paso siguiente está listo cuando el lote n del anterior ya pasó.
          if (!terminado && est === "liberada" && anterior?.lote && (anterior.hechasOk ?? 0) >= hechoHasta && pz.liberada) est = "lista";
          tareas.push({
            ...base,
            clave: `${claveBase}::L${n}`,
            cantidad: cant,
            horas: (paso.setupHoras ?? 0) + (paso.porUnidadHoras ?? paso.horas / pz.cantidad) * cant,
            estado: est,
            lote: { n, de },
          });
        }
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
        // Plan factible (§1.4): si al nacer el proyecto ya había pasado el día para pedirlo, es "Pedir ya", no "Vencida".
        pedirYa: !!inicioProyecto && pedirAntes < inicioProyecto,
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
  const tareasDePieza = new Map<string, Tarea[]>();
  for (const t of tareas) tareasDePieza.set(t.otPiezaId, [...(tareasDePieza.get(t.otPiezaId) ?? []), t]);
  const holguraActual = (pz: PiezaEntrada) => {
    const t = tareasDePieza.get(pz.otPiezaId)?.find((x) => x.estado !== "terminada");
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
  /** Por pieza: la primera tarea que terminó después de su fecha límite (de ahí sale la causa raíz). */
  const origenAtraso = new Map<string, { t: Tarea; porLiberar: boolean }>();
  const compraDe = new Map(compras.map((c) => [c.clave, c]));
  for (const { p, pz } of piezas) {
    let desdeInicial = hoy;
    let porLiberar = false;
    if (!pz.liberada) {
      // Una pieza no liberada no ocupa el plan de esta semana: arranca cuando entraría en la tanda
      // (horizonte de liberación) y, como pronto, la semana que viene — liberarla es una decisión.
      const primero = tareasDePieza.get(pz.otPiezaId)?.[0];
      const semanaQueViene = sumarHabiles(hoy, 5, cal);
      if (semanaQueViene > desdeInicial) desdeInicial = semanaQueViene;
      if (primero) {
        const libera = sumarHabiles(primero.inicioMasTardio, -e.horizonteLiberacion, cal);
        if (libera > desdeInicial) desdeInicial = libera;
      }
      porLiberar = desdeInicial > hoy;
    }
    if (pz.compraEntera && !pz.compraEntera.recibida) {
      const llega = pz.compraEntera.llegadaPrevista ?? sumarHabiles(desdeInicial, pz.compraEntera.plazoDias, cal);
      finPieza.set(pz.otPiezaId, llega > hoy ? llega : hoy);
      continue;
    }
    // Fin de cada paso (y de cada lote) para encadenar: el lote n del paso siguiente espera al lote n del anterior.
    const finPaso = new Map<number, { fin: string; lotes: string[]; conLote: boolean }>();
    let ultimoFin = hoy;
    for (const t of tareasDePieza.get(pz.otPiezaId) ?? []) {
      const paso = pz.pasos[t.posicion - 1];
      const previo = finPaso.get(t.posicion - 1);
      let desde = desdeInicial;
      if (previo) {
        const dep = t.lote && previo.conLote && previo.lotes[t.lote.n - 1] ? previo.lotes[t.lote.n - 1] : previo.fin;
        const siguiente = sumarHabiles(dep, 1, cal);
        if (siguiente > desde) desde = siguiente;
      }
      if (t.estado === "terminada") {
        const registro = finPaso.get(t.posicion) ?? { fin: hoy, lotes: [], conLote: !!t.lote };
        if (t.lote) registro.lotes[t.lote.n - 1] = hoy;
        finPaso.set(t.posicion, registro);
        continue;
      }
      if (t.tipo === "compras") {
        const compra = compraDe.get(t.clave);
        const llega = paso.llegadaPrevista ?? sumarHabiles(compra && compra.pedirAntes > desde ? compra.pedirAntes : desde, paso.plazoDias, cal);
        t.fechaPlan = desde;
        t.finPlan = llega < hoy ? hoy : llega;
      } else if (t.tipo === "tercerizado") {
        const salida = paso.estado === "afuera" ? hoy : desde;
        const vuelta = paso.vueltaPrevista ?? sumarHabiles(salida, paso.plazoDias, cal);
        t.fechaPlan = salida;
        t.finPlan = vuelta < hoy ? hoy : vuelta;
      } else if (!t.fijada) {
        const aj = e.ajustes.get(t.clave);
        const inicio = aj?.fecha && aj.fecha >= desde ? ajustarAHabil(aj.fecha, cal) : desde;
        ubicarInterno(t, inicio, aj?.centroId ?? t.centroId!, aj?.operarioId ?? null, cap, cal, !!aj?.fecha);
        t.movida = !!aj?.fecha || !!aj?.operarioId;
      }
      t.tarde = !!t.finPlan && t.finPlan > t.fechaLimite;
      if (t.tarde && !origenAtraso.has(pz.otPiezaId)) origenAtraso.set(pz.otPiezaId, { t, porLiberar });
      const registro = finPaso.get(t.posicion) ?? { fin: t.finPlan!, lotes: [], conLote: !!t.lote };
      if (t.lote) registro.lotes[t.lote.n - 1] = t.finPlan!;
      if (t.finPlan! > registro.fin) registro.fin = t.finPlan!;
      finPaso.set(t.posicion, registro);
      if (t.finPlan! > ultimoFin) ultimoFin = t.finPlan!;
    }
    finPieza.set(pz.otPiezaId, ultimoFin);
  }

  /** La causa de una pieza que se atrasa: su primera tarea tarde (compra, tercerizado, capacidad o falta liberar). */
  const causaDePieza = (p: ProyectoEntrada, pz: PiezaEntrada, conjuntoNombre: string): Causa | null => {
    if (pz.compraEntera && !pz.compraEntera.recibida) {
      const c = compraDe.get(`${pz.otPiezaId}::compra`);
      return { tipo: "comercial", conjunto: conjuntoNombre, pieza: pz.nombre, pedirAntes: c?.pedirAntes ?? hoy, pedido: pz.compraEntera.pedido, llegada: pz.compraEntera.llegadaPrevista, pedirYa: !!c?.pedirYa };
    }
    const o = origenAtraso.get(pz.otPiezaId);
    if (!o) return null;
    const { t } = o;
    if (t.tipo === "compras") {
      const c = compraDe.get(t.clave);
      return { tipo: "compra", conjunto: conjuntoNombre, pieza: pz.nombre, pedirAntes: c?.pedirAntes ?? t.inicioMasTardio, pedido: !!c?.pedido, llegada: c?.llegadaPrevista ?? null, pedirYa: !!c?.pedirYa };
    }
    if (t.tipo === "tercerizado") return { tipo: "tercerizado", conjunto: conjuntoNombre, pieza: pz.nombre, paso: t.paso, vuelta: t.finPlan ?? hoy };
    if (o.porLiberar && !pz.liberada) return { tipo: "sin_liberar", conjunto: conjuntoNombre, pieza: pz.nombre };
    return { tipo: "capacidad", conjunto: conjuntoNombre, pieza: pz.nombre, centroId: t.centroId ?? "", centro: centros.get(t.centroId ?? "")?.nombre ?? "un centro", desde: t.fechaPlan ?? hoy };
  };
  const claveCausa = (c: Causa) => `${c.tipo}:${"centroId" in c ? c.centroId : c.conjunto}`;

  // Proyectos: montaje hacia adelante, fecha estimada de fin y causa raíz de los atrasos.
  const proyectos: ProyectoPlan[] = e.proyectos.map((p) => {
    const atras = atrasPorProyecto.get(p.id)!;
    const esMaquina = p.tipo === "maquina";
    const tramos = [...Map.groupBy(p.conjuntos, (c) => c.orden).entries()].sort(([a], [b]) => a - b);
    const tareasP = tareas.filter((t) => t.proyectoId === p.id);
    let finAnterior = hoy;
    let tramoAnterior: ConjuntoEntrada | null = null;
    const conjuntos: ConjuntoPlan[] = [];
    for (const [, grupo] of tramos) {
      // Los alternativos (mismo orden) se montan en el mismo tramo: empiezan juntos, después del tramo anterior.
      const finesGrupo: string[] = [];
      let masLargo: ConjuntoEntrada = grupo[0];
      for (const c of grupo) {
        const piezasC = p.piezas.filter((x) => x.conjuntoId === c.id);
        const critica = [...piezasC].sort((a, b) => (finPieza.get(b.otPiezaId) ?? hoy).localeCompare(finPieza.get(a.otPiezaId) ?? hoy))[0];
        const listas = critica ? (finPieza.get(critica.otPiezaId) ?? hoy) : hoy;
        const porPiezas = esMaquina ? sumarHabiles(listas, p.margenDias, cal) : listas;
        const inicioEst = [porPiezas, finAnterior].sort().at(-1)!;
        const finEst = sumarHabiles(inicioEst, esMaquina ? c.dias : 0, cal);
        finesGrupo.push(finEst);
        if (c.dias > masLargo.dias) masLargo = c;
        const lim = atras.conjuntos.get(c.id)!;
        const atraso = habilesEntre(lim.inicio, inicioEst, cal);
        const tc = tareasP.filter((t) => t.conjuntoId === c.id);
        // Si espera al anterior, la causa no es "secuencia de montaje": es lo que atrasa al anterior (§1.5).
        const esperaAnterior = atraso > 0 && finAnterior > porPiezas && !!tramoAnterior;
        const causa = atraso > 0 && !esperaAnterior && critica ? causaDePieza(p, critica, c.nombre) : null;
        const motivo =
          atraso <= 0
            ? null
            : esperaAnterior
              ? `Espera a ${tramoAnterior!.codigo} ${tramoAnterior!.nombre}`
              : causa?.tipo === "compra" || causa?.tipo === "comercial"
                ? "Compra"
                : causa?.tipo === "tercerizado"
                  ? "Tercerizado"
                  : causa?.tipo === "sin_liberar"
                    ? "Falta liberar piezas"
                    : causa?.tipo === "capacidad"
                      ? `Capacidad de ${causa.centro}`
                      : "Capacidad";
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
        conjuntos.push({
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
          esperaA: esperaAnterior ? { codigo: tramoAnterior!.codigo, nombre: tramoAnterior!.nombre } : null,
          causa,
          fabricacionDesde: desdeFab,
          piezas: resumen,
        });
      }
      finAnterior = finesGrupo.sort().at(-1) ?? finAnterior;
      tramoAnterior = masLargo;
    }
    const finEstimado = esMaquina ? sumarHabiles(finAnterior, p.montajeFinalDias, cal) : finAnterior;
    const internas = tareasP.filter((t) => t.tipo === "interno");
    const horasTotales = internas.reduce((s, t) => s + t.horas, 0);
    const horasHechas = internas.filter((t) => t.estado === "terminada").reduce((s, t) => s + t.horas, 0);
    const diferenciaDias = habilesEntre(ajustarAHabil(p.entrega, cal, true), finEstimado, cal);
    // Causa raíz: se sigue la cadena "espera a…" desde el último tramo hasta el conjunto que se atrasa por sí mismo.
    const causas: ProyectoPlan["causas"] = [];
    if (diferenciaDias > 0) {
      // Desde el último tramo hacia atrás: mientras "espera al anterior", se pasa al tramo anterior.
      const ultimoDelTramo = (orden: number) => conjuntos.filter((c) => c.orden === orden).sort((a, b) => b.montajeFinEstimado.localeCompare(a.montajeFinEstimado))[0];
      const ordenes = [...new Set(conjuntos.map((c) => c.orden))].sort((a, b) => a - b);
      let k = ordenes.length - 1;
      let principal: ConjuntoPlan | undefined;
      while (k >= 0) {
        const c = ultimoDelTramo(ordenes[k]);
        if (c.esperaA) {
          k--;
          continue;
        }
        if (c.causa && c.atrasoDias > 0) principal = c;
        break;
      }
      principal ??= conjuntos.filter((c) => c.causa && c.atrasoDias > 0).sort((a, b) => b.atrasoDias - a.atrasoDias)[0];
      if (principal) causas.push({ causa: principal.causa!, dias: diferenciaDias });
      const otra = conjuntos
        .filter((c) => c.causa && c.atrasoDias > 0 && c !== principal && claveCausa(c.causa) !== claveCausa(principal!.causa!))
        .sort((a, b) => b.atrasoDias - a.atrasoDias)[0];
      if (otra) causas.push({ causa: otra.causa!, dias: otra.atrasoDias });
    }
    return {
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      tipo: p.tipo,
      prioridad: p.prioridad,
      entrega: p.entrega,
      montajeFinalLimite: atras.montajeFinalInicio,
      finEstimado,
      diferenciaDias,
      horasTotales,
      horasHechas,
      avancePct: horasTotales ? Math.round((horasHechas / horasTotales) * 100) : 0,
      pctEstimado: internas.length ? Math.round((internas.filter((t) => t.estimado).length / internas.length) * 100) : 0,
      conjuntos,
      piezasCubiertasConStock: p.piezasCubiertasConStock,
      piezasSinRuta: p.piezas.filter((x) => x.sinRuta).length,
      causas,
    };
  });

  // Capacidad de todos los centros para los próximos 60 días hábiles (para la carga y las grillas).
  for (let k = 0, d = hoy; k < 60; k++, d = sumarHabiles(d, 1, cal)) for (const c of e.centros) cap.total(c.id, d);
  return { tareas, compras, proyectos, carga: cap.usado, capacidad: cap.disponible, tandas, cargaOperario: cap.porOperario };
}

/**
 * Ubica un paso interno desde `inicio` en su centro: consume horas día por día
 * hasta completar la duración, sin pasar ni la capacidad del centro ni las
 * horas del operario (§1.7). Forzada (movida o fijada a mano): va ese día
 * aunque sobrecargue — el plan lo marca en rojo.
 */
function ubicarInterno(t: Tarea, inicio: string, centroId: string, operarioFijo: string | null, cap: Capacidad, cal: Calendario, forzarInicio: boolean) {
  let dia = inicio;
  let resto = t.horas;
  t.horasPorDia = {};
  t.centroId = centroId;
  const lugar = (d: string) => Math.min(cap.libre(centroId, d), cap.elegirOperario(centroId, d, operarioFijo ?? t.operarioId).libre);
  // Si la fecha no está forzada, se busca el primer día con lugar en el centro y en la persona.
  if (!forzarInicio) for (let k = 0; k < 400 && lugar(dia) <= 0.01; k++) dia = sumarHabiles(dia, 1, cal);
  t.fechaPlan = dia;
  for (let k = 0; k < 400 && resto > 0.001; k++) {
    const op = cap.elegirOperario(centroId, dia, operarioFijo ?? t.operarioId);
    const usa = forzarInicio ? Math.min(resto, cap.total(centroId, dia) || resto) : Math.min(resto, Math.max(0, Math.min(cap.libre(centroId, dia), op.libre)));
    if (usa > 0) {
      cap.usar(centroId, dia, usa);
      cap.asignarOperario(op.id, dia, usa);
      t.horasPorDia[dia] = (t.horasPorDia[dia] ?? 0) + usa;
      t.operarioId = op.id;
      resto -= usa;
    }
    if (resto > 0.001) dia = sumarHabiles(dia, 1, cal);
  }
  t.finPlan = dia;
}
