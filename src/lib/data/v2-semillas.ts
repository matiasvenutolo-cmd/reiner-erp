/**
 * Datos estimados y escenario de demo (especificación, "Datos estimados para
 * la demo" y "Escenario de demo").
 *
 * - `sembrarEstimaciones`: tiempos por proceso, feriados, secuencias de montaje
 *   y parámetros. Se puede volver a correr sin duplicar y nunca pisa un valor
 *   que REINER ya definió (origen "definido").
 * - `cargarDemo` / `borrarDemo`: la OTM006 activa con entrega a 4 meses y una
 *   segunda máquina de prueba (marcada demo) con entrega a 10 semanas, para ver
 *   dos proyectos compitiendo por los mismos centros. Borrar elimina sólo lo
 *   marcado como demo.
 */
import { and, eq, inArray, like, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  proceso, feriado, montajeConjunto, configuracion, conjunto, parametro, pieza, operacion, otMaquina, otConjunto, otPieza,
  registroOperacion, parada, reservaStock, asignacionTrabajo, planAjuste, proyectoEvento, pedidoCompra, movimientoStock,
  remitoItem, ausencia, cliente, proveedor, proveedorServicio, articuloStock, solicitudCompra, tareaRevision, usuario,
} from "@/lib/db/schema";
import { FERIADOS_AR, sumarHabiles } from "@/lib/planning/calendario";
import { generarOtMaquina, generarOrdenSuelta, enviarAProduccion } from "./ot";
import { hoyISO } from "@/lib/fecha";

/** Tabla "Tiempos estimados por proceso" de la especificación. */
const TIEMPOS: Record<string, { setup?: number; unidad?: number; plazo?: number }> = {
  TORNO: { setup: 30, unidad: 20 },
  CNC: { setup: 45, unidad: 12 },
  MECANIZADO: { setup: 60, unidad: 25 },
  FRESADO: { setup: 45, unidad: 25 },
  CORTE_HILO: { setup: 30, unidad: 60 },
  ROSCADO: { setup: 10, unidad: 5 },
  CHAVETERO: { setup: 20, unidad: 15, plazo: 5 },
  TALLADO: { setup: 60, unidad: 40 },
  SOLDADURA: { setup: 20, unidad: 30, plazo: 5 },
  RECTIFICADO: { setup: 30, unidad: 20, plazo: 5 },
  PULIDO: { setup: 15, unidad: 10, plazo: 5 },
  GRABADO_LASER: { setup: 10, unidad: 5, plazo: 5 },
  IMPRESION_3D: { setup: 10, unidad: 120, plazo: 5 },
  ELECTRONICA: { setup: 30, unidad: 60 },
  TALLER: { setup: 0, unidad: 15 },
  TEMPLADO: { plazo: 5 },
  CROMADO: { plazo: 7 },
  CROMADO_ANODIZADO: { plazo: 7 },
  ANODIZADO: { plazo: 7 },
  PAVONADO: { plazo: 5 },
  ARENADO: { plazo: 3 },
  PINTURA: { plazo: 5 },
  FUNDICION: { plazo: 15 },
  FIERRO: { plazo: 10 },
  COMPRAS: { plazo: 10 },
};

/** Secuencia de montaje estimada de la RD estándar (especificación) y la propuesta para las PS, con el mismo criterio. */
const MONTAJE_RD: [string, number][] = [
  ["C15", 2], ["C14", 1], ["C13", 2], ["C07", 2], ["C01", 3], ["C02", 2], ["C03", 1], ["C06", 1], ["C04", 1], ["C05", 1],
  ["C09", 2], ["C23", 2], ["C20", 1], ["C22", 1], ["C11", 1], ["C12", 1], ["C16", 2], ["C24", 1],
];
const MONTAJE_PS: [string, number][] = [
  ["C15", 2], ["C14", 1], ["C13", 2], ["C07", 2], ["C01", 3], ["C02", 2], ["C06", 1], ["C04", 1], ["C05", 1],
  ["C09", 2], ["C20", 1], ["C11", 1], ["C21", 1], ["C12", 1], ["C16", 2],
];

