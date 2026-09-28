/**
 * Cola de producción por centro de trabajo (Release 2, pedido de Horacio —
 * docs/05-backlog-release-2.md §1, §3): "visualización por centros de
 * trabajo, cantidad de tareas disponibles al momento y futuras tareas
 * disponibles (que dependen de un proceso anterior finalizado), que puedan
 * ser ordenadas según cuál se quiere hacer primero".
 *
 * Regla de "ahora" vs "a futuro": para cada OT de pieza abierta se ubica su
 * operación actual (ver getEstadoYOperacionActual en ./ot) dentro de su hoja
 * de ruta. El centro de esa operación la tiene "disponible ahora"; el centro
 * de cualquier operación posterior en la misma hoja de ruta la tiene "a
 * futuro" (todavía depende de que termine lo que viene antes).
 */
import { asc, eq, and, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  centroTrabajo,
  otPieza,
  otConjunto,
  otMaquina,
  pieza,
  conjunto,
  operacion,
  proceso,
  registroOperacion,
  stockPieza,
} from "@/lib/db/schema";
import type { CentroTrabajo, OtPieza } from "@/lib/db/schema";

export async function getCentrosTrabajo(): Promise<CentroTrabajo[]> {
  return db.select().from(centroTrabajo).orderBy(asc(centroTrabajo.orden));
}

export async function getCentroTrabajo(id: string): Promise<CentroTrabajo | undefined> {
  const [row] = await db.select().from(centroTrabajo).where(eq(centroTrabajo.id, id));
  return row;
}

export type ItemCola = {
  otPieza: OtPieza;
  piezaNombre: string;
  piezaCodigo: string;
  conjuntoNombre: string;
  otMaquinaId: string;
  otMaquinaCodigo: string;
  procesoNombre: string;
  operacionSecuencia: number;
  totalOperaciones: number;
};

export type ColaCentro = { centro: CentroTrabajo; disponibleAhora: ItemCola[]; aFuturo: ItemCola[] };

type PasoRuta = { id: string; secuencia: number; procesoNombre: string; centroTrabajoId: string | null; tipo: "interno" | "tercerizado" | "compras" };

type FilaOtPieza = {
  otPieza: OtPieza;
  piezaNombre: string;
  piezaCodigo: string;
  conjuntoNombre: string;
  otMaquinaId: string;
  otMaquinaCodigo: string;
};

/**
 * Trae TODO lo que hace falta en 3 queries (independiente de cuántas OT de
 * pieza haya) y ubica, para cada OT de pieza todavía abierta, en qué paso de
 * su hoja de ruta está parada. La primera versión de `getColaPorCentroTrabajo`
 * llamaba a `getEstadoYOperacionActual` una vez por pieza dentro de un
 * for-loop — con los cientos de OT de pieza que ya hay sembradas, eso
 * tardaba más de 60s y hacía fallar el build (Next intenta prerenderizar la
 * página en build time). Evitar el N+1 acá importa tanto para el build como
 * para que las pantallas que la usan (`getColaPorCentroTrabajo` y
 * `getPiezasCompraPendientes`) carguen rápido en producción.
 */
