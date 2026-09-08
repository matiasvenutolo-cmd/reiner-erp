/**
 * Lecturas de maestros: modelo → configuración → conjunto → pieza →
 * operación. Todo lo que sale de los Excel del cliente (ver
 * docs/01-analisis.md y docs/migracion-datos.md).
 *
 * Funciones `async` aunque hoy lean de un array en memoria: el día que se
 * conecte Postgres, cada una pasa a hacer un `db.select()...` sin cambiar
 * su firma ni los call-sites.
 */
import { FIXTURES } from "./fixtures-loader";
import type { ModeloFx, ConfiguracionFx, ConjuntoFx, PiezaFx, ProcesoFx } from "@/lib/fixtures/types";

export async function getModelos(): Promise<ModeloFx[]> {
  return FIXTURES.modelos;
}

export async function getModelo(id: string): Promise<ModeloFx | undefined> {
  return FIXTURES.modelos.find((m) => m.id === id);
}

export async function getConfiguraciones(modeloId?: string): Promise<ConfiguracionFx[]> {
  return modeloId ? FIXTURES.configuraciones.filter((c) => c.modeloId === modeloId) : FIXTURES.configuraciones;
}

export async function getConfiguracion(id: string): Promise<ConfiguracionFx | undefined> {
  return FIXTURES.configuraciones.find((c) => c.id === id);
}

export async function getConjuntos(modeloId?: string): Promise<ConjuntoFx[]> {
  const lista = modeloId
    ? FIXTURES.conjuntoModelo.filter((cm) => cm.modeloId === modeloId).map((cm) => cm.conjuntoId)
    : null;
  const conjuntos = lista ? FIXTURES.conjuntos.filter((c) => lista.includes(c.id)) : FIXTURES.conjuntos;
  return [...conjuntos].sort((a, b) => a.orden - b.orden);
}

export async function getConjunto(id: string): Promise<ConjuntoFx | undefined> {
  return FIXTURES.conjuntos.find((c) => c.id === id);
}

export async function getProcesos(): Promise<ProcesoFx[]> {
  return [...FIXTURES.procesos].sort((a, b) => a.ordenFlujo - b.ordenFlujo);
}

export async function getProceso(id: string): Promise<ProcesoFx | undefined> {
  return FIXTURES.procesos.find((p) => p.id === id);
}

/** Piezas que aplican a una configuración dada, con su cantidad necesaria. */
export async function getPiezasPorConfiguracion(
  configuracionId: string,
): Promise<(PiezaFx & { cantidadNecesaria: number })[]> {
  const links = FIXTURES.piezaConfiguracion.filter((pc) => pc.configuracionId === configuracionId);
  return links
    .map((link) => {
      const pieza = FIXTURES.piezas.find((p) => p.id === link.piezaId);
      return pieza ? { ...pieza, cantidadNecesaria: link.cantidadNecesaria } : null;
    })
    .filter((p): p is PiezaFx & { cantidadNecesaria: number } => p !== null);
}

export async function getPiezasPorConjunto(conjuntoId: string, modeloId?: string): Promise<PiezaFx[]> {
  return FIXTURES.piezas.filter((p) => p.conjuntoId === conjuntoId && (!modeloId || p.modeloId === modeloId));
}

export async function getPieza(id: string): Promise<PiezaFx | undefined> {
  return FIXTURES.piezas.find((p) => p.id === id);
}

export async function getPiezas(modeloId?: string): Promise<PiezaFx[]> {
  return modeloId ? FIXTURES.piezas.filter((p) => p.modeloId === modeloId) : FIXTURES.piezas;
}

export type OperacionConDetalle = {
  id: string;
  secuencia: number;
  ops: number;
  proceso: ProcesoFx;
  dispositivoNombre: string | null;
};

/** Hoja de ruta de una pieza: sus operaciones en secuencia, con el proceso resuelto. */
export async function getRoutingPieza(piezaId: string): Promise<OperacionConDetalle[]> {
  const ops = FIXTURES.operaciones
    .filter((op) => op.piezaId === piezaId)
    .sort((a, b) => a.secuencia - b.secuencia);
  return ops.map((op) => {
    const proceso = FIXTURES.procesos.find((p) => p.id === op.procesoId);
    const dispositivo = op.dispositivoId ? FIXTURES.dispositivos.find((d) => d.id === op.dispositivoId) : null;
    return {
      id: op.id,
      secuencia: op.secuencia,
      ops: op.ops,
      proceso: proceso ?? { id: op.procesoId, codigo: op.procesoId, nombre: op.procesoId, ordenFlujo: 999, esExterno: false },
      dispositivoNombre: dispositivo?.nombre ?? null,
    };
  });
}

export async function contarPiezasPorConjunto(modeloId?: string): Promise<Record<string, number>> {
  const piezas = await getPiezas(modeloId);
  const conteo: Record<string, number> = {};
  for (const p of piezas) conteo[p.conjuntoId] = (conteo[p.conjuntoId] ?? 0) + 1;
  return conteo;
}
