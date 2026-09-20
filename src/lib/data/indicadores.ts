/**
 * Panel de indicadores (Release 2, paquete 7 — pedido de Horacio: "un panel
 * donde se puedan observar todos los indicadores disparados desde la
 * fabricación: tiempos transcurridos, paradas, errores, setups, etc").
 * Sólo lectura — agrega lo que ya se viene cargando en /taller desde
 * Fase 1 (registro_operacion, parada), nada nuevo que registrar.
 */
import { eq, desc, sql, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { registroOperacion, parada, tipoParada, usuario, otPieza, proceso, operacion } from "@/lib/db/schema";

export type ResumenIndicadores = {
  horasSetup: number;
  horasEjecucion: number;
  piezasOk: number;
  piezasRechazadas: number;
  piezasNoOk: number;
  piezasDefectuosas: number;
  piezasRetrabajadas: number;
  paradasCantidad: number;
  paradasHoras: number;
};

export async function getResumenIndicadores(): Promise<ResumenIndicadores> {
  const [tiempos, piezasReg, piezasOt, paradas] = await Promise.all([
    db
      .select({
        tipo: registroOperacion.tipo,
        totalSeg: sql<number>`coalesce(sum(${registroOperacion.duracionSeg}),0)`.mapWith(Number),
      })
      .from(registroOperacion)
      .where(isNotNull(registroOperacion.fin))
      .groupBy(registroOperacion.tipo),
    db
      .select({
        piezasOk: sql<number>`coalesce(sum(${registroOperacion.piezasOk}),0)`.mapWith(Number),
        piezasRechazadas: sql<number>`coalesce(sum(${registroOperacion.piezasRechazadas}),0)`.mapWith(Number),
      })
      .from(registroOperacion),
    db
      .select({
        piezasNoOk: sql<number>`coalesce(sum(${otPieza.piezasNoOk}),0)`.mapWith(Number),
        piezasDefectuosas: sql<number>`coalesce(sum(${otPieza.piezasDefectuosas}),0)`.mapWith(Number),
        piezasRetrabajadas: sql<number>`coalesce(sum(${otPieza.piezasRetrabajadas}),0)`.mapWith(Number),
      })
      .from(otPieza),
    db
      .select({
        cantidad: sql<number>`count(*)`.mapWith(Number),
        totalSeg: sql<number>`coalesce(sum(${parada.duracionSeg}),0)`.mapWith(Number),
      })
      .from(parada)
      .where(isNotNull(parada.fin)),
  ]);

  const segPorTipo = new Map(tiempos.map((t) => [t.tipo, t.totalSeg]));

  return {
    horasSetup: (segPorTipo.get("setup") ?? 0) / 3600,
    horasEjecucion: (segPorTipo.get("ejecucion") ?? 0) / 3600,
    piezasOk: piezasReg[0]?.piezasOk ?? 0,
    piezasRechazadas: piezasReg[0]?.piezasRechazadas ?? 0,
    piezasNoOk: piezasOt[0]?.piezasNoOk ?? 0,
    piezasDefectuosas: piezasOt[0]?.piezasDefectuosas ?? 0,
    piezasRetrabajadas: piezasOt[0]?.piezasRetrabajadas ?? 0,
    paradasCantidad: paradas[0]?.cantidad ?? 0,
    paradasHoras: (paradas[0]?.totalSeg ?? 0) / 3600,
  };
}

export type ParadaPorTipo = { tipoParadaId: string; nombre: string; cantidad: number; horas: number };

export async function getParadasPorTipo(): Promise<ParadaPorTipo[]> {
  const rows = await db
    .select({
      tipoParadaId: parada.tipoParadaId,
      nombre: tipoParada.nombre,
      cantidad: sql<number>`count(*)`.mapWith(Number),
      totalSeg: sql<number>`coalesce(sum(${parada.duracionSeg}),0)`.mapWith(Number),
    })
    .from(parada)
    .innerJoin(tipoParada, eq(tipoParada.id, parada.tipoParadaId))
    .where(isNotNull(parada.fin))
    .groupBy(parada.tipoParadaId, tipoParada.nombre)
    .orderBy(desc(sql`sum(${parada.duracionSeg})`));
  return rows.map((r) => ({ tipoParadaId: r.tipoParadaId, nombre: r.nombre, cantidad: r.cantidad, horas: r.totalSeg / 3600 }));
}

export type TiempoPorOperario = { usuarioId: string; nombre: string; horasSetup: number; horasEjecucion: number };

export async function getTiempoPorOperario(): Promise<TiempoPorOperario[]> {
  const rows = await db
    .select({
      usuarioId: registroOperacion.usuarioId,
      nombre: usuario.nombre,
      tipo: registroOperacion.tipo,
      totalSeg: sql<number>`coalesce(sum(${registroOperacion.duracionSeg}),0)`.mapWith(Number),
    })
    .from(registroOperacion)
    .innerJoin(usuario, eq(usuario.id, registroOperacion.usuarioId))
    .where(isNotNull(registroOperacion.fin))
    .groupBy(registroOperacion.usuarioId, usuario.nombre, registroOperacion.tipo);

  const porUsuario = new Map<string, TiempoPorOperario>();
  for (const r of rows) {
    const actual = porUsuario.get(r.usuarioId) ?? { usuarioId: r.usuarioId, nombre: r.nombre, horasSetup: 0, horasEjecucion: 0 };
    if (r.tipo === "setup") actual.horasSetup += r.totalSeg / 3600;
    else actual.horasEjecucion += r.totalSeg / 3600;
    porUsuario.set(r.usuarioId, actual);
  }
  return [...porUsuario.values()].sort((a, b) => b.horasSetup + b.horasEjecucion - (a.horasSetup + a.horasEjecucion));
}

export type TiempoPorProceso = { procesoId: string; nombre: string; horasSetup: number; horasEjecucion: number; observaciones: number };

export async function getTiempoPorProceso(): Promise<TiempoPorProceso[]> {
  const rows = await db
    .select({
      procesoId: proceso.id,
      nombre: proceso.nombre,
      tipo: registroOperacion.tipo,
      totalSeg: sql<number>`coalesce(sum(${registroOperacion.duracionSeg}),0)`.mapWith(Number),
      observaciones: sql<number>`count(*)`.mapWith(Number),
    })
    .from(registroOperacion)
    .innerJoin(operacion, eq(operacion.id, registroOperacion.operacionId))
    .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
    .where(isNotNull(registroOperacion.fin))
    .groupBy(proceso.id, proceso.nombre, registroOperacion.tipo);

  const porProceso = new Map<string, TiempoPorProceso>();
  for (const r of rows) {
    const actual = porProceso.get(r.procesoId) ?? { procesoId: r.procesoId, nombre: r.nombre, horasSetup: 0, horasEjecucion: 0, observaciones: 0 };
    if (r.tipo === "setup") actual.horasSetup += r.totalSeg / 3600;
    else actual.horasEjecucion += r.totalSeg / 3600;
    actual.observaciones += r.observaciones;
    porProceso.set(r.procesoId, actual);
  }
  return [...porProceso.values()].sort((a, b) => b.horasSetup + b.horasEjecucion - (a.horasSetup + a.horasEjecucion));
}
