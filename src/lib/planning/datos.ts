/**
 * Carga los datos reales de la base y arma la entrada del motor. Todo en un
 * puñado de consultas (no una por pieza): con 5 proyectos de 250 piezas el
 * cálculo tiene que tardar menos de 2 segundos.
 *
 * Valores por defecto cuando falta un dato (especificación, "Migración y
 * datos faltantes"): tiempo del paso → el del proceso → 30 min de setup y 15
 * por unidad; plazo de tercerizado → proveedor → 5 días; plazo de compra →
 * proveedor → proceso Compras → 10 días; hoja de ruta vacía → una tarea
 * genérica "Fabricar" en Taller. Todo lo supuesto queda marcado.
 */
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  otMaquina, otConjunto, otPieza, pieza, conjunto, operacion, proceso, centroTrabajo, usuario, usuarioCentroTrabajo,
  registroOperacion, parada, remito, remitoItem, pedidoCompra, proveedor, proveedorServicio, feriado, ausencia,
  montajeConjunto, configuracion, planAjuste, parametro, cliente, tareaBloqueo, tareaLote, asignacionTrabajo,
} from "@/lib/db/schema";
import { avancePasos } from "@/lib/data/produccion";
import { hoyISO, fechaISO } from "@/lib/fecha";
import { sumarHabiles, type Calendario } from "./calendario";
import { planificar, CENTRO_POR_DEFECTO, type EntradaMotor, type ProyectoEntrada, type PasoEntrada, type ResultadoMotor } from "./motor";

export const ESTADOS_PLANIFICADOS = ["activo", "en_montaje"];
export const DEFAULT = { setupMin: 30, minPorUnidad: 15, plazoTercerizado: 5, plazoCompra: 10, plazoComercial: 20 };

export async function getParametros(): Promise<{ horizonte: number; exigirPlano: boolean; entradaAutomatica: boolean; filas: { clave: string; valor: string; nota: string | null }[] }> {
  const filas = await db.select().from(parametro);
  const v = (k: string) => filas.find((f) => f.clave === k)?.valor;
  return {
    horizonte: Number(v("horizonte_liberacion") ?? 15),
    exigirPlano: (v("exigir_plano") ?? "si") === "si",
    // Simplificación §4.3: la entrada al plan es automática salvo que ADMIN vuelva a la liberación manual por tandas.
    entradaAutomatica: (v("entrada_plan") ?? "automatica") !== "manual",
    filas,
  };
}

export async function getCalendario(): Promise<Calendario> {
  const f = await db.select({ fecha: feriado.fecha }).from(feriado);
  return { feriados: new Set(f.map((x) => x.fecha)), diasSemana: [1, 2, 3, 4, 5] };
}

export type ContextoPlan = {
  entrada: EntradaMotor;
  resultado: ResultadoMotor;
  centros: { id: string; nombre: string; horasDia: number; maquinas: number; eficiencia: number; operarios: { id: string; nombre: string }[] }[];
  operarios: Map<string, string>;
  proyectosInfo: Map<string, { cliente: string | null; configuracion: string | null; estado: string; esDemo: boolean; referencia: string }>;
  ms: number;
};

// El plan guardado (simplificación §4.6): se calcula al cambiar algo, no en cada carga de página.
// Se guarda como texto porque el caché de Next sólo guarda JSON; los Map y Set se reconstruyen al leerlo.
const aTexto = (_k: string, v: unknown) => (v instanceof Map ? { __mapa: [...v] } : v instanceof Set ? { __conjunto: [...v] } : v);
const deTexto = (_k: string, v: unknown) => {
  if (v && typeof v === "object" && "__mapa" in v) return new Map((v as { __mapa: [unknown, unknown][] }).__mapa);
  if (v && typeof v === "object" && "__conjunto" in v) return new Set((v as { __conjunto: unknown[] }).__conjunto);
  return v;
};
// El día va como argumento sólo para que forme parte de la clave del caché (un plan por día).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const planGuardado = unstable_cache(async (_dia: string) => JSON.stringify(await construirPlan(), aTexto), ["plan-v2", process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local"], {
  tags: ["plan"],
  // Red de seguridad: aunque nada cambie, se recalcula cada 10 minutos. Y el día forma parte de la clave.
  revalidate: 600,
});

/** El plan completo: guardado entre cargas e invalidado por cada acción que cambia datos (ver src/lib/revalidar.ts). */
export const getPlan = cache(async (): Promise<ContextoPlan> => JSON.parse(await planGuardado(hoyISO()), deTexto));

