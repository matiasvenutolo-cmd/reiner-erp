/**
 * Ejecución en taller: iniciar/pausar/finalizar una operación, registrar
 * paradas, y el cálculo de tiempo estándar (RF-05 a RF-08).
 *
 * RF-05 es el requerimiento pivote del proyecto (ver docs/01-analisis.md
 * §2): éste es el módulo que existe para hacer posible que el operario
 * cargue desde el celular en 2-3 toques.
 *
 * Un operario tiene a lo sumo UNA operación en curso (abierta y sin pausa).
 * Desde la observación del cliente en Fase 3 ("una vez que inicia una tarea
 * no puede salir de ella, aunque la pause") puede dejar otras en pausa y
 * cambiar de actividad: la pausada conserva su registro abierto y su parada
 * con el motivo, y se retoma desde "Mi trabajo". El tiempo no se pisa: una
 * operación pausada está parada (la parada registra ese lapso) mientras el
 * operario trabaja en otra.
 */
import { eq, and, isNull, isNotNull, sql, desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { registroOperacion, parada, tipoParada, otPieza, tareaRevision, usuario, pieza } from "@/lib/db/schema";
import { getRoutingPieza, nombreOperacion } from "./maestros";
import { cantidadQueEntraAlPaso, pasoHabilitadoParaOperario, getCentrosDeUsuario } from "./produccion";
import { getAsignacionesDeHoy } from "./planificacion";
import { getEstadoYOperacionActual } from "./ot";
import type { RegistroOperacion, Parada, TipoParada } from "@/lib/db/schema";

export async function getTiposParada(): Promise<TipoParada[]> {
  return db.select().from(tipoParada);
}

export type OperacionAbierta = RegistroOperacion & { pausada: boolean; piezaNombre: string; otPiezaCodigo: string };

/** Operaciones abiertas del operario: como mucho una en curso y las que dejó en pausa. */
export async function getOperacionesAbiertas(usuarioId: string): Promise<OperacionAbierta[]> {
  const rows = await db
    .select({ registro: registroOperacion, piezaNombre: pieza.nombre, otPiezaCodigo: otPieza.codigo })
    .from(registroOperacion)
    .innerJoin(otPieza, eq(otPieza.id, registroOperacion.otPiezaId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .where(and(eq(registroOperacion.usuarioId, usuarioId), isNull(registroOperacion.fin)))
    .orderBy(desc(registroOperacion.inicio));
  if (rows.length === 0) return [];
  const pausadas = await db
    .select({ registroOperacionId: parada.registroOperacionId })
    .from(parada)
    .where(and(inArray(parada.registroOperacionId, rows.map((r) => r.registro.id)), isNull(parada.fin)));
  const idsPausados = new Set(pausadas.map((p) => p.registroOperacionId));
  return rows.map((r) => ({ ...r.registro, pausada: idsPausados.has(r.registro.id), piezaNombre: r.piezaNombre, otPiezaCodigo: r.otPiezaCodigo }));
}

/** La operación en curso (abierta y sin pausa) del operario, si tiene una. */
export async function getOperacionEnCurso(usuarioId: string): Promise<OperacionAbierta | null> {
  return (await getOperacionesAbiertas(usuarioId)).find((o) => !o.pausada) ?? null;
}

/** Registro abierto del propio operario — los formularios mandan el id, el servidor no confía en él. */
async function getRegistroAbiertoPropio(registroOperacionId: string, usuarioId: string): Promise<RegistroOperacion> {
  const [registro] = await db.select().from(registroOperacion).where(eq(registroOperacion.id, registroOperacionId));
  if (!registro || registro.usuarioId !== usuarioId) throw new Error("Esa operación no es tuya.");
  if (registro.fin) throw new Error("Esa operación ya está finalizada.");
  return registro;
}

/** Centros del operario y lo que Planificación le asignó para hoy — para `pasoHabilitadoParaOperario`. */
export async function getHabilitacionOperario(usuarioId: string) {
  const [centros, asignadasHoy] = await Promise.all([getCentrosDeUsuario(usuarioId), getAsignacionesDeHoy(usuarioId)]);
  return { centros, centroIds: new Set(centros.map((c) => c.id)), asignadasHoy };
}

export type CantidadesOperacion = {
  /** Piezas que llegan a este paso (las OK del anterior, o la cantidad a fabricar en el primero). */
  entra: number;
  /** Lo que todavía se puede declarar (OK + rechazadas) en este paso. */
  disponibles: number;
};

export async function getCantidadesOperacion(otPiezaId: string, operacionId: string, excluirRegistroId?: string): Promise<CantidadesOperacion> {
  const [op] = await db.select().from(otPieza).where(eq(otPieza.id, otPiezaId));
  if (!op) return { entra: 0, disponibles: 0 };
  const [routing, cierres] = await Promise.all([
    getRoutingPieza(op.piezaId),
    db
      .select({
        id: registroOperacion.id,
        operacionId: registroOperacion.operacionId,
        piezasOk: registroOperacion.piezasOk,
        piezasRechazadas: registroOperacion.piezasRechazadas,
      })
      .from(registroOperacion)
      .where(and(eq(registroOperacion.otPiezaId, otPiezaId), eq(registroOperacion.tipo, "ejecucion"), isNotNull(registroOperacion.fin))),
  ]);
  const idx = routing.findIndex((r) => r.id === operacionId);
  if (idx === -1) return { entra: 0, disponibles: 0 };
  const entra = cantidadQueEntraAlPaso(routing.map((r) => r.id), idx, op.cantidadAFabricar, cierres);
  const yaDeclaradas = cierres
    .filter((c) => c.operacionId === operacionId && c.id !== excluirRegistroId)
    .reduce((s, c) => s + (c.piezasOk ?? 0) + (c.piezasRechazadas ?? 0), 0);
  return { entra, disponibles: Math.max(0, entra - yaDeclaradas) };
}

export async function getParadaAbierta(registroOperacionId: string): Promise<Parada | null> {
  const [row] = await db
    .select()
    .from(parada)
    .where(and(eq(parada.registroOperacionId, registroOperacionId), isNull(parada.fin)));
  return row ?? null;
}

export type ParadaActiva = {
  id: string;
  inicio: Date;
  tipoParadaNombre: string;
  usuarioNombre: string;
  piezaNombre: string;
  otPiezaCodigo: string;
};

/** Todo lo que está frenado AHORA MISMO en el taller, con el motivo — pedido
 * del cliente (docs/06-backlog-release-3.md §10, §15): "diferenciar
 * aquello que está en espera por un motivo particular... debería generar
 * una alerta". Base de la home de dirección/taller. */
export async function getParadasActivas(): Promise<ParadaActiva[]> {
  return db
    .select({
      id: parada.id,
      inicio: parada.inicio,
      tipoParadaNombre: tipoParada.nombre,
      usuarioNombre: usuario.nombre,
      piezaNombre: pieza.nombre,
      otPiezaCodigo: otPieza.codigo,
    })
    .from(parada)
    .innerJoin(tipoParada, eq(tipoParada.id, parada.tipoParadaId))
    .innerJoin(registroOperacion, eq(registroOperacion.id, parada.registroOperacionId))
    .innerJoin(usuario, eq(usuario.id, registroOperacion.usuarioId))
    .innerJoin(otPieza, eq(otPieza.id, registroOperacion.otPiezaId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .where(isNull(parada.fin))
    .orderBy(desc(parada.inicio));
}

export type IniciarOperacionInput = {
  otPiezaId: string;
  operacionId: string;
  usuarioId: string;
  tipo: "setup" | "ejecucion";
  /** v2 — hora real del toque (si se guardó sin conexión y se envía después). */
  cuando?: Date;
};

/**
 * v2 — Hora del toque: la que mandó la tablet si se guardó sin conexión, sólo
 * si es razonable (de las últimas 12 horas y no del futuro); si no, ahora.
 */
export function horaDelToque(cuando?: Date | null): Date {
  const ahora = new Date();
  if (!cuando || Number.isNaN(cuando.getTime())) return ahora;
  const dif = ahora.getTime() - cuando.getTime();
  return dif >= 0 && dif < 12 * 3600 * 1000 ? cuando : ahora;
}

export async function iniciarOperacion(
  input: IniciarOperacionInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const abiertas = await getOperacionesAbiertas(input.usuarioId);
  if (abiertas.some((a) => !a.pausada)) {
    return { ok: false, error: "Tenés una operación en curso. Pausala o finalizala antes de iniciar otra." };
  }
  if (abiertas.some((a) => a.otPiezaId === input.otPiezaId)) {
    return { ok: false, error: "Esta pieza la tenés en pausa: reanudala en vez de iniciar de nuevo." };
  }
  const [op] = await db.select().from(otPieza).where(eq(otPieza.id, input.otPiezaId));
  if (!op?.enviadaProduccionAt) {
    return { ok: false, error: "Esta pieza todavía no fue enviada a producción." };
  }
  // Sólo el paso que sigue en la hoja de ruta, y sólo si le corresponde a este operario.
  const { operacionActual } = await getEstadoYOperacionActual(op);
  if (!operacionActual || operacionActual.id !== input.operacionId) {
    return { ok: false, error: "Esa no es la operación que sigue en la hoja de ruta de la pieza." };
  }
  const { centroIds, asignadasHoy } = await getHabilitacionOperario(input.usuarioId);
  const paso = {
    id: operacionActual.id,
    tipo: operacionActual.proceso.tipo,
    centroTrabajoId: operacionActual.centroTrabajoId ?? operacionActual.proceso.centroTrabajoId,
  };
  if (paso.tipo !== "interno") {
    return { ok: false, error: "Ese paso no se hace en taller (es una compra o un tercerizado)." };
  }
  if (!pasoHabilitadoParaOperario(paso, op.id, centroIds, asignadasHoy)) {
    return { ok: false, error: `${nombreOperacion(operacionActual)} es de otro centro de trabajo y no la tenés asignada.` };
  }
  const [registro] = await db
    .insert(registroOperacion)
    .values({
      otPiezaId: input.otPiezaId,
      operacionId: input.operacionId,
      usuarioId: input.usuarioId,
      tipo: input.tipo,
      inicio: horaDelToque(input.cuando),
      piezasOk: 0,
      piezasRechazadas: 0,
    })
    .returning();
  // Primera vez que alguien trabaja la pieza: es su fecha de inicio (la OT impresa la muestra).
  await db
    .update(otPieza)
    .set({ fechaInicio: registro.inicio })
    .where(and(eq(otPieza.id, input.otPiezaId), isNull(otPieza.fechaInicio)));
  return { ok: true, id: registro.id };
}

export async function pausarOperacion(registroOperacionId: string, tipoParadaId: string, usuarioId: string, cuando?: Date): Promise<void> {
  await getRegistroAbiertoPropio(registroOperacionId, usuarioId);
  const existente = await getParadaAbierta(registroOperacionId);
  if (existente) return; // ya está pausada
  await db.insert(parada).values({ registroOperacionId, tipoParadaId, inicio: horaDelToque(cuando) });
}

async function cerrarParadaAbierta(registroOperacionId: string, cuando?: Date): Promise<void> {
  const abierta = await getParadaAbierta(registroOperacionId);
  if (!abierta) return;
  const fin = horaDelToque(cuando);
  const duracionSeg = Math.round((fin.getTime() - abierta.inicio.getTime()) / 1000);
  await db.update(parada).set({ fin, duracionSeg }).where(eq(parada.id, abierta.id));
}

/** Retomar una operación pausada: sólo si no hay otra en curso (nunca dos a la vez). */
export async function reanudarOperacion(registroOperacionId: string, usuarioId: string, cuando?: Date): Promise<void> {
  await getRegistroAbiertoPropio(registroOperacionId, usuarioId);
  const enCurso = await getOperacionEnCurso(usuarioId);
  if (enCurso && enCurso.id !== registroOperacionId) {
    throw new Error(`Tenés en curso ${enCurso.piezaNombre} (${enCurso.otPiezaCodigo}). Pausala o finalizala antes de retomar ésta.`);
  }
  await cerrarParadaAbierta(registroOperacionId, cuando);
}

export type FinalizarOperacionInput = {
  registroOperacionId: string;
  usuarioId: string;
  piezasOk: number;
  piezasRechazadas: number;
  observacion?: string;
  /** v2 — motivo de los rechazos (medida, terminación, material, otro). */
  motivoRechazo?: string;
  cuando?: Date;
  // Sólo si es la última operación de la hoja de ruta de la pieza:
  cierrePieza?: {
    piezasNoOk: number;
    piezasDefectuosas: number;
    piezasRetrabajadas: number;
  };
};

export async function finalizarOperacion(input: FinalizarOperacionInput): Promise<void> {
  const registro = await getRegistroAbiertoPropio(input.registroOperacionId, input.usuarioId);

  if (registro.tipo === "setup") {
    // El setup no produce piezas ni cierra la pieza: antes, terminar el setup
    // de la última operación disparaba el cierre de la OT de pieza.
    input = { ...input, piezasOk: 0, piezasRechazadas: 0, cierrePieza: undefined };
  } else {
    validarCantidades(input, await getCantidadesOperacion(registro.otPiezaId, registro.operacionId, registro.id));
  }

  // Si quedó una parada abierta, se cierra junto con la operación.
  await cerrarParadaAbierta(registro.id, input.cuando);

  const fin = horaDelToque(input.cuando);
  const duracionSeg = Math.round((fin.getTime() - registro.inicio.getTime()) / 1000);
  await db
    .update(registroOperacion)
    .set({ fin, duracionSeg, piezasOk: input.piezasOk, piezasRechazadas: input.piezasRechazadas, observacion: input.observacion, motivoRechazo: input.piezasRechazadas > 0 ? (input.motivoRechazo ?? null) : null })
    .where(eq(registroOperacion.id, registro.id));

  if (input.cierrePieza) {
    await db
      .update(otPieza)
      .set({
        piezasOk: input.piezasOk,
        piezasNoOk: input.cierrePieza.piezasNoOk,
        piezasDefectuosas: input.cierrePieza.piezasDefectuosas,
        piezasRetrabajadas: input.cierrePieza.piezasRetrabajadas,
        fechaFin: fin,
        updatedAt: fin,
      })
      .where(eq(otPieza.id, registro.otPiezaId));

    // Release 2, paquete 7 — pedido de Horacio: "que cuando se fabriquen
    // piezas por retrabajar o piezas defectuosas se genere en otro panel
    // tareas de revisión de proceso para darles seguimiento". Se dispara
    // sola acá, nadie la carga a mano — ver docs/05-backlog-release-2.md §9.
    if (input.cierrePieza.piezasDefectuosas > 0 || input.cierrePieza.piezasRetrabajadas > 0) {
      await db.insert(tareaRevision).values({
        otPiezaId: registro.otPiezaId,
        piezasDefectuosas: input.cierrePieza.piezasDefectuosas,
        piezasRetrabajadas: input.cierrePieza.piezasRetrabajadas,
        estado: "pendiente",
      });
    }
  }
}

/** No se declaran más piezas de las que llegaron al paso. Los conteos del
 * cierre de la pieza (no OK, defectuosas, retrabajadas) todavía no tienen
 * una definición de si se solapan entre sí (ver docs/06 §25, punto 3.2): por
 * ahora cada uno, por separado, no puede superar las piezas que no salieron OK. */
function validarCantidades(input: FinalizarOperacionInput, { disponibles }: CantidadesOperacion) {
  const valores = [input.piezasOk, input.piezasRechazadas, ...Object.values(input.cierrePieza ?? {})];
  if (valores.some((v) => !Number.isInteger(v) || v < 0)) throw new Error("Las cantidades tienen que ser números enteros, 0 o más.");
  if (input.piezasOk + input.piezasRechazadas > disponibles) {
    throw new Error(
      `Llegaron ${disponibles} pieza${disponibles === 1 ? "" : "s"} a esta operación: OK + rechazadas no puede pasar de ${disponibles}.`,
    );
  }
  if (input.cierrePieza) {
    const noSalieronOk = disponibles - input.piezasOk;
    const { piezasNoOk, piezasDefectuosas, piezasRetrabajadas } = input.cierrePieza;
    if (Math.max(piezasNoOk, piezasDefectuosas, piezasRetrabajadas) > noSalieronOk) {
      throw new Error(`De ${disponibles} piezas salieron ${input.piezasOk} OK: no OK, defectuosas o retrabajadas no pueden pasar de ${noSalieronOk}.`);
    }
  }
}

/** ¿La operación que se está por cerrar es la última de la hoja de ruta de esa pieza? */
export async function esUltimaOperacion(otPiezaId: string, operacionId: string): Promise<boolean> {
  const [pieza] = await db.select().from(otPieza).where(eq(otPieza.id, otPiezaId));
  if (!pieza) return false;
  const routing = await getRoutingPieza(pieza.piezaId);
  if (routing.length === 0) return false;
  return routing[routing.length - 1].id === operacionId;
}

export type TiempoEstandar = { promedio: number; minimo: number; maximo: number; observaciones: number };

/**
 * Tiempo estándar por pieza × operación × tipo, calculado sobre el
 * histórico acumulado (RF-08). Devuelve rango y no sólo promedio, porque
 * con 2-3 máquinas por año un promedio simple engaña (ver docs/01-analisis.md §5).
 */
export async function getTiempoEstandar(operacionId: string, tipo: "setup" | "ejecucion"): Promise<TiempoEstandar | null> {
  const [row] = await db
    .select({
      promedio: sql<number>`avg(${registroOperacion.duracionSeg})`.mapWith(Number),
      minimo: sql<number>`min(${registroOperacion.duracionSeg})`.mapWith(Number),
      maximo: sql<number>`max(${registroOperacion.duracionSeg})`.mapWith(Number),
      observaciones: sql<number>`count(*)`.mapWith(Number),
    })
    .from(registroOperacion)
    .where(
      and(
        eq(registroOperacion.operacionId, operacionId),
        eq(registroOperacion.tipo, tipo),
        sql`${registroOperacion.fin} is not null`,
        // Compras/tercerizados recibidos cierran su paso sin duración — no es tiempo de máquina.
        sql`${registroOperacion.duracionSeg} is not null`,
      ),
    );
  if (!row || row.observaciones === 0) return null;
  return { promedio: Math.round(row.promedio), minimo: row.minimo, maximo: row.maximo, observaciones: row.observaciones };
}

export async function getHistorialOtPieza(otPiezaId: string) {
  const registros = await db
    .select()
    .from(registroOperacion)
    .where(eq(registroOperacion.otPiezaId, otPiezaId))
    .orderBy(registroOperacion.inicio);
  return Promise.all(
    registros.map(async (r) => ({
      registro: r,
      paradas: await db.select().from(parada).where(eq(parada.registroOperacionId, r.id)),
    })),
  );
}

export type ResumenOperacion = { usuarioIds: string[]; duracionSeg: number | null; paradas: Parada[] };

/** Junta todos los registros de cada operación (setup + fabricación, o más de
 * un turno): antes la ficha mostraba sólo el último y perdía el setup y sus paradas. */
export function resumirHistorialPorOperacion(historial: Awaited<ReturnType<typeof getHistorialOtPieza>>): Map<string, ResumenOperacion> {
  const resumen = new Map<string, ResumenOperacion>();
  for (const { registro, paradas } of historial) {
    const r = resumen.get(registro.operacionId) ?? { usuarioIds: [], duracionSeg: null, paradas: [] };
    if (!r.usuarioIds.includes(registro.usuarioId)) r.usuarioIds.push(registro.usuarioId);
    if (registro.duracionSeg !== null) r.duracionSeg = (r.duracionSeg ?? 0) + registro.duracionSeg;
    r.paradas.push(...paradas);
    resumen.set(registro.operacionId, r);
  }
  return resumen;
}

/**
 * v2 — "Deshacer" después de Terminar (mejoras de usabilidad §3.4): durante unos
 * segundos se puede volver atrás si se tocó sin querer. Reabre el registro y,
 * si había cerrado la pieza, deshace ese cierre. Sólo el mismo operario, sólo
 * si nadie siguió trabajando la pieza después.
 */
export async function deshacerFinalizar(registroOperacionId: string, usuarioId: string): Promise<void> {
  const [registro] = await db.select().from(registroOperacion).where(eq(registroOperacion.id, registroOperacionId));
  if (!registro || registro.usuarioId !== usuarioId || !registro.fin) throw new Error("No hay nada para deshacer.");
  if (Date.now() - registro.fin.getTime() > 60_000) throw new Error("Ya pasó el momento para deshacer. Avisale al jefe de planta.");
  const posteriores = await db
    .select({ id: registroOperacion.id })
    .from(registroOperacion)
    .where(and(eq(registroOperacion.otPiezaId, registro.otPiezaId), sql`${registroOperacion.inicio} > ${registro.fin}`));
  if (posteriores.length) throw new Error("La pieza ya siguió en otro paso: no se puede deshacer.");
  await db.update(registroOperacion).set({ fin: null, duracionSeg: null, piezasOk: 0, piezasRechazadas: 0, motivoRechazo: null }).where(eq(registroOperacion.id, registro.id));
  const [op] = await db.select().from(otPieza).where(eq(otPieza.id, registro.otPiezaId));
  if (op?.fechaFin && Math.abs(op.fechaFin.getTime() - registro.fin.getTime()) < 5000) {
    await db.update(otPieza).set({ fechaFin: null, piezasOk: 0, piezasNoOk: 0, piezasDefectuosas: 0, piezasRetrabajadas: 0 }).where(eq(otPieza.id, op.id));
    await db.delete(tareaRevision).where(and(eq(tareaRevision.otPiezaId, op.id), sql`${tareaRevision.createdAt} >= ${new Date(registro.fin.getTime() - 5000)}`));
  }
}
