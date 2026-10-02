/**
 * Stock y WIP por etapa de proceso (hallazgo 3.1 de docs/01-analisis.md).
 *
 * `stockPieza` = lo que está "Finalizado" (disponible para armar) — se
 * actualiza con cada ajuste manual de taller (Release 2, ajustarStock).
 *
 * El WIP "en proceso" YA NO sale de la tabla `wip_pieza`: esa tabla es la
 * foto fija que trajo la migración del Excel en Fase 1 y ningún flujo de la
 * app la volvió a tocar nunca (ver `wipPieza` en schema.ts) — cerrar una
 * operación en taller no la actualiza. Con meses de OT generadas y
 * ejecutadas desde entonces, mostrarla como si fuera el estado actual es
 * exactamente el problema que reportó el cliente en la reunión de Release 3
 * (docs/06-backlog-release-3.md §11): "aparecen números... que no permiten
 * entender fácilmente qué representan". En cambio, se calcula EN VIVO a
 * partir de la misma ejecución real que ya usan /avance y /centros-trabajo
 * (`registro_operacion` + la hoja de ruta) — una sola base para stock,
 * avance y tableros, tal como pidió el cliente.
 *
 * `wip_pieza` queda sin usar en la UI, no se borra: puede representar stock
 * físico genérico en planta sin atar a una OT puntual (trabajo que ya
 * estaba en curso antes de este sistema) — a confirmar con Julián/Horacio
 * antes de eliminar la tabla del todo (ver pregunta abierta en el backlog).
 */
import { asc, eq, and, inArray, isNotNull, lt, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  reservaStock,
  stockPieza,
  pieza,
  conjunto,
  proceso,
  movimientoStock,
  otPieza,
  otConjunto,
  otMaquina,
  operacion,
  registroOperacion,
  piezaConfiguracion,
} from "@/lib/db/schema";

/** Filtros comunes de los listados de Stock (Release 3, devolución del
 * cliente: "el listado de piezas es difícil de visualizar... poder filtrar
 * por conjunto y/o máquina, y por si es comprada o ya se fabricó"). */
export type FiltrosStock = { conjuntoId?: string; configuracionId?: string; tipo?: "fabricada" | "comprada" };

/** IDs de pieza que aplican a una configuración (máquina) puntual, vía
 * `piezaConfiguracion` — el mismo vínculo que usa la explosión de OT. */
async function piezaIdsDeConfiguracion(configuracionId: string): Promise<Set<string>> {
  const filas = await db
    .select({ piezaId: piezaConfiguracion.piezaId })
    .from(piezaConfiguracion)
    .where(eq(piezaConfiguracion.configuracionId, configuracionId));
  return new Set(filas.map((f) => f.piezaId));
}

/** Total físico en almacén — incluye lo comprometido para otras máquinas. */
export async function getStockDisponible(piezaId: string): Promise<number> {
  const [row] = await db
    .select({ cantidad: stockPieza.cantidadDisponible })
    .from(stockPieza)
    .where(eq(stockPieza.piezaId, piezaId));
  return row?.cantidad ?? 0;
}

