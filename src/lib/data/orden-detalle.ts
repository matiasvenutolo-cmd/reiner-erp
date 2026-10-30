/**
 * Datos del detalle de una orden que no salen del plan (reorganización 30/10 §2.2 y §2.5): a qué proveedor
 * fue la pieza que está afuera y qué paso de Compras quedó como informativo, para tildarlo como hecho.
 */
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { remito, remitoItem, otPieza, otConjunto, operacion, proceso, registroOperacion } from "@/lib/db/schema";

/** Proveedor del último remito de cada pieza de la orden (el tercerizado donde está). */
export async function getProveedoresAfuera(otMaquinaId: string): Promise<Map<string, string>> {
  const filas = await db
    .select({ otPiezaId: remitoItem.otPiezaId, destino: remito.destino, fecha: remito.fecha })
    .from(remitoItem)
    .innerJoin(remito, eq(remito.id, remitoItem.remitoId))
    .innerJoin(otPieza, eq(otPieza.id, remitoItem.otPiezaId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .where(eq(otConjunto.otMaquinaId, otMaquinaId))
    .orderBy(desc(remito.fecha));
  const r = new Map<string, string>();
  for (const f of filas) if (f.otPiezaId && !r.has(f.otPiezaId)) r.set(f.otPiezaId, f.destino);
  return r;
}

/** Pasos de Compras sin tildar de cada pieza de la orden (sin control de materia prima son informativos). */
export async function getPasosInformativos(otMaquinaId: string): Promise<Map<string, { operacionId: string; nombre: string }>> {
  const piezas = await db
    .select({ id: otPieza.id, piezaId: otPieza.piezaId })
    .from(otPieza)
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .where(eq(otConjunto.otMaquinaId, otMaquinaId));
  if (!piezas.length) return new Map();
  const [pasos, cerrados] = await Promise.all([
    db
      .select({ id: operacion.id, piezaId: operacion.piezaId, secuencia: operacion.secuencia, descripcion: operacion.descripcion, nombre: proceso.nombre })
      .from(operacion)
      .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
      .where(and(inArray(operacion.piezaId, [...new Set(piezas.map((p) => p.piezaId))]), eq(proceso.tipo, "compras"))),
    db
      .select({ otPiezaId: registroOperacion.otPiezaId, operacionId: registroOperacion.operacionId })
      .from(registroOperacion)
      .where(and(inArray(registroOperacion.otPiezaId, piezas.map((p) => p.id)), isNotNull(registroOperacion.fin))),
  ]);
  const hecho = new Set(cerrados.map((c) => `${c.otPiezaId}::${c.operacionId}`));
  const r = new Map<string, { operacionId: string; nombre: string }>();
  for (const p of piezas) {
    const paso = pasos.filter((x) => x.piezaId === p.piezaId && !hecho.has(`${p.id}::${x.id}`)).sort((a, b) => a.secuencia - b.secuencia)[0];
    if (paso) r.set(p.id, { operacionId: paso.id, nombre: paso.descripcion?.trim() || paso.nombre });
  }
  return r;
}

/** El jefe de planta tilda como hecho un paso de Compras informativo (queda registrado como cerrado). */
export async function tildarPasoInformativo(otPiezaId: string, operacionId: string, usuarioId: string): Promise<void> {
  const [op] = await db.select({ cantidad: otPieza.cantidadAFabricar }).from(otPieza).where(eq(otPieza.id, otPiezaId));
  if (!op) throw new Error("Esa pieza no existe.");
  const ahora = new Date();
  await db.insert(registroOperacion).values({ otPiezaId, operacionId, usuarioId, tipo: "ejecucion", inicio: ahora, fin: ahora, duracionSeg: null, piezasOk: op.cantidad, observacion: "Tildado como hecho (paso de Compras informativo)" });
}
