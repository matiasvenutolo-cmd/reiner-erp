/**
 * Compras pedidas y llegadas (devolución del socio sobre Stock: "no sabés
 * cuáles son existencias reales en el almacén, cuáles están en proceso de
 * compra o ya compradas y esperando que lleguen"), y vuelta de piezas
 * tercerizadas (Logística: "ver en una tabla aparte lo que aún sigue
 * esperando ingreso, en manos del proveedor").
 *
 * Una llegada OK cierra el paso pendiente de la hoja de ruta (Compras o el
 * proceso tercerizado) con un registro sin duración — no es tiempo de
 * máquina, así que no entra en el tiempo estándar. Una pieza comprada
 * entera, en cambio, suma al almacén y queda reservada para su OT.
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull, like, max, sum } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  pedidoCompra,
  otPieza,
  otConjunto,
  otMaquina,
  pieza,
  proveedor,
  movimientoStock,
  stockPieza,
  reservaStock,
  registroOperacion,
  remito,
  remitoItem,
  solicitudCompra,
} from "@/lib/db/schema";
import { getStockDisponible } from "./stock";
import { esUltimaOperacion, getCantidadesOperacion } from "./ejecucion";
import { getEstadoYOperacionActual } from "./ot";

/** Prefijo con el que se asienta la vuelta de un tercerizado — distingue esos
 * ingresos de la llegada de una compra de la misma OT de pieza. */
export const OBS_VUELTA_TERCERIZADO = "Vuelta de tercerizado";

export type MovimientoTercerizado = {
  operacionId: string;
  /** Piezas que llegaron a este paso tercerizado (las OK del anterior). */
  cantidadPaso: number;
  /** Mandadas con remito desde que la pieza llegó a este paso. */
  enviadas: number;
  /** Vueltas registradas (OK o NO OK) desde que llegó a este paso. */
  recibidas: number;
  /** En planta y todavía sin mandar: las que llegaron, menos las que están afuera. */
  enPlanta: number;
  /** En manos del proveedor: mandadas y todavía no vueltas. */
  afuera: number;
};

/**
 * Cuánto se mandó y cuánto volvió en el paso tercerizado ACTUAL de una OT de
 * pieza (observación del cliente en Fase 3: se podía registrar el ingreso de
 * más piezas de las que se enviaron). Mismo criterio que
 * `getPiezasAfueraTercerizado`: cuenta lo posterior a que la pieza llegó al
 * paso (último cierre registrado). Una vuelta NO OK cuenta como recibida — la
 * pieza volvió a planta y, si se la manda de nuevo, sale con otro remito.
 */
export async function getMovimientoTercerizado(otPiezaId: string): Promise<MovimientoTercerizado | null> {
  const [op] = await db.select().from(otPieza).where(eq(otPieza.id, otPiezaId));
  if (!op) return null;
  const { operacionActual } = await getEstadoYOperacionActual(op);
  if (!operacionActual || operacionActual.proceso.tipo !== "tercerizado") return null;

  const [ultimoCierre] = await db
    .select({ fin: max(registroOperacion.fin) })
    .from(registroOperacion)
    .where(and(eq(registroOperacion.otPiezaId, otPiezaId), isNotNull(registroOperacion.fin)));
  const desde = ultimoCierre?.fin ?? new Date(0);

  const [[env], [rec], { entra }] = await Promise.all([
    db
      .select({ total: sum(remitoItem.cantidad).mapWith(Number) })
      .from(remitoItem)
      .innerJoin(remito, eq(remito.id, remitoItem.remitoId))
      .where(and(eq(remitoItem.otPiezaId, otPiezaId), gte(remito.fecha, desde))),
    db
      .select({ total: sum(movimientoStock.cantidad).mapWith(Number) })
      .from(movimientoStock)
      .where(
        and(
          eq(movimientoStock.otPiezaId, otPiezaId),
          eq(movimientoStock.tipo, "ingreso"),
          like(movimientoStock.observacion, `${OBS_VUELTA_TERCERIZADO}%`),
          gte(movimientoStock.fecha, desde),
        ),
      ),
    getCantidadesOperacion(otPiezaId, operacionActual.id),
  ]);
  const enviadas = env?.total ?? 0;
  const recibidas = rec?.total ?? 0;
  const afuera = Math.max(0, enviadas - recibidas);
  return { operacionId: operacionActual.id, cantidadPaso: entra, enviadas, recibidas, enPlanta: Math.max(0, entra - afuera), afuera };
}

