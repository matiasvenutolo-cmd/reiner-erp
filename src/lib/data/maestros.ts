/**
 * Lecturas de maestros: modelo → configuración → conjunto → pieza →
 * operación. Todo lo que sale de los Excel del cliente (ver
 * docs/01-analisis.md y docs/migracion-datos.md).
 *
 * Consulta Postgres (Neon) vía Drizzle. Antes de conectar la base esto leía
 * un array en memoria cargado de fixtures JSON — la firma de cada función
 * no cambió, así que ninguna pantalla tuvo que tocarse (ver docs/01 §6).
 */
import { eq, inArray, asc, desc, or, ilike } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  modelo,
  configuracion,
  conjunto,
  conjuntoModelo,
  proceso,
  dispositivo,
  pieza,
  piezaNota,
  piezaAdjunto,
  piezaConfiguracion,
  operacion,
  usuario,
} from "@/lib/db/schema";
import type { Modelo, Configuracion, Conjunto, Pieza, Proceso, PiezaNota, PiezaAdjunto } from "@/lib/db/schema";

/**
 * El modelo de una pieza no es un campo propio en la base (una pieza puede
 * compartirse entre familias, ver hallazgo de migración §3). Para mostrar
 * en la UI de qué familia es "nativa", se infiere del prefijo del código,
 * igual que scripts/migrate-excel.ts.
 */
export function modeloDeCodigo(codigo: string): "RD" | "PS" {
  return /^RD\d/i.test(codigo) ? "RD" : "PS";
}

export async function getModelos(): Promise<Modelo[]> {
  return db.select().from(modelo);
}

export async function getModelo(id: string): Promise<Modelo | undefined> {
  const [row] = await db.select().from(modelo).where(eq(modelo.id, id));
  return row;
}

export async function getConfiguraciones(modeloId?: string): Promise<Configuracion[]> {
  const query = db.select().from(configuracion);
  return modeloId ? query.where(eq(configuracion.modeloId, modeloId)) : query;
}

export async function getConfiguracion(id: string): Promise<Configuracion | undefined> {
  const [row] = await db.select().from(configuracion).where(eq(configuracion.id, id));
  return row;
}

export async function getConjuntos(modeloId?: string): Promise<Conjunto[]> {
  if (!modeloId) {
    return db.select().from(conjunto).orderBy(asc(conjunto.orden));
  }
  const rows = await db
    .select({ conjunto })
    .from(conjuntoModelo)
    .innerJoin(conjunto, eq(conjunto.id, conjuntoModelo.conjuntoId))
    .where(eq(conjuntoModelo.modeloId, modeloId))
    .orderBy(asc(conjunto.orden));
  return rows.map((r) => r.conjunto);
}

export async function getConjunto(id: string): Promise<Conjunto | undefined> {
  const [row] = await db.select().from(conjunto).where(eq(conjunto.id, id));
  return row;
}

export async function getProcesos(): Promise<Proceso[]> {
  return db.select().from(proceso).orderBy(asc(proceso.ordenFlujo));
}

export async function getProceso(id: string): Promise<Proceso | undefined> {
  const [row] = await db.select().from(proceso).where(eq(proceso.id, id));
  return row;
}

/** Piezas que aplican a una configuración dada, con su cantidad necesaria. */
export async function getPiezasPorConfiguracion(
  configuracionId: string,
): Promise<(Pieza & { cantidadNecesaria: number })[]> {
  const rows = await db
    .select({ pieza, cantidadNecesaria: piezaConfiguracion.cantidadNecesaria })
    .from(piezaConfiguracion)
    .innerJoin(pieza, eq(pieza.id, piezaConfiguracion.piezaId))
    .where(eq(piezaConfiguracion.configuracionId, configuracionId));
  return rows.map((r) => ({ ...r.pieza, cantidadNecesaria: r.cantidadNecesaria }));
}

