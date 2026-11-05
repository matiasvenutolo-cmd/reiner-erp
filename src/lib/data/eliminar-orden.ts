/**
 * Eliminar una orden (prueba 1, 05/11): sólo dirección. Borra la orden con todo lo que cuelga de ella —conjuntos,
 * piezas, reservas, necesidades de compra, cola de Gestión, asignaciones, registros del taller, paradas,
 * controles y su historia— en una sola transacción: o se borra todo, o nada.
 *
 * Lo que no es de la orden se conserva y sólo pierde el vínculo:
 * - las piezas que ya entraron al stock siguen en el stock (existen físicamente) y sus movimientos quedan;
 * - las solicitudes que Compras ya armó (cotizadas, confirmadas o pagadas) quedan en Compras, sin la pieza ni el pedido de origen;
 * - los remitos ya emitidos quedan, sin la pieza de la orden.
 * Las reservas se borran, así que ese stock vuelve a quedar libre; el material que ya llegó queda en Materia prima, libre.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  otMaquina,
  otConjunto,
  otPieza,
  reservaStock,
  necesidadCompraOrden,
  proyectoEvento,
  ordenBorrador,
  controlArmado,
  asignacionTrabajo,
  avisoPlanta,
  colaTarea,
  controlCalidad,
  movimientoStock,
  pedidoCompra,
  planAjuste,
  registroOperacion,
  parada,
  remitoItem,
  solicitudCompra,
  tareaAdelanto,
  tareaBloqueo,
  tareaLote,
  tareaRevision,
  tareaRevisionItem,
  articuloStock,
  stockConjunto,
} from "@/lib/db/schema";

export async function eliminarOrden(otMaquinaId: string): Promise<{ codigo: string }> {
  const [orden] = await db.select({ id: otMaquina.id, codigo: otMaquina.codigo }).from(otMaquina).where(eq(otMaquina.id, otMaquinaId));
  if (!orden) throw new Error("Esa orden no existe.");

  await db.transaction(async (tx) => {
    const conjuntos = (await tx.select({ id: otConjunto.id }).from(otConjunto).where(eq(otConjunto.otMaquinaId, orden.id))).map((c) => c.id);
    const piezas = conjuntos.length ? (await tx.select({ id: otPieza.id }).from(otPieza).where(inArray(otPieza.otConjuntoId, conjuntos))).map((p) => p.id) : [];

    if (piezas.length) {
      const registros = (await tx.select({ id: registroOperacion.id }).from(registroOperacion).where(inArray(registroOperacion.otPiezaId, piezas))).map((r) => r.id);
      if (registros.length) await tx.delete(parada).where(inArray(parada.registroOperacionId, registros));
      const revisiones = (await tx.select({ id: tareaRevision.id }).from(tareaRevision).where(inArray(tareaRevision.otPiezaId, piezas))).map((r) => r.id);
      if (revisiones.length) await tx.delete(tareaRevisionItem).where(inArray(tareaRevisionItem.tareaRevisionId, revisiones));

      // Lo que no es de la orden queda, sin el vínculo.
      await tx.update(movimientoStock).set({ otPiezaId: null }).where(inArray(movimientoStock.otPiezaId, piezas));
      await tx.update(solicitudCompra).set({ otPiezaId: null }).where(inArray(solicitudCompra.otPiezaId, piezas));
      // La compra confirmada queda en Compras (con su cotización y sus pagos), sin el pedido de la orden.
      const pedidos = (await tx.select({ id: pedidoCompra.id }).from(pedidoCompra).where(inArray(pedidoCompra.otPiezaId, piezas))).map((x) => x.id);
      if (pedidos.length) await tx.update(solicitudCompra).set({ pedidoCompraId: null }).where(inArray(solicitudCompra.pedidoCompraId, pedidos));
      await tx.update(remitoItem).set({ otPiezaId: null }).where(inArray(remitoItem.otPiezaId, piezas));
      // El material que ya llegó existe: queda en Materia prima, libre.
      await tx.update(articuloStock).set({ otPiezaId: null, asignada: 0 }).where(inArray(articuloStock.otPiezaId, piezas));

      for (const t of [registroOperacion, tareaRevision, asignacionTrabajo, avisoPlanta, colaTarea, controlCalidad, pedidoCompra, planAjuste, tareaAdelanto, tareaBloqueo, tareaLote, necesidadCompraOrden])
        await tx.delete(t).where(inArray(t.otPiezaId, piezas));
      await tx.delete(otPieza).where(inArray(otPieza.id, piezas));
    }
    if (conjuntos.length) await tx.delete(controlArmado).where(inArray(controlArmado.otConjuntoId, conjuntos));
    // Un conjunto ya armado existe: queda en Productos terminados, libre.
    await tx.update(stockConjunto).set({ otMaquinaId: null, otConjuntoId: null }).where(eq(stockConjunto.otMaquinaId, orden.id));
    await tx.delete(otConjunto).where(eq(otConjunto.otMaquinaId, orden.id));
    await tx.delete(necesidadCompraOrden).where(eq(necesidadCompraOrden.otMaquinaId, orden.id));
    await tx.delete(reservaStock).where(eq(reservaStock.otMaquinaId, orden.id));
    await tx.delete(proyectoEvento).where(eq(proyectoEvento.otMaquinaId, orden.id));
    await tx.delete(ordenBorrador).where(eq(ordenBorrador.otMaquinaId, orden.id));
    await tx.delete(otMaquina).where(eq(otMaquina.id, orden.id));
  });
  return { codigo: orden.codigo };
}
