import Link from "next/link";
import { eq, inArray, and } from "drizzle-orm";
import { getUsuarioActual } from "@/lib/session";
import { getPlan } from "@/lib/planning/datos";
import { lunesDe, ajustarAHabil } from "@/lib/planning/calendario";
import { db } from "@/lib/db/client";
import { feriado, semanaConfirmada, usuario, piezaAdjunto } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso, Vacio } from "@/components/ui/Aviso";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";
import { GrillaPlan, type FilaPlan, type Tarjeta } from "@/components/v2/GrillaPlan";
import { Holgura, fechaCorta, Estimado, colorProyecto, textoMargen } from "@/components/v2/Plan";
import { recalcularAction, confirmarSemanaAction } from "@/app/actions/v2";
import type { Tarea } from "@/lib/planning/motor";
import { cargaSemana } from "@/lib/planning/carga";
import { HORAS_OPERARIO_DIA } from "@/lib/data/operario";
import { capitalizar, numero, plural } from "@/lib/formato";

export const dynamic = "force-dynamic";

const corridos = (f: string, n: number) => {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const VISTAS = [
  ["centro", "Por centro"],
  ["operario", "Por operario"],
] as const;

/**
 * Plan de la semana (mejoras de usabilidad §2.2): el sistema propone qué se
 * hace en cada centro y cada día; el jefe de planta mueve, cambia el operario,
 * fija con candado y confirma. Tarjeta mínima con su panel, color por
 * proyecto, resumen arriba con links que filtran y un solo selector de vista.
 */
export default async function PlanSemanaPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string; vista?: string; ver?: string; ok?: string; error?: string; proyecto?: string; solo?: string; centro?: string }>;
}) {
  const sp = await searchParams;
  const { semana, vista = "centro", ver, ok, error, proyecto, solo, centro } = sp;
  const [usuarioActual, plan, feriados] = await Promise.all([getUsuarioActual(), getPlan(), db.select().from(feriado)]);
  const { resultado: r, entrada, centros, operarios } = plan;
  const cal = entrada.calendario;
  const hoy = ajustarAHabil(entrada.hoy, cal);
  const lunesActual = lunesDe(hoy);
  const lunes = semana ? lunesDe(semana) : lunesActual;
  const dias = [0, 1, 2, 3, 4].map((i) => corridos(lunes, i));
  const viernes = dias[4];
  const nombresDia = ["lun", "mar", "mié", "jue", "vie"];
  const feriadosMap = Object.fromEntries(feriados.filter((f) => dias.includes(f.fecha)).map((f) => [f.fecha, f.nombre]));
  const filtros = new URLSearchParams(Object.entries({ semana: lunes, vista: vista !== "centro" ? vista : undefined, proyecto, solo, centro }).filter(([, v]) => v) as [string, string][]);
  const volver = `/planificacion?${filtros}`;
  const con = (cambios: Record<string, string | undefined>) => {
    const q = new URLSearchParams(filtros);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    return `/planificacion?${q}`;
  };

  // Colores por proyecto, fijos y con leyenda.
  const proyectos = [...r.proyectos].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const color = new Map(proyectos.map((p, i) => [p.id, colorProyecto(i, p.tipo)]));

  const enSemana = (t: Tarea) => t.fechaPlan && t.fechaPlan <= viernes && (t.finPlan ?? t.fechaPlan) >= lunes;
  const todas = r.tareas.filter((t) => t.tipo === "interno" && t.estado !== "terminada" && enSemana(t));
  const pasaFiltro = (t: Tarea) =>
    (!proyecto || t.proyectoId === proyecto) &&
    (!centro || t.centroId === centro) &&
    (solo !== "urgentes" || t.nivel === "atrasada" || t.nivel === "urgente" || t.nivel === "arranca_tarde") &&
    (solo !== "sinoperario" || !t.operarioId) &&
    (solo !== "tarde" || t.tarde);
  const internas = todas.filter(pasaFiltro);

  const codigos = [...new Set(internas.map((t) => t.piezaCodigo))];
  const [conPlano, [confirmada]] = await Promise.all([
    codigos.length ? db.selectDistinct({ id: piezaAdjunto.piezaId }).from(piezaAdjunto).where(and(inArray(piezaAdjunto.piezaId, codigos), eq(piezaAdjunto.tipo, "plano"))) : [],
    db.select({ s: semanaConfirmada, nombre: usuario.nombre }).from(semanaConfirmada).innerJoin(usuario, eq(usuario.id, semanaConfirmada.usuarioId)).where(eq(semanaConfirmada.lunes, lunes)),
  ]);
  const tienePlano = new Set(conPlano.map((x) => x.id));

  // Una tarjeta por día en que la tarea tiene horas: "parte 1 de 2" (§1.6).
  const aTarjetas = (t: Tarea): Tarjeta[] => {
    const diasTarea = Object.keys(t.horasPorDia).sort();
    const enEsta = diasTarea.filter((d) => d >= lunes && d <= viernes);
    const lista = enEsta.length ? enEsta : [t.fechaPlan! < lunes ? lunes : t.fechaPlan!];
    return lista.map((d) => ({
      clave: t.clave,
      dia: d,
      titulo: capitalizar(t.piezaNombre),
      cantidad: t.cantidad,
      paso: t.paso,
      proyecto: `${t.proyectoCodigo}${t.proyectoTipo === "repuesto" ? " · Repuesto" : t.proyectoTipo === "stock" ? " · Stock" : ""}`,
      colorProyecto: color.get(t.proyectoId)?.fondo ?? "bg-gris",
      nivel: t.nivel,
      textoMargen: t.nivel === "arranca_tarde" ? "arranca tarde" : textoMargen(t.holgura),
      horas: t.horasPorDia[d] ?? t.horas,
      parte: diasTarea.length > 1 ? { n: diasTarea.indexOf(d) + 1, de: diasTarea.length } : null,
      lote: t.lote ?? null,
      operarioId: t.operarioId,
      operarioNombre: t.operarioId ? (operarios.get(t.operarioId) ?? null) : null,
      fijada: t.fijada,
      movida: t.movida,
      tarde: t.tarde,
      enCurso: t.estado === "en_curso" || t.estado === "pausada",
      futura: t.estado === "futura",
      resaltada: t.clave === ver,
      planoHref: tienePlano.has(t.piezaCodigo) ? `/maestros/pieza/${t.piezaCodigo}#adjuntos` : null,
      centroNombre: centros.find((c) => c.id === t.centroId)?.nombre ?? "",
      limite: fechaCorta(t.fechaLimite, hoy),
    }));
  };

  const capacidadDia = (centroId: string, d: string) => r.capacidad.get(centroId)?.get(d) ?? 0;
  const cargaDia = (centroId: string, d: string) => r.carga.get(centroId)?.get(d) ?? 0;

  let filas: FilaPlan[];
  if (vista === "operario") {
    // Por operario (§1.7): la barra de carga de cada persona, en rojo si pasa el 100 %.
    filas = [...operarios.entries()].map(([id, nombre]) => {
      const ts = internas.filter((t) => t.operarioId === id);
      const porDia = dias.map((d) => ({ dia: d, usado: r.cargaOperario.get(id)?.get(d) ?? 0, disponible: feriadosMap[d] ? 0 : HORAS_OPERARIO_DIA }));
      const susCentros = [...new Set(centros.filter((c) => c.operarios.some((o) => o.id === id)).map((c) => c.nombre))];
      return { id, nombre, subtitulo: susCentros.join(" · "), usado: porDia.reduce((s, x) => s + x.usado, 0), disponible: porDia.reduce((s, x) => s + x.disponible, 0), porDia, tarjetas: ts.flatMap(aTarjetas), operarios: [{ id, nombre }] };
    });
  } else {
    filas = centros
      .filter((c) => !centro || c.id === centro)
      .map((c) => {
        const porDia = dias.map((d) => ({ dia: d, usado: cargaDia(c.id, d), disponible: capacidadDia(c.id, d) || (feriadosMap[d] ? 0 : c.horasDia * c.maquinas * c.eficiencia) }));
        return {
          id: c.id,
          nombre: c.nombre,
          subtitulo: c.operarios.map((o) => o.nombre).join(", ") || "sin operarios habilitados",
          usado: porDia.reduce((s, x) => s + x.usado, 0),
          disponible: porDia.reduce((s, x) => s + x.disponible, 0),
          demanda: cargaSemana(r, c.id, dias, lunes <= lunesActual).demanda,
          porDia,
          tarjetas: internas.filter((t) => t.centroId === c.id).flatMap(aTarjetas),
          operarios: c.operarios,
        };
      });
    const terc = r.tareas.filter((t) => t.tipo === "tercerizado" && t.estado !== "terminada" && t.fechaPlan && t.fechaPlan >= lunes && t.fechaPlan <= viernes && pasaFiltro(t));
    filas.push({
      id: "TERCERIZADOS",
      nombre: "Tercerizados",
      subtitulo: "para mandar",
      sinLimite: true,
      usado: 0,
      disponible: 0,
      porDia: dias.map((d) => ({ dia: d, usado: 0, disponible: 0 })),
      tarjetas: terc.map((t) => ({ ...aTarjetas(t)[0], dia: t.fechaPlan!, parte: null, paso: `${t.paso} · vuelve ${fechaCorta(t.finPlan, hoy)}` })),
      operarios: [],
    });
  }

  // Lo que debería hacerse esta semana y no entró por capacidad.
  const sinLugar = r.tareas
    .filter((t) => t.tipo === "interno" && t.estado === "lista" && t.inicioMasTardio <= viernes && t.fechaPlan && t.fechaPlan > viernes && pasaFiltro(t))
    .sort((a, b) => a.holgura - b.holgura);
  const sobrecargados = filas.filter((f) => !f.sinLimite && f.disponible && ((f.demanda ?? 0) / f.disponible > 1 || f.usado / f.disponible > 1));
  const tardes = todas.filter((t) => t.tarde).length;
  const sinOperario = todas.filter((t) => !t.operarioId).length;
  const esJefe = usuarioActual.rol === "taller";
  const semanaAnterior = corridos(lunes, -7), semanaSiguiente = corridos(lunes, 7);
  const pctEst = Math.max(0, ...r.proyectos.map((p) => p.pctEstimado));
  const hayFiltro = !!(proyecto || solo || centro);

  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Plan de la semana"
        descripcion="El sistema propone qué se hace en cada centro y cada día, según el margen de cada tarea y la capacidad. Tocá una tarjeta para cambiar el operario, moverla de día o fijarla con candado."
        acciones={
          <>
            <form action={recalcularAction}>
              <input type="hidden" name="volver" value={volver} />
              <ConfirmarBoton mensaje="¿Recalcular? Se descartan los movimientos manuales que no tienen candado." className="btn-secundario">
                Recalcular
              </ConfirmarBoton>
            </form>
            <form action={confirmarSemanaAction}>
              <input type="hidden" name="lunes" value={lunes} />
              <ConfirmarBoton
                mensaje={`${plural(todas.length, "tarea")}, ${sinOperario} sin operario, ${tardes} termina${tardes === 1 ? "" : "n"} tarde. ¿Confirmar la semana? El plan se publica en la pantalla de cada operario.`}
                disabled={!esJefe}
                title={esJefe ? undefined : "Sólo el jefe de planta confirma la semana"}
              >
                Confirmar semana
              </ConfirmarBoton>
            </form>
          </>
        }
      />

      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={con({ semana: semanaAnterior })} className="btn-secundario btn-sm" aria-label="Semana anterior">
            ←
          </Link>
          <span className="font-semibold">
            {fechaCorta(lunes, hoy)} al {fechaCorta(viernes, hoy)}
            {lunes === lunesActual && <span className="text-foreground-muted font-normal"> · esta semana</span>}
          </span>
          <Link href={con({ semana: semanaSiguiente })} className="btn-secundario btn-sm" aria-label="Semana siguiente">
            →
          </Link>
          {confirmada ? (
            <Etiqueta tono="verde">
              Confirmada por {confirmada.nombre} el {fechaCorta(confirmada.s.confirmadaAt.toISOString().slice(0, 10), hoy)}{" "}
              {confirmada.s.confirmadaAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })}
            </Etiqueta>
          ) : (
            <Etiqueta tono="estimado">Sin confirmar: los operarios ven el plan propuesto</Etiqueta>
          )}
        </div>
        {/* Un solo selector de vista (§2.2): por centro, por operario, colas por centro o asignar a mano. */}
        <div className="flex flex-wrap rounded-md border border-border overflow-hidden text-sm bg-surface">
          {VISTAS.map(([v, l]) => (
            <Link key={v} href={con({ vista: v === "centro" ? undefined : v })} className={`px-3 py-1.5 ${vista === v ? "bg-accent text-accent-foreground" : "hover:bg-surface-muted"}`}>
              {l}
            </Link>
          ))}
          <Link href="/centros-trabajo" className="px-3 py-1.5 hover:bg-surface-muted border-l border-border">
            Colas por centro
          </Link>
          <Link href="/planificacion/manual" className="px-3 py-1.5 hover:bg-surface-muted border-l border-border">
            Asignar a mano
          </Link>
        </div>
      </div>

      {!esJefe && <p className="text-sm text-foreground-muted">Lo confirma el jefe de planta: recién ahí queda como plan confirmado en la pantalla de cada operario.</p>}

      {/* Resumen con links que filtran (§2.2) */}
      <p className="text-sm">
        <Link href={con({ solo: undefined, centro: undefined, proyecto: undefined })} className="font-semibold hover:underline">
          {plural(todas.length, "tarea")}
        </Link>
        {tardes > 0 && (
          <>
            {" · "}
            <Link href={con({ solo: "tarde" })} className="text-rojo-fg font-semibold hover:underline">
              {tardes} termina{tardes === 1 ? "" : "n"} tarde
            </Link>
          </>
        )}
        {sinOperario > 0 && (
          <>
            {" · "}
            <Link href={con({ solo: "sinoperario" })} className="text-rojo-fg hover:underline">
              {sinOperario} sin operario
            </Link>
          </>
        )}
        {sobrecargados.map((f) => (
          <span key={f.id}>
            {" · "}
            <Link href={con({ centro: vista === "operario" ? undefined : f.id })} className="text-rojo-fg font-semibold hover:underline">
              {f.nombre} sobrecargado ({numero(Math.round((Math.max(f.demanda ?? 0, f.usado) / f.disponible) * 100))}%)
            </Link>
          </span>
        ))}
      </p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-foreground-muted">Orden:</span>
        {proyectos.map((p) => (
          <Link key={p.id} href={con({ proyecto: proyecto === p.id ? undefined : p.id })} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${proyecto === p.id ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-foreground-muted"}`}>
            <span className={`w-2.5 h-2.5 rounded-sm ${color.get(p.id)?.fondo}`} />
            {p.codigo}
          </Link>
        ))}
        <span className="text-foreground-muted ml-2">Mostrar:</span>
        {[
          ["urgentes", "Sólo atrasadas o urgentes"],
          ["sinoperario", "Sólo sin operario"],
        ].map(([v, l]) => (
          <Link key={v} href={con({ solo: solo === v ? undefined : v })} className={`rounded-full border px-2.5 py-0.5 ${solo === v ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-foreground-muted"}`}>
            {l}
          </Link>
        ))}
        {hayFiltro && (
          <Link href={con({ proyecto: undefined, solo: undefined, centro: undefined })} className="btn-texto btn-sm">
            Quitar filtros
          </Link>
        )}
        <span className="ml-auto">
          <Estimado pct={pctEst} />
        </span>
      </div>

      <div className="grid xl:grid-cols-[1fr_16rem] gap-4 items-start [&>*]:min-w-0">
        <GrillaPlan dias={dias} filas={filas} feriados={feriadosMap} nombresDia={nombresDia} volver={volver} vista={vista} />
        <aside className="tarjeta p-3">
          <h2 className="font-semibold text-sm">Sin lugar esta semana ({sinLugar.length})</h2>
          <p className="text-xs text-foreground-muted mb-2">Tendrían que empezar antes del {fechaCorta(viernes, hoy)} y no entraron por capacidad.</p>
          {sinLugar.length === 0 ? (
            <Vacio>Todo entra en la semana.</Vacio>
          ) : (
            <ul className="space-y-1.5 max-h-[32rem] overflow-y-auto">
              {sinLugar.slice(0, 40).map((t) => (
                <li key={t.clave} className="border border-border rounded-md px-2 py-1.5 text-xs">
                  <div className="font-medium">
                    {capitalizar(t.piezaNombre)} × {t.cantidad}
                    {t.lote && <span className="font-normal text-foreground-muted"> · lote {t.lote.n} de {t.lote.de}</span>}
                  </div>
                  <div className="text-foreground-muted">
                    {t.paso} · {centros.find((c) => c.id === t.centroId)?.nombre} · va el {fechaCorta(t.fechaPlan, hoy)}
                  </div>
                  <div className="mt-1">
                    <Holgura nivel={t.nivel} dias={t.holgura} corto />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