export async function getPiezasPorConjunto(conjuntoId: string, modeloId?: string): Promise<Pieza[]> {
  if (!modeloId) {
    return db.select().from(pieza).where(eq(pieza.conjuntoId, conjuntoId));
  }
  // El modelo de una pieza no es un campo propio: se infiere por qué
  // configuraciones (y por lo tanto qué modelo) la usan.
  const rows = await db
    .select({ pieza })
    .from(pieza)
    .innerJoin(piezaConfiguracion, eq(piezaConfiguracion.piezaId, pieza.id))
    .innerJoin(configuracion, eq(configuracion.id, piezaConfiguracion.configuracionId))
    .where(eq(pieza.conjuntoId, conjuntoId));
  const filtradas = rows.map((r) => r.pieza);
  const vistos = new Set<string>();
  const unicas: Pieza[] = [];
  for (const p of filtradas) {
    if (!vistos.has(p.id)) {
      vistos.add(p.id);
      unicas.push(p);
    }
  }
  return unicas;
}

export async function getPieza(id: string): Promise<Pieza | undefined> {
  const [row] = await db.select().from(pieza).where(eq(pieza.id, id));
  return row;
}

export async function actualizarMaterialPieza(piezaId: string, material: string): Promise<void> {
  await db
    .update(pieza)
    .set({ material: material || null })
    .where(eq(pieza.id, piezaId));
}

/** Revisión y número de plano — devolución del cliente: "todos los campos de
 * las piezas deberían ser editables por ingeniería". Antes sólo Material y
 * Tipo lo eran; Revisión se mostraba de sólo lectura y "número de plano" no
 * existía como campo propio. */
export async function actualizarRevisionPieza(piezaId: string, revision: string): Promise<void> {
  await db
    .update(pieza)
    .set({ revision: revision || null })
    .where(eq(pieza.id, piezaId));
}

export async function actualizarNumeroPlanoPieza(piezaId: string, numeroPlano: string): Promise<void> {
  await db
    .update(pieza)
    .set({ numeroPlano: numeroPlano || null })
    .where(eq(pieza.id, piezaId));
}

/** Marca una pieza como sólo de compra o de fabricación (Release 3, pedido
 * del cliente — docs/06-backlog-release-3.md §7: "Compra Chiapas soporte
 * Wiper" no debería tratarse igual que una pieza que hay que fabricar).
 * `pieza.tipo` ya existía en el schema pero la migración del Excel siempre
 * cargó "fabricada" — no había forma de derivarlo del origen, así que se
 * deja como toggle manual que ingeniería va corrigiendo. */
export async function actualizarTipoPieza(piezaId: string, tipo: "fabricada" | "comprada"): Promise<void> {
  await db.update(pieza).set({ tipo }).where(eq(pieza.id, piezaId));
}

/** Mínimo de stock (RF sugerido, Fase 2) — quedó siempre en 0 desde la
 * migración del Excel (`scripts/migrate-excel.ts` lo hardcodea), así que
 * la alerta de "por debajo del mínimo" en /stock nunca tenía nada para
 * mostrar. Editable acá para que ingeniería lo vaya cargando de verdad. */
export async function actualizarStockMinimoPieza(piezaId: string, stockMinimo: number): Promise<void> {
  await db.update(pieza).set({ stockMinimo }).where(eq(pieza.id, piezaId));
}

export async function actualizarDescripcionOperacion(operacionId: string, descripcion: string): Promise<void> {
  await db
    .update(operacion)
    .set({ descripcion: descripcion || null })
    .where(eq(operacion.id, operacionId));
}

/**
 * Hoja de ruta editable de verdad (devolución del cliente: "todos los
 * campos de las piezas deberían ser editables... hojas de ruta") — antes
 * sólo se podía tocar el texto de `descripcion`, no agregar, quitar,
 * reordenar operaciones ni cambiar a qué proceso corresponde cada una.
 */
/** Centro de trabajo para una operación de una pieza puntual; null vuelve al del tipo de operación. */
export async function actualizarCentroOperacion(operacionId: string, centroTrabajoId: string | null): Promise<void> {
  await db.update(operacion).set({ centroTrabajoId }).where(eq(operacion.id, operacionId));
}

