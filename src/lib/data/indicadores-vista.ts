/**
 * Indicadores (reorganización 30/10 §4): todo lo que es mirar, en cuatro pestañas. Nada se modifica desde acá.
 * - Carga: horas asignadas contra disponibles por operario (llenando su cola en orden, según el calendario) o
 *   por centro (lo que el plan ubica en cada día), por semana o por mes, con el espacio libre destacado.
 * - Tiempos: real contra estimado por pieza y paso, ordenado por mayor desvío, y el peso del setup por centro.
 * - Paradas y rechazos: por motivo, con las horas perdidas, los rechazos por pieza y los "No puedo hacer esta".
 */
import { and, eq, gte, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { registroOperacion, operacion, proceso, pieza, otPieza, parada, tipoParada, tareaBloqueo, usuario, centroTrabajo, colaTarea } from "@/lib/db/schema";
import { getPlan, DEFAULT, MOTIVO_BLOQUEO } from "@/lib/planning/datos";
import { esHabil } from "@/lib/planning/calendario";

const iso = (d: Date) => d.toISOString().slice(0, 10);
function sumarDias(f: string, n: number) {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
function lunesDe(f: string) {
  const d = new Date(`${f}T12:00:00Z`);
  const dia = d.getUTCDay();
  return sumarDias(f, dia === 0 ? -6 : 1 - dia);
}

// ── Carga ────────────────────────────────────────────────────────────────

export type Columna = { clave: string; label: string; dias: string[] };
export type FilaCarga = { id: string; nombre: string; celdas: { ocupadas: number; disponibles: number; tareas: string[] }[]; libre2Semanas: number };

export async function getCarga(vista: "semana" | "mes", por: "operario" | "centro") {
  const plan = await getPlan();
  const { entrada, resultado: r } = plan;
  const hoy = entrada.hoy;
  const cal = entrada.calendario;
  // Un sábado o domingo, "esta semana" ya pasó: se muestra la que viene.
  const dia = new Date(`${hoy}T12:00:00Z`).getUTCDay();
  const lunes = dia === 0 || dia === 6 ? sumarDias(lunesDe(hoy), 7) : lunesDe(hoy);
  // Semana: lunes a viernes de esta semana, por día. Mes: cuatro semanas desde ésta, por semana.
  const columnas: Columna[] =
    vista === "semana"
      ? [0, 1, 2, 3, 4].map((i) => {
          const f = sumarDias(lunes, i);
          return { clave: f, label: f, dias: [f] };
        })
      : [0, 1, 2, 3].map((w) => {
          const desde = sumarDias(lunes, 7 * w);
          return { clave: desde, label: desde, dias: [0, 1, 2, 3, 4].map((i) => sumarDias(desde, i)) };
        });
  // Espacio libre: de hoy al viernes de la semana que viene.
  const dosSemanas = Array.from({ length: 12 }, (_, i) => sumarDias(lunes, i)).filter((f) => f >= hoy && new Date(`${f}T12:00:00Z`).getUTCDay() % 6 !== 0);

  let filas: FilaCarga[] = [];
  if (por === "operario") {
    const [operarios, cola] = await Promise.all([
      db.select({ id: usuario.id, nombre: usuario.nombre }).from(usuario).where(and(eq(usuario.rol, "operario"), eq(usuario.activo, true))).orderBy(usuario.nombre),
      db.select().from(colaTarea).where(isNotNull(colaTarea.operarioId)).orderBy(colaTarea.posicion),
    ]);
    const tareas = new Map(r.tareas.filter((t) => t.estado !== "terminada" && t.tipo === "interno").map((t) => [t.clave, t]));
    const horasDia = entrada.horasOperarioDia ?? 6.8;
    filas = operarios.map((o) => {
      const capacidad = (f: string) => (f < hoy || !esHabil(f, cal) || entrada.ausencias.get(o.id)?.has(f) ? 0 : horasDia);
      // Se llena la cola en orden, día por día, con las horas del operario: es una estimación, no un compromiso.
      const ocupado = new Map<string, number>();
      const nombres = new Map<string, Set<string>>();
      let dia = hoy;
      let libreHoy = capacidad(dia);
      for (const c of cola.filter((x) => x.operarioId === o.id)) {
        const t = tareas.get(`${c.otPiezaId}::${c.operacionId}`);
        if (!t) continue;
        let resto = t.horas;
        let vueltas = 0;
        while (resto > 0.001 && vueltas++ < 400) {
          if (libreHoy <= 0.001) {
            dia = sumarDias(dia, 1);
            libreHoy = capacidad(dia);
            continue;
          }
          const usa = Math.min(resto, libreHoy);
          ocupado.set(dia, (ocupado.get(dia) ?? 0) + usa);
          nombres.set(dia, (nombres.get(dia) ?? new Set()).add(t.piezaNombre));
          resto -= usa;
          libreHoy -= usa;
        }
      }
      return {
        id: o.id,
        nombre: o.nombre,
        celdas: columnas.map((col) => ({
          ocupadas: col.dias.reduce((s, f) => s + (ocupado.get(f) ?? 0), 0),
          disponibles: col.dias.reduce((s, f) => s + capacidad(f), 0),
          tareas: [...new Set(col.dias.flatMap((f) => [...(nombres.get(f) ?? [])]))],
        })),
        libre2Semanas: dosSemanas.reduce((s, f) => s + Math.max(0, capacidad(f) - (ocupado.get(f) ?? 0)), 0),
      };
    });
  } else {
    const centros = await db.select().from(centroTrabajo).orderBy(centroTrabajo.orden);
    const nombres = new Map<string, Map<string, Set<string>>>();
    for (const t of r.tareas) {
      if (t.tipo !== "interno" || !t.centroId) continue;
      for (const f of Object.keys(t.horasPorDia)) {
        const m = nombres.get(t.centroId) ?? new Map();
        m.set(f, (m.get(f) ?? new Set()).add(t.piezaNombre));
        nombres.set(t.centroId, m);
      }
    }
    filas = centros.map((c) => {
      const capacidad = (f: string) => (f < hoy || !esHabil(f, cal) ? 0 : c.horasDia * c.maquinas * c.eficiencia);
      const carga = (f: string) => r.carga.get(c.id)?.get(f) ?? 0;
      return {
        id: c.id,
        nombre: c.nombre,
        celdas: columnas.map((col) => ({
          ocupadas: col.dias.reduce((s, f) => s + carga(f), 0),
          disponibles: col.dias.reduce((s, f) => s + capacidad(f), 0),
          tareas: [...new Set(col.dias.flatMap((f) => [...(nombres.get(c.id)?.get(f) ?? [])]))],
        })),
        libre2Semanas: dosSemanas.reduce((s, f) => s + Math.max(0, capacidad(f) - carga(f)), 0),
      };
    });
  }
  return { columnas, filas, hoy };
}

/** "Espacio libre": personas y centros con horas libres en las próximas dos semanas. */
export async function getEspacioLibre() {
  const [ops, cts] = await Promise.all([getCarga("semana", "operario"), getCarga("semana", "centro")]);
  const libres = (fs: FilaCarga[]) => fs.filter((f) => f.libre2Semanas >= 1).map((f) => ({ nombre: f.nombre, horas: f.libre2Semanas }));
  return { operarios: libres(ops.filas), centros: libres(cts.filas) };
}

// ── Tiempos ──────────────────────────────────────────────────────────────

export type FilaTiempo = {
  operacionId: string;
  piezaId: string;
  pieza: string;
  codigo: string;
  paso: string;
  secuencia: number;
  registros: number;
  setupEst: number;
  setupReal: number | null;
  unidadEst: number;
  unidadReal: number | null;
  desvioSetup: number | null;
  desvioUnidad: number | null;
  desvio: number;
};

const pct = (real: number | null, est: number) => (real == null || est <= 0 ? null : Math.round(((real - est) / est) * 100));

/** `ex`: la conexión (o una transacción) donde consultar. */
export async function getTiempos(ex: Pick<typeof db, "execute"> = db) {
  const filas = await ex.execute<{
    operacion_id: string;
    pieza_id: string;
    pieza: string;
    codigo: string;
    paso: string;
    secuencia: number;
    setup_est: number | null;
    unidad_est: number | null;
    setup_real: number | null;
    unidad_real: number | null;
    n: number;
  }>(sql`
    select o.id operacion_id, p.id pieza_id, p.nombre pieza, p.codigo, coalesce(nullif(trim(o.descripcion), ''), pr.nombre) paso, o.secuencia,
      coalesce(o.setup_min, pr.setup_min) setup_est, coalesce(o.min_por_unidad, pr.min_por_unidad)::float unidad_est,
      (avg(r.duracion_seg) filter (where r.tipo = 'setup') / 60.0)::float setup_real,
      (sum(r.duracion_seg) filter (where r.tipo = 'ejecucion') / 60.0 / nullif(sum(coalesce(r.piezas_ok, 0) + coalesce(r.piezas_rechazadas, 0)) filter (where r.tipo = 'ejecucion'), 0))::float unidad_real,
      count(*) filter (where r.tipo = 'ejecucion')::int n
    from registro_operacion r
    join operacion o on o.id = r.operacion_id
    join proceso pr on pr.id = o.proceso_id
    join pieza p on p.id = o.pieza_id
    where r.fin is not null and pr.tipo = 'interno' and r.duracion_seg is not null
    group by o.id, p.id, p.nombre, p.codigo, o.descripcion, pr.nombre, o.secuencia, o.setup_min, pr.setup_min, o.min_por_unidad, pr.min_por_unidad`);
  const tiempos: FilaTiempo[] = filas.map((f) => {
    const setupEst = f.setup_est ?? DEFAULT.setupMin;
    const unidadEst = f.unidad_est ?? DEFAULT.minPorUnidad;
    const ds = pct(f.setup_real, setupEst);
    const du = pct(f.unidad_real, unidadEst);
    return {
      operacionId: f.operacion_id,
      piezaId: f.pieza_id,
      pieza: f.pieza,
      codigo: f.codigo,
      paso: f.paso,
      secuencia: f.secuencia,
      registros: f.n,
      setupEst,
      setupReal: f.setup_real,
      unidadEst,
      unidadReal: f.unidad_real,
      desvioSetup: ds,
      desvioUnidad: du,
      desvio: Math.max(Math.abs(ds ?? 0), Math.abs(du ?? 0)),
    };
  });
  tiempos.sort((a, b) => b.desvio - a.desvio);

  // Setup sobre horas totales, por centro (el diagnóstico de la empresa lo marca como problema).
  const porCentro = await ex.execute<{ centro: string; setup: number; total: number }>(sql`
    select coalesce(c.nombre, 'Sin centro') centro,
      (coalesce(sum(r.duracion_seg) filter (where r.tipo = 'setup'), 0) / 3600.0)::float setup,
      (coalesce(sum(r.duracion_seg), 0) / 3600.0)::float total
    from registro_operacion r
    join operacion o on o.id = r.operacion_id
    join proceso pr on pr.id = o.proceso_id
    left join centro_trabajo c on c.id = coalesce(o.centro_trabajo_id, pr.centro_trabajo_id)
    where r.fin is not null and pr.tipo = 'interno' and r.duracion_seg is not null
    group by 1 order by 3 desc`);
  return { tiempos, porCentro: [...porCentro] };
}

// ── Paradas y rechazos ───────────────────────────────────────────────────

export type FiltroPeriodo = { periodo: "semana" | "mes" | "todo"; operarioId?: string; centroId?: string };

export async function getParadasYRechazos(f: FiltroPeriodo) {
  const hoy = (await getPlan()).entrada.hoy;
  const desde = f.periodo === "semana" ? lunesDe(hoy) : f.periodo === "mes" ? `${hoy.slice(0, 8)}01` : null;
  const desdeTs = desde ? new Date(`${desde}T00:00:00-03:00`) : null;
  const centroDe = sql`coalesce(${operacion.centroTrabajoId}, ${proceso.centroTrabajoId})`;
  const condReg: SQL[] = [isNotNull(registroOperacion.fin)];
  if (desdeTs) condReg.push(gte(registroOperacion.inicio, desdeTs));
  if (f.operarioId) condReg.push(eq(registroOperacion.usuarioId, f.operarioId));
  if (f.centroId) condReg.push(sql`${centroDe} = ${f.centroId}`);

  const [paradas, rechazos, bloqueos] = await Promise.all([
    db
      .select({
        motivo: tipoParada.nombre,
        cantidad: sql<number>`count(*)::int`,
        horas: sql<number>`(coalesce(sum(${parada.duracionSeg}), 0) / 3600.0)::float`,
      })
      .from(parada)
      .innerJoin(registroOperacion, eq(registroOperacion.id, parada.registroOperacionId))
      .innerJoin(operacion, eq(operacion.id, registroOperacion.operacionId))
      .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
      .innerJoin(tipoParada, eq(tipoParada.id, parada.tipoParadaId))
      .where(and(...condReg.filter((c) => c !== condReg[0]), ...(desdeTs ? [gte(parada.inicio, desdeTs)] : [])))
      .groupBy(tipoParada.nombre)
      .orderBy(sql`3 desc`),
    db
      .select({
        pieza: pieza.nombre,
        codigo: pieza.codigo,
        motivo: registroOperacion.motivoRechazo,
        rechazadas: sql<number>`sum(${registroOperacion.piezasRechazadas})::int`,
      })
      .from(registroOperacion)
      .innerJoin(otPieza, eq(otPieza.id, registroOperacion.otPiezaId))
      .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
      .innerJoin(operacion, eq(operacion.id, registroOperacion.operacionId))
      .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
      .where(and(...condReg, sql`${registroOperacion.piezasRechazadas} > 0`))
      .groupBy(pieza.nombre, pieza.codigo, registroOperacion.motivoRechazo)
      .orderBy(sql`4 desc`),
    db
      .select({ motivo: tareaBloqueo.motivo, texto: tareaBloqueo.texto, pieza: pieza.nombre, creada: tareaBloqueo.createdAt, resuelta: tareaBloqueo.resueltoAt })
      .from(tareaBloqueo)
      .innerJoin(otPieza, eq(otPieza.id, tareaBloqueo.otPiezaId))
      .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
      .where(
        and(
          ...(desdeTs ? [gte(tareaBloqueo.createdAt, desdeTs)] : []),
          ...(f.operarioId ? [eq(tareaBloqueo.usuarioId, f.operarioId)] : []),
          ...(f.centroId ? [inArray(tareaBloqueo.operacionId, db.select({ id: operacion.id }).from(operacion).innerJoin(proceso, eq(proceso.id, operacion.procesoId)).where(sql`${centroDe} = ${f.centroId}`))] : []),
        ),
      )
      .orderBy(sql`${tareaBloqueo.createdAt} desc`),
  ]);
  return { paradas, rechazos, bloqueos: bloqueos.map((b) => ({ ...b, motivoTexto: MOTIVO_BLOQUEO[b.motivo] ?? b.motivo })), desde };
}
