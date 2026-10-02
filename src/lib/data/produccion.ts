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
import { asc, eq, and, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  centroTrabajo,
  usuarioCentroTrabajo,
  otPieza,
  otConjunto,
  otMaquina,
  pieza,
  conjunto,
  operacion,
  proceso,
  registroOperacion,
  stockPieza,
  remito,
  remitoItem,
} from "@/lib/db/schema";
import type { CentroTrabajo, OtPieza } from "@/lib/db/schema";

export async function getCentrosTrabajo(): Promise<CentroTrabajo[]> {
  return db.select().from(centroTrabajo).orderBy(asc(centroTrabajo.orden));
}

export async function getCentroTrabajo(id: string): Promise<CentroTrabajo | undefined> {
  const [row] = await db.select().from(centroTrabajo).where(eq(centroTrabajo.id, id));
  return row;
}

/**
 * Centros de trabajo de un operario — reemplaza el viejo `usuario.centroTrabajoId`
 * (FK único). Devolución del cliente (2ª ronda, pregunta 4 de Fase 2): "un
 * operario puede ocupar dos puestos, un puesto de trabajo puede ser ocupado
 * por dos operarios también" — de varios a varios, no 1 a 1.
 */
export async function getCentrosDeUsuario(usuarioId: string): Promise<CentroTrabajo[]> {
  const rows = await db
    .select({ centro: centroTrabajo })
    .from(usuarioCentroTrabajo)
    .innerJoin(centroTrabajo, eq(centroTrabajo.id, usuarioCentroTrabajo.centroTrabajoId))
    .where(eq(usuarioCentroTrabajo.usuarioId, usuarioId))
    .orderBy(asc(centroTrabajo.orden));
  return rows.map((r) => r.centro);
}

/** Batcheado para pantallas con varios usuarios a la vez (ej. /usuarios) — evita N+1. */
export async function getCentrosDeUsuariosBatch(usuarioIds: string[]): Promise<Map<string, CentroTrabajo[]>> {
  const resultado = new Map<string, CentroTrabajo[]>();
  if (usuarioIds.length === 0) return resultado;
  const rows = await db
    .select({ usuarioId: usuarioCentroTrabajo.usuarioId, centro: centroTrabajo })
    .from(usuarioCentroTrabajo)
    .innerJoin(centroTrabajo, eq(centroTrabajo.id, usuarioCentroTrabajo.centroTrabajoId))
    .where(inArray(usuarioCentroTrabajo.usuarioId, usuarioIds))
    .orderBy(asc(centroTrabajo.orden));
  for (const r of rows) {
    const arr = resultado.get(r.usuarioId) ?? [];
    arr.push(r.centro);
    resultado.set(r.usuarioId, arr);
  }
  return resultado;
}

/** Reemplaza el conjunto completo de centros asignados a un operario — la
 * pantalla de /usuarios manda siempre la lista final marcada, no altas/bajas
 * puntuales, así que "borrar todo e insertar de nuevo" es más simple y
 * correcto que diffear. */
export async function asignarCentrosTrabajo(usuarioId: string, centroTrabajoIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(usuarioCentroTrabajo).where(eq(usuarioCentroTrabajo.usuarioId, usuarioId));
    if (centroTrabajoIds.length > 0) {
      await tx.insert(usuarioCentroTrabajo).values(centroTrabajoIds.map((centroTrabajoId) => ({ usuarioId, centroTrabajoId })));
    }
  });
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

