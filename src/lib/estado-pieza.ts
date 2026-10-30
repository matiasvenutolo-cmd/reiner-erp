/**
 * Un estado por pieza (simplificación §4.2). Es la capa que se ve: el motor
 * sigue calculando un estado por paso (futura, liberada, lista, en curso,
 * pausada, terminada, trabada) y acá se reduce a uno de cinco por pieza.
 *
 * - Falta material: la materia prima o el artículo no llegó.
 * - Lista: tiene material y puede empezar (o seguir con el próximo paso).
 * - En curso: un paso está empezado (aunque esté parado un rato).
 * - Trabada: no puede avanzar por otro motivo, siempre con el motivo.
 * - Terminada: completó la hoja de ruta (o llegó, si se compra hecha).
 *
 * "Esperando el paso anterior", "Liberada" y "Futura" no se muestran. La
 * urgencia (el margen) tampoco es un estado: va aparte.
 *
 * Criterio, hasta la entrada automática al plan: una pieza con material que
 * todavía no pasó al plan queda "Trabada · Falta pasarla al plan", porque
 * nadie la va a empezar hasta que alguien la pase.
 */
import type { Tarea, Compra } from "@/lib/planning/motor";
import type { Tono } from "@/components/ui/Etiqueta";
import { fechaCorta } from "@/lib/formato";

export type EstadoVisible = "falta_material" | "lista" | "en_curso" | "afuera" | "trabada" | "terminada";

export const ESTADOS_VISIBLES: EstadoVisible[] = ["falta_material", "lista", "en_curso", "afuera", "trabada", "terminada"];

export const ESTADO_VISIBLE: Record<EstadoVisible, { label: string; tono: Tono; icono: string }> = {
  falta_material: { label: "Falta material", tono: "naranja", icono: "alerta" },
  lista: { label: "Lista", tono: "azul", icono: "okCirculo" },
  en_curso: { label: "En curso", tono: "azulFuerte", icono: "empezar" },
  // Reorganización 30/10 §2.5: la pieza está en un tercerizado (con proveedor y vuelta prevista).
  afuera: { label: "Afuera", tono: "azul", icono: "tercerizados" },
  trabada: { label: "Trabada", tono: "rojo", icono: "bloqueo" },
  terminada: { label: "Terminada", tono: "verde", icono: "ok" },
};

export type EstadoDePieza = {
  estado: EstadoVisible;
  /** Siempre presente en "Trabada"; en "Falta material", qué se espera. */
  motivo: string | null;
  /** El paso que importa ahora (el que está en curso, o el próximo). */
  actual: Tarea | null;
};

/**
 * `tareas`: los pasos de la pieza en el plan. `compra`: su compra pendiente en el plan, si la hay.
 * `esperaMaterial`: la orden se confirmó con esta pieza en "Falta material" y la compra todavía no llegó.
 */
export function estadoDePieza(tareas: Tarea[], compra?: Compra | null, esperaMaterial?: string | null, noSeCompra?: boolean, proveedorAfuera?: string | null): EstadoDePieza {
  const pasos = [...tareas].sort((a, b) => a.posicion - b.posicion);
  const llegada = compra ? (compra.pedido ? `pedido${compra.llegadaPrevista ? `, llega el ${fechaCorta(compra.llegadaPrevista)}` : ""}` : "falta pedir") : null;

  // Se compra hecha: no tiene pasos.
  if (!pasos.length) {
    if (compra) return { estado: "falta_material", motivo: `Artículo: ${llegada}`, actual: null };
    return { estado: "terminada", motivo: noSeCompra ? "No se compra: se decidió al cargar la orden" : null, actual: null };
  }
  if (pasos.every((t) => t.estado === "terminada")) return { estado: "terminada", motivo: null, actual: null };

  const empezado = pasos.find((t) => t.estado === "en_curso" || t.estado === "pausada");
  if (empezado?.tipo === "tercerizado")
    return { estado: "afuera", motivo: `${proveedorAfuera ? `En ${proveedorAfuera}` : "En el tercerizado"}${empezado.finPlan ? ` · vuelve el ${fechaCorta(empezado.finPlan)}` : ""}`, actual: empezado };
  if (empezado) return { estado: "en_curso", motivo: empezado.estado === "pausada" ? "Parada por ahora" : null, actual: empezado };

  const actual = pasos.find((t) => t.estado !== "terminada")!;
  if (actual.tipo === "compras" || actual.motivoTraba === "Falta material" || actual.motivoTraba === "Esperando material")
    return { estado: "falta_material", motivo: llegada ? `Material: ${llegada}` : "Esperando material", actual };
  if (esperaMaterial) return { estado: "falta_material", motivo: esperaMaterial, actual };
  if (actual.estado === "trabada") return { estado: "trabada", motivo: actual.motivoTraba ?? "Sin motivo cargado", actual };
  if (actual.estado === "futura") return { estado: "trabada", motivo: "Falta pasarla al plan", actual };
  return { estado: "lista", motivo: null, actual };
}
