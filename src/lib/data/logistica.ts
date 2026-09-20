/**
 * Logística (Release 2, pedido de Horacio — docs/05-backlog-release-2.md
 * §4): panel de ingresos/egresos y control de calidad al recibir materia
 * prima o una pieza que vuelve de un proceso tercerizado. Comparte la base
 * de datos de `stock.ts` (movimiento_stock, stock_pieza) — separado en su
 * propio archivo porque el foco acá es el movimiento en sí (quién, cuándo,
 * de qué proveedor), no el saldo resultante.
 */
import { eq, desc, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { movimientoStock, stockPieza, pieza, usuario, proveedor, wipPieza, proceso } from "@/lib/db/schema";
import type { Proveedor, MovimientoStock } from "@/lib/db/schema";
import { getStockDisponible } from "./stock";

type TipoMovimientoStock = MovimientoStock["tipo"];

export async function getProveedores(): Promise<Proveedor[]> {
  return db.select().from(proveedor);
}

export type MovimientoConDetalle = {
  id: string;
  tipo: TipoMovimientoStock;
  cantidad: number;
  fecha: Date;
  observacion: string | null;
  controlResultado: "ok" | "no_ok" | null;
  piezaCodigo: string;
  piezaNombre: string;
  usuarioNombre: string;
  proveedorNombre: string | null;
};

/** Últimos movimientos, opcionalmente filtrados por tipo — la base del panel de ingresos/egresos. */
export async function listarMovimientos(tipo?: TipoMovimientoStock, limite = 50): Promise<MovimientoConDetalle[]> {
  const rows = await db
    .select({
      id: movimientoStock.id,
      tipo: movimientoStock.tipo,
      cantidad: movimientoStock.cantidad,
      fecha: movimientoStock.fecha,
      observacion: movimientoStock.observacion,
      controlResultado: movimientoStock.controlResultado,
      piezaCodigo: pieza.codigo,
      piezaNombre: pieza.nombre,
      usuarioNombre: usuario.nombre,
      proveedorNombre: proveedor.razonSocial,
    })
    .from(movimientoStock)
    .innerJoin(pieza, eq(pieza.id, movimientoStock.piezaId))
    .innerJoin(usuario, eq(usuario.id, movimientoStock.usuarioId))
    .leftJoin(proveedor, eq(proveedor.id, movimientoStock.proveedorId))
    .where(tipo ? eq(movimientoStock.tipo, tipo) : undefined)
    .orderBy(desc(movimientoStock.fecha))
    .limit(limite);
  return rows;
}

export type PiezaFueraDeFabrica = { piezaId: string; piezaCodigo: string; piezaNombre: string; procesoNombre: string; cantidad: number };

/** Piezas hoy "afuera" en un proceso tercerizado (Cromado, Pavonado, Compras...)
 * — se apoya en `proceso.esExterno`, que ya existía (hallazgo 3.5). No hace
 * falta ninguna escritura nueva: el WIP migrado de los Excel ya lo sabe. */
export async function getPiezasFueraDeFabrica(): Promise<PiezaFueraDeFabrica[]> {
  const rows = await db
    .select({
      piezaId: wipPieza.piezaId,
      piezaCodigo: pieza.codigo,
      piezaNombre: pieza.nombre,
      procesoNombre: proceso.nombre,
      cantidad: wipPieza.cantidad,
    })
    .from(wipPieza)
    .innerJoin(proceso, eq(proceso.id, wipPieza.procesoId))
    .innerJoin(pieza, eq(pieza.id, wipPieza.piezaId))
    .where(and(eq(proceso.esExterno, true)));
  return rows.filter((r) => r.cantidad > 0);
}

export type RegistrarIngresoInput = {
  piezaId: string;
  cantidad: number;
  proveedorId?: string;
  controlResultado: "ok" | "no_ok";
  observacion?: string;
  usuarioId: string;
};

/**
 * Registra un ingreso (materia prima o vuelta de proceso tercerizado) con su
 * control de calidad. Si el control da `no_ok`, el movimiento queda
 * igualmente asentado (para poder reclamarle al proveedor — el motivo real
 * del pedido, según lo que confirmó Julián), pero el stock disponible NO se
 * incrementa: lo que llegó mal no está listo para armar.
 */
export async function registrarIngreso(input: RegistrarIngresoInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(movimientoStock).values({
      piezaId: input.piezaId,
      tipo: "ingreso",
      cantidad: input.cantidad,
      proveedorId: input.proveedorId,
      controlResultado: input.controlResultado,
      observacion: input.observacion,
      usuarioId: input.usuarioId,
    });

    if (input.controlResultado === "ok") {
      const actual = await getStockDisponible(input.piezaId);
      await tx
        .insert(stockPieza)
        .values({ piezaId: input.piezaId, cantidadDisponible: actual + input.cantidad })
        .onConflictDoUpdate({
          target: stockPieza.piezaId,
          set: { cantidadDisponible: actual + input.cantidad, updatedAt: new Date() },
        });
    }
  });
}

export type RegistrarEgresoInput = { piezaId: string; cantidad: number; observacion?: string; usuarioId: string };

/** Egreso simple (pieza sale de fábrica) — sin control de calidad, ese chequeo es sólo al ingresar. */
export async function registrarEgreso(input: RegistrarEgresoInput): Promise<void> {
  await db.transaction(async (tx) => {
    const actual = await getStockDisponible(input.piezaId);
    await tx.insert(movimientoStock).values({
      piezaId: input.piezaId,
      tipo: "egreso",
      cantidad: input.cantidad,
      observacion: input.observacion,
      usuarioId: input.usuarioId,
    });
    await tx
      .insert(stockPieza)
      .values({ piezaId: input.piezaId, cantidadDisponible: Math.max(0, actual - input.cantidad) })
      .onConflictDoUpdate({
        target: stockPieza.piezaId,
        set: { cantidadDisponible: Math.max(0, actual - input.cantidad), updatedAt: new Date() },
      });
  });
}