type PasoRuta = {
  id: string;
  secuencia: number;
  procesoNombre: string;
  /** Detalle de la operación si ingeniería lo cargó (ej. "CNC – desbaste"), si no el proceso. */
  nombre: string;
  centroTrabajoId: string | null;
  tipo: "interno" | "tercerizado" | "compras";
};

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
        descripcion: operacion.descripcion,
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
    arr.push({
      id: r.id,
      secuencia: r.secuencia,
      procesoNombre: r.procesoNombre,
      nombre: r.descripcion?.trim() || r.procesoNombre,
      centroTrabajoId: r.centroTrabajoId,
      tipo: r.tipo,
    });
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

  // Sólo lo que ingeniería ya envió a producción: lo demás todavía no es trabajo de taller.
  const filasConPosicion = (await getFilasConPosicionActual()).filter(({ fila }) => fila.otPieza.enviadaProduccionAt);

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
  /** Unidades a comprar (pieza comprada) o a abastecer de material (fabricada). */
  cantidad: number;
  /** Paso de Compras a cerrar cuando llega el material — null si es una pieza comprada entera. */
  operacionCompraId: string | null;
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
      cantidad: f.cantidadNecesaria - f.disponible,
      operacionCompraId: null,
    }));

  const filasConPosicion = await getFilasConPosicionActual();
  const piezasMaterialPendiente: ItemCompraPendiente[] = filasConPosicion
    .filter(({ routing, posActual }) => routing[posActual].tipo === "compras")
    .map(({ fila, routing, posActual }) => ({
      otPiezaId: fila.otPieza.id,
      otPiezaCodigo: fila.otPieza.codigo,
      piezaCodigo: fila.piezaCodigo,
      piezaNombre: fila.piezaNombre,
      conjuntoNombre: fila.conjuntoNombre,
      otMaquinaId: fila.otMaquinaId,
      otMaquinaCodigo: fila.otMaquinaCodigo,
      detalle: `${fila.otPieza.cantidadAFabricar} u. esperando compra de material para arrancar`,
      cantidad: fila.otPieza.cantidadAFabricar,
      operacionCompraId: routing[posActual].id,
    }));

  return [...piezasComprada, ...piezasMaterialPendiente];
}

export type ItemAfueraTercerizado = {
  otPiezaId: string;
  otPiezaCodigo: string;
  piezaId: string;
  piezaCodigo: string;
  piezaNombre: string;
  otMaquinaId: string;
  otMaquinaCodigo: string;
  procesoNombre: string;
  operacionId: string;
  cantidad: number;
  /** Remito con el que salió a este paso tercerizado — null si todavía está en planta, lista para mandar. */
  remito: { id: string; numero: number; fecha: Date; destino: string } | null;
};

/** OT de pieza cuyo paso actual es un proceso tercerizado: o lista para
 * mandar (sin remito todavía) o afuera esperando volver. Una fila por OT de
 * pieza para poder mandar y registrar la vuelta de cada una. Salió si hay un
 * remito con esa OT de pieza posterior a que llegara a este paso. */
export async function getPiezasAfueraTercerizado(): Promise<ItemAfueraTercerizado[]> {
  const filas = (await getFilasConPosicionActual()).filter(({ routing, posActual }) => routing[posActual].tipo === "tercerizado");
  if (filas.length === 0) return [];
  const ids = filas.map((f) => f.fila.otPieza.id);
  const [remitos, cierres] = await Promise.all([
    db
      .select({ otPiezaId: remitoItem.otPiezaId, id: remito.id, numero: remito.numero, fecha: remito.fecha, destino: remito.destino })
      .from(remitoItem)
      .innerJoin(remito, eq(remito.id, remitoItem.remitoId))
      .where(inArray(remitoItem.otPiezaId, ids)),
    db
      .select({ otPiezaId: registroOperacion.otPiezaId, fin: registroOperacion.fin })
      .from(registroOperacion)
      .where(and(inArray(registroOperacion.otPiezaId, ids), isNotNull(registroOperacion.fin))),
  ]);
  const llegoAlPaso = new Map<string, number>();
  for (const c of cierres) llegoAlPaso.set(c.otPiezaId, Math.max(llegoAlPaso.get(c.otPiezaId) ?? 0, c.fin!.getTime()));

  return filas
    .map(({ fila, routing, posActual }) => ({
      otPiezaId: fila.otPieza.id,
      otPiezaCodigo: fila.otPieza.codigo,
      piezaId: fila.otPieza.piezaId,
      piezaCodigo: fila.piezaCodigo,
      piezaNombre: fila.piezaNombre,
      otMaquinaId: fila.otMaquinaId,
      otMaquinaCodigo: fila.otMaquinaCodigo,
      procesoNombre: routing[posActual].procesoNombre,
      operacionId: routing[posActual].id,
      cantidad: fila.otPieza.cantidadAFabricar,
      remito:
        remitos
          .filter((r) => r.otPiezaId === fila.otPieza.id && r.fecha.getTime() >= (llegoAlPaso.get(fila.otPieza.id) ?? 0))
          .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
          .map(({ id, numero, fecha, destino }) => ({ id, numero, fecha, destino }))[0] ?? null,
    }));
}