export async function marcarPedido(input: {
  otPiezaId: string;
  cantidad: number;
  proveedorId?: string;
  observacion?: string;
  usuarioId: string;
}): Promise<void> {
  if (input.cantidad <= 0) throw new Error("La cantidad tiene que ser mayor a cero.");
  const [abierto] = await db
    .select({ id: pedidoCompra.id })
    .from(pedidoCompra)
    .where(and(eq(pedidoCompra.otPiezaId, input.otPiezaId), isNull(pedidoCompra.recibidoAt)));
  if (abierto) throw new Error("Esa pieza ya tiene un pedido sin recibir.");
  await db.insert(pedidoCompra).values({
    otPiezaId: input.otPiezaId,
    cantidad: input.cantidad,
    proveedorId: input.proveedorId || null,
    observacion: input.observacion || null,
    usuarioId: input.usuarioId,
  });
}

export async function cancelarPedido(pedidoId: string): Promise<void> {
  // Un pedido confirmado desde el módulo de Compras queda atado a esa compra (cotización, pagos):
  // borrarlo acá la dejaría inconsistente. Los pedidos hechos desde Stock se cancelan como siempre.
  const [deCompras] = await db
    .select({ numero: solicitudCompra.numero })
    .from(solicitudCompra)
    .where(eq(solicitudCompra.pedidoCompraId, pedidoId));
  if (deCompras) throw new Error(`Este pedido lo confirmó Compras (compra Nº ${deCompras.numero}): se gestiona desde ahí.`);
  await db.delete(pedidoCompra).where(and(eq(pedidoCompra.id, pedidoId), isNull(pedidoCompra.recibidoAt)));
}

export type PedidoPendiente = {
  id: string;
  otPiezaId: string;
  otPiezaCodigo: string;
  piezaId: string;
  piezaCodigo: string;
  piezaNombre: string;
  tipoPieza: "fabricada" | "comprada";
  otMaquinaCodigo: string;
  proveedorId: string | null;
  proveedorNombre: string | null;
  cantidad: number;
  fechaPedido: Date;
  observacion: string | null;
};

