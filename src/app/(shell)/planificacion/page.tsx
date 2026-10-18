import Link from "next/link";
import { getUsuarioActual } from "@/lib/session";
import { getPlan } from "@/lib/planning/datos";
import { lunesDe, sumarHabiles, ajustarAHabil } from "@/lib/planning/calendario";
import { db } from "@/lib/db/client";
import { feriado } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { PestanasPlanificacion } from "@/components/ui/PestanasSecciones";
import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";
import { GrillaPlan, type FilaPlan, type Tarjeta } from "@/components/v2/GrillaPlan";
import { Holgura, fechaCorta, Estimado } from "@/components/v2/Plan";
import { recalcularAction, confirmarSemanaAction } from "@/app/actions/v2";
import type { Tarea } from "@/lib/planning/motor";
import { cargaSemana } from "@/lib/planning/carga";

export const dynamic = "force-dynamic";

const corridos = (f: string, n: number) => {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Plan de la semana (reemplaza Planificación): el sistema propone qué se hace
 * en cada centro cada día; el jefe de planta mueve, cambia el operario, fija
 * con candado y confirma. Confirmar publica el plan en "Mi próxima tarea".
 */
export default async function PlanSemanaPage({ searchParams }: { searchParams: Promise<{ semana?: string; vista?: string; ver?: string; ok?: string; error?: string }> }) {
  const { semana, vista = "centro", ver, ok, error } = await searchParams;
  const [usuario, plan, feriados] = await Promise.all([getUsuarioActual(), getPlan(), db.select().from(feriado)]);
  const { resultado: r, entrada, centros, operarios } = plan;
  const cal = entrada.calendario;
  const hoy = ajustarAHabil(entrada.hoy, cal);
  const lunesActual = lunesDe(hoy);
  const lunes = semana ? lunesDe(semana) : lunesActual;
  const dias = [0, 1, 2, 3, 4].map((i) => corridos(lunes, i));
  const viernes = dias[4];
  const nombresDia = ["lun", "mar", "mié", "jue", "vie"];
  const feriadosMap = Object.fromEntries(feriados.filter((f) => dias.includes(f.fecha)).map((f) => [f.fecha, f.nombre]));
  const volver = `/planificacion?semana=${lunes}${vista !== "centro" ? `&vista=${vista}` : ""}`;

  const enSemana = (t: Tarea) => t.fechaPlan && t.fechaPlan <= viernes && (t.finPlan ?? t.fechaPlan) >= lunes;
  const diaDeTarjeta = (t: Tarea) => Object.keys(t.horasPorDia).sort().find((d) => d >= lunes && d <= viernes) ?? (t.fechaPlan! < lunes ? lunes : t.fechaPlan!);
  const aTarjeta = (t: Tarea): Tarjeta => ({
    clave: t.clave,
    dia: diaDeTarjeta(t),
    titulo: `${t.piezaNombre} × ${t.cantidad}`,
    sub: `${t.paso} · ${t.proyectoCodigo}${vista === "operario" ? ` · ${centros.find((c) => c.id === t.centroId)?.nombre ?? ""}` : ""}`,
    nivel: t.nivel,
    holgura: t.holgura,
    horas: Object.entries(t.horasPorDia).filter(([d]) => d >= lunes && d <= viernes).reduce((s, [, h]) => s + h, 0) || t.horas,
    dias: Object.keys(t.horasPorDia).length,
    operarioId: t.operarioId,
    fijada: t.fijada,
    movida: t.movida,
    tarde: t.tarde,
    enCurso: t.estado === "en_curso" || t.estado === "pausada",
    futura: t.estado === "futura",
    resaltada: t.clave === ver,
  });

  const internas = r.tareas.filter((t) => t.tipo === "interno" && t.estado !== "terminada" && enSemana(t));
  const capacidadDia = (centroId: string, d: string) => r.capacidad.get(centroId)?.get(d) ?? 0;
  const cargaDia = (centroId: string, d: string) => r.carga.get(centroId)?.get(d) ?? 0;

  let filas: FilaPlan[];
  if (vista === "operario") {
    const ops = [...operarios.entries()];
    filas = ops.map(([id, nombre]) => {
      const ts = internas.filter((t) => t.operarioId === id);
      const porDia = dias.map((d) => ({ dia: d, usado: ts.reduce((s, t) => s + (t.horasPorDia[d] ?? 0), 0), disponible: 6.8 }));
      return { id, nombre, usado: porDia.reduce((s, x) => s + x.usado, 0), disponible: 34, porDia, tarjetas: ts.map(aTarjeta), operarios: [{ id, nombre }] };
    });
  } else {
    filas = centros.map((c) => {
      const porDia = dias.map((d) => ({ dia: d, usado: cargaDia(c.id, d), disponible: capacidadDia(c.id, d) || (feriadosMap[d] ? 0 : c.horasDia * c.maquinas * c.eficiencia) }));
      return {
        id: c.id,
        nombre: c.nombre,
        usado: porDia.reduce((s, x) => s + x.usado, 0),
        disponible: porDia.reduce((s, x) => s + x.disponible, 0),
        demanda: cargaSemana(r, c.id, dias, lunes <= lunesActual).demanda,
        porDia,
        tarjetas: internas.filter((t) => t.centroId === c.id).map(aTarjeta),
        operarios: c.operarios,
      };
    });
    const terc = r.tareas.filter((t) => t.tipo === "tercerizado" && t.estado !== "terminada" && t.fechaPlan && t.fechaPlan >= lunes && t.fechaPlan <= viernes);
    filas.push({
      id: "TERCERIZADOS",
      nombre: "Tercerizados (para mandar)",
      sinLimite: true,
      usado: 0,
      disponible: 0,
      porDia: dias.map((d) => ({ dia: d, usado: 0, disponible: 0 })),
      tarjetas: terc.map((t) => ({ ...aTarjeta(t), dia: t.fechaPlan!, sub: `${t.paso} · vuelve ${fechaCorta(t.finPlan)} · ${t.proyectoCodigo}` })),
      operarios: [],
    });
  }

  // Lo que debería hacerse esta semana y no entró por capacidad.
  const sinLugar = r.tareas
    .filter((t) => t.tipo === "interno" && t.estado === "lista" && t.inicioMasTardio <= viernes && t.fechaPlan && t.fechaPlan > viernes)
    .sort((a, b) => a.holgura - b.holgura);
  const sobrecargados = filas.filter((f) => !f.sinLimite && f.disponible && (f.demanda ?? 0) / f.disponible > 1);
  const tardes = internas.filter((t) => t.tarde).length;
  const esJefe = usuario.rol === "taller";
  const semanaAnterior = corridos(lunes, -7), semanaSiguiente = corridos(lunes, 7);
  const pctEst = Math.max(0, ...r.proyectos.map((p) => p.pctEstimado));

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Plan de la semana"
        descripcion="El sistema propone qué se hace en cada centro y cada día, según la holgura de cada tarea y la capacidad. Arrastrá una tarjeta a otro día, cambiá el operario o fijala con el candado."
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
                mensaje="¿Confirmar la semana? El plan se publica en la pantalla de cada operario."
                disabled={!esJefe}
                title={esJefe ? undefined : "Sólo el jefe de planta confirma la semana"}
              >
                Confirmar semana
              </ConfirmarBoton>
            </form>
          </>
        }
      >
        <PestanasPlanificacion actual="/planificacion" />
      </PageHeader>

      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!esJefe && <Aviso tipo="info">Estás viendo el plan propuesto. Lo confirma el jefe de planta: recién ahí aparece en la pantalla de cada operario.</Aviso>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/planificacion?semana=${semanaAnterior}&vista=${vista}`} className="btn-secundario btn-sm">
            ←
          </Link>
          <span className="font-semibold">
            Semana del {fechaCorta(lunes)} al {fechaCorta(viernes)}
            {lunes === lunesActual && <span className="text-foreground-muted font-normal"> · esta semana</span>}
          </span>
          <Link href={`/planificacion?semana=${semanaSiguiente}&vista=${vista}`} className="btn-secundario btn-sm">
            →
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-foreground-muted">
            {internas.length} tareas{tardes ? ` · ${tardes} terminan tarde` : ""}
            {sobrecargados.length ? ` · ${sobrecargados.length} centro${sobrecargados.length === 1 ? "" : "s"} sobrecargado${sobrecargados.length === 1 ? "" : "s"}` : ""}
          </span>
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            {[
              ["centro", "Por centro"],
              ["operario", "Por operario"],
            ].map(([v, l]) => (
              <Link key={v} href={`/planificacion?semana=${lunes}&vista=${v}`} className={`px-3 py-1 ${vista === v ? "bg-accent text-accent-foreground" : "hover:bg-surface-muted"}`}>
                {l}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-foreground-muted items-center">
        <span className="flex items-center gap-1"><span className="w-3 h-3 border-l-4 border-l-[#dc2626] border border-border rounded-sm" /> atrasada</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 border-l-4 border-l-[#ea580c] border border-border rounded-sm" /> urgente (0 a 3 días de margen)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 border-l-4 border-l-[#16a34a] border border-border rounded-sm" /> en plazo</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 border-l-4 border-l-[#9ca3af] border border-border rounded-sm" /> con mucho margen</span>
        <Estimado pct={pctEst} />
      </div>

      <div className="grid xl:grid-cols-[1fr_17rem] gap-4 items-start [&>*]:min-w-0">
        <GrillaPlan dias={dias} filas={filas} feriados={feriadosMap} nombresDia={nombresDia} volver={volver} />
        <aside className="tarjeta p-3">
          <h2 className="font-semibold text-sm">Sin lugar esta semana ({sinLugar.length})</h2>
          <p className="text-xs text-foreground-muted mb-2">Deberían empezar antes del {fechaCorta(viernes)} y no entraron por capacidad. Ordenadas por margen.</p>
          {sinLugar.length === 0 ? (
            <p className="text-sm text-[var(--estado-terminada-fg)] font-medium">✓ Todo entra en la semana.</p>
          ) : (
            <ul className="space-y-1.5 max-h-[32rem] overflow-y-auto">
              {sinLugar.slice(0, 40).map((t) => (
                <li key={t.clave} className="border border-border rounded-md px-2 py-1.5 text-xs">
                  <div className="font-medium">
                    {t.piezaNombre} × {t.cantidad}
                  </div>
                  <div className="text-foreground-muted">
                    {t.paso} · {centros.find((c) => c.id === t.centroId)?.nombre} · va el {fechaCorta(t.fechaPlan)}
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