export type CandidataTaller = {
  otPieza: OtPieza;
  piezaNombre: string;
  conjuntoNombre: string;
  centroActualId: string | null;
  tipoPasoActual: "interno" | "tercerizado" | "compras";
  estado: "pendiente" | "en_curso";
  pasos: number;
};

/**
 * Lo que puede aparecer en `/taller`: OT de pieza abiertas, con el centro de
 * su paso actual. Antes la pantalla calculaba el estado pieza por pieza
 * (2-4 consultas por cada una de las ~500 OT de pieza) y tardaba 30-60s en
 * abrir — la pantalla del operario, la más usada de todas. Ahora son las
 * mismas 3 consultas batcheadas de `getFilasConPosicionActual` + 1 más.
 */
export async function getCandidatasTaller(): Promise<CandidataTaller[]> {
  const filas = (await getFilasConPosicionActual()).filter(({ fila }) => fila.otPieza.enviadaProduccionAt);
  if (filas.length === 0) return [];
  const abiertas = await db
    .select({ otPiezaId: registroOperacion.otPiezaId })
    .from(registroOperacion)
    .where(and(inArray(registroOperacion.otPiezaId, filas.map((f) => f.fila.otPieza.id)), isNull(registroOperacion.fin)));
  const conAbierta = new Set(abiertas.map((a) => a.otPiezaId));
  return filas.map(({ fila, routing, posActual }) => {
    const derivado = posActual > 0 || conAbierta.has(fila.otPieza.id) ? "en_curso" : "pendiente";
    return {
      otPieza: fila.otPieza,
      piezaNombre: fila.piezaNombre,
      conjuntoNombre: fila.conjuntoNombre,
      centroActualId: routing[posActual].centroTrabajoId,
      tipoPasoActual: routing[posActual].tipo,
      estado: derivado,
      pasos: routing.length,
    };
  });
}

export type PendienteDePlanificar = {
  otPiezaId: string;
  otPiezaCodigo: string;
  piezaNombre: string;
  otMaquinaId: string;
  otMaquinaCodigo: string;
  operacionId: string;
  operacionNombre: string;
  centroTrabajoId: string;
  cantidad: number;
  /** null si se puede hacer ya; si no, el paso anterior que tiene que terminar antes. */
  despuesDe: string | null;
};

/**
 * Lo que falta planificar: cada operación interna pendiente de cada OT de
 * pieza enviada a producción — la actual ("se puede hacer ya") y las que
 * vienen después ("después de …"), para poder planificar los días siguientes.
 * Una operación con asignación de hoy en adelante ya no aparece; si la
 * asignación quedó en un día pasado sin hacerse, vuelve a aparecer.
 */
export async function getPendientesDePlanificar(asignadas: Set<string>): Promise<PendienteDePlanificar[]> {
  const filas = (await getFilasConPosicionActual()).filter(({ fila }) => fila.otPieza.enviadaProduccionAt);
  const resultado: PendienteDePlanificar[] = [];
  for (const { fila, routing, posActual } of filas) {
    for (let i = posActual; i < routing.length; i++) {
      const paso = routing[i];
      if (paso.tipo !== "interno" || !paso.centroTrabajoId) continue;
      if (asignadas.has(`${fila.otPieza.id}::${paso.id}`)) continue;
      resultado.push({
        otPiezaId: fila.otPieza.id,
        otPiezaCodigo: fila.otPieza.codigo,
        piezaNombre: fila.piezaNombre,
        otMaquinaId: fila.otMaquinaId,
        otMaquinaCodigo: fila.otMaquinaCodigo,
        operacionId: paso.id,
        operacionNombre: paso.nombre,
        centroTrabajoId: paso.centroTrabajoId,
        cantidad: fila.otPieza.cantidadAFabricar,
        despuesDe: i === posActual ? null : routing[i - 1].nombre,
      });
    }
  }
  return resultado;
}
