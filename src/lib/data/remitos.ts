/**
 * Remitos (Release 2, paquete 7). Multi-pieza desde Release 3 — pedido
 * explícito del cliente (docs/06-backlog-release-3.md §12): "un remito debe
 * poder agrupar varias piezas... para un mismo proveedor". Numeración
 * secuencial simple (no una secuencia de Postgres — el volumen de esta
 * etapa no la necesita) y vista imprimible en `/remitos/[id]`.
 */
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { remito, remitoItem, pieza, usuario, movimientoStock, stockPieza } from "@/lib/db/schema";
import { getStockDisponible } from "./stock";

export type RemitoResumen = {
  id: string;
  numero: number;
  destino: string;
  tecnico: string | null;
  fecha: Date;
  usuarioNombre: string;
  cantidadPiezas: number;
  cantidadItems: number;
};

export async function listarRemitos(): Promise<RemitoResumen[]> {
  const rows = await db
    .select({
      id: remito.id,
      numero: remito.numero,
      destino: remito.destino,
      tecnico: remito.tecnico,
      fecha: remito.fecha,
      usuarioNombre: usuario.nombre,
      cantidadItems: sql<number>`count(${remitoItem.id})`.mapWith(Number),
      cantidadPiezas: sql<number>`coalesce(sum(${remitoItem.cantidad}), 0)`.mapWith(Number),
    })
    .from(remito)
    .innerJoin(usuario, eq(usuario.id, remito.usuarioId))
    .leftJoin(remitoItem, eq(remitoItem.remitoId, remito.id))
    .groupBy(remito.id, usuario.nombre)
    .orderBy(desc(remito.numero));
  return rows;
}

export type RemitoItemConDetalle = {
  id: string;
  piezaId: string;
  piezaCodigo: string;
  piezaNombre: string;
  cantidad: number;
  tratamiento: string | null;
};

export type RemitoConDetalle = {
  id: string;
  numero: number;
  destino: string;
  tecnico: string | null;
  observacion: string | null;
  fecha: Date;
  usuarioNombre: string;
  items: RemitoItemConDetalle[];
};

export async function getRemito(id: string): Promise<RemitoConDetalle | undefined> {
  const [cabecera] = await db
    .select({
      id: remito.id,
      numero: remito.numero,
      destino: remito.destino,
      tecnico: remito.tecnico,
      observacion: remito.observacion,
      fecha: remito.fecha,
      usuarioNombre: usuario.nombre,
    })
    .from(remito)
    .innerJoin(usuario, eq(usuario.id, remito.usuarioId))
    .where(eq(remito.id, id));
  if (!cabecera) return undefined;

  const items = await db
    .select({
      id: remitoItem.id,
      piezaId: remitoItem.piezaId,
      piezaCodigo: pieza.codigo,
      piezaNombre: pieza.nombre,
      cantidad: remitoItem.cantidad,
      tratamiento: remitoItem.tratamiento,
    })
    .from(remitoItem)
    .innerJoin(pieza, eq(pieza.id, remitoItem.piezaId))
    .where(eq(remitoItem.remitoId, id));

  return { ...cabecera, items };
}

export type GenerarRemitoInput = {
  destino: string;
  tecnico?: string;
  observacion?: string;
  usuarioId: string;
  items: { piezaId: string; cantidad: number; tratamiento?: string }[];
};

/**
 * Genera el remito Y registra el egreso de stock de cada pieza en la misma
 * transacción — devolución del cliente: "generar un movimiento y que quede
 * registrado y a la vez se haga el remito... que quede toda centralizada la
 * info, no en diferentes pestañas". Antes armar un remito y registrar el
 * egreso eran dos acciones sueltas en la misma pantalla de Tercerizados —
 * nada obligaba a hacer las dos, así que el stock disponible podía quedar
 * desactualizado (una pieza mandada a cromar seguía figurando como
 * disponible). El "Registrar ingreso o egreso" manual de Tercerizados sigue
 * existiendo para movimientos que no van por remito (ej. compra de materia
 * prima).
 */
export async function generarRemito(input: GenerarRemitoInput): Promise<string> {
  if (input.items.length === 0) throw new Error("Un remito necesita al menos una pieza.");

  return db.transaction(async (tx) => {
    // Numeración secuencial simple — no hay concurrencia real en este
    // mockup (un solo usuario generando remitos a la vez). Si hace falta
    // blindarla contra carreras, pasar a una secuencia de Postgres.
    const [ultimo] = await tx.select({ max: sql<number>`coalesce(max(${remito.numero}), 0)`.mapWith(Number) }).from(remito);
    const numero = (ultimo?.max ?? 0) + 1;

    const [nuevo] = await tx
      .insert(remito)
      .values({
        numero,
        destino: input.destino,
        tecnico: input.tecnico || null,
        observacion: input.observacion || null,
        usuarioId: input.usuarioId,
      })
      .returning();

    await tx.insert(remitoItem).values(
      input.items.map((item) => ({
        remitoId: nuevo.id,
        piezaId: item.piezaId,
        cantidad: item.cantidad,
        tratamiento: item.tratamiento || null,
      })),
    );

    for (const item of input.items) {
      const disponible = await getStockDisponible(item.piezaId);
      const nuevoDisponible = Math.max(0, disponible - item.cantidad);
      await tx.insert(movimientoStock).values({
        piezaId: item.piezaId,
        tipo: "egreso",
        cantidad: item.cantidad,
        remitoId: nuevo.id,
        usuarioId: input.usuarioId,
        observacion: `Remito Nº ${numero}${item.tratamiento ? ` — ${item.tratamiento}` : ""}`,
      });
      await tx
        .insert(stockPieza)
        .values({ piezaId: item.piezaId, cantidadDisponible: nuevoDisponible })
        .onConflictDoUpdate({ target: stockPieza.piezaId, set: { cantidadDisponible: nuevoDisponible, updatedAt: new Date() } });
    }

    return nuevo.id;
  });
}
