/**
 * Logística (Release 2, pedido de Horacio — docs/05-backlog-release-2.md
 * §4): panel de ingresos/egresos y control de calidad al recibir materia
 * prima o una pieza que vuelve de un proceso tercerizado. Comparte la base
 * de datos de `stock.ts` (movimiento_stock, stock_pieza) — separado en su
 * propio archivo porque el foco acá es el movimiento en sí (quién, cuándo,
 * de qué proveedor), no el saldo resultante.
 */
import { eq, desc, and, inArray, isNotNull, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { movimientoStock, stockPieza, pieza, usuario, proveedor, proceso, otPieza, operacion, registroOperacion } from "@/lib/db/schema";
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

/**
 * Piezas hoy "afuera" en un proceso tercerizado (Cromado, Pavonado,
 * Anodizado...) — se apoya en `proceso.tipo === "tercerizado"`. Antes salía
 * de `wip_pieza` (la foto fija migrada del Excel, que ningún flujo de la app
 * vuelve a actualizar); ahora se calcula en vivo desde la misma ejecución
 * real que ya usan /avance, /centros-trabajo y /stock (ver
 * src/lib/data/stock.ts) — evita que este panel muestre piezas que ya
 * volvieron del proveedor hace meses.
 *
 * "Compras" (`proceso.tipo === "compras"`) queda afuera a propósito
 * (devolución del cliente, docs/06-backlog-release-3.md): una pieza
 * esperando una compra nunca salió físicamente de la fábrica, así que no es
 * "fuera de fábrica" ni tercerizado — es un tema de stock, no de Logística.
 * Se ve en `getPiezasCompraPendientes` (produccion.ts).
 */
export async function getPiezasFueraDeFabrica(): Promise<PiezaFueraDeFabrica[]> {
  const filas = await db
    .select({ otPieza, piezaId: pieza.id, piezaCodigo: pieza.codigo, piezaNombre: pieza.nombre })
    .from(otPieza)
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId));
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

  const rutaPorPieza = new Map<string, { id: string; procesoId: string; procesoNombre: string; tipo: "interno" | "tercerizado" | "compras" }[]>();
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

  const acumulado = new Map<string, PiezaFueraDeFabrica>();
  for (const fila of filas) {
    const routing = rutaPorPieza.get(fila.piezaId) ?? [];
    if (routing.length === 0) continue;
    const completadas = completadasPorOtPieza.get(fila.otPieza.id) ?? new Set<string>();
    if (completadas.size >= routing.length) continue;
    const actual = routing.find((op) => !completadas.has(op.id));
    if (!actual || actual.tipo !== "tercerizado") continue;

    const clave = `${fila.piezaId}::${actual.procesoId}`;
    const acc = acumulado.get(clave) ?? {
      piezaId: fila.piezaId,
      piezaCodigo: fila.piezaCodigo,
      piezaNombre: fila.piezaNombre,
      procesoNombre: actual.procesoNombre,
      cantidad: 0,
    };
    acc.cantidad += fila.otPieza.cantidadAFabricar;
    acumulado.set(clave, acc);
  }

  return [...acumulado.values()];
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
