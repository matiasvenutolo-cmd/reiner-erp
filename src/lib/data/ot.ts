/**
 * Generación y consulta de Órdenes de Trabajo (RF-01 a RF-04, RF-09).
 *
 * La explosión máquina → conjunto → pieza reproduce el circuito del
 * PI-04 (ver docs/01-analisis.md §4): la cantidad a fabricar se PROPONE
 * como `cantidad_necesaria − stock_disponible` y sólo se genera una OT de
 * pieza cuando esa propuesta es mayor a cero — igual que la macro real,
 * que exige `Cant a Fab > 0`. La cantidad queda siempre editable.
 */
import { eq, inArray, and, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otMaquina, otConjunto, otPieza, registroOperacion, cliente } from "@/lib/db/schema";
import type { OtMaquina, OtPieza } from "@/lib/db/schema";
import {
  getConjuntos,
  getConjunto,
  getPiezasPorConfiguracion,
  getConfiguracion,
  getRoutingPieza,
} from "./maestros";
import { getStockDisponible } from "./stock";

export type NuevaOtMaquinaInput = {
  configuracionId: string;
  numeroSerie: string;
  clienteId: string;
  ordenCompra?: string;
  plazoEntrega?: string;
  emitidoPor: string;
  pais?: string;
};

export type EstadoCalculado = "pendiente" | "en_curso" | "terminada";

async function estadoDePieza(pieza: OtPieza): Promise<{ estado: EstadoCalculado; sinRouting: boolean }> {
  const routing = await getRoutingPieza(pieza.piezaId);
  if (routing.length === 0) return { estado: "pendiente", sinRouting: true };

  const registros = await db
    .select()
    .from(registroOperacion)
    .where(and(eq(registroOperacion.otPiezaId, pieza.id), eq(registroOperacion.tipo, "ejecucion")));

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
  const [existente] = await db.select({ id: otMaquina.id }).from(otMaquina).where(eq(otMaquina.codigo, codigoMaquina));
  if (existente) {
    throw new Error(`Ya existe una OT de máquina con el número de serie ${input.numeroSerie} (${codigoMaquina})`);
  }

  const [nuevaOt] = await db
    .insert(otMaquina)
    .values({
      codigo: codigoMaquina,
      numeroSerie: input.numeroSerie,
      configuracionId: configuracion.id,
      clienteId: input.clienteId,
      ordenCompra: input.ordenCompra,
      emitidoPor: input.emitidoPor,
      fechaEmision: new Date(),
      plazoEntrega: input.plazoEntrega,
      pais: input.pais ?? "Argentina",
      estado: "pendiente",
    })
    .returning();

  const conjuntos = await getConjuntos(configuracion.modeloId);
  const piezasConfig = await getPiezasPorConfiguracion(configuracion.id);

  const conjuntosAInsertar = conjuntos.map((c) => ({
    codigo: `${codigoMaquina}${c.codigo}`,
    otMaquinaId: nuevaOt.id,
    conjuntoId: c.id,
    estado: "pendiente" as const,
  }));
  const conjuntosCreados = conjuntosAInsertar.length
    ? await db.insert(otConjunto).values(conjuntosAInsertar).returning()
    : [];

  const piezasAInsertar: (typeof otPieza.$inferInsert)[] = [];
  for (const otc of conjuntosCreados) {
    const piezasDelConjunto = piezasConfig.filter((p) => p.conjuntoId === otc.conjuntoId);
    let seq = 0;
    for (const pieza of piezasDelConjunto) {
      const stockDisponible = await getStockDisponible(pieza.id);
      const propuesta = Math.max(pieza.cantidadNecesaria - stockDisponible, 0);
      if (propuesta <= 0) continue; // igual que el PI-04: sólo se genera OT de pieza si Cant a Fab > 0
      seq += 1;
      piezasAInsertar.push({
        codigo: `${otc.codigo}P${seq}`,
        otConjuntoId: otc.id,
        piezaId: pieza.id,
        material: pieza.material,
        cantidadNecesaria: pieza.cantidadNecesaria,
        stockAlGenerar: stockDisponible,
        cantidadAFabricar: propuesta,
        estado: "pendiente",
      });
    }
  }
  if (piezasAInsertar.length) {
    await db.insert(otPieza).values(piezasAInsertar);
  }

  return nuevaOt.id;
}