export async function getComprometido(piezaId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${reservaStock.cantidad}), 0)`.mapWith(Number) })
    .from(reservaStock)
    .where(and(eq(reservaStock.piezaId, piezaId), gt(reservaStock.cantidad, 0)));
  return row?.total ?? 0;
}

export async function getComprometidoBatch(): Promise<Map<string, number>> {
  const rows = await db
    .select({ piezaId: reservaStock.piezaId, total: sql<number>`sum(${reservaStock.cantidad})`.mapWith(Number) })
    .from(reservaStock)
    .where(gt(reservaStock.cantidad, 0))
    .groupBy(reservaStock.piezaId);
  return new Map(rows.map((r) => [r.piezaId, r.total]));
}

/** Lo que se puede usar para una OT nueva: almacén menos lo ya comprometido. */
export async function getStockLibre(piezaId: string): Promise<number> {
  const [disponible, comprometido] = await Promise.all([getStockDisponible(piezaId), getComprometido(piezaId)]);
  return Math.max(0, disponible - comprometido);
}

/**
 * Reserva para una OT lo que el stock libre cubra de lo que necesita, y
 * devuelve cuánto cubrió — reemplaza al `getStockDisponible` que usaba la
 * explosión de OT, que leía el stock sin apartarlo.
 */
export async function reservarStockLibre(input: { otMaquinaId: string; piezaId: string; necesaria: number }): Promise<number> {
  const libre = await getStockLibre(input.piezaId);
  const cubre = Math.min(libre, input.necesaria);
  if (cubre > 0) {
    await db.insert(reservaStock).values({ otMaquinaId: input.otMaquinaId, piezaId: input.piezaId, cantidad: cubre });
  }
  return cubre;
}

export type ReservaConOt = { id: string; otMaquinaId: string; otMaquinaCodigo: string; cantidad: number; createdAt: Date };

export async function getReservasDePieza(piezaId: string): Promise<ReservaConOt[]> {
  return db
    .select({
      id: reservaStock.id,
      otMaquinaId: reservaStock.otMaquinaId,
      otMaquinaCodigo: otMaquina.codigo,
      cantidad: reservaStock.cantidad,
      createdAt: reservaStock.createdAt,
    })
    .from(reservaStock)
    .innerJoin(otMaquina, eq(otMaquina.id, reservaStock.otMaquinaId))
    .where(and(eq(reservaStock.piezaId, piezaId), gt(reservaStock.cantidad, 0)))
    .orderBy(asc(reservaStock.createdAt));
}

/**
 * Retiro físico del almacén (devolución del socio: "poner que te agarraste x
 * cantidad y registrar quién sacó del stock"). Con OT, consume su reserva;
 * sin OT, sólo puede tocar lo libre — lo comprometido es de otra máquina.
 */
export async function retirarStock(input: {
  piezaId: string;
  cantidad: number;
  otMaquinaId?: string;
  observacion?: string;
  usuarioId: string;
}): Promise<void> {
  if (input.cantidad <= 0) throw new Error("La cantidad tiene que ser mayor a cero.");
  const [disponible, comprometido, reservas] = await Promise.all([
    getStockDisponible(input.piezaId),
    getComprometido(input.piezaId),
    getReservasDePieza(input.piezaId),
  ]);
  if (input.cantidad > disponible) throw new Error(`Sólo hay ${disponible} en almacén.`);

  let otCodigo: string | undefined;
  const reservaUpdates: { id: string; cantidad: number }[] = [];
  if (input.otMaquinaId) {
    const deEsaOt = reservas.filter((r) => r.otMaquinaId === input.otMaquinaId);
    const reservadoOt = deEsaOt.reduce((s, r) => s + r.cantidad, 0);
    const libre = Math.max(0, disponible - comprometido);
    if (input.cantidad > reservadoOt + libre) {
      throw new Error(`Para esa OT hay ${reservadoOt} reservadas y ${libre} libres.`);
    }
    otCodigo = deEsaOt[0]?.otMaquinaCodigo;
    if (!otCodigo) {
      const [m] = await db.select({ codigo: otMaquina.codigo }).from(otMaquina).where(eq(otMaquina.id, input.otMaquinaId));
      otCodigo = m?.codigo;
    }
    let resto = input.cantidad;
    for (const r of deEsaOt) {
      if (resto <= 0) break;
      const usa = Math.min(resto, r.cantidad);
      reservaUpdates.push({ id: r.id, cantidad: r.cantidad - usa });
      resto -= usa;
    }
  } else {
    const libre = Math.max(0, disponible - comprometido);
    if (input.cantidad > libre) {
      throw new Error(`Hay ${libre} libres; el resto está comprometido para otra máquina — elegí la OT para la que lo retirás.`);
    }
  }

  await db.transaction(async (tx) => {
    for (const u of reservaUpdates) {
      await tx.update(reservaStock).set({ cantidad: u.cantidad }).where(eq(reservaStock.id, u.id));
    }
    await tx
      .insert(stockPieza)
      .values({ piezaId: input.piezaId, cantidadDisponible: disponible - input.cantidad })
      .onConflictDoUpdate({ target: stockPieza.piezaId, set: { cantidadDisponible: disponible - input.cantidad, updatedAt: new Date() } });
    await tx.insert(movimientoStock).values({
      piezaId: input.piezaId,
      tipo: "retiro_ot",
      cantidad: input.cantidad,
      usuarioId: input.usuarioId,
      observacion: [otCodigo ? `Para ${otCodigo}` : null, input.observacion?.trim() || null].filter(Boolean).join(" — ") || null,
    });
  });
}

export type WipEtapa = { procesoNombre: string; cantidad: number };

/** WIP en vivo de UNA pieza puntual — para la búsqueda de /stock. Sin riesgo
 * de N+1: una pieza tiene a lo sumo un puñado de OT de pieza abiertas. */
export async function getWipEnCursoDePieza(piezaId: string): Promise<WipEtapa[]> {
  const rutaRows = await db
    .select({ id: operacion.id, secuencia: operacion.secuencia, procesoId: proceso.id, procesoNombre: proceso.nombre, tipo: proceso.tipo })
    .from(operacion)
    .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
    .where(eq(operacion.piezaId, piezaId))
    .orderBy(asc(operacion.secuencia));
  if (rutaRows.length === 0) return [];

  const otPiezas = await db.select().from(otPieza).where(eq(otPieza.piezaId, piezaId));
  if (otPiezas.length === 0) return [];

  const otPiezaIds = otPiezas.map((p) => p.id);
  const completadasRows = await db
    .select({ otPiezaId: registroOperacion.otPiezaId, operacionId: registroOperacion.operacionId })
    .from(registroOperacion)
    .where(
      and(inArray(registroOperacion.otPiezaId, otPiezaIds), eq(registroOperacion.tipo, "ejecucion"), isNotNull(registroOperacion.fin)),
    );

  const completadasPorOtPieza = new Map<string, Set<string>>();
  for (const c of completadasRows) {
    const set = completadasPorOtPieza.get(c.otPiezaId) ?? new Set<string>();
    set.add(c.operacionId);
    completadasPorOtPieza.set(c.otPiezaId, set);
  }

  const acumulado = new Map<string, WipEtapa>();
  for (const otp of otPiezas) {
    const completadas = completadasPorOtPieza.get(otp.id) ?? new Set<string>();
    if (completadas.size >= rutaRows.length || otp.estadoManual === "terminada") continue; // terminada — ya pasó a stock "Finalizado"
    const actual = rutaRows.find((op) => !completadas.has(op.id));
    if (!actual || actual.tipo === "compras") continue; // esperando compra: va en Compras, no en fabricación
    const acc = acumulado.get(actual.procesoId) ?? { procesoNombre: actual.procesoNombre, cantidad: 0 };
    acc.cantidad += otp.cantidadAFabricar;
    acumulado.set(actual.procesoId, acc);
  }
  return [...acumulado.values()];
}

export async function getWipTotalEnCursoDePieza(piezaId: string): Promise<number> {
  const etapas = await getWipEnCursoDePieza(piezaId);
  return etapas.reduce((sum, e) => sum + e.cantidad, 0);
}

export type WipEtapaResumen = { procesoId: string; procesoNombre: string; piezas: number; unidades: number };

/**
 * Mismo cálculo que getColaPorCentroTrabajo (src/lib/data/produccion.ts) —
 * 3 consultas siempre, sin importar cuántas OT de pieza haya — pero
 * agrupado por proceso/etapa en vez de por centro de trabajo, y quedándose
 * sólo con la etapa ACTUAL de cada OT (no toda la ruta restante).
 */
export async function getResumenWipEnCursoPorProceso(): Promise<WipEtapaResumen[]> {
  const filas = await db.select({ otPieza, piezaId: pieza.id }).from(otPieza).innerJoin(pieza, eq(pieza.id, otPieza.piezaId));
  if (filas.length === 0) return [];

  const piezaIds = [...new Set(filas.map((f) => f.piezaId))];
  const otPiezaIds = filas.map((f) => f.otPieza.id);

  const [rutaRows, completadasRows] = await Promise.all([
    db
      .select({
        piezaId: operacion.piezaId,
        id: operacion.id,
        secuencia: operacion.secuencia,
        procesoId: proceso.id,
        procesoNombre: proceso.nombre,
        tipo: proceso.tipo,
      })
      .from(operacion)
      .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
      .where(inArray(operacion.piezaId, piezaIds))
      .orderBy(asc(operacion.piezaId), asc(operacion.secuencia)),
    db
      .select({ otPiezaId: registroOperacion.otPiezaId, operacionId: registroOperacion.operacionId })
      .from(registroOperacion)
      .where(
        and(inArray(registroOperacion.otPiezaId, otPiezaIds), eq(registroOperacion.tipo, "ejecucion"), isNotNull(registroOperacion.fin)),
      ),
  ]);

  const rutaPorPieza = new Map<string, { id: string; procesoId: string; procesoNombre: string; tipo: string }[]>();
  for (const r of rutaRows) {
    const arr = rutaPorPieza.get(r.piezaId) ?? [];
    arr.push({ id: r.id, procesoId: r.procesoId, procesoNombre: r.procesoNombre, tipo: r.tipo });
    rutaPorPieza.set(r.piezaId, arr);
  }

  const completadasPorOtPieza = new Map<string, Set<string>>();
  for (const c of completadasRows) {
    const set = completadasPorOtPieza.get(c.otPiezaId) ?? new Set<string>();
    set.add(c.operacionId);
    completadasPorOtPieza.set(c.otPiezaId, set);
  }

  const acumulado = new Map<string, { procesoNombre: string; piezas: Set<string>; unidades: number }>();
  for (const fila of filas) {
    const routing = rutaPorPieza.get(fila.piezaId) ?? [];
    if (routing.length === 0) continue;
    const completadas = completadasPorOtPieza.get(fila.otPieza.id) ?? new Set<string>();
    if (completadas.size >= routing.length || fila.otPieza.estadoManual === "terminada") continue;
    const actual = routing.find((op) => !completadas.has(op.id));
    if (!actual || actual.tipo === "compras") continue; // esperando compra: va en Compras, no en fabricación

    const acc = acumulado.get(actual.procesoId) ?? { procesoNombre: actual.procesoNombre, piezas: new Set<string>(), unidades: 0 };
    acc.piezas.add(fila.piezaId);
    acc.unidades += fila.otPieza.cantidadAFabricar;
    acumulado.set(actual.procesoId, acc);
  }

  return [...acumulado.entries()].map(([procesoId, v]) => ({
    procesoId,
    procesoNombre: v.procesoNombre,
    piezas: v.piezas.size,
    unidades: v.unidades,
  }));
}

export type ItemEnEtapa = {
  otPiezaId: string;
  otPiezaCodigo: string;
  piezaId: string;
  piezaCodigo: string;
  piezaNombre: string;
  conjuntoNombre: string;
  tipo: "fabricada" | "comprada";
  otMaquinaId: string;
  otMaquinaCodigo: string;
  procesoNombre: string;
  cantidad: number;
};

/**
 * Detalle pieza por pieza de lo que está en proceso — antes de esto, el
 * número de "En proceso ahora mismo, por etapa" no tenía ningún lugar
 * donde ver QUÉ piezas lo componen (pedido de Matías: "no tenemos el
 * detalle del stock en ningún lado"). Sin `procesoId` trae TODO lo que
 * está en proceso (cualquier etapa); con `procesoId` filtra a una sola
 * etapa puntual. Acepta además los filtros de conjunto/máquina/tipo
 * (devolución del cliente: "el listado de piezas es difícil de
 * visualizar"). Mismo cálculo batcheado que getResumenWipEnCursoPorProceso,
 * sin agregar al final.
 */
export async function getPiezasEnProceso(procesoId?: string, filtros: FiltrosStock = {}): Promise<ItemEnEtapa[]> {
  const condiciones = [];
  if (filtros.conjuntoId) condiciones.push(eq(pieza.conjuntoId, filtros.conjuntoId));
  if (filtros.tipo) condiciones.push(eq(pieza.tipo, filtros.tipo));

  const piezaIdsPermitidos = filtros.configuracionId ? await piezaIdsDeConfiguracion(filtros.configuracionId) : null;

  const filas = await db
    .select({
      otPieza,
      piezaId: pieza.id,
      piezaCodigo: pieza.codigo,
      piezaNombre: pieza.nombre,
      conjuntoNombre: conjunto.nombre,
      tipo: pieza.tipo,
      otMaquinaId: otMaquina.id,
      otMaquinaCodigo: otMaquina.codigo,
    })
    .from(otPieza)
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(conjunto, eq(conjunto.id, pieza.conjuntoId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .where(condiciones.length ? and(...condiciones) : undefined);
  if (filas.length === 0) return [];

  const piezaIds = [...new Set(filas.map((f) => f.piezaId))];
  const otPiezaIds = filas.map((f) => f.otPieza.id);

  const [rutaRows, completadasRows] = await Promise.all([
    db
      .select({ piezaId: operacion.piezaId, id: operacion.id, secuencia: operacion.secuencia, procesoId: proceso.id, procesoNombre: proceso.nombre, tipo: proceso.tipo })
      .from(operacion)
      .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
      .where(inArray(operacion.piezaId, piezaIds))
      .orderBy(asc(operacion.piezaId), asc(operacion.secuencia)),
    db
      .select({ otPiezaId: registroOperacion.otPiezaId, operacionId: registroOperacion.operacionId })
      .from(registroOperacion)
      .where(
        and(inArray(registroOperacion.otPiezaId, otPiezaIds), eq(registroOperacion.tipo, "ejecucion"), isNotNull(registroOperacion.fin)),
      ),
  ]);

  const rutaPorPieza = new Map<string, { id: string; procesoId: string; procesoNombre: string; tipo: string }[]>();
  for (const r of rutaRows) {
    const arr = rutaPorPieza.get(r.piezaId) ?? [];
    arr.push({ id: r.id, procesoId: r.procesoId, procesoNombre: r.procesoNombre, tipo: r.tipo });
    rutaPorPieza.set(r.piezaId, arr);
  }

  const completadasPorOtPieza = new Map<string, Set<string>>();
  for (const c of completadasRows) {
    const set = completadasPorOtPieza.get(c.otPiezaId) ?? new Set<string>();
    set.add(c.operacionId);
    completadasPorOtPieza.set(c.otPiezaId, set);
  }

  const resultado: ItemEnEtapa[] = [];
  for (const fila of filas) {
    const routing = rutaPorPieza.get(fila.piezaId) ?? [];
    if (routing.length === 0) continue;
    const completadas = completadasPorOtPieza.get(fila.otPieza.id) ?? new Set<string>();
    if (completadas.size >= routing.length || fila.otPieza.estadoManual === "terminada") continue;
    const actual = routing.find((op) => !completadas.has(op.id));
    if (!actual || actual.tipo === "compras" || (procesoId && actual.procesoId !== procesoId)) continue;
    if (piezaIdsPermitidos && !piezaIdsPermitidos.has(fila.piezaId)) continue;

    resultado.push({
      otPiezaId: fila.otPieza.id,
      otPiezaCodigo: fila.otPieza.codigo,
      piezaId: fila.piezaId,
      piezaCodigo: fila.piezaCodigo,
      piezaNombre: fila.piezaNombre,
      conjuntoNombre: fila.conjuntoNombre,
      tipo: fila.tipo,
      otMaquinaId: fila.otMaquinaId,
      otMaquinaCodigo: fila.otMaquinaCodigo,
      procesoNombre: actual.procesoNombre,
      cantidad: fila.otPieza.cantidadAFabricar,
    });
  }
  return resultado;
}

/**
 * Ajuste manual del stock disponible ("Finalizado") de una pieza — pedido de
 * Horacio en la devolución del 2026-09-19 ("que Horacio también pueda
 * modificar el stock de ser necesario", docs/05-backlog-release-2.md §3).
 *
 * Es el primer lugar de toda la app que escribe en `stock_pieza` y
 * `movimiento_stock` — hasta ahora ambas tablas sólo se leían: el stock
 * migrado de los Excel es una foto fija, cerrar una operación en taller
 * todavía no la actualiza (eso es la próxima pieza natural de este backlog,
 * no estaba pedida todavía). El ajuste no reemplaza el número sin dejar
 * rastro: guarda el delta en `movimiento_stock` (tipo "ajuste") para que
 * quede quién lo cambió y por qué, y recién después actualiza el saldo.
 */
export async function ajustarStock(input: {
  piezaId: string;
  cantidadNueva: number;
  observacion?: string;
  usuarioId: string;
}): Promise<void> {
  const actual = await getStockDisponible(input.piezaId);
  const delta = input.cantidadNueva - actual;
  if (delta === 0) return;

  await db.transaction(async (tx) => {
    await tx
      .insert(stockPieza)
      .values({ piezaId: input.piezaId, cantidadDisponible: input.cantidadNueva })
      .onConflictDoUpdate({ target: stockPieza.piezaId, set: { cantidadDisponible: input.cantidadNueva, updatedAt: new Date() } });
    await tx.insert(movimientoStock).values({
      piezaId: input.piezaId,
      tipo: "ajuste",
      cantidad: delta,
      usuarioId: input.usuarioId,
      observacion: input.observacion,
    });
  });
}

/** Métricas generales para el panel de /stock — pedido de Matías/Julián:
 * la pantalla no puede abrir en blanco con sólo un buscador, tiene que dar
 * una imagen general accionable de entrada. */
export async function getResumenStockGeneral(): Promise<{ piezasConStock: number; unidadesFinalizadas: number; unidadesComprometidas: number }> {
  const [rows, comprometido] = await Promise.all([
    db.select({ piezaId: stockPieza.piezaId, cantidad: stockPieza.cantidadDisponible }).from(stockPieza),
    getComprometidoBatch(),
  ]);
  return {
    piezasConStock: rows.filter((r) => r.cantidad > 0).length,
    unidadesFinalizadas: rows.reduce((sum, r) => sum + r.cantidad, 0),
    unidadesComprometidas: rows.reduce((sum, r) => sum + Math.min(r.cantidad, comprometido.get(r.piezaId) ?? 0), 0),
  };
}

export type PiezaFinalizada = {
  piezaId: string;
  piezaCodigo: string;
  piezaNombre: string;
  conjuntoNombre: string;
  tipo: "fabricada" | "comprada";
  disponible: number;
  comprometido: number;
};

/** Detalle pieza por pieza de lo "Finalizado" — mismo motivo que
 * getPiezasEnProceso: la métrica agregada de /stock no tenía ningún lugar
 * adonde ir a ver qué la compone. Acepta los mismos filtros que
 * getPiezasEnProceso (conjunto, máquina, tipo) para poder acotar el listado. */
export async function getPiezasFinalizadas(filtros: FiltrosStock = {}): Promise<PiezaFinalizada[]> {
  const condiciones = [gt(stockPieza.cantidadDisponible, 0)];
  if (filtros.conjuntoId) condiciones.push(eq(pieza.conjuntoId, filtros.conjuntoId));
  if (filtros.tipo) condiciones.push(eq(pieza.tipo, filtros.tipo));

  const piezaIdsPermitidos = filtros.configuracionId ? await piezaIdsDeConfiguracion(filtros.configuracionId) : null;

  const [rows, comprometido] = await Promise.all([
    db
      .select({
        piezaId: pieza.id,
        piezaCodigo: pieza.codigo,
        piezaNombre: pieza.nombre,
        conjuntoNombre: conjunto.nombre,
        tipo: pieza.tipo,
        disponible: stockPieza.cantidadDisponible,
      })
      .from(stockPieza)
      .innerJoin(pieza, eq(pieza.id, stockPieza.piezaId))
      .innerJoin(conjunto, eq(conjunto.id, pieza.conjuntoId))
      .where(and(...condiciones)),
    getComprometidoBatch(),
  ]);

  return rows
    .filter((r) => !piezaIdsPermitidos || piezaIdsPermitidos.has(r.piezaId))
    .map((r) => ({ ...r, comprometido: Math.min(r.disponible, comprometido.get(r.piezaId) ?? 0) }))
    .sort((a, b) => b.disponible - a.disponible);
}

export type PiezaStockBajo = { piezaId: string; piezaCodigo: string; piezaNombre: string; disponible: number; minimo: number };

/** Piezas con stock disponible por debajo de su mínimo (RF sugerido, Fase 2). */
export async function getPiezasStockBajo(): Promise<PiezaStockBajo[]> {
  return db
    .select({
      piezaId: pieza.id,
      piezaCodigo: pieza.codigo,
      piezaNombre: pieza.nombre,
      disponible: stockPieza.cantidadDisponible,
      minimo: pieza.stockMinimo,
    })
    .from(pieza)
    .innerJoin(stockPieza, eq(stockPieza.piezaId, pieza.id))
    .where(lt(stockPieza.cantidadDisponible, pieza.stockMinimo));
}