const PALABRAS_COMERCIAL = ["motor", "reductor", "correa", "rodamiento", "celda", "actuador", "switch", "iman", "imán", "alemite", "bisagra"];

export async function sembrarEstimaciones(): Promise<string[]> {
  const log: string[] = [];
  const procesos = await db.select().from(proceso);
  for (const p of procesos) {
    const t = TIEMPOS[p.id];
    if (!t || p.tiempoOrigen === "definido") continue;
    await db.update(proceso).set({ setupMin: t.setup ?? null, minPorUnidad: t.unidad ?? null, plazoDias: t.plazo ?? null, tiempoOrigen: "estimado" }).where(eq(proceso.id, p.id));
  }
  log.push(`tiempos por proceso: ${procesos.filter((p) => TIEMPOS[p.id]).length}`);

  await db.insert(feriado).values(FERIADOS_AR.map((f) => ({ ...f, tipo: "nacional" }))).onConflictDoNothing();
  log.push(`feriados: ${FERIADOS_AR.length}`);

  const configs = await db.select().from(configuracion);
  const conjuntos = await db.select({ id: conjunto.id, codigo: conjunto.codigo }).from(conjunto);
  for (const c of configs) {
    if (c.montajeOrigen === "definido") continue;
    const seq = c.id.startsWith("rd") ? MONTAJE_RD : MONTAJE_PS;
    await db.delete(montajeConjunto).where(eq(montajeConjunto.configuracionId, c.id));
    const filas = seq
      .map(([cod, dias], i) => ({ configuracionId: c.id, conjuntoId: conjuntos.find((x) => x.codigo === cod)?.id, orden: i + 1, dias }))
      .filter((f): f is { configuracionId: string; conjuntoId: string; orden: number; dias: number } => !!f.conjuntoId);
    if (filas.length) await db.insert(montajeConjunto).values(filas).onConflictDoNothing();
    await db.update(configuracion).set({ montajeFinalDias: 5, margenMontajeDias: 3, montajeOrigen: "estimado" }).where(eq(configuracion.id, c.id));
  }
  log.push(`secuencias de montaje: ${configs.length}`);

  await db
    .insert(parametro)
    .values([
      { clave: "horizonte_liberacion", valor: "15", nota: "Días hábiles hacia adelante en que el sistema propone liberar piezas." },
      {
        clave: "exigir_plano",
        valor: "no",
        nota: "La especificación pide plano y revisión cargados para liberar. Hoy ninguna pieza tiene plano: con \"sí\" no se podría liberar nada. Activarlo cuando ingeniería los cargue.",
      },
    ])
    .onConflictDoNothing();

  // Propuesta de reclasificación como comercial: no se aplica sola, se aprueba en ADMIN.
  const piezas = await db.select({ id: pieza.id, nombre: pieza.nombre, clase: pieza.clase }).from(pieza);
  const rutas = await db.execute<{ pieza_id: string; solo_compras: boolean }>(
    sql`select pieza_id, bool_and(proceso_id = 'COMPRAS') solo_compras from operacion group by pieza_id`,
  );
  const soloCompras = new Set(rutas.filter((r) => r.solo_compras).map((r) => r.pieza_id));
  const propuestas = piezas.filter((p) => p.clase === "fabricada" && (PALABRAS_COMERCIAL.some((w) => p.nombre.toLowerCase().includes(w)) || soloCompras.has(p.id)));
  if (propuestas.length) await db.update(pieza).set({ claseSugerida: "comercial" }).where(inArray(pieza.id, propuestas.map((p) => p.id)));
  log.push(`propuestas de reclasificación: ${propuestas.length}`);
  return log;
}