async function getFilasConPosicionActual(): Promise<{ fila: FilaOtPieza; routing: PasoRuta[]; posActual: number }[]> {
  const filas = await db
    .select({
      otPieza,
      piezaNombre: pieza.nombre,
      piezaCodigo: pieza.codigo,
      conjuntoNombre: conjunto.nombre,
      otMaquinaId: otMaquina.id,
      otMaquinaCodigo: otMaquina.codigo,
    })
    .from(otPieza)
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(conjunto, eq(conjunto.id, pieza.conjuntoId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .orderBy(asc(otPieza.prioridad), asc(otPieza.createdAt));

  if (filas.length === 0) return [];

  const piezaIds = [...new Set(filas.map((f) => f.otPieza.piezaId))];
  const otPiezaIds = filas.map((f) => f.otPieza.id);

  const [rutaRows, completadasRows] = await Promise.all([
    db
      .select({
        piezaId: operacion.piezaId,
        id: operacion.id,
        secuencia: operacion.secuencia,
        procesoNombre: proceso.nombre,
        centroTrabajoId: proceso.centroTrabajoId,
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
        and(
          inArray(registroOperacion.otPiezaId, otPiezaIds),
          eq(registroOperacion.tipo, "ejecucion"),
          isNotNull(registroOperacion.fin),
        ),
      ),
  ]);

  const rutaPorPieza = new Map<string, PasoRuta[]>();
  for (const r of rutaRows) {
    const arr = rutaPorPieza.get(r.piezaId) ?? [];
    arr.push({ id: r.id, secuencia: r.secuencia, procesoNombre: r.procesoNombre, centroTrabajoId: r.centroTrabajoId, tipo: r.tipo });
    rutaPorPieza.set(r.piezaId, arr);
  }

  const completadasPorOtPieza = new Map<string, Set<string>>();
  for (const c of completadasRows) {
    const set = completadasPorOtPieza.get(c.otPiezaId) ?? new Set<string>();
    set.add(c.operacionId);
    completadasPorOtPieza.set(c.otPiezaId, set);
  }

  const resultado: { fila: FilaOtPieza; routing: PasoRuta[]; posActual: number }[] = [];
  for (const fila of filas) {
    const routing = rutaPorPieza.get(fila.otPieza.piezaId) ?? [];
    if (routing.length === 0) continue; // sin hoja de ruta — no aparece en ninguna cola

    const completadas = completadasPorOtPieza.get(fila.otPieza.id) ?? new Set<string>();
    if (completadas.size >= routing.length) continue; // terminada

    const posActual = routing.findIndex((op) => !completadas.has(op.id));
    if (posActual === -1) continue;

    resultado.push({ fila, routing, posActual });
  }
  return resultado;
}

export async function getColaPorCentroTrabajo(): Promise<ColaCentro[]> {
  const centros = await getCentrosTrabajo();
  const porCentro = new Map<string, ColaCentro>(centros.map((c) => [c.id, { centro: c, disponibleAhora: [], aFuturo: [] }]));

  const filasConPosicion = await getFilasConPosicionActual();

  for (const { fila, routing, posActual } of filasConPosicion) {
    for (let i = posActual; i < routing.length; i++) {
      const op = routing[i];
      if (!op.centroTrabajoId) continue; // proceso sin centro asignado — no aparece en ninguna cola
      const cola = porCentro.get(op.centroTrabajoId);
      if (!cola) continue; // centro borrado o inconsistente — se ignora, no rompe la pantalla

      // Una hoja de ruta puede pasar dos veces por el mismo centro (ej. un
      // repaso de Torno más adelante) — no listar la pieza dos veces en la
      // misma cola, sólo en su primera aparición.
      const destino = i === posActual ? cola.disponibleAhora : cola.aFuturo;
      if (destino.some((it) => it.otPieza.id === fila.otPieza.id)) continue;

      destino.push({
        otPieza: fila.otPieza,
        piezaNombre: fila.piezaNombre,
        piezaCodigo: fila.piezaCodigo,
        conjuntoNombre: fila.conjuntoNombre,
        otMaquinaId: fila.otMaquinaId,
        otMaquinaCodigo: fila.otMaquinaCodigo,
        procesoNombre: op.procesoNombre,
        operacionSecuencia: op.secuencia,
        totalOperaciones: routing.length,
      });
    }
  }

  return centros.map((c) => porCentro.get(c.id)!);
}

/** Reordena la cola completa de "disponible ahora" de un centro a partir del
 * arrastre en la UI (Release 3 — reemplaza las flechas de subir/bajar de
 * Release 2, pedido explícito del cliente: "sería mucho mejor poder agarrar
 * y arrastrar los elementos para modificar el orden de prioridad"). Se
 * renumera toda la lista como enteros secuenciales en el orden recibido —
 * así el cambio se nota aunque haya empates de prioridad, que es el caso
 * normal (todas las piezas arrancan en 0). */
export async function reordenarCola(centroTrabajoId: string, ordenOtPiezaIds: string[]): Promise<void> {
  void centroTrabajoId; // la prioridad es global por OT de pieza, no por centro — se mantiene el parámetro por claridad de la acción que la llama
  await Promise.all(ordenOtPiezaIds.map((id, i) => db.update(otPieza).set({ prioridad: i }).where(eq(otPieza.id, id))));
}

export type ItemCompraPendiente = {
  otPiezaId: string;
  otPiezaCodigo: string;
  piezaCodigo: string;
  piezaNombre: string;
  conjuntoNombre: string;
  otMaquinaId: string;
  otMaquinaCodigo: string;
  detalle: string;
};

/**
 * Piezas de compra (Release 3, docs/06-backlog-release-3.md §13, y la
 * devolución del cliente sobre no confundir Compras con tercerizados): junta
 * dos casos, distintos pero con el mismo problema de visibilidad — ninguno
 * de los dos tiene centro de trabajo, así que ninguno aparecía en ningún
 * lado antes de esto.
 *
 * 1. Piezas enteras `comprada` (nunca se fabrican) cuyo stock actual todavía
 *    no alcanza lo que su OT necesita.
 * 2. Piezas `fabricada` cuyo paso ACTUAL de la hoja de ruta es un proceso
 *    `compras` (ej. falta comprar la materia prima antes de arrancar el
 *    mecanizado) — se apoya en `getFilasConPosicionActual`, la misma base
 *    que usa `getColaPorCentroTrabajo`.
 */
export async function getPiezasCompraPendientes(): Promise<ItemCompraPendiente[]> {
  const filasCompradas = await db
    .select({
      otPiezaId: otPieza.id,
      otPiezaCodigo: otPieza.codigo,
      piezaCodigo: pieza.codigo,
      piezaNombre: pieza.nombre,
      conjuntoNombre: conjunto.nombre,
      otMaquinaId: otMaquina.id,
      otMaquinaCodigo: otMaquina.codigo,
      cantidadNecesaria: otPieza.cantidadNecesaria,
      disponible: stockPieza.cantidadDisponible,
    })
    .from(otPieza)
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(conjunto, eq(conjunto.id, pieza.conjuntoId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .leftJoin(stockPieza, eq(stockPieza.piezaId, pieza.id))
    .where(eq(pieza.tipo, "comprada"))
    .orderBy(asc(otMaquina.codigo));

  const piezasComprada: ItemCompraPendiente[] = filasCompradas
    .map((f) => ({ ...f, disponible: f.disponible ?? 0 }))
    .filter((f) => f.disponible < f.cantidadNecesaria)
    .map((f) => ({
      otPiezaId: f.otPiezaId,
      otPiezaCodigo: f.otPiezaCodigo,
      piezaCodigo: f.piezaCodigo,
      piezaNombre: f.piezaNombre,
      conjuntoNombre: f.conjuntoNombre,
      otMaquinaId: f.otMaquinaId,
      otMaquinaCodigo: f.otMaquinaCodigo,
      detalle: `faltan ${f.cantidadNecesaria - f.disponible} de ${f.cantidadNecesaria}`,
    }));

  const filasConPosicion = await getFilasConPosicionActual();
  const piezasMaterialPendiente: ItemCompraPendiente[] = filasConPosicion
    .filter(({ routing, posActual }) => routing[posActual].tipo === "compras")
    .map(({ fila }) => ({
      otPiezaId: fila.otPieza.id,
      otPiezaCodigo: fila.otPieza.codigo,
      piezaCodigo: fila.piezaCodigo,
      piezaNombre: fila.piezaNombre,
      conjuntoNombre: fila.conjuntoNombre,
      otMaquinaId: fila.otMaquinaId,
      otMaquinaCodigo: fila.otMaquinaCodigo,
      detalle: `${fila.otPieza.cantidadAFabricar} u. esperando compra de material para arrancar`,
    }));

  return [...piezasComprada, ...piezasMaterialPendiente];
}