export async function listarOtMaquinas() {
  const maquinas = await db
    .select({ otMaquina, clienteNombre: cliente.razonSocial })
    .from(otMaquina)
    .leftJoin(cliente, eq(cliente.id, otMaquina.clienteId))
    .orderBy(desc(otMaquina.createdAt));

  return Promise.all(
    maquinas.map(async ({ otMaquina: m, clienteNombre }) => {
      const configuracion = await getConfiguracion(m.configuracionId);
      const conjuntos = await db.select({ id: otConjunto.id }).from(otConjunto).where(eq(otConjunto.otMaquinaId, m.id));
      const piezas = conjuntos.length
        ? await db
            .select()
            .from(otPieza)
            .where(
              inArray(
                otPieza.otConjuntoId,
                conjuntos.map((c) => c.id),
              ),
            )
        : [];
      const estadosPieza = await Promise.all(piezas.map(async (p) => (await estadoDePieza(p)).estado));
      const estado = piezas.length > 0 ? agregarEstados(estadosPieza) : "pendiente";
      return {
        ...m,
        clienteNombre,
        configuracion,
        totalPiezasAFabricar: piezas.length,
        piezasTerminadas: estadosPieza.filter((e) => e === "terminada").length,
        estadoCalculado: estado as EstadoCalculado,
      };
    }),
  );
}

export async function getOtMaquinaDetalle(id: string) {
  const [row] = await db
    .select({ otMaquina, clienteNombre: cliente.razonSocial })
    .from(otMaquina)
    .leftJoin(cliente, eq(cliente.id, otMaquina.clienteId))
    .where(eq(otMaquina.id, id));
  if (!row) return null;
  const configuracion = await getConfiguracion(row.otMaquina.configuracionId);

  const conjuntosOt = await db.select().from(otConjunto).where(eq(otConjunto.otMaquinaId, id));
  const conjuntos = await Promise.all(
    conjuntosOt.map(async (otc) => {
      const conjunto = await getConjunto(otc.conjuntoId);
      const piezasOt = await db.select().from(otPieza).where(eq(otPieza.otConjuntoId, otc.id));
      const piezasConEstado = await Promise.all(
        piezasOt.map(async (pieza) => ({ otPieza: pieza, ...(await estadoDePieza(pieza)) })),
      );
      const estadoConjunto = agregarEstados(piezasConEstado.map((p) => p.estado));
      return { otConjunto: otc, conjunto, piezas: piezasConEstado, estadoConjunto };
    }),
  );
  const estadoMaquina = agregarEstados(conjuntos.flatMap((c) => c.piezas.map((p) => p.estado)));

  return { otMaquina: row.otMaquina, clienteNombre: row.clienteNombre, configuracion, conjuntos, estadoCalculado: estadoMaquina };
}

/** Todas las OT de pieza existentes, sin importar su OT de máquina — usado
 * por la pantalla del operario (/taller) para listar candidatas de trabajo. */
export async function listarTodasLasOtPieza(): Promise<OtPieza[]> {
  return db.select().from(otPieza);
}

export async function getOtPieza(id: string): Promise<OtPieza | null> {
  const [row] = await db.select().from(otPieza).where(eq(otPieza.id, id));
  return row ?? null;
}

export async function actualizarCantidadAFabricar(otPiezaId: string, cantidad: number): Promise<void> {
  await db
    .update(otPieza)
    .set({ cantidadAFabricar: Math.max(0, Math.floor(cantidad)), updatedAt: new Date() })
    .where(eq(otPieza.id, otPiezaId));
}

export { estadoDePieza };
