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
import { store, nuevoId } from "./store";
import { getRoutingPieza } from "./maestros";
import type { RegistroOperacion, Parada, TipoParada } from "@/lib/db/schema";

export async function getTiposParada(): Promise<TipoParada[]> {
  return store.tipoParada;
}

export async function getOperacionAbierta(usuarioId: string): Promise<RegistroOperacion | null> {
  return store.registroOperacion.find((r) => r.usuarioId === usuarioId && !r.fin) ?? null;
}

export async function getParadaAbierta(registroOperacionId: string): Promise<Parada | null> {
  return store.parada.find((p) => p.registroOperacionId === registroOperacionId && !p.fin) ?? null;
}

export type IniciarOperacionInput = {
  otPiezaId: string;
  operacionId: string;
  usuarioId: string;
  tipo: "setup" | "ejecucion";
};

export async function iniciarOperacion(input: IniciarOperacionInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const abierta = await getOperacionAbierta(input.usuarioId);
  if (abierta) {
    return { ok: false, error: "Ya tenés una operación abierta. Cerrala antes de iniciar otra." };
  }
  const registro: RegistroOperacion = {
    id: nuevoId("reg"),
    otPiezaId: input.otPiezaId,
    operacionId: input.operacionId,
    usuarioId: input.usuarioId,
    tipo: input.tipo,
    inicio: new Date(),
    fin: null,
    duracionSeg: null,
    piezasOk: 0,
    piezasRechazadas: 0,
    observacion: null,
  };
  store.registroOperacion.push(registro);
  return { ok: true, id: registro.id };
}

export async function pausarOperacion(registroOperacionId: string, tipoParadaId: string): Promise<void> {
  const existente = await getParadaAbierta(registroOperacionId);
  if (existente) return; // ya está pausada
  const parada: Parada = {
    id: nuevoId("par"),
    registroOperacionId,
    tipoParadaId,
    inicio: new Date(),
    fin: null,
    duracionSeg: null,
    observacion: null,
  };
  store.parada.push(parada);
}

export async function reanudarOperacion(registroOperacionId: string): Promise<void> {
  const parada = await getParadaAbierta(registroOperacionId);
  if (!parada) return;
  parada.fin = new Date();
  parada.duracionSeg = Math.round((parada.fin.getTime() - parada.inicio.getTime()) / 1000);
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
  const registro = store.registroOperacion.find((r) => r.id === input.registroOperacionId);
  if (!registro) throw new Error("Registro de operación no encontrado");

  // Si quedó una parada abierta, se cierra junto con la operación.
  const paradaAbierta = await getParadaAbierta(registro.id);
  if (paradaAbierta) await reanudarOperacion(registro.id);

  registro.fin = new Date();
  registro.duracionSeg = Math.round((registro.fin.getTime() - registro.inicio.getTime()) / 1000);
  registro.piezasOk = input.piezasOk;
  registro.piezasRechazadas = input.piezasRechazadas;
  registro.observacion = input.observacion ?? null;

  if (input.cierrePieza) {
    const otPieza = store.otPieza.find((p) => p.id === registro.otPiezaId);
    if (otPieza) {
      otPieza.piezasOk = input.piezasOk;
      otPieza.piezasNoOk = input.cierrePieza.piezasNoOk;
      otPieza.piezasDefectuosas = input.cierrePieza.piezasDefectuosas;
      otPieza.piezasRetrabajadas = input.cierrePieza.piezasRetrabajadas;
      otPieza.fechaFin = registro.fin;
      otPieza.updatedAt = new Date();
    }
  }
}

/** ¿La operación que se está por cerrar es la última de la hoja de ruta de esa pieza? */
export async function esUltimaOperacion(otPiezaId: string, operacionId: string): Promise<boolean> {
  const otPieza = store.otPieza.find((p) => p.id === otPiezaId);
  if (!otPieza) return false;
  const routing = await getRoutingPieza(otPieza.piezaId);
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
  const registros = store.registroOperacion.filter(
    (r) => r.operacionId === operacionId && r.tipo === tipo && r.fin && r.duracionSeg !== null,
  );
  if (registros.length === 0) return null;
  const duraciones = registros.map((r) => r.duracionSeg!);
  return {
    promedio: Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length),
    minimo: Math.min(...duraciones),
    maximo: Math.max(...duraciones),
    observaciones: duraciones.length,
  };
}

export async function getHistorialOtPieza(otPiezaId: string) {
  const registros = store.registroOperacion
    .filter((r) => r.otPiezaId === otPiezaId)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  return Promise.all(
    registros.map(async (r) => ({
      registro: r,
      paradas: store.parada.filter((p) => p.registroOperacionId === r.id),
    })),
  );
}