export async function actualizarProcesoOperacion(operacionId: string, procesoId: string): Promise<void> {
  await db.update(operacion).set({ procesoId }).where(eq(operacion.id, operacionId));
}

export async function agregarOperacion(input: { piezaId: string; procesoId: string }): Promise<string> {
  const existentes = await db.select({ secuencia: operacion.secuencia }).from(operacion).where(eq(operacion.piezaId, input.piezaId));
  const siguienteSecuencia = existentes.length ? Math.max(...existentes.map((o) => o.secuencia)) + 1 : 1;
  const id = `${input.piezaId}-op-${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(operacion).values({ id, piezaId: input.piezaId, procesoId: input.procesoId, secuencia: siguienteSecuencia });
  return id;
}

/** Bloqueada por la propia base si la operación ya tiene ejecuciones
 * registradas (`registro_operacion.operacion_id` referencia esta fila sin
 * `onDelete: cascade`) — el error de FK sube tal cual, no se traga en
 * silencio: si taller ya trabajó esa operación, no se puede borrar sin
 * perder ese historial. */
export async function eliminarOperacion(operacionId: string): Promise<void> {
  const [op] = await db.select({ piezaId: operacion.piezaId }).from(operacion).where(eq(operacion.id, operacionId));
  if (!op) return;
  await db.transaction(async (tx) => {
    await tx.delete(operacion).where(eq(operacion.id, operacionId));
    // Renumera para que no queden huecos ("Operación 5" en una ruta de 4 pasos).
    const restantes = await tx.select({ id: operacion.id }).from(operacion).where(eq(operacion.piezaId, op.piezaId)).orderBy(asc(operacion.secuencia));
    for (const [i, r] of restantes.entries()) {
      await tx.update(operacion).set({ secuencia: i + 1 }).where(eq(operacion.id, r.id));
    }
  });
}

/** Sube o baja una operación un lugar en la hoja de ruta, intercambiando su
 * `secuencia` con la del vecino — igual de simple que las flechas que ya se
 * habían reemplazado por arrastre en Centros de trabajo, pero acá una hoja
 * de ruta rara vez pasa de 10 pasos, así que no hace falta drag&drop. */
export async function moverOperacion(operacionId: string, direccion: "arriba" | "abajo"): Promise<void> {
  const [op] = await db.select().from(operacion).where(eq(operacion.id, operacionId));
  if (!op) return;

  const ruta = await db
    .select()
    .from(operacion)
    .where(eq(operacion.piezaId, op.piezaId))
    .orderBy(asc(operacion.secuencia));
  const idx = ruta.findIndex((o) => o.id === operacionId);
  const vecinoIdx = direccion === "arriba" ? idx - 1 : idx + 1;
  if (vecinoIdx < 0 || vecinoIdx >= ruta.length) return;

  const vecino = ruta[vecinoIdx];
  await db.transaction(async (tx) => {
    await tx.update(operacion).set({ secuencia: vecino.secuencia }).where(eq(operacion.id, op.id));
    await tx.update(operacion).set({ secuencia: op.secuencia }).where(eq(operacion.id, vecino.id));
  });
}

export type NotaPiezaConAutor = PiezaNota & { autorNombre: string };

/** Bitácora de una pieza (docs/05-backlog-release-2.md §1, §2): notas de
 * ingeniería (versión/diseño) y de producción, más recientes primero. */
export async function getNotasPieza(piezaId: string): Promise<NotaPiezaConAutor[]> {
  const rows = await db
    .select({ nota: piezaNota, autorNombre: usuario.nombre })
    .from(piezaNota)
    .innerJoin(usuario, eq(usuario.id, piezaNota.usuarioId))
    .where(eq(piezaNota.piezaId, piezaId))
    .orderBy(desc(piezaNota.createdAt));
  return rows.map((r) => ({ ...r.nota, autorNombre: r.autorNombre }));
}

export async function crearNotaPieza(input: {
  piezaId: string;
  tipo: "ingenieria" | "produccion";
  texto: string;
  usuarioId: string;
}): Promise<void> {
  await db.insert(piezaNota).values(input);
}

export type AdjuntoPiezaConAutor = PiezaAdjunto & { autorNombre: string };

/** Adjuntos de ingeniería de una pieza (planos, fotos) — ver `piezaAdjunto` en schema.ts. */
export async function getAdjuntosPieza(piezaId: string): Promise<AdjuntoPiezaConAutor[]> {
  const rows = await db
    .select({ adjunto: piezaAdjunto, autorNombre: usuario.nombre })
    .from(piezaAdjunto)
    .innerJoin(usuario, eq(usuario.id, piezaAdjunto.usuarioId))
    .where(eq(piezaAdjunto.piezaId, piezaId))
    .orderBy(desc(piezaAdjunto.createdAt));
  return rows.map((r) => ({ ...r.adjunto, autorNombre: r.autorNombre }));
}

export async function crearAdjuntoPieza(input: {
  piezaId: string;
  tipo: "plano" | "foto";
  nombreArchivo: string;
  pathname: string;
  usuarioId: string;
}): Promise<void> {
  await db.insert(piezaAdjunto).values(input);
}

export async function getAdjuntoPieza(id: string): Promise<PiezaAdjunto | undefined> {
  const [row] = await db.select().from(piezaAdjunto).where(eq(piezaAdjunto.id, id));
  return row;
}

export async function eliminarAdjuntoPieza(id: string): Promise<void> {
  await db.delete(piezaAdjunto).where(eq(piezaAdjunto.id, id));
}

export async function getPiezas(modeloId?: string): Promise<Pieza[]> {
  if (!modeloId) return db.select().from(pieza);
  return getPiezasPorModelo(modeloId);
}

async function getPiezasPorModelo(modeloId: string): Promise<Pieza[]> {
  const rows = await db
    .select({ pieza })
    .from(pieza)
    .innerJoin(piezaConfiguracion, eq(piezaConfiguracion.piezaId, pieza.id))
    .innerJoin(configuracion, eq(configuracion.id, piezaConfiguracion.configuracionId))
    .where(eq(configuracion.modeloId, modeloId));
  const vistos = new Set<string>();
  const unicas: Pieza[] = [];
  for (const r of rows) {
    if (!vistos.has(r.pieza.id)) {
      vistos.add(r.pieza.id);
      unicas.push(r.pieza);
    }
  }
  return unicas;
}

export type OperacionConDetalle = {
  id: string;
  secuencia: number;
  // El cliente confirmó (devolución de Fase 2, pregunta 8) que un OPS vacío
  // es un dato que falta cargar, NO "1 operación" — antes el código lo
  // defaulteaba a 1, mostrando un valor inventado como si fuera real.
  ops: number | null;
  proceso: Proceso;
  descripcion: string | null;
  dispositivoNombre: string | null;
  /** Centro elegido para esta pieza; null = el del tipo de operación (proceso.centroTrabajoId). */
  centroTrabajoId: string | null;
};

/** Nombre a mostrar de una operación: el detalle específico si se cargó
 * (ej. "Roscado"), si no el nombre genérico del proceso (ej. "Torno") —
 * Release 3, docs/06-backlog-release-3.md §5. */
export function nombreOperacion(op: { descripcion: string | null; proceso: { nombre: string } }): string {
  return op.descripcion?.trim() || op.proceso.nombre;
}

/** Hoja de ruta de una pieza: sus operaciones en secuencia, con el proceso resuelto. */
export async function getRoutingPieza(piezaId: string): Promise<OperacionConDetalle[]> {
  const rows = await db
    .select({ operacion, proceso, dispositivoNombre: dispositivo.nombre })
    .from(operacion)
    .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
    .leftJoin(dispositivo, eq(dispositivo.id, operacion.dispositivoId))
    .where(eq(operacion.piezaId, piezaId))
    .orderBy(asc(operacion.secuencia));
  return rows.map((r) => ({
    id: r.operacion.id,
    secuencia: r.operacion.secuencia,
    ops: r.operacion.ops,
    proceso: r.proceso,
    descripcion: r.operacion.descripcion,
    dispositivoNombre: r.dispositivoNombre,
    centroTrabajoId: r.operacion.centroTrabajoId,
  }));
}

export async function contarPiezasPorConjunto(modeloId?: string): Promise<Record<string, number>> {
  const piezas = await getPiezas(modeloId);
  const conteo: Record<string, number> = {};
  for (const p of piezas) conteo[p.conjuntoId] = (conteo[p.conjuntoId] ?? 0) + 1;
  return conteo;
}

/** Cantidad de piezas distintas que aplican a cada configuración (máquina) —
 * para el índice de Maestros, que ahora entra por máquina (devolución del
 * cliente, docs/06-backlog-release-3.md: "que aparezca por Máquina, no por
 * conjunto"). */
export async function contarPiezasPorConfiguracion(): Promise<Record<string, number>> {
  const rows = await db.select({ configuracionId: piezaConfiguracion.configuracionId }).from(piezaConfiguracion);
  const conteo: Record<string, number> = {};
  for (const r of rows) conteo[r.configuracionId] = (conteo[r.configuracionId] ?? 0) + 1;
  return conteo;
}

export type ResumenConjuntoDeConfiguracion = {
  conjunto: Conjunto;
  totalPiezas: number;
  aProducir: number;
  aComprar: number;
};

/**
 * Conjuntos que aparecen en una configuración (máquina) puntual, con cuántas
 * de sus piezas son a producir vs. a comprar — devolución del cliente: "que
 * de cada conjunto diferencie piezas a comprar y a producir". Se apoya en
 * `getPiezasPorConfiguracion`, el mismo vínculo que usa la explosión de OT.
 */
export async function getResumenConjuntosDeConfiguracion(configuracionId: string): Promise<ResumenConjuntoDeConfiguracion[]> {
  const piezas = await getPiezasPorConfiguracion(configuracionId);
  if (piezas.length === 0) return [];

  const conteoPorConjunto = new Map<string, { aProducir: number; aComprar: number }>();
  for (const p of piezas) {
    const acc = conteoPorConjunto.get(p.conjuntoId) ?? { aProducir: 0, aComprar: 0 };
    if (p.tipo === "comprada") acc.aComprar += 1;
    else acc.aProducir += 1;
    conteoPorConjunto.set(p.conjuntoId, acc);
  }

  const conjuntos = await db.select().from(conjunto).where(inArray(conjunto.id, [...conteoPorConjunto.keys()]));
  return conjuntos
    .map((c) => {
      const counts = conteoPorConjunto.get(c.id)!;
      return { conjunto: c, totalPiezas: counts.aProducir + counts.aComprar, aProducir: counts.aProducir, aComprar: counts.aComprar };
    })
    .sort((a, b) => a.conjunto.orden - b.conjunto.orden);
}

/** Piezas de un conjunto puntual dentro de una configuración (máquina)
 * puntual — el mismo par que gobierna `/maestros/[configuracionId]/[conjuntoId]`. */
export async function getPiezasPorConfiguracionYConjunto(
  configuracionId: string,
  conjuntoId: string,
): Promise<(Pieza & { cantidadNecesaria: number })[]> {
  const piezas = await getPiezasPorConfiguracion(configuracionId);
  return piezas.filter((p) => p.conjuntoId === conjuntoId);
}

/** Busca piezas por código o nombre (usado en /stock). */
export async function buscarPiezas(query: string, limite = 30): Promise<Pieza[]> {
  const patron = `%${query}%`;
  return db
    .select()
    .from(pieza)
    .where(or(ilike(pieza.codigo, patron), ilike(pieza.nombre, patron)))
    .limit(limite);
}

/** Trae varias piezas de una sola consulta (evita N+1 en listados). */
export async function getPiezasPorIds(ids: string[]): Promise<Map<string, Pieza>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(pieza).where(inArray(pieza.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}
