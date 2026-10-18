"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  generarOtMaquina,
  actualizarCantidadAFabricar,
  completarOtConjunto,
  generarOtPiezaSuelta,
  generarOrdenSuelta,
  enviarAProduccion,
  getOtPiezaIdsSinEnviar,
} from "@/lib/data/ot";
import { getUsuarioDePlanta } from "@/lib/session";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otMaquina } from "@/lib/db/schema";
import { hoyISO } from "@/lib/fecha";

function volverANuevaCon(mensaje: string): never {
  redirect(`/ot/nueva?error=${encodeURIComponent(mensaje)}`);
}

export async function crearOtMaquinaAction(formData: FormData) {
  await getUsuarioDePlanta();
  const configuracionId = String(formData.get("configuracionId") ?? "");
  const numeroSerie = String(formData.get("numeroSerie") ?? "").trim();
  const clienteId = String(formData.get("clienteId") ?? "").trim();
  const ordenCompra = String(formData.get("ordenCompra") ?? "").trim();
  const plazoEntrega = String(formData.get("plazoEntrega") ?? "").trim();
  const emitidoPor = String(formData.get("emitidoPor") ?? "").trim();

  if (!configuracionId || !numeroSerie || !clienteId || !emitidoPor) {
    volverANuevaCon("Faltan datos obligatorios: configuración, número de serie, cliente y emitido por.");
  }

  let id: string;
  try {
    id = await generarOtMaquina({
      configuracionId,
      numeroSerie,
      clienteId,
      ordenCompra: ordenCompra || undefined,
      plazoEntrega: plazoEntrega || undefined,
      emitidoPor,
    });
  } catch (e) {
    volverANuevaCon(e instanceof Error ? e.message : "No se pudo generar la OT.");
  }

  revalidatePath("/ot");
  redirect(`/ot/${id}`);
}

export async function actualizarCantidadAction(formData: FormData) {
  await getUsuarioDePlanta();
  const otPiezaId = String(formData.get("otPiezaId") ?? "");
  const cantidad = Number(formData.get("cantidad") ?? 0);
  const otMaquinaId = String(formData.get("otMaquinaId") ?? "");
  await actualizarCantidadAFabricar(otPiezaId, cantidad);
  revalidatePath(`/ot/${otMaquinaId}`);
}

export async function completarOtConjuntoAction(formData: FormData) {
  await getUsuarioDePlanta();
  const otMaquinaId = String(formData.get("otMaquinaId") ?? "");
  const otConjuntoId = String(formData.get("otConjuntoId") ?? "");
  if (!otMaquinaId || !otConjuntoId) throw new Error("Faltan datos.");

  await completarOtConjunto(otConjuntoId);
  revalidatePath(`/ot/${otMaquinaId}`);
}

export async function agregarPiezaSueltaAction(formData: FormData) {
  await getUsuarioDePlanta();
  const otMaquinaId = String(formData.get("otMaquinaId") ?? "");
  const otConjuntoId = String(formData.get("otConjuntoId") ?? "");
  const piezaId = String(formData.get("piezaId") ?? "");
  const cantidad = Number(formData.get("cantidad"));

  if (!otMaquinaId || !otConjuntoId || !piezaId || !Number.isFinite(cantidad) || cantidad <= 0) {
    throw new Error("Faltan datos o la cantidad es inválida.");
  }

  await generarOtPiezaSuelta({ otConjuntoId, piezaId, cantidadAFabricar: cantidad });
  revalidatePath(`/ot/${otMaquinaId}`);
}

