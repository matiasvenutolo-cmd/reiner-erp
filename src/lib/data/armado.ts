/**
 * Control de armado (Release 2, paquete 7 — pedido de Horacio: "que cuando
 * todas las piezas de un conjunto estén listas se habilite una sección de
 * control de armado, donde también podamos poner procedimientos de armado y
 * control en donde se asiente que todo el conjunto funciona bien" — ver
 * docs/05-backlog-release-2.md §3, §9). El gate ("¿están todas las piezas
 * terminadas?") se calcula donde ya se calculaba el estado del conjunto
 * (src/lib/data/ot.ts) — acá sólo se guarda y se lee el control en sí.
 */
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { controlArmado, procedimiento, usuario } from "@/lib/db/schema";
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
}