const CLIENTE_DEMO = "Cliente de prueba (demo)";
const SERIE_DEMO = "D01";
const REF_STOCK_DEMO = "reposicion-demo";

export async function cargarDemo(usuarioId: string): Promise<string[]> {
  const log: string[] = [];
  const hoy = hoyISO();
  const cal = { feriados: new Set(FERIADOS_AR.map((f) => f.fecha)), diasSemana: [1, 2, 3, 4, 5] };

  // 1. OTM006 activa: entrega = emisión + 4 meses (su plazo en texto).
  const [otm] = await db.select().from(otMaquina).where(eq(otMaquina.codigo, "OTM006"));
  if (otm && otm.estadoProyecto === "borrador") {
    const emision = (otm.fechaEmision ?? otm.createdAt).toISOString().slice(0, 10);
    const d = new Date(`${emision}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 4);
    const entrega = d.toISOString().slice(0, 10);
    await db.update(otMaquina).set({ fechaEntrega: entrega, fechaInicioProyecto: emision, estadoProyecto: "activo", destino: "maquina" }).where(eq(otMaquina.id, otm.id));
    await db.insert(proyectoEvento).values({ otMaquinaId: otm.id, tipo: "activado", texto: `Activado con entrega ${entrega} (emisión + "4 meses")`, usuarioId });
    log.push(`OTM006 activa, entrega ${entrega}`);
  }

  // 2. Máquina de prueba: PS 120 Instrumentada con entrega a 10 semanas.
  const [existe] = await db.select().from(otMaquina).where(eq(otMaquina.codigo, `OTM${SERIE_DEMO}`));
  if (!existe) {
    let [cli] = await db.select().from(cliente).where(eq(cliente.razonSocial, CLIENTE_DEMO));
    if (!cli) [cli] = await db.insert(cliente).values({ razonSocial: CLIENTE_DEMO }).returning();
    const id = await generarOtMaquina({ configuracionId: "ps120i", numeroSerie: SERIE_DEMO, clienteId: cli.id, emitidoPor: "Demo", plazoEntrega: "10 semanas" });
    const entrega = sumarHabiles(hoy, 50, cal);
    await db.update(otMaquina).set({ esDemo: true, fechaEntrega: entrega, fechaInicioProyecto: hoy, estadoProyecto: "activo", destino: "maquina", prioridad: "alta" }).where(eq(otMaquina.id, id));
    await db.insert(proyectoEvento).values({ otMaquinaId: id, tipo: "activado", texto: `Máquina de prueba (demo), entrega ${entrega}`, usuarioId });

    // Libera la mitad de las piezas con ruta (el resto queda como "tanda para liberar").
    const piezas = await db
      .select({ id: otPieza.id, piezaId: otPieza.piezaId, cant: otPieza.cantidadAFabricar })
      .from(otPieza)
      .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
      .where(and(eq(otConjunto.otMaquinaId, id), sql`${otPieza.cantidadAFabricar} > 0`));
    const conRuta = await db.select({ piezaId: operacion.piezaId }).from(operacion).where(inArray(operacion.piezaId, piezas.map((p) => p.piezaId)));
    const rutaSet = new Set(conRuta.map((r) => r.piezaId));
    const liberar = piezas.filter((p) => rutaSet.has(p.piezaId)).slice(0, Math.ceil(piezas.length * 0.45));
    await enviarAProduccion(liberar.map((p) => p.id), usuarioId);

    // Material recibido para 3 de cada 4 piezas liberadas que lo esperaban (cierra su paso de Compras),
    // y algo de avance real: el primer paso de taller terminado en 6 piezas y uno en curso.
    const operarios = await db.select({ id: usuario.id }).from(usuario).where(and(eq(usuario.rol, "operario"), eq(usuario.activo, true)));
    const ayer = new Date(Date.now() - 86_400_000);
    let recibidas = 0, hechas = 0;
    for (const [i, p] of liberar.entries()) {
      const ruta = await db
        .select({ id: operacion.id, tipo: proceso.tipo })
        .from(operacion)
        .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
        .where(eq(operacion.piezaId, p.piezaId))
        .orderBy(operacion.secuencia);
      if (ruta[0]?.tipo === "compras" && i % 4 !== 3) {
        await db.insert(registroOperacion).values({ otPiezaId: p.id, operacionId: ruta[0].id, usuarioId, tipo: "ejecucion", inicio: ayer, fin: ayer, piezasOk: p.cant, observacion: "Cerrado al recibir la compra" });
        recibidas++;
        const interno = ruta[1];
        if (interno?.tipo === "interno" && hechas < 7 && operarios.length) {
          const enCurso = hechas === 6;
          await db.insert(registroOperacion).values({
            otPiezaId: p.id, operacionId: interno.id, usuarioId: operarios[hechas % operarios.length].id, tipo: "ejecucion",
            inicio: ayer, fin: enCurso ? null : new Date(ayer.getTime() + 3_600_000), duracionSeg: enCurso ? null : 3600, piezasOk: enCurso ? 0 : p.cant,
          });
          hechas++;
        }
      }
    }
    log.push(`máquina de prueba OTM${SERIE_DEMO}: ${liberar.length} piezas liberadas, ${recibidas} con material recibido, ${hechas} con avance`);
  }

  // 3. Una orden para stock (reposición) de una pieza de torno en cantidad: compite por el mismo centro.
  const [ordenStock] = await db.select().from(otMaquina).where(eq(otMaquina.codigo, `OTS${REF_STOCK_DEMO}`));
  if (!ordenStock) {
    const candidatas = await db.execute<{ pieza_id: string }>(sql`
      select o.pieza_id from operacion o join pieza_configuracion pc on pc.pieza_id = o.pieza_id and pc.configuracion_id = 'ps120i'
      where o.secuencia = (select min(secuencia) from operacion x where x.pieza_id = o.pieza_id) and o.proceso_id = 'TORNO'
      and (select count(*) from operacion y where y.pieza_id = o.pieza_id) between 2 and 4 limit 1`);
    const [cli] = await db.select().from(cliente).where(eq(cliente.razonSocial, CLIENTE_DEMO));
    if (candidatas[0] && cli) {
      const id = await generarOrdenSuelta({ configuracionId: "ps120i", referencia: REF_STOCK_DEMO, clienteId: cli.id, emitidoPor: "Demo", tipo: "pieza", piezaId: candidatas[0].pieza_id, cantidad: 150 });
      await db
        .update(otMaquina)
        .set({ esDemo: true, destino: "stock", motivoStock: "Reposición por mínimo", fechaEntrega: sumarHabiles(hoy, 12, cal), estadoProyecto: "activo", fechaInicioProyecto: hoy })
        .where(eq(otMaquina.id, id));
      const piezas = await db.select({ id: otPieza.id }).from(otPieza).innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId)).where(eq(otConjunto.otMaquinaId, id));
      await enviarAProduccion(piezas.map((x) => x.id), usuarioId);
      log.push(`orden para stock OTS${REF_STOCK_DEMO}: 150 u. de ${candidatas[0].pieza_id}`);
    }
  }

  // 4. Una ausencia, condiciones de servicio y plazos de proveedores, materia prima y consumibles.
  const [nico] = await db.select().from(usuario).where(eq(usuario.id, "nico"));
  const ausente = await db.select().from(ausencia).where(like(ausencia.motivo, "%(demo)"));
  if (nico && !ausente.length) {
    const desde = sumarHabiles(hoy, 6, cal);
    await db.insert(ausencia).values({ usuarioId: nico.id, desde, hasta: sumarHabiles(desde, 4, cal), motivo: "Vacaciones (demo)" });
  }
  const provs = await db.select().from(proveedor);
  const p = (txt: string) => provs.find((x) => x.razonSocial.toLowerCase().includes(txt));
  const cromados = p("cromados"), aceros = p("aceros");
  if (aceros && aceros.plazoDias == null) await db.update(proveedor).set({ plazoDias: 7, tipoProveedor: "materia_prima" }).where(eq(proveedor.id, aceros.id));
  if (cromados) {
    if (cromados.plazoDias == null) await db.update(proveedor).set({ plazoDias: 7, tipoProveedor: "servicio", procesos: "Cromado, Pavonado" }).where(eq(proveedor.id, cromados.id));
    const serv = await db.select().from(proveedorServicio).where(eq(proveedorServicio.esDemo, true));
    if (!serv.length)
      await db.insert(proveedorServicio).values([
        { proveedorId: cromados.id, procesoId: "CROMADO", precio: 4800, unidadPrecio: "pieza", plazoDias: 7, habitual: true, esDemo: true },
        { proveedorId: cromados.id, procesoId: "PAVONADO", precio: 2100, unidadPrecio: "pieza", plazoDias: 5, habitual: true, esDemo: true },
      ]);
  }
  const arts = await db.select().from(articuloStock).where(eq(articuloStock.esDemo, true));
  if (!arts.length)
    await db.insert(articuloStock).values([
      { tipo: "materia_prima", nombre: "Acero SAE 1045", medida: "Ø40 × 6 m", unidad: "barra", cantidad: 12, asignada: 5, minimo: 4, ubicacion: "Rack A", proveedorId: aceros?.id, esDemo: true },
      { tipo: "materia_prima", nombre: "Acero SAE 1045", medida: "Ø60 × 6 m", unidad: "barra", cantidad: 3, asignada: 2, minimo: 4, ubicacion: "Rack A", proveedorId: aceros?.id, esDemo: true },
      { tipo: "materia_prima", nombre: "Bronce SAE 65", medida: "Ø30 × 3 m", unidad: "barra", cantidad: 5, asignada: 0, minimo: 2, ubicacion: "Rack B", esDemo: true },
      { tipo: "materia_prima", nombre: "Acero D2", medida: "Ø25 × 3 m", unidad: "barra", cantidad: 2, asignada: 2, minimo: 2, ubicacion: "Rack B", esDemo: true },
      { tipo: "materia_prima", nombre: "Chapa AISI 304", medida: "1220 × 2440 × 1,5", unidad: "chapa", cantidad: 6, asignada: 1, minimo: 3, ubicacion: "Estiba 1", esDemo: true },
      { tipo: "consumible", nombre: "Inserto CNMG 120408", unidad: "u.", cantidad: 34, minimo: 20, centroUso: "Torno CNC", esDemo: true },
      { tipo: "consumible", nombre: "Mecha HSS Ø8", unidad: "u.", cantidad: 6, minimo: 10, centroUso: "Taller", esDemo: true },
      { tipo: "consumible", nombre: "Aceite soluble de corte", unidad: "l", cantidad: 40, minimo: 20, centroUso: "Torno", esDemo: true },
      { tipo: "consumible", nombre: "Hilo de latón 0,25 mm", unidad: "kg", cantidad: 8, minimo: 5, centroUso: "Corte por hilo", esDemo: true },
    ]);
  log.push("ausencia, servicios, materia prima y consumibles de demo");
  return log;
}

/** Elimina sólo lo marcado como demo (la OTM006 vuelve a borrador; sus datos reales no se tocan). */
export async function borrarDemo(): Promise<string[]> {
  const demos = await db.select({ id: otMaquina.id }).from(otMaquina).where(eq(otMaquina.esDemo, true));
  const ids = demos.map((d) => d.id);
  if (ids.length) {
    const conj = await db.select({ id: otConjunto.id }).from(otConjunto).where(inArray(otConjunto.otMaquinaId, ids));
    const piezas = conj.length ? await db.select({ id: otPieza.id }).from(otPieza).where(inArray(otPieza.otConjuntoId, conj.map((c) => c.id))) : [];
    const pid = piezas.map((p) => p.id);
    if (pid.length) {
      const regs = await db.select({ id: registroOperacion.id }).from(registroOperacion).where(inArray(registroOperacion.otPiezaId, pid));
      if (regs.length) await db.delete(parada).where(inArray(parada.registroOperacionId, regs.map((r) => r.id)));
      await db.delete(registroOperacion).where(inArray(registroOperacion.otPiezaId, pid));
      await db.delete(asignacionTrabajo).where(inArray(asignacionTrabajo.otPiezaId, pid));
      await db.delete(planAjuste).where(inArray(planAjuste.otPiezaId, pid));
      await db.update(solicitudCompra).set({ anuladaAt: new Date() }).where(inArray(solicitudCompra.otPiezaId, pid));
      await db.delete(tareaRevision).where(inArray(tareaRevision.otPiezaId, pid));
      await db.delete(movimientoStock).where(inArray(movimientoStock.otPiezaId, pid));
      await db.update(remitoItem).set({ otPiezaId: null }).where(inArray(remitoItem.otPiezaId, pid));
      const ped = await db.select({ id: pedidoCompra.id }).from(pedidoCompra).where(inArray(pedidoCompra.otPiezaId, pid));
      if (ped.length) {
        await db.update(solicitudCompra).set({ pedidoCompraId: null }).where(inArray(solicitudCompra.pedidoCompraId, ped.map((x) => x.id)));
        await db.delete(pedidoCompra).where(inArray(pedidoCompra.id, ped.map((x) => x.id)));
      }
      await db.update(solicitudCompra).set({ otPiezaId: null }).where(inArray(solicitudCompra.otPiezaId, pid));
      await db.delete(otPieza).where(inArray(otPieza.id, pid));
    }
    await db.delete(reservaStock).where(inArray(reservaStock.otMaquinaId, ids));
    await db.delete(proyectoEvento).where(inArray(proyectoEvento.otMaquinaId, ids));
    await db.delete(otConjunto).where(inArray(otConjunto.otMaquinaId, ids));
    await db.delete(otMaquina).where(inArray(otMaquina.id, ids));
  }
  await db.delete(cliente).where(eq(cliente.razonSocial, CLIENTE_DEMO));
  await db.delete(ausencia).where(like(ausencia.motivo, "%(demo)"));
  await db.delete(proveedorServicio).where(eq(proveedorServicio.esDemo, true));
  await db.delete(articuloStock).where(eq(articuloStock.esDemo, true));
  return [`borrados ${ids.length} proyectos de demo y sus datos`];
}

/**
 * Migración de órdenes existentes (especificación, "Migración de OT
 * existentes"): las órdenes sueltas pasan a destino "repuesto"; las que ya
 * tienen todas sus piezas terminadas quedan como Entregadas. El resto queda
 * en Borrador hasta que se cargue su fecha de entrega (no se infiere).
 */
export async function migrarOrdenesExistentes(): Promise<string[]> {
  await db.update(otMaquina).set({ destino: "repuesto" }).where(and(eq(otMaquina.tipo, "suelta"), eq(otMaquina.destino, "maquina")));
  const sueltas = await db.execute<{ id: string; abiertas: number }>(sql`
    select m.id, count(*) filter (where op.fecha_fin is null and op.cantidad_a_fabricar > 0)::int abiertas
    from ot_maquina m join ot_conjunto oc on oc.ot_maquina_id = m.id join ot_pieza op on op.ot_conjunto_id = oc.id
    where m.tipo = 'suelta' and m.estado_proyecto = 'borrador' group by m.id`);
  const terminadas = sueltas.filter((s) => s.abiertas === 0).map((s) => s.id);
  if (terminadas.length) await db.update(otMaquina).set({ estadoProyecto: "entregado" }).where(inArray(otMaquina.id, terminadas));
  return [`órdenes sueltas migradas a repuesto; ${terminadas.length} quedan como entregadas`];
}
