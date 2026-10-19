import { asc, count } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { proceso, centroTrabajo, usuarioCentroTrabajo } from "@/lib/db/schema";
import { guardarProcesoAction, guardarCapacidadAction } from "@/app/actions/v2";

const Origen = ({ o }: { o: string }) =>
  o === "definido" ? <span className="badge-estado badge-terminada">definido</span> : <span className="badge-estado bg-demo-bg text-demo-fg">estimado</span>;

/** Tiempos por proceso: los heredan todos los pasos que no tienen tiempo propio cargado en la ficha de la pieza. */
export async function TiemposPorProceso({ editable }: { editable: boolean }) {
  const procesos = await db.select().from(proceso).orderBy(asc(proceso.tipo), asc(proceso.ordenFlujo), asc(proceso.nombre));
  return (
    <section className="space-y-2">
      <p className="text-sm text-foreground-muted">
        Tiempo de preparación (setup) y minutos por unidad de cada proceso. Los usa el plan para todos los pasos que todavía no tienen un tiempo propio. Los marcados <strong>estimado</strong> los puso el sistema para poder mostrar la idea: hay que reemplazarlos por los de REINER.
      </p>
      <div className="tarjeta overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-foreground-muted">
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2 font-medium">Proceso</th>
              <th className="text-left px-3 py-2 font-medium">Tipo</th>
              <th className="text-left px-3 py-2 font-medium">Setup (min)</th>
              <th className="text-left px-3 py-2 font-medium">Min por unidad</th>
              <th className="text-left px-3 py-2 font-medium">Plazo (días hábiles)</th>
              <th className="text-left px-3 py-2 font-medium">Origen</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {procesos.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{p.nombre}</td>
                <td className="px-3 py-2 text-foreground-muted">{p.tipo === "interno" ? "Interno" : p.tipo === "tercerizado" ? "Tercerizado" : "Compra"}</td>
                <td className="px-3 py-2" colSpan={4}>
                  <form action={guardarProcesoAction} className="flex items-center gap-2" id={`p-${p.id}`}>
                    <input type="hidden" name="id" value={p.id} />
                    <input name="setupMin" type="number" min="0" defaultValue={p.setupMin ?? ""} disabled={!editable || p.tipo !== "interno"} className="input text-sm py-1 w-20" aria-label="Setup" />
                    <input name="minPorUnidad" type="number" min="0" step="0.1" defaultValue={p.minPorUnidad ?? ""} disabled={!editable || p.tipo !== "interno"} className="input text-sm py-1 w-24" aria-label="Minutos por unidad" />
                    <input name="plazoDias" type="number" min="0" defaultValue={p.plazoDias ?? ""} disabled={!editable || p.tipo === "interno"} className="input text-sm py-1 w-20" aria-label="Plazo" />
                    <Origen o={p.tiempoOrigen} />
                    {editable && (
                      <button className="text-xs text-accent hover:underline ml-auto" type="submit">
                        Guardar
                      </button>
                    )}
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Capacidad de cada centro: horas por día × máquinas iguales × eficiencia planificable. Las ausencias se restan solas. */
export async function Capacidad({ editable }: { editable: boolean }) {
  const [centros, ops] = await Promise.all([
    db.select().from(centroTrabajo).orderBy(centroTrabajo.orden, centroTrabajo.nombre),
    db.select({ c: usuarioCentroTrabajo.centroTrabajoId, n: count() }).from(usuarioCentroTrabajo).groupBy(usuarioCentroTrabajo.centroTrabajoId),
  ]);
  const nOps = new Map(ops.map((o) => [o.c, o.n]));
  return (
    <section className="space-y-2">
      <p className="text-sm text-foreground-muted">
        Cuántas horas por día puede producir cada centro. Ejemplo: 8 h × 1 máquina × 85 % = 6,8 h planificables por día. El 15 % restante cubre imprevistos, mantenimiento y tiempos muertos. Los feriados y las ausencias se descuentan solos.
      </p>
      <div className="tarjeta overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-foreground-muted">
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2 font-medium">Centro</th>
              <th className="text-left px-3 py-2 font-medium">Horas por día · Máquinas · Eficiencia %</th>
              <th className="text-left px-3 py-2 font-medium">Planificable por día</th>
              <th className="text-left px-3 py-2 font-medium">Operarios habilitados</th>
            </tr>
          </thead>
          <tbody>
            {centros.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{c.nombre}</td>
                <td className="px-3 py-2">
                  <form action={guardarCapacidadAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input name="horasDia" type="number" min="0" step="0.5" defaultValue={c.horasDia} disabled={!editable} className="input text-sm py-1 w-20" aria-label="Horas por día" />
                    <span className="text-foreground-muted">×</span>
                    <input name="maquinas" type="number" min="0" defaultValue={c.maquinas} disabled={!editable} className="input text-sm py-1 w-16" aria-label="Máquinas" />
                    <span className="text-foreground-muted">×</span>
                    <input name="eficiencia" type="number" min="0" max="100" defaultValue={Math.round(c.eficiencia * 100)} disabled={!editable} className="input text-sm py-1 w-16" aria-label="Eficiencia" />
                    <Origen o={c.capacidadOrigen} />
                    {editable && (
                      <button className="text-xs text-accent hover:underline" type="submit">
                        Guardar
                      </button>
                    )}
                  </form>
                </td>
                <td className="px-3 py-2 tabular-nums font-semibold">{(Math.round(c.horasDia * c.maquinas * c.eficiencia * 10) / 10).toLocaleString("es-AR")} h</td>
                <td className={`px-3 py-2 tabular-nums ${nOps.get(c.id) ? "" : "text-naranja-fg"}`}>{nOps.get(c.id) ?? "ninguno"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
