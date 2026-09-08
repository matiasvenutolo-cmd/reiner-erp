/**
 * Generación y consulta de Órdenes de Trabajo (RF-01 a RF-04, RF-09).
 *
 * La explosión máquina → conjunto → pieza reproduce el circuito del
 * PI-04 (ver docs/01-analisis.md §4): la cantidad a fabricar se PROPONE
 * como `cantidad_necesaria − stock_disponible` y sólo se genera una OT de
 * pieza cuando esa propuesta es mayor a cero — igual que la macro real,
 * que exige `Cant a Fab > 0`. La cantidad queda siempre editable.
 */
import { store, nuevoId } from "./store";
import { getConjuntos, getConjunto, getPiezasPorConfiguracion, getConfiguracion, getRoutingPieza } from "./maestros";
import { getStockDisponible } from "./stock";
import type { OtMaquina, OtConjunto, OtPieza } from "@/lib/db/schema";

/** Clientes de ejemplo para la demo — REINER todavía no envió su maestro real (insumo pendiente #10). */
export const CLIENTES_DEMO = [
  { id: "casasco", razonSocial: "Laboratorios Casasco" },
  { id: "avellaneda", razonSocial: "Laboratorio de Avellaneda (parque alemán)" },
  { id: "otro", razonSocial: "Otro cliente" },
];

export type NuevaOtMaquinaInput = {
  configuracionId: string;
  numeroSerie: string;
  clienteNombre: string;
  ordenCompra?: string;
  plazoEntrega?: string;
  emitidoPor: string;
  pais?: string;
};

export type EstadoCalculado = "pendiente" | "en_curso" | "terminada";

async function estadoDePieza(otPieza: OtPieza): Promise<{ estado: EstadoCalculado; sinRouting: boolean }> {
  const routing = await getRoutingPieza(otPieza.piezaId);
  if (routing.length === 0) return { estado: "pendiente", sinRouting: true };
  const registros = store.registroOperacion.filter((r) => r.otPiezaId === otPieza.id && r.tipo === "ejecucion");
  const operacionesCompletadas = new Set(registros.filter((r) => r.fin).map((r) => r.operacionId));
  const hayAbierto = registros.some((r) => !r.fin);
  if (operacionesCompletadas.size >= routing.length) return { estado: "terminada", sinRouting: false };
  if (operacionesCompletadas.size > 0 || hayAbierto) return { estado: "en_curso", sinRouting: false };
  return { estado: "pendiente", sinRouting: false };
}

function agregarEstados(estados: EstadoCalculado[]): EstadoCalculado {
  if (estados.length === 0) return "pendiente";
  if (estados.every((e) => e === "terminada")) return "terminada";
  if (estados.some((e) => e === "en_curso" || e === "terminada")) return "en_curso";
  return "pendiente";
}

