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
import { otMaquina, otConjunto, otPieza, registroOperacion, cliente, operacion, configuracion } from "@/lib/db/schema";
import type { OtMaquina, OtPieza } from "@/lib/db/schema";
import {
  getConjuntos,
  getPiezasPorConfiguracion,
  getConfiguracion,
  getRoutingPieza,
  type OperacionConDetalle,
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

export type EstadoYOperacion = {
  estado: EstadoCalculado;
  sinRouting: boolean;
  /** Primer paso de la hoja de ruta sin un registro de ejecución cerrado — null si terminada o sin routing. */
  operacionActual: OperacionConDetalle | null;
  /** Hoja de ruta completa, ya cargada — evita que el caller la vuelva a pedir. */
  routing: OperacionConDetalle[];
};

/** Estado + operación actual de una OT de pieza, derivados siempre del
 * histórico de `registro_operacion` (nunca de `ot_pieza.estado`, que sólo se
 * escribe al crear la fila y después queda desactualizado — ver
 * docs/05-backlog-release-2.md §9). Único lugar que hace este cálculo: antes
 * vivía duplicado acá y en /taller/[otPiezaId]. */
export async function getEstadoYOperacionActual(pieza: OtPieza): Promise<EstadoYOperacion> {
  const routing = await getRoutingPieza(pieza.piezaId);
  if (routing.length === 0) return { estado: "pendiente", sinRouting: true, operacionActual: null, routing };

  const registros = await db
    .select()
    .from(registroOperacion)
    .where(and(eq(registroOperacion.otPiezaId, pieza.id), eq(registroOperacion.tipo, "ejecucion")));

  const operacionesCompletadas = new Set(registros.filter((r) => r.fin).map((r) => r.operacionId));
  const hayAbierto = registros.some((r) => !r.fin);
  const operacionActual = routing.find((op) => !operacionesCompletadas.has(op.id)) ?? null;

  const estado: EstadoCalculado =
    operacionesCompletadas.size >= routing.length ? "terminada" : operacionesCompletadas.size > 0 || hayAbierto ? "en_curso" : "pendiente";

  return { estado, sinRouting: false, operacionActual, routing };
}

async function estadoDePieza(pieza: OtPieza): Promise<{ estado: EstadoCalculado; sinRouting: boolean }> {
  const { estado, sinRouting } = await getEstadoYOperacionActual(pieza);
  return { estado, sinRouting };
}

/**
 * Igual que `getEstadoYOperacionActual`, pero para muchas OT de pieza a la
 * vez, en 2 queries en vez de 2 por pieza. `listarOtMaquinas` y
 * `getOtMaquinaDetalle` llamaban a `estadoDePieza` una por una dentro de un
 * `Promise.all` — con ~450 piezas × varias OT de máquina sembradas, eso
 * tardaba 15-35s por carga de `/avance` (encontrado probando en el
 * navegador, mismo tipo de bug que ya había tumbado el build de
 * /centros-trabajo — ver docs/05-backlog-release-2.md §9).
 */
async function getEstadosBatch(piezas: OtPieza[]): Promise<Map<string, { estado: EstadoCalculado; sinRouting: boolean }>> {
  const resultado = new Map<string, { estado: EstadoCalculado; sinRouting: boolean }>();
  if (piezas.length === 0) return resultado;

  const piezaIds = [...new Set(piezas.map((p) => p.piezaId))];
  const otPiezaIds = piezas.map((p) => p.id);

  const [operaciones, registros] = await Promise.all([
    db.select({ piezaId: operacion.piezaId, id: operacion.id }).from(operacion).where(inArray(operacion.piezaId, piezaIds)),
    db
      .select({ otPiezaId: registroOperacion.otPiezaId, operacionId: registroOperacion.operacionId, fin: registroOperacion.fin })
      .from(registroOperacion)
      .where(and(inArray(registroOperacion.otPiezaId, otPiezaIds), eq(registroOperacion.tipo, "ejecucion"))),
  ]);

  const totalOpsPorPieza = new Map<string, number>();
  for (const o of operaciones) totalOpsPorPieza.set(o.piezaId, (totalOpsPorPieza.get(o.piezaId) ?? 0) + 1);

  const completadasPorOtPieza = new Map<string, Set<string>>();
  const abiertaPorOtPieza = new Set<string>();
  for (const r of registros) {
    if (r.fin) {
      const set = completadasPorOtPieza.get(r.otPiezaId) ?? new Set<string>();
      set.add(r.operacionId);
      completadasPorOtPieza.set(r.otPiezaId, set);
    } else {
      abiertaPorOtPieza.add(r.otPiezaId);
    }
  }

  for (const p of piezas) {
    const totalOps = totalOpsPorPieza.get(p.piezaId) ?? 0;
    if (totalOps === 0) {
      resultado.set(p.id, { estado: "pendiente", sinRouting: true });
      continue;
    }
    const completadas = completadasPorOtPieza.get(p.id)?.size ?? 0;
    const abierta = abiertaPorOtPieza.has(p.id);
    const estado: EstadoCalculado = completadas >= totalOps ? "terminada" : completadas > 0 || abierta ? "en_curso" : "pendiente";
    resultado.set(p.id, { estado, sinRouting: false });
  }
  return resultado;
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
  if (maquinas.length === 0) return [];

  const maquinaIds = maquinas.map((m) => m.otMaquina.id);
  const conjuntosTodos = await db.select().from(otConjunto).where(inArray(otConjunto.otMaquinaId, maquinaIds));
  const conjuntoIdsPorMaquina = new Map<string, string[]>();
  for (const c of conjuntosTodos) {
    const arr = conjuntoIdsPorMaquina.get(c.otMaquinaId) ?? [];
    arr.push(c.id);
    conjuntoIdsPorMaquina.set(c.otMaquinaId, arr);
  }

  const conjuntoIdsTodos = conjuntosTodos.map((c) => c.id);
  const piezasTodas = conjuntoIdsTodos.length ? await db.select().from(otPieza).where(inArray(otPieza.otConjuntoId, conjuntoIdsTodos)) : [];
  const piezasPorConjunto = new Map<string, OtPieza[]>();
  for (const p of piezasTodas) {
    const arr = piezasPorConjunto.get(p.otConjuntoId) ?? [];
    arr.push(p);
    piezasPorConjunto.set(p.otConjuntoId, arr);
  }

  const [estados, configs] = await Promise.all([
    getEstadosBatch(piezasTodas),
    (async () => {
      const configIds = [...new Set(maquinas.map((m) => m.otMaquina.configuracionId))];
      const rows = configIds.length ? await db.select().from(configuracion).where(inArray(configuracion.id, configIds)) : [];
      return new Map(rows.map((c) => [c.id, c]));
    })(),
  ]);

  return maquinas.map(({ otMaquina: m, clienteNombre }) => {
    const conjuntoIds = conjuntoIdsPorMaquina.get(m.id) ?? [];
    const piezas = conjuntoIds.flatMap((cid) => piezasPorConjunto.get(cid) ?? []);
    const estadosPieza = piezas.map((p) => estados.get(p.id)?.estado ?? "pendiente");
    const estado = piezas.length > 0 ? agregarEstados(estadosPieza) : "pendiente";
    return {
      ...m,
      clienteNombre,
      configuracion: configs.get(m.configuracionId),
      totalPiezasAFabricar: piezas.length,
      piezasTerminadas: estadosPieza.filter((e) => e === "terminada").length,
      estadoCalculado: estado,
    };
  });
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
  const conjuntoIds = conjuntosOt.map((c) => c.id);
  const [piezasTodas, conjuntosMaestro] = await Promise.all([
    conjuntoIds.length ? db.select().from(otPieza).where(inArray(otPieza.otConjuntoId, conjuntoIds)) : Promise.resolve([]),
    getConjuntos().then((todos) => new Map(todos.map((c) => [c.id, c]))),
  ]);
  const estados = await getEstadosBatch(piezasTodas);

  const piezasPorConjuntoOt = new Map<string, OtPieza[]>();
  for (const p of piezasTodas) {
    const arr = piezasPorConjuntoOt.get(p.otConjuntoId) ?? [];
    arr.push(p);
    piezasPorConjuntoOt.set(p.otConjuntoId, arr);
  }

  const conjuntos = conjuntosOt.map((otc) => {
    const piezasOt = piezasPorConjuntoOt.get(otc.id) ?? [];
    const piezasConEstado = piezasOt.map((pieza) => ({
      otPieza: pieza,
      estado: estados.get(pieza.id)?.estado ?? ("pendiente" as EstadoCalculado),
      sinRouting: estados.get(pieza.id)?.sinRouting ?? true,
    }));
    const estadoConjunto = agregarEstados(piezasConEstado.map((p) => p.estado));
    return { otConjunto: otc, conjunto: conjuntosMaestro.get(otc.conjuntoId), piezas: piezasConEstado, estadoConjunto };
  });
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
