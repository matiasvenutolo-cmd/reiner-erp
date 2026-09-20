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
import { centroTrabajo, otPieza, otConjunto, otMaquina, pieza, conjunto, operacion, proceso, registroOperacion } from "@/lib/db/schema";
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
  otMaquinaCodigo: string;
  procesoNombre: string;
  operacionSecuencia: number;
  totalOperaciones: number;
};

export type ColaCentro = { centro: CentroTrabajo; disponibleAhora: ItemCola[]; aFuturo: ItemCola[] };

type PasoRuta = { id: string; secuencia: number; procesoNombre: string; centroTrabajoId: string | null };

/**
 * Trae TODO lo que hace falta en 3 queries (independiente de cuántas OT de
 * pieza haya) y arma la cola en memoria. La primera versión llamaba a
 * `getEstadoYOperacionActual` una vez por pieza dentro de un for-loop — con
 * los cientos de OT de pieza que ya hay sembradas, eso tardaba más de 60s y
 * hacía fallar el build (Next intenta prerenderizar la página en build time).
 * Evitar el N+1 acá importa tanto para el build como para que la pantalla
 * cargue rápido en producción.
 */
export async function getColaPorCentroTrabajo(): Promise<ColaCentro[]> {
  const centros = await getCentrosTrabajo();
  const porCentro = new Map<string, ColaCentro>(centros.map((c) => [c.id, { centro: c, disponibleAhora: [], aFuturo: [] }]));

  const filas = await db
    .select({
      otPieza,
      piezaNombre: pieza.nombre,
      piezaCodigo: pieza.codigo,
      conjuntoNombre: conjunto.nombre,
      otMaquinaCodigo: otMaquina.codigo,
    })
    .from(otPieza)
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(conjunto, eq(conjunto.id, pieza.conjuntoId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .orderBy(asc(otPieza.prioridad), asc(otPieza.createdAt));

  if (filas.length === 0) return centros.map((c) => porCentro.get(c.id)!);

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
    arr.push({ id: r.id, secuencia: r.secuencia, procesoNombre: r.procesoNombre, centroTrabajoId: r.centroTrabajoId });
    rutaPorPieza.set(r.piezaId, arr);
  }

  const completadasPorOtPieza = new Map<string, Set<string>>();
  for (const c of completadasRows) {
    const set = completadasPorOtPieza.get(c.otPiezaId) ?? new Set<string>();
    set.add(c.operacionId);
    completadasPorOtPieza.set(c.otPiezaId, set);
  }

  for (const fila of filas) {
    const routing = rutaPorPieza.get(fila.otPieza.piezaId) ?? [];
    if (routing.length === 0) continue; // sin hoja de ruta — no aparece en ninguna cola

    const completadas = completadasPorOtPieza.get(fila.otPieza.id) ?? new Set<string>();
    if (completadas.size >= routing.length) continue; // terminada

    const posActual = routing.findIndex((op) => !completadas.has(op.id));
    if (posActual === -1) continue;

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
        otMaquinaCodigo: fila.otMaquinaCodigo,
        procesoNombre: op.procesoNombre,
        operacionSecuencia: op.secuencia,
        totalOperaciones: routing.length,
      });
    }
  }

  return centros.map((c) => porCentro.get(c.id)!);
}

/** Reordena manualmente la cola de "disponible ahora" de un centro (pedido de
 * Horacio: "que se puedan ordenar según cuál se quiere hacer primero").
 * Renumera toda la cola visible como enteros secuenciales en vez de sólo
 * intercambiar el valor con el vecino — así el cambio se nota aunque haya
 * empates de prioridad, que es el caso normal (todas las piezas arrancan en 0). */
export async function moverPrioridad(otPiezaId: string, centroTrabajoId: string, direccion: "subir" | "bajar"): Promise<void> {
  const colas = await getColaPorCentroTrabajo();
  const cola = colas.find((c) => c.centro.id === centroTrabajoId);
  if (!cola) return;

  const lista = [...cola.disponibleAhora];
  const idx = lista.findIndex((item) => item.otPieza.id === otPiezaId);
  if (idx === -1) return;
  const vecinoIdx = direccion === "subir" ? idx - 1 : idx + 1;
  if (vecinoIdx < 0 || vecinoIdx >= lista.length) return;

  [lista[idx], lista[vecinoIdx]] = [lista[vecinoIdx], lista[idx]];
  await Promise.all(lista.map((item, i) => db.update(otPieza).set({ prioridad: i }).where(eq(otPieza.id, item.otPieza.id))));
}