/** Para el diálogo de "plan factible" (§1.4): un proyecto en borrador, simulado como si se activara con esa entrega. */
export type Simulacion = { id: string; entrega: string; prioridad: "normal" | "alta" };

export async function construirPlan(simular?: Simulacion): Promise<ContextoPlan> {
  const t0 = Date.now();
  const hoy = hoyISO();
  // Una sola tanda para todo lo que no depende de los proyectos.
  const [calendario, params, proyectosRows, centrosRows, habilitados, ausencias, ajustes, bloqueos, asignadasAntes] = await Promise.all([
    getCalendario(),
    getParametros(),
    db
      .select({ m: otMaquina, configNombre: configuracion.nombre, montajeFinalDias: configuracion.montajeFinalDias, margen: configuracion.margenMontajeDias, cliente: cliente.razonSocial })
      .from(otMaquina)
      .leftJoin(configuracion, eq(configuracion.id, otMaquina.configuracionId))
      .leftJoin(cliente, eq(cliente.id, otMaquina.clienteId))
      .where(simular ? or(inArray(otMaquina.estadoProyecto, ESTADOS_PLANIFICADOS), eq(otMaquina.id, simular.id)) : inArray(otMaquina.estadoProyecto, ESTADOS_PLANIFICADOS)),
    db.select().from(centroTrabajo).orderBy(centroTrabajo.orden),
    db
      .select({ centroId: usuarioCentroTrabajo.centroTrabajoId, id: usuario.id, nombre: usuario.nombre })
      .from(usuarioCentroTrabajo)
      .innerJoin(usuario, eq(usuario.id, usuarioCentroTrabajo.usuarioId))
      .where(and(eq(usuario.activo, true), eq(usuario.rol, "operario"))),
    db.select().from(ausencia),
    db.select().from(planAjuste),
    db.select().from(tareaBloqueo).where(isNull(tareaBloqueo.resueltoAt)),
    // Plan confirmado de días anteriores: lo que no se empezó ya no "arranca tarde", está atrasado (§1.4).
    db
      .selectDistinct({ otPiezaId: asignacionTrabajo.otPiezaId, operacionId: asignacionTrabajo.operacionId })
      .from(asignacionTrabajo)
      .where(and(eq(asignacionTrabajo.dePlanConfirmado, true), sql`${asignacionTrabajo.fecha} < ${hoy}`)),
  ]);
  const proyectosActivos = proyectosRows
    .map((r) => (simular && r.m.id === simular.id ? { ...r, m: { ...r.m, fechaEntrega: simular.entrega, prioridad: simular.prioridad, estadoProyecto: "activo", fechaInicioProyecto: hoy } } : r))
    .filter((r) => r.m.fechaEntrega);
  const ids = proyectosActivos.map((r) => r.m.id);

  const centros = centrosRows.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    horasDia: c.horasDia,
    maquinas: c.maquinas,
    eficiencia: c.eficiencia,
    operarios: habilitados.filter((h) => h.centroId === c.id).map((h) => ({ id: h.id, nombre: h.nombre })),
  }));
  const operarios = new Map(habilitados.map((h) => [h.id, h.nombre]));

  const mapaAusencias = new Map<string, Set<string>>();
  for (const a of ausencias) {
    const set = mapaAusencias.get(a.usuarioId) ?? new Set<string>();
    for (let f = a.desde; f <= a.hasta; ) {
      set.add(f);
      const d = new Date(`${f}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      f = d.toISOString().slice(0, 10);
    }
    mapaAusencias.set(a.usuarioId, set);
  }

  let proyectos: ProyectoEntrada[] = [];
  const proyectosInfo: ContextoPlan["proyectosInfo"] = new Map();
  if (ids.length) {
    const [conjRows, piezaRows, montaje] = await Promise.all([
      db
        .select({ id: otConjunto.id, otMaquinaId: otConjunto.otMaquinaId, conjuntoId: otConjunto.conjuntoId, nombre: conjunto.nombre, codigo: conjunto.codigo })
        .from(otConjunto)
        .innerJoin(conjunto, eq(conjunto.id, otConjunto.conjuntoId))
        .where(inArray(otConjunto.otMaquinaId, ids)),
      db
        .select({ op: otPieza, p: pieza, otMaquinaId: otConjunto.otMaquinaId })
        .from(otPieza)
        .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
        .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
        .where(inArray(otConjunto.otMaquinaId, ids)),
      db.select().from(montajeConjunto),
    ]);
    const piezaIds = [...new Set(piezaRows.map((r) => r.p.id))];
    const otPiezaIds = piezaRows.map((r) => r.op.id);
    const [ruta, registros, abiertas, remitos, pedidos, servicios, proveedores, lotesManuales] = await Promise.all([
      piezaIds.length
        ? db.select({ o: operacion, pr: proceso }).from(operacion).innerJoin(proceso, eq(proceso.id, operacion.procesoId)).where(inArray(operacion.piezaId, piezaIds)).orderBy(operacion.piezaId, operacion.secuencia)
        : [],
      otPiezaIds.length
        ? db
            .select({ otPiezaId: registroOperacion.otPiezaId, operacionId: registroOperacion.operacionId, fin: registroOperacion.fin, id: registroOperacion.id, piezasOk: registroOperacion.piezasOk, piezasRechazadas: registroOperacion.piezasRechazadas })
            .from(registroOperacion)
            .where(and(inArray(registroOperacion.otPiezaId, otPiezaIds), eq(registroOperacion.tipo, "ejecucion")))
        : [],
      otPiezaIds.length
        ? db
            .select({ registroId: parada.registroOperacionId })
            .from(parada)
            .innerJoin(registroOperacion, eq(registroOperacion.id, parada.registroOperacionId))
            .where(and(isNull(parada.fin), inArray(registroOperacion.otPiezaId, otPiezaIds)))
        : [],
      otPiezaIds.length
        ? db.select({ otPiezaId: remitoItem.otPiezaId, fecha: remito.fecha }).from(remitoItem).innerJoin(remito, eq(remito.id, remitoItem.remitoId)).where(inArray(remitoItem.otPiezaId, otPiezaIds))
        : [],
      otPiezaIds.length ? db.select().from(pedidoCompra).where(inArray(pedidoCompra.otPiezaId, otPiezaIds)) : [],
      db.select().from(proveedorServicio),
      db.select({ id: proveedor.id, plazoDias: proveedor.plazoDias }).from(proveedor),
      otPiezaIds.length ? db.select().from(tareaLote).where(inArray(tareaLote.otPiezaId, otPiezaIds)) : [],
    ]);
    const plazoProveedor = new Map(proveedores.map((p) => [p.id, p.plazoDias]));
    const pausados = new Set(abiertas.map((a) => a.registroId));
    const rutaPorPieza = new Map<string, typeof ruta>();
    for (const r of ruta) rutaPorPieza.set(r.o.piezaId, [...(rutaPorPieza.get(r.o.piezaId) ?? []), r]);

    proyectos = proyectosActivos.map(({ m, montajeFinalDias, margen, configNombre, cliente: cli }) => {
      proyectosInfo.set(m.id, { cliente: cli, configuracion: configNombre, estado: m.estadoProyecto, esDemo: m.esDemo, referencia: m.numeroSerie });
      const tipo = m.destino as ProyectoEntrada["tipo"];
      const conjuntosOt = conjRows.filter((c) => c.otMaquinaId === m.id);
      const ordenMontaje = montaje.filter((x) => x.configuracionId === m.configuracionId);
      const conjuntos = conjuntosOt.map((c, i) => {
        const mj = ordenMontaje.find((x) => x.conjuntoId === c.conjuntoId);
        return { id: c.id, nombre: c.nombre, codigo: c.codigo, orden: mj?.orden ?? 100 + i, dias: mj?.dias ?? 1 };
      });
      const piezasOt = piezaRows.filter((r) => r.otMaquinaId === m.id);
      const piezas = piezasOt
        .filter((r) => r.op.cantidadAFabricar > 0)
        .map(({ op, p }) => {
          const cant = op.cantidadAFabricar;
          const pedidosPieza = pedidos.filter((x) => x.otPiezaId === op.id);
          const pedidoAbierto = pedidosPieza.find((x) => !x.recibidoAt);
          const llegadaPedido = (plazo: number) =>
            pedidoAbierto ? (pedidoAbierto.fechaPrometida ?? sumarHabiles(fechaISO(pedidoAbierto.fechaPedido), plazo, calendario)) : null;
          const clase = (p.clase as "fabricada" | "a_medida" | "comercial") ?? "fabricada";
          if (clase !== "fabricada" || p.tipo === "comprada") {
            const plazo = p.plazoCompraDias ?? plazoProveedor.get(p.proveedorHabitualId ?? "") ?? DEFAULT.plazoComercial;
            return {
              otPiezaId: op.id, codigo: p.codigo, nombre: p.nombre, cantidad: cant, conjuntoId: op.otConjuntoId,
              liberada: !!op.enviadaProduccionAt, tienePlano: !!(p.numeroPlano && p.revision), clase: clase === "fabricada" ? "comercial" : clase, sinRuta: false, pasos: [],
              compraEntera: { plazoDias: plazo, plazoSupuesto: p.plazoCompraDias == null && !plazoProveedor.get(p.proveedorHabitualId ?? ""), llegadaPrevista: llegadaPedido(plazo), pedido: !!pedidoAbierto, recibida: pedidosPieza.some((x) => x.recibidoAt) },
            };
          }
          const pasosRuta = rutaPorPieza.get(p.id) ?? [];
          const regs = registros.filter((r) => r.otPiezaId === op.id);
          // Para saber si un tercerizado ya salió: remito posterior al cierre del paso anterior.
          const cierres = regs.filter((r) => r.fin).map((r) => r.fin!.getTime());
          const ultimoCierre = cierres.length ? Math.max(...cierres) : 0;
          const remitoPaso = remitos.filter((x) => x.otPiezaId === op.id && x.fecha.getTime() >= ultimoCierre).sort((a, b) => b.fecha.getTime() - a.fecha.getTime())[0];
          // Lotes (§1.6): el elegido a mano para la tarea, o el de la pieza si la cantidad lo supera.
          const loteDe = (opId: string, interno: boolean) => {
            const manual = lotesManuales.find((l) => l.otPiezaId === op.id && l.operacionId === opId);
            if (manual) return manual.tamano > 0 && manual.tamano < cant ? manual.tamano : null;
            return interno && p.tamanoLote && p.tamanoLote < cant ? p.tamanoLote : null;
          };
          const cerrados = regs.filter((r) => r.fin);
          const conLote = new Set(pasosRuta.filter(({ o, pr }) => loteDe(o.id, pr.tipo === "interno")).map(({ o }) => o.id));
          const { completados } = avancePasos(pasosRuta.map(({ o }) => o.id), cant, cerrados, conLote);
          const pasos: PasoEntrada[] = pasosRuta.length
            ? pasosRuta.map(({ o, pr }) => {
                const base = pasoDeRuta(o, pr, p, cant, servicios, plazoProveedor);
                const tipoPaso = base.tipo;
                const plazo = base.plazoDias;
                const terminada = completados.has(o.id);
                const delPaso = cerrados.filter((r) => r.operacionId === o.id);
                const abierta = regs.find((r) => r.operacionId === o.id && !r.fin);
                let estado: PasoEntrada["estado"] = terminada ? "terminada" : abierta ? (pausados.has(abierta.id) ? "pausada" : "en_curso") : "pendiente";
                let vueltaPrevista: string | null = null;
                if (!terminada && tipoPaso === "tercerizado" && remitoPaso) {
                  estado = "afuera";
                  vueltaPrevista = sumarHabiles(fechaISO(remitoPaso.fecha), plazo, calendario);
                }
                return {
                  ...base,
                  lote: loteDe(o.id, tipoPaso === "interno"),
                  declaradas: delPaso.reduce((n, r) => n + (r.piezasOk ?? 0) + (r.piezasRechazadas ?? 0), 0),
                  hechasOk: delPaso.reduce((n, r) => n + (r.piezasOk ?? 0), 0),
                  estado,
                  vueltaPrevista,
                  pedido: tipoPaso === "compras" ? !!pedidoAbierto : undefined,
                  llegadaPrevista: tipoPaso === "compras" ? llegadaPedido(plazo) : null,
                };
              })
            : [
                {
                  operacionId: `fabricar-${p.id}`, nombre: "Fabricar (sin hoja de ruta)", tipo: "interno", centroId: CENTRO_POR_DEFECTO,
                  horas: (DEFAULT.setupMin + DEFAULT.minPorUnidad * cant) / 60, plazoDias: 0, esperaHoras: 0, estimado: true, plazoSupuesto: false,
                  estado: op.fechaFin ? "terminada" : "pendiente",
                },
              ];
          return {
            otPiezaId: op.id, codigo: p.codigo, nombre: p.nombre, cantidad: cant, conjuntoId: op.otConjuntoId,
            liberada: !!op.enviadaProduccionAt, tienePlano: !!(p.numeroPlano && p.revision), clase: "fabricada" as const, sinRuta: !pasosRuta.length, pasos, compraEntera: null,
          };
        });
      return {
        id: m.id,
        codigo: m.codigo,
        nombre: configNombre ?? m.numeroSerie,
        tipo,
        entrega: m.fechaEntrega!,
        prioridad: (m.prioridad as "normal" | "alta") ?? "normal",
        montajeFinalDias: montajeFinalDias ?? 5,
        margenDias: margen ?? 3,
        conjuntos,
        piezas,
        piezasCubiertasConStock: piezasOt.filter((r) => r.op.cantidadAFabricar === 0).length,
        inicio: m.fechaInicioProyecto ?? (m.fechaEmision ? fechaISO(m.fechaEmision) : fechaISO(m.createdAt)),
      };
    });
  }

  const entrada: EntradaMotor = {
    hoy,
    calendario,
    proyectos,
    centros,
    ausencias: mapaAusencias,
    ajustes: new Map(ajustes.map((a) => [`${a.otPiezaId}::${a.operacionId}`, { fecha: a.fecha, operarioId: a.operarioId, centroId: a.centroTrabajoId, fijada: a.fijada }])),
    horizonteLiberacion: params.horizonte,
    exigirPlano: params.exigirPlano,
    entradaAutomatica: params.entradaAutomatica,
    asignadasAntes: new Set(asignadasAntes.map((a) => `${a.otPiezaId}::${a.operacionId}`)),
    horasOperarioDia: 8 * 0.85,
    bloqueos: new Map(bloqueos.map((b) => [`${b.otPiezaId}::${b.operacionId}`, MOTIVO_BLOQUEO[b.motivo] ?? b.texto ?? "No se puede hacer"])),
  };
  const resultado = planificar(entrada);
  return { entrada, resultado, centros, operarios, proyectosInfo, ms: Date.now() - t0 };
}

/**
 * Lo fijo de un paso de la hoja de ruta: duración, centro y plazo, con los valores por defecto cuando
 * falta el dato. Lo usan el plan y el cálculo de "cuándo puede estar" de una orden nueva.
 */
export function pasoDeRuta(
  o: typeof operacion.$inferSelect,
  pr: typeof proceso.$inferSelect,
  p: { plazoCompraDias: number | null; proveedorHabitualId: string | null },
  cant: number,
  servicios: (typeof proveedorServicio.$inferSelect)[],
  plazoProveedor: Map<string, number | null>,
) {
  const tipo = pr.tipo as PasoEntrada["tipo"];
  const setup = o.setupMin ?? pr.setupMin ?? DEFAULT.setupMin;
  const porUnidad = o.minPorUnidad ?? pr.minPorUnidad ?? DEFAULT.minPorUnidad;
  const servicio = servicios.find((s) => s.procesoId === pr.id && s.habitual);
  const plazoTerc = o.plazoTercerizadoDias ?? servicio?.plazoDias ?? pr.plazoDias ?? null;
  const plazoCompra = p.plazoCompraDias ?? plazoProveedor.get(p.proveedorHabitualId ?? "") ?? pr.plazoDias ?? null;
  return {
    operacionId: o.id,
    nombre: o.descripcion?.trim() || pr.nombre,
    tipo,
    centroId: o.centroTrabajoId ?? pr.centroTrabajoId,
    horas: tipo === "interno" ? (setup + porUnidad * cant) / 60 : 0,
    setupHoras: setup / 60,
    porUnidadHoras: porUnidad / 60,
    plazoDias: tipo === "tercerizado" ? (plazoTerc ?? DEFAULT.plazoTercerizado) : tipo === "compras" ? (plazoCompra ?? DEFAULT.plazoCompra) : 0,
    esperaHoras: o.esperaHoras ?? 0,
    estimado: o.tiempoOrigen ? o.tiempoOrigen === "estimado" : pr.tiempoOrigen !== "definido",
    plazoSupuesto: (tipo === "tercerizado" && plazoTerc == null) || (tipo === "compras" && plazoCompra == null),
  };
}

/** Motivos de "No puedo hacer esta", en palabras de la planta. */
export const MOTIVO_BLOQUEO: Record<string, string> = {
  falta_material: "Falta material",
  falta_pieza_anterior: "Falta la pieza del paso anterior",
  falta_plano: "Falta plano o está mal",
  maquina: "Máquina o herramienta",
  otro: "Otro motivo",
};

/** Proyectos que todavía no se planifican (borrador, pausado o sin fecha de entrega). */
export async function getProyectosSinPlan() {
  return db
    .select({ id: otMaquina.id, codigo: otMaquina.codigo, estado: otMaquina.estadoProyecto, fechaEntrega: otMaquina.fechaEntrega, plazo: otMaquina.plazoEntrega, destino: otMaquina.destino, fechaEmision: otMaquina.fechaEmision })
    .from(otMaquina)
    .where(sql`${otMaquina.estadoProyecto} not in ('activo','en_montaje','terminado','entregado') or ${otMaquina.fechaEntrega} is null`);
}