export async function crearOrdenSueltaAction(formData: FormData) {
  await getUsuarioDePlanta();
  const configuracionId = String(formData.get("configuracionId") ?? "");
  const referencia = String(formData.get("referencia") ?? "").trim();
  const clienteId = String(formData.get("clienteId") ?? "").trim();
  const ordenCompra = String(formData.get("ordenCompra") ?? "").trim();
  const plazoEntrega = String(formData.get("plazoEntrega") ?? "").trim();
  const emitidoPor = String(formData.get("emitidoPor") ?? "").trim();
  const tipo = String(formData.get("tipoSuelta") ?? "");

  // v2 — destino: Cliente (repuesto) o Stock. Stock no tiene cliente y pide un motivo.
  const destino = String(formData.get("destino") ?? "repuesto") === "stock" ? "stock" : "repuesto";
  const fechaEntrega = String(formData.get("fechaEntrega") ?? "").trim();
  const prioridad = String(formData.get("prioridad") ?? "") === "alta" ? "alta" : "normal";
  const motivoStock = String(formData.get("motivoStock") ?? "").trim();
  if (!configuracionId || !referencia || (destino === "repuesto" && !clienteId) || !emitidoPor) {
    volverANuevaCon(destino === "stock" ? "Faltan datos obligatorios: máquina, referencia y emitido por." : "Faltan datos obligatorios: máquina, referencia, cliente y emitido por.");
  }
  if (destino === "stock" && !motivoStock) volverANuevaCon("Una orden para stock pide un motivo.");

  const base = {
    configuracionId,
    referencia,
    clienteId: destino === "stock" ? null : clienteId,
    paraStock: destino === "stock",
    ordenCompra: ordenCompra || undefined,
    plazoEntrega: plazoEntrega || undefined,
    emitidoPor,
  };

  let id: string;
  try {
    if (tipo === "conjunto") {
      const conjuntoId = String(formData.get("conjuntoId") ?? "");
      if (!conjuntoId) throw new Error("Elegí un conjunto.");
      id = await generarOrdenSuelta({ ...base, tipo: "conjunto", conjuntoId });
    } else if (tipo === "pieza") {
      const piezaId = String(formData.get("piezaId") ?? "");
      const cantidad = Number(formData.get("cantidad"));
      if (!piezaId || !Number.isFinite(cantidad) || cantidad <= 0) throw new Error("Elegí una pieza y una cantidad válida.");
      id = await generarOrdenSuelta({ ...base, tipo: "pieza", piezaId, cantidad });
    } else {
      throw new Error("Elegí conjunto o pieza.");
    }
  } catch (e) {
    volverANuevaCon(e instanceof Error ? e.message : "No se pudo generar la orden.");
  }

  // v2 — una orden de un solo nivel con fecha queda activa: entra sola al plan.
  await db
    .update(otMaquina)
    .set({ destino, motivoStock: destino === "stock" ? motivoStock : null, prioridad, fechaEntrega: fechaEntrega || null, estadoProyecto: fechaEntrega ? "activo" : "borrador", fechaInicioProyecto: fechaEntrega ? hoyISO() : null })
    .where(eq(otMaquina.id, id));
  revalidatePath("/ot");
  revalidatePath("/proyectos");
  redirect(fechaEntrega ? `/proyectos/${id}` : `/ot/${id}`);
}

/**
 * Pedido de fabricación (ingeniería → producción): una pieza, un conjunto o
 * toda la OT. Después de esto la pieza aparece en Planificación para que
 * taller le asigne día, operación y operario.
 */
export async function enviarAProduccionAction(formData: FormData) {
  const usuario = await getUsuarioDePlanta();
  if (usuario.rol === "operario") throw new Error("No autorizado.");
  const otPiezaId = String(formData.get("otPiezaId") ?? "");
  const otConjuntoId = String(formData.get("otConjuntoId") ?? "");
  const otMaquinaId = String(formData.get("otMaquinaId") ?? "");
  const ids = otPiezaId
    ? [otPiezaId]
    : await getOtPiezaIdsSinEnviar(otConjuntoId ? { otConjuntoId } : { otMaquinaId });
  await enviarAProduccion(ids, usuario.id);
  for (const ruta of ["/ot", "/planificacion", "/centros-trabajo", "/taller", "/avance"]) revalidatePath(ruta, "layout");
}