export async function generarOtMaquina(input: NuevaOtMaquinaInput): Promise<string> {
  const configuracion = await getConfiguracion(input.configuracionId);
  if (!configuracion) throw new Error("Configuración inválida");

  const codigoMaquina = `OTM${input.numeroSerie}`;
  if (store.otMaquina.some((m) => m.codigo === codigoMaquina)) {
    throw new Error(`Ya existe una OT de máquina con el número de serie ${input.numeroSerie} (${codigoMaquina})`);
  }

  const otMaquina: OtMaquina = {
    id: nuevoId("otm"),
    codigo: codigoMaquina,
    numeroSerie: input.numeroSerie,
    configuracionId: configuracion.id,
    clienteId: null,
    ordenCompra: input.ordenCompra ?? null,
    emitidoPor: input.emitidoPor,
    fechaEmision: new Date(),
    visadoPor: null,
    fechaVisado: null,
    plazoEntrega: input.plazoEntrega ?? null,
    fechaComprometida: null,
    pais: input.pais ?? "Argentina",
    estado: "pendiente",
    observaciones: input.clienteNombre, // cliente como texto libre hasta tener maestro real (insumo #10)
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.otMaquina.push(otMaquina);

  const conjuntos = await getConjuntos(configuracion.modeloId);
  const piezasConfig = await getPiezasPorConfiguracion(configuracion.id);

  for (const conjunto of conjuntos) {
    const codigoConjunto = `${codigoMaquina}${conjunto.codigo}`;
    const otConjunto: OtConjunto = {
      id: nuevoId("otc"),
      codigo: codigoConjunto,
      otMaquinaId: otMaquina.id,
      conjuntoId: conjunto.id,
      estado: "pendiente",
      fechaInicio: null,
      fechaFin: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.otConjunto.push(otConjunto);

    const piezasDelConjunto = piezasConfig.filter((p) => p.conjuntoId === conjunto.id);
    let seq = 0;
    for (const pieza of piezasDelConjunto) {
      const stockDisponible = await getStockDisponible(pieza.id);
      const propuesta = Math.max(pieza.cantidadNecesaria - stockDisponible, 0);
      if (propuesta <= 0) continue; // igual que el PI-04: sólo se genera OT de pieza si Cant a Fab > 0
      seq += 1;
      const otPieza: OtPieza = {
        id: nuevoId("otp"),
        codigo: `${codigoConjunto}P${seq}`,
        otConjuntoId: otConjunto.id,
        piezaId: pieza.id,
        material: pieza.material,
        cantidadNecesaria: pieza.cantidadNecesaria,
        stockAlGenerar: stockDisponible,
        cantidadAFabricar: propuesta,
        estado: "pendiente",
        fechaInicio: null,
        fechaFin: null,
        piezasOk: 0,
        piezasNoOk: 0,
        piezasDefectuosas: 0,
        piezasRetrabajadas: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.otPieza.push(otPieza);
    }
  }

  return otMaquina.id;
}

export async function listarOtMaquinas() {
  const resultado = await Promise.all(
    store.otMaquina.map(async (m) => {
      const configuracion = await getConfiguracion(m.configuracionId);
      const conjuntos = store.otConjunto.filter((c) => c.otMaquinaId === m.id);
      const piezas = store.otPieza.filter((p) => conjuntos.some((c) => c.id === p.otConjuntoId));
      const estadosPieza = await Promise.all(piezas.map(async (p) => (await estadoDePieza(p)).estado));
      const estado = piezas.length > 0 ? agregarEstados(estadosPieza) : "pendiente";
      return {
        ...m,
        configuracion,
        totalPiezasAFabricar: piezas.length,
        piezasTerminadas: estadosPieza.filter((e) => e === "terminada").length,
        estadoCalculado: estado as EstadoCalculado,
      };
    }),
  );
  return resultado.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getOtMaquinaDetalle(id: string) {
  const otMaquina = store.otMaquina.find((m) => m.id === id);
  if (!otMaquina) return null;
  const configuracion = await getConfiguracion(otMaquina.configuracionId);

  const conjuntos = await Promise.all(
    store.otConjunto
      .filter((c) => c.otMaquinaId === id)
      .map(async (otConjunto) => {
        const conjunto = await getConjunto(otConjunto.conjuntoId);
        const piezasOt = store.otPieza.filter((p) => p.otConjuntoId === otConjunto.id);
        const piezasConEstado = await Promise.all(
          piezasOt.map(async (otPieza) => ({ otPieza, ...(await estadoDePieza(otPieza)) })),
        );
        const estadoConjunto = agregarEstados(piezasConEstado.map((p) => p.estado));
        return { otConjunto, conjunto, piezas: piezasConEstado, estadoConjunto };
      }),
  );
  const estadoMaquina = agregarEstados(conjuntos.flatMap((c) => c.piezas.map((p) => p.estado)));

  return { otMaquina, configuracion, conjuntos, estadoCalculado: estadoMaquina };
}

export async function getOtPieza(id: string) {
  return store.otPieza.find((p) => p.id === id) ?? null;
}

export async function actualizarCantidadAFabricar(otPiezaId: string, cantidad: number): Promise<void> {
  const otPieza = store.otPieza.find((p) => p.id === otPiezaId);
  if (!otPieza) throw new Error("OT de pieza no encontrada");
  otPieza.cantidadAFabricar = Math.max(0, Math.floor(cantidad));
  otPieza.updatedAt = new Date();
}

export { estadoDePieza };
