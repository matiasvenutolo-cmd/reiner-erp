/**
 * Remitos (Release 2, paquete 7 — pedido de Horacio: "generación de
 * remitos para movimiento de piezas", ver docs/05-backlog-release-2.md §4,
 * §9). Numeración secuencial simple (no una secuencia de Postgres — el
 * volumen de esta etapa no la necesita) y vista imprimible en `/remitos/[id]`.
 */
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { remito, pieza, usuario } from "@/lib/db/schema";

export type RemitoConDetalle = {
  id: string;
  numero: number;
  cantidad: number;
  destino: string;
  observacion: string | null;
  fecha: Date;
  piezaCodigo: string;
  piezaNombre: string;
  usuarioNombre: string;
};

export async function listarRemitos(): Promise<RemitoConDetalle[]> {
  return db
    .select({
      id: remito.id,
      numero: remito.numero,
      cantidad: remito.cantidad,
      destino: remito.destino,
      observacion: remito.observacion,
      fecha: remito.fecha,
      piezaCodigo: pieza.codigo,
      piezaNombre: pieza.nombre,
      usuarioNombre: usuario.nombre,
    })
    .from(remito)
    .innerJoin(pieza, eq(pieza.id, remito.piezaId))
    .innerJoin(usuario, eq(usuario.id, remito.usuarioId))
    .orderBy(desc(remito.numero));
}

export async function getRemito(id: string): Promise<RemitoConDetalle | undefined> {
  const [row] = await db
    .select({
      id: remito.id,
      numero: remito.numero,
      cantidad: remito.cantidad,
      destino: remito.destino,
      observacion: remito.observacion,
      fecha: remito.fecha,
      piezaCodigo: pieza.codigo,
      piezaNombre: pieza.nombre,
      usuarioNombre: usuario.nombre,
    })
    .from(remito)
    .innerJoin(pieza, eq(pieza.id, remito.piezaId))
    .innerJoin(usuario, eq(usuario.id, remito.usuarioId))
    .where(eq(remito.id, id));
  return row;
}

export type GenerarRemitoInput = { piezaId: string; cantidad: number; destino: string; observacion?: string; usuarioId: string };

export async function generarRemito(input: GenerarRemitoInput): Promise<string> {
  // Numeración secuencial simple — no hay concurrencia real en este mockup
  // (un solo usuario generando remitos a la vez). Si hace falta blindarla
  // contra carreras, pasar a una secuencia de Postgres.
  const [ultimo] = await db.select({ max: sql<number>`coalesce(max(${remito.numero}), 0)`.mapWith(Number) }).from(remito);
  const numero = (ultimo?.max ?? 0) + 1;

  const [nuevo] = await db
    .insert(remito)
    .values({
      numero,
      piezaId: input.piezaId,
      cantidad: input.cantidad,
      destino: input.destino,
      observacion: input.observacion,
      usuarioId: input.usuarioId,
    })
    .returning();
  return nuevo.id;
}
