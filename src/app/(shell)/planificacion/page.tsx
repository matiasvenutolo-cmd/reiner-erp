import Link from "next/link";
import { hoyISO } from "@/lib/fecha";
import { getAsignacionesRango, getClavesAsignadasDesdeHoy, type AsignacionConDetalle } from "@/lib/data/planificacion";
import { getUsuariosPorRol } from "@/lib/data/usuarios";
import { getCentrosTrabajo, getPendientesDePlanificar, type PendienteDePlanificar } from "@/lib/data/produccion";
import { asignarTrabajoAction, eliminarAsignacionAction } from "@/app/actions/planificacion";
import type { Usuario } from "@/lib/db/schema";

// Datos en vivo (asignaciones/producción cambian todo el tiempo) — nunca prerenderizar en build.
export const dynamic = "force-dynamic";

const DIA_LABEL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function lunesDe(fecha: Date): Date {
  const d = new Date(fecha);
  const dia = d.getDay(); // 0=domingo
  const offset = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function aISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatoCorto(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/**
 * Planificación (revisión del 2026-10-02): lo que ingeniería envió a
 * producción llega acá como pendiente de asignar, con sus operaciones por
 * centro de trabajo — la actual y las que vienen después. Se asigna una
 * operación a un operario para un día, y se ve la carga de cada centro por
 * día (vista "Por centro") o de cada operario (vista "Por operario", desde
 * donde se imprimen sus hojas del día).
 */
export default async function PlanificacionPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; vista?: string }>;
}) {
  const { desde, vista = "centro" } = await searchParams;
  const hoy = hoyISO();
  const lunes = lunesDe(new Date(`${desde ?? hoy}T00:00:00`));
  const dias = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(d.getDate() + i);
    return aISO(d);
  });
  const semanaAnterior = new Date(lunes);
  semanaAnterior.setDate(semanaAnterior.getDate() - 7);
  const semanaSiguiente = new Date(lunes);
  semanaSiguiente.setDate(semanaSiguiente.getDate() + 7);
  const fechaPorDefecto = dias.includes(hoy) ? hoy : dias[0];

  const [operarios, asignaciones, centros, claves] = await Promise.all([
    getUsuariosPorRol("operario"),
    getAsignacionesRango(dias[0], dias[dias.length - 1]),
    getCentrosTrabajo(),
    getClavesAsignadasDesdeHoy(),
  ]);
  const pendientes = await getPendientesDePlanificar(claves);

  const pendientesPorCentro = new Map<string, PendienteDePlanificar[]>();
  const sinCentro: PendienteDePlanificar[] = [];
  for (const p of pendientes) {
    if (!p.centroTrabajoId) sinCentro.push(p);
    else pendientesPorCentro.set(p.centroTrabajoId, [...(pendientesPorCentro.get(p.centroTrabajoId) ?? []), p]);
  }
  // Operaciones sin centro, agrupadas por tipo de operación: se resuelven en Administración.
  const sinCentroPorOperacion = [...sinCentro.reduce((m, p) => m.set(p.operacionNombre, (m.get(p.operacionNombre) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  const centrosConAlgo = centros.filter((c) => pendientesPorCentro.has(c.id) || asignaciones.some((a) => a.centroTrabajoId === c.id));
  const operariosActivos = operarios.filter((o) => o.activo);

  const linkVista = (v: string) => `/planificacion?desde=${dias[0]}&vista=${v}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Planificación</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Lo que ingeniería envió a producción, para asignarle día, operación y operario. Abajo, lo que todavía falta asignar.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-md border border-border overflow-hidden text-sm">
          {[
            ["centro", "Por centro de trabajo"],
            ["operario", "Por operario"],
          ].map(([v, label]) => (
            <Link
              key={v}
              href={linkVista(v)}
              className={`px-3 py-1.5 ${vista === v ? "bg-accent text-accent-foreground" : "hover:bg-surface-muted"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href={`/planificacion?desde=${aISO(semanaAnterior)}&vista=${vista}`} className="text-accent hover:underline">
            ← Semana anterior
          </Link>
          <span className="text-foreground-muted">
            {formatoCorto(dias[0])} – {formatoCorto(dias[dias.length - 1])}
          </span>
          <Link href={`/planificacion?desde=${aISO(semanaSiguiente)}&vista=${vista}`} className="text-accent hover:underline">
            Semana siguiente →
          </Link>
        </div>
      </div>

      {vista === "operario" ? (
        <Grilla
          dias={dias}
          hoy={hoy}
          titulo="Operario"
          filas={operariosActivos.map((op) => ({
            id: op.id,
            nombre: op.nombre,
            asignaciones: asignaciones.filter((a) => a.operarioId === op.id),
            detalle: (a: AsignacionConDetalle) =>
              `${a.operacionNombre ?? "—"}${a.centroNombre && a.centroNombre !== a.operacionNombre ? ` · ${a.centroNombre}` : ""}`,
            pie: (dia: string, n: number) =>
              n > 0 ? (
                <Link href={`/planificacion/hojas?operario=${op.id}&fecha=${dia}`} className="text-xs text-accent hover:underline">
                  Imprimir hojas
                </Link>
              ) : null,
          }))}
          vacio="No hay operarios activos."
        />
      ) : (
        <Grilla
          dias={dias}
          hoy={hoy}
          titulo="Centro de trabajo"
          filas={centrosConAlgo.map((c) => ({
            id: c.id,
            nombre: c.nombre,
            sub: `${pendientesPorCentro.get(c.id)?.length ?? 0} sin asignar`,
            asignaciones: asignaciones.filter((a) => a.centroTrabajoId === c.id),
            detalle: (a: AsignacionConDetalle) => `${a.operacionNombre ?? "—"} · ${a.operarioNombre}`,
          }))}
          vacio="Nada enviado a producción ni asignado esta semana."
        />
      )}

      <div>
        <h2 className="text-sm font-semibold mb-1">Pendiente de asignar ({pendientes.length})</h2>
        <p className="text-xs text-foreground-muted mb-2">
          Por centro de trabajo. &ldquo;Se puede hacer ya&rdquo; = es el paso actual de la pieza; el resto llega cuando termine el paso anterior,
          y se puede ir asignando para los próximos días.
        </p>
        {pendientes.length === 0 && sinCentro.length === 0 ? (
          <p className="text-sm text-foreground-muted">No hay nada pendiente de asignar.</p>
        ) : (
          <div className="space-y-2">
            {sinCentro.length > 0 && (
              <div className="bg-surface border border-border rounded-lg px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">Sin centro de trabajo asignado</span>
                    <span className="text-foreground-muted"> · {sinCentro.length} operaciones — no se pueden planificar hasta saber dónde se hacen</span>
                  </span>
                  <Link href="/operaciones" className="text-accent hover:underline whitespace-nowrap">
                    Asignar centro de trabajo →
                  </Link>
                </div>
                <div className="text-xs text-foreground-muted mt-1">
                  {sinCentroPorOperacion.map(([nombre, n]) => `${nombre} (${n})`).join(" · ")}
                </div>
              </div>
            )}
            {centros
              .filter((c) => pendientesPorCentro.has(c.id))
              .map((c) => {
                const items = [...(pendientesPorCentro.get(c.id) ?? [])].sort((a, b) => Number(a.despuesDe !== null) - Number(b.despuesDe !== null));
                const ya = items.filter((i) => i.despuesDe === null).length;
                return (
                  <details key={c.id} className="bg-surface border border-border rounded-lg">
                    <summary className="cursor-pointer px-4 py-2.5 text-sm flex items-center gap-2">
                      <span className="font-medium">{c.nombre}</span>
                      <span className="text-foreground-muted">
                        · {ya} se pueden hacer ya · {items.length - ya} después
                      </span>
                    </summary>
                    <div className="overflow-x-auto border-t border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                          <tr>
                            <th className="text-left px-4 py-2 font-medium">Pieza</th>
                            <th className="text-left px-4 py-2 font-medium">Operación</th>
                            <th className="text-left px-4 py-2 font-medium">Cuándo</th>
                            <th className="text-right px-4 py-2 font-medium">Cant.</th>
                            <th className="text-left px-4 py-2 font-medium">Asignar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((p) => (
                            <tr key={`${p.otPiezaId}-${p.operacionId}`} className="border-t border-border">
                              <td className="px-4 py-2">
                                <Link href={`/ot/${p.otMaquinaId}/pieza/${p.otPiezaId}`} className="font-mono text-xs text-accent hover:underline mr-1">
                                  {p.otPiezaCodigo}
                                </Link>
                                {p.piezaNombre}
                              </td>
                              <td className="px-4 py-2">{p.operacionNombre}</td>
                              <td className="px-4 py-2 text-foreground-muted text-xs">
                                {p.despuesDe === null ? <span className="badge-estado badge-terminada">Se puede hacer ya</span> : `Después de ${p.despuesDe}`}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums">{p.cantidad}</td>
                              <td className="px-4 py-2">
                                <FormAsignar p={p} operarios={operariosActivos} fecha={fechaPorDefecto} min={hoy > dias[0] ? hoy : dias[0]} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

function Grilla({
  dias,
  hoy,
  titulo,
  filas,
  vacio,
}: {
  dias: string[];
  hoy: string;
  titulo: string;
  filas: {
    id: string;
    nombre: string;
    sub?: string;
    asignaciones: AsignacionConDetalle[];
    detalle: (a: AsignacionConDetalle) => string;
    pie?: (dia: string, n: number) => React.ReactNode;
  }[];
  vacio: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
          <tr>
            <th className="text-left px-3 py-2 font-medium w-40">{titulo}</th>
            {dias.map((dia, i) => (
              <th key={dia} className={`text-left px-3 py-2 font-medium ${dia === hoy ? "text-accent" : ""}`}>
                {DIA_LABEL[i]}
                <div className="font-normal normal-case text-foreground-muted/70">{dia === hoy ? "hoy" : formatoCorto(dia)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className="border-t border-border align-top">
              <td className="px-3 py-2.5">
                <div className="font-medium">{f.nombre}</div>
                {f.sub && <div className="text-xs text-foreground-muted">{f.sub}</div>}
              </td>
              {dias.map((dia) => {
                const delDia = f.asignaciones.filter((a) => a.fecha === dia);
                const unidades = delDia.length;
                return (
                  <td key={dia} className={`px-2 py-2 ${dia === hoy ? "bg-accent-soft/40" : ""}`}>
                    {unidades > 0 && <div className="text-xs text-foreground-muted mb-1">{unidades} trabajo{unidades === 1 ? "" : "s"}</div>}
                    <div className="space-y-1">
                      {delDia.map((a) => (
                        <div key={a.id} className="flex items-start gap-1 bg-accent-soft text-accent rounded px-1.5 py-1 text-xs">
                          <span className="flex-1 min-w-0" title={`${a.otPiezaCodigo} — ${a.piezaNombre}`}>
                            <span className="block truncate font-medium">{a.piezaNombre}</span>
                            <span className="block truncate opacity-80">{f.detalle(a)}</span>
                          </span>
                          <form action={eliminarAsignacionAction}>
                            <input type="hidden" name="id" value={a.id} />
                            <button type="submit" className="hover:opacity-70" aria-label="Quitar asignación">
                              ×
                            </button>
                          </form>
                        </div>
                      ))}
                    </div>
                    {f.pie && <div className="mt-1">{f.pie(dia, delDia.length)}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
          {filas.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-foreground-muted">
                {vacio}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function FormAsignar({ p, operarios, fecha, min }: { p: PendienteDePlanificar; operarios: Usuario[]; fecha: string; min: string }) {
  return (
    <form action={asignarTrabajoAction} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="otPiezaId" value={p.otPiezaId} />
      <input type="hidden" name="operacionId" value={p.operacionId} />
      <select name="operarioId" required className="input text-xs py-1 w-auto" defaultValue="">
        <option value="" disabled>
          Operario…
        </option>
        {operarios.map((op) => (
          <option key={op.id} value={op.id}>
            {op.nombre}
          </option>
        ))}
      </select>
      <input type="date" name="fecha" required defaultValue={fecha} min={min} className="input text-xs py-1 w-auto" />
      <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap">
        Asignar
      </button>
    </form>
  );
}
