/**
 * Ejecución en taller: iniciar/pausar/finalizar una operación, registrar
 * paradas, y el cálculo de tiempo estándar (RF-05 a RF-08).
 *
 * RF-05 es el requerimiento pivote del proyecto (ver docs/01-analisis.md
 * §2): éste es el módulo que existe para hacer posible que el operario
 * cargue desde el celular en 2-3 toques.
 *
 * Asunción pendiente de confirmar con Horacio (ver docs/03-plan-fase-1.md):
 * un operario no puede tener dos operaciones abiertas a la vez. Si el
 * taller trabaja distinto, esta regla se relaja acá sin tocar la UI.
 */
import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { registroOperacion, parada, tipoParada, otPieza } from "@/lib/db/schema";
import { getRoutingPieza } from "./maestros";
import type { RegistroOperacion, Parada, TipoParada } from "@/lib/db/schema";

export async function getTiposParada(): Promise<TipoParada[]> {
  return db.select().from(tipoParada);
}

export async function getOperacionAbierta(usuarioId: string): Promise<RegistroOperacion | null> {
  const [row] = await db
    .select()
    .from(registroOperacion)
    .where(and(eq(registroOperacion.usuarioId, usuarioId), isNull(registroOperacion.fin)));
  return row ?? null;
}

export async function getParadaAbierta(registroOperacionId: string): Promise<Parada | null> {
  const [row] = await db
    .select()
    .from(parada)
    .where(and(eq(parada.registroOperacionId, registroOperacionId), isNull(parada.fin)));
  return row ?? null;
}

export type IniciarOperacionInput = {
  otPiezaId: string;
  operacionId: string;
  usuarioId: string;
  tipo: "setup" | "ejecucion";
};

export async function iniciarOperacion(
  input: IniciarOperacionInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const abierta = await getOperacionAbierta(input.usuarioId);
  if (abierta) {
    return { ok: false, error: "Ya tenés una operación abierta. Cerrala antes de iniciar otra." };
  }
  const [registro] = await db
    .insert(registroOperacion)
    .values({
      otPiezaId: input.otPiezaId,
      operacionId: input.operacionId,
      usuarioId: input.usuarioId,
      tipo: input.tipo,
      inicio: new Date(),
      piezasOk: 0,
      piezasRechazadas: 0,
    })
    .returning();
  return { ok: true, id: registro.id };
}

export async function pausarOperacion(registroOperacionId: string, tipoParadaId: string): Promise<void> {
  const existente = await getParadaAbierta(registroOperacionId);
  if (existente) return; // ya está pausada
  await db.insert(parada).values({ registroOperacionId, tipoParadaId, inicio: new Date() });
}

export async function reanudarOperacion(registroOperacionId: string): Promise<void> {
  const abierta = await getParadaAbierta(registroOperacionId);
  if (!abierta) return;
  const fin = new Date();
  const duracionSeg = Math.round((fin.getTime() - abierta.inicio.getTime()) / 1000);
  await db.update(parada).set({ fin, duracionSeg }).where(eq(parada.id, abierta.id));
}

export type FinalizarOperacionInput = {
  registroOperacionId: string;
  piezasOk: number;
  piezasRechazadas: number;
  observacion?: string;
  // Sólo si es la última operación de la hoja de ruta de la pieza:
  cierrePieza?: {
    piezasNoOk: number;
    piezasDefectuosas: number;
    piezasRetrabajadas: number;
  };
};

export async function finalizarOperacion(input: FinalizarOperacionInput): Promise<void> {
  const [registro] = await db.select().from(registroOperacion).where(eq(registroOperacion.id, input.registroOperacionId));
  if (!registro) throw new Error("Registro de operación no encontrado");

  // Si quedó una parada abierta, se cierra junto con la operación.
  await reanudarOperacion(registro.id);

  const fin = new Date();
  const duracionSeg = Math.round((fin.getTime() - registro.inicio.getTime()) / 1000);
  await db
    .update(registroOperacion)
    .set({ fin, duracionSeg, piezasOk: input.piezasOk, piezasRechazadas: input.piezasRechazadas, observacion: input.observacion })
    .where(eq(registroOperacion.id, registro.id));

  if (input.cierrePieza) {
    await db
      .update(otPieza)
      .set({
        piezasOk: input.piezasOk,
        piezasNoOk: input.cierrePieza.piezasNoOk,
        piezasDefectuosas: input.cierrePieza.piezasDefectuosas,
        piezasRetrabajadas: input.cierrePieza.piezasRetrabajadas,
        fechaFin: fin,
        updatedAt: fin,
      })
      .where(eq(otPieza.id, registro.otPiezaId));
  }
}

/** ¿La operación que se está por cerrar es la última de la hoja de ruta de esa pieza? */
export async function esUltimaOperacion(otPiezaId: string, operacionId: string): Promise<boolean> {
  const [pieza] = await db.select().from(otPieza).where(eq(otPieza.id, otPiezaId));
  if (!pieza) return false;
  const routing = await getRoutingPieza(pieza.piezaId);
  if (routing.length === 0) return false;
  return routing[routing.length - 1].id === operacionId;
}

export type TiempoEstandar = { promedio: number; minimo: number; maximo: number; observaciones: number };

/**
 * Tiempo estándar por pieza × operación × tipo, calculado sobre el
 * histórico acumulado (RF-08). Devuelve rango y no sólo promedio, porque
 * con 2-3 máquinas por año un promedio simple engaña (ver docs/01-analisis.md §5).
 */
export async function getTiempoEstandar(operacionId: string, tipo: "setup" | "ejecucion"): Promise<TiempoEstandar | null> {
  const [row] = await db
    .select({
      promedio: sql<number>`avg(${registroOperacion.duracionSeg})`.mapWith(Number),
      minimo: sql<number>`min(${registroOperacion.duracionSeg})`.mapWith(Number),
      maximo: sql<number>`max(${registroOperacion.duracionSeg})`.mapWith(Number),
      observaciones: sql<number>`count(*)`.mapWith(Number),
    })
    .from(registroOperacion)
    .where(
      and(
        eq(registroOperacion.operacionId, operacionId),
        eq(registroOperacion.tipo, tipo),
        sql`${registroOperacion.fin} is not null`,
      ),
    );
  if (!row || row.observaciones === 0) return null;
  return { promedio: Math.round(row.promedio), minimo: row.minimo, maximo: row.maximo, observaciones: row.observaciones };
}

export async function getHistorialOtPieza(otPiezaId: string) {
  const registros = await db
    .select()
    .from(registroOperacion)
    .where(eq(registroOperacion.otPiezaId, otPiezaId))
    .orderBy(registroOperacion.inicio);
  return Promise.all(
    registros.map(async (r) => ({
      registro: r,
      paradas: await db.select().from(parada).where(eq(parada.registroOperacionId, r.id)),
    })),
  );
}