export async function getPedidosPendientes(piezaId?: string): Promise<PedidoPendiente[]> {
  return db
    .select({
      id: pedidoCompra.id,
      otPiezaId: otPieza.id,
      otPiezaCodigo: otPieza.codigo,
      piezaId: pieza.id,
      piezaCodigo: pieza.codigo,
      piezaNombre: pieza.nombre,
      tipoPieza: pieza.tipo,
      otMaquinaCodigo: otMaquina.codigo,
      proveedorId: pedidoCompra.proveedorId,
      proveedorNombre: proveedor.razonSocial,
      cantidad: pedidoCompra.cantidad,
      fechaPedido: pedidoCompra.fechaPedido,
      observacion: pedidoCompra.observacion,
    })
    .from(pedidoCompra)
    .innerJoin(otPieza, eq(otPieza.id, pedidoCompra.otPiezaId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .leftJoin(proveedor, eq(proveedor.id, pedidoCompra.proveedorId))
    .where(and(isNull(pedidoCompra.recibidoAt), piezaId ? eq(pieza.id, piezaId) : undefined))
    .orderBy(desc(pedidoCompra.fechaPedido));
}

export async function getOtPiezaIdsConPedidoAbierto(otPiezaIds: string[]): Promise<Set<string>> {
  if (otPiezaIds.length === 0) return new Set();
  const rows = await db
    .select({ otPiezaId: pedidoCompra.otPiezaId })
    .from(pedidoCompra)
    .where(and(inArray(pedidoCompra.otPiezaId, otPiezaIds), isNull(pedidoCompra.recibidoAt)));
  return new Set(rows.map((r) => r.otPiezaId));
}

/**
 * Llegada de un pedido, con su control de calidad. NO OK: queda asentado
 * para reclamar, pero el pedido sigue abierto (lo que llegó mal no sirve).
 */
export async function registrarLlegadaPedido(input: {
  pedidoId: string;
  controlResultado: "ok" | "no_ok";
  operacionCompraId?: string;
  observacion?: string;
  usuarioId: string;
}): Promise<void> {
  const [row] = await db
    .select({ pedido: pedidoCompra, otPieza, tipoPieza: pieza.tipo, otMaquinaId: otConjunto.otMaquinaId })
    .from(pedidoCompra)
    .innerJoin(otPieza, eq(otPieza.id, pedidoCompra.otPiezaId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .where(eq(pedidoCompra.id, input.pedidoId));
  if (!row) throw new Error("Pedido inexistente.");
  if (row.pedido.recibidoAt) throw new Error("Ese pedido ya se recibió.");

  const ahora = new Date();
  const esPiezaComprada = row.tipoPieza === "comprada";
  const disponible = esPiezaComprada ? await getStockDisponible(row.otPieza.piezaId) : 0;

  await db.transaction(async (tx) => {
    await tx.insert(movimientoStock).values({
      piezaId: row.otPieza.piezaId,
      tipo: "ingreso",
      cantidad: row.pedido.cantidad,
      otPiezaId: row.otPieza.id,
      proveedorId: row.pedido.proveedorId,
      controlResultado: input.controlResultado,
      usuarioId: input.usuarioId,
      observacion: [esPiezaComprada ? "Compra recibida" : "Material recibido", row.otPieza.codigo, input.observacion?.trim()]
        .filter(Boolean)
        .join(" — "),
    });
    if (input.controlResultado !== "ok") return;

    await tx.update(pedidoCompra).set({ recibidoAt: ahora }).where(eq(pedidoCompra.id, row.pedido.id));

    if (esPiezaComprada) {
      await tx
        .insert(stockPieza)
        .values({ piezaId: row.otPieza.piezaId, cantidadDisponible: disponible + row.pedido.cantidad })
        .onConflictDoUpdate({
          target: stockPieza.piezaId,
          set: { cantidadDisponible: disponible + row.pedido.cantidad, updatedAt: ahora },
        });
      await tx.insert(reservaStock).values({ otMaquinaId: row.otMaquinaId, piezaId: row.otPieza.piezaId, cantidad: row.pedido.cantidad });
    } else if (input.operacionCompraId) {
      await tx.insert(registroOperacion).values({
        otPiezaId: row.otPieza.id,
        operacionId: input.operacionCompraId,
        usuarioId: input.usuarioId,
        tipo: "ejecucion",
        inicio: row.pedido.fechaPedido,
        fin: ahora,
        duracionSeg: null,
        piezasOk: row.pedido.cantidad,
        observacion: "Cerrado al recibir la compra",
      });
    }
  });
}

/** Vuelta de una pieza tercerizada (Cromado, Pavonado...), con control de calidad. */
export async function registrarVueltaTercerizado(input: {
  otPiezaId: string;
  operacionId: string;
  cantidad: number;
  proveedorId?: string;
  controlResultado: "ok" | "no_ok";
  observacion?: string;
  usuarioId: string;
}): Promise<void> {
  const [op] = await db.select().from(otPieza).where(eq(otPieza.id, input.otPiezaId));
  if (!op) throw new Error("OT de pieza inexistente.");
  const mov = await getMovimientoTercerizado(op.id);
  if (!mov || mov.operacionId !== input.operacionId) throw new Error("Esa pieza no está en este paso tercerizado.");
  if (mov.enviadas === 0) throw new Error("Esa pieza todavía no salió con remito en este paso: no hay vuelta para registrar.");
  if (input.cantidad > mov.afuera) {
    throw new Error(
      `${op.codigo}: se enviaron ${mov.enviadas} y ya volvieron ${mov.recibidas} — como mucho pueden volver ${mov.afuera}.`,
    );
  }
  const ahora = new Date();
  const cierraLaPieza = await esUltimaOperacion(op.id, input.operacionId);
  await db.transaction(async (tx) => {
    await tx.insert(movimientoStock).values({
      piezaId: op.piezaId,
      tipo: "ingreso",
      cantidad: input.cantidad,
      otPiezaId: op.id,
      proveedorId: input.proveedorId || null,
      controlResultado: input.controlResultado,
      usuarioId: input.usuarioId,
      observacion: [OBS_VUELTA_TERCERIZADO, op.codigo, input.observacion?.trim()].filter(Boolean).join(" — "),
    });
    if (input.controlResultado !== "ok") return;
    await tx.insert(registroOperacion).values({
      otPiezaId: op.id,
      operacionId: input.operacionId,
      usuarioId: input.usuarioId,
      tipo: "ejecucion",
      inicio: ahora,
      fin: ahora,
      duracionSeg: null,
      piezasOk: input.cantidad,
      observacion: "Cerrado al registrar la vuelta del proveedor",
    });
    // Si el tercerizado era el último paso, la pieza queda terminada igual que al cerrarla en taller.
    if (cierraLaPieza) {
      await tx.update(otPieza).set({ piezasOk: input.cantidad, fechaFin: ahora, updatedAt: ahora }).where(eq(otPieza.id, op.id));
    }
  });
}
