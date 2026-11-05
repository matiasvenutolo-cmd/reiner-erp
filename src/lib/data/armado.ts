/**
 * Control de armado (Release 2, paquete 7 — pedido de Horacio: "que cuando
 * todas las piezas de un conjunto estén listas se habilite una sección de
 * control de armado, donde también podamos poner procedimientos de armado y
 * control en donde se asiente que todo el conjunto funciona bien" — ver
 * docs/05-backlog-release-2.md §3, §9). El gate ("¿están todas las piezas
 * terminadas?") se calcula donde ya se calculaba el estado del conjunto
 * (src/lib/data/ot.ts) — acá sólo se guarda y se lee el control en sí.
 */
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { controlArmado, procedimiento, usuario, otConjunto, otMaquina, otPieza, stockPieza, reservaStock, movimientoStock, stockConjunto } from "@/lib/db/schema";
import type { Procedimiento } from "@/lib/db/schema";

export async function getProcedimientos(): Promise<Procedimiento[]> {
  return db.select().from(procedimiento);
}

export type ControlArmadoConDetalle = {
  id: string;
  resultado: "ok" | "no_ok";
  observacion: string | null;
  fecha: Date;
  procedimientoCodigo: string | null;
  revisadoPorNombre: string;
};

/** Últimos controles de armado registrados para un conjunto — puede haber
 * más de uno si un NO OK se corrige y se vuelve a controlar. */
export async function getControlesArmado(otConjuntoId: string): Promise<ControlArmadoConDetalle[]> {
  const rows = await db
    .select({
      id: controlArmado.id,
      resultado: controlArmado.resultado,
      observacion: controlArmado.observacion,
      fecha: controlArmado.fecha,
      procedimientoCodigo: procedimiento.codigo,
      revisadoPorNombre: usuario.nombre,
    })
    .from(controlArmado)
    .innerJoin(usuario, eq(usuario.id, controlArmado.revisadoPorId))
    .leftJoin(procedimiento, eq(procedimiento.id, controlArmado.procedimientoId))
    .where(eq(controlArmado.otConjuntoId, otConjuntoId))
    .orderBy(desc(controlArmado.fecha));
  return rows;
}

export type RegistrarControlArmadoInput = {
  otConjuntoId: string;
  procedimientoId?: string;
  resultado: "ok" | "no_ok";
  observacion?: string;
  usuarioId: string;
};

export async function registrarControlArmado(input: RegistrarControlArmadoInput): Promise<void> {
  await db.insert(controlArmado).values({
    otConjuntoId: input.otConjuntoId,
    procedimientoId: input.procedimientoId,
    resultado: input.resultado,
    observacion: input.observacion,
    revisadoPorId: input.usuarioId,
  });
  if (input.resultado === "ok") await entrarConjuntoAlStock(input.otConjuntoId, input.usuarioId);
}

/**
 * Tanda 2 (05/11): con el armado OK, el conjunto entra a Productos terminados (reservado para su orden, o libre si
 * la orden era para stock) y sus piezas salen del stock de piezas: dejan de figurar sueltas. Si el conjunto ya
 * había entrado (un segundo control OK), no se vuelve a sumar.
 */
async function entrarConjuntoAlStock(otConjuntoId: string, usuarioId: string): Promise<void> {
  const [oc] = await db
    .select({ oc: otConjunto, m: otMaquina })
    .from(otConjunto)
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .where(eq(otConjunto.id, otConjuntoId));
  if (!oc) return;
  const [ya] = await db.select({ id: stockConjunto.id }).from(stockConjunto).where(eq(stockConjunto.otConjuntoId, otConjuntoId));
  if (ya) return;
  const piezas = await db.select().from(otPieza).where(eq(otPieza.otConjuntoId, otConjuntoId));
  const paraStock = oc.m.destino === "stock";
  await db.transaction(async (tx) => {
    for (const p of piezas) {
      const [st] = await tx.select().from(stockPieza).where(eq(stockPieza.piezaId, p.piezaId));
      const sale = Math.min(p.cantidadNecesaria, st?.cantidadDisponible ?? 0);
      if (sale <= 0) continue;
      await tx.update(stockPieza).set({ cantidadDisponible: (st?.cantidadDisponible ?? 0) - sale, updatedAt: new Date() }).where(eq(stockPieza.piezaId, p.piezaId));
      // Lo reservado para esta orden se consume primero.
      let resta = sale;
      const reservas = await tx.select().from(reservaStock).where(and(eq(reservaStock.otMaquinaId, oc.m.id), eq(reservaStock.piezaId, p.piezaId)));
      for (const r of reservas) {
        if (resta <= 0) break;
        const usa = Math.min(resta, r.cantidad);
        await tx.update(reservaStock).set({ cantidad: r.cantidad - usa }).where(eq(reservaStock.id, r.id));
        resta -= usa;
      }
      await tx.insert(movimientoStock).values({
        piezaId: p.piezaId,
        tipo: "egreso",
        cantidad: sale,
        otPiezaId: p.id,
        usuarioId,
        observacion: `Armado del conjunto — ${oc.oc.codigo}`,
      });
    }
    await tx.insert(stockConjunto).values({
      conjuntoId: oc.oc.conjuntoId,
      configuracionId: oc.m.configuracionId,
      otConjuntoId,
      otMaquinaId: paraStock ? null : oc.m.id,
      cantidad: 1,
    });
  });
}
