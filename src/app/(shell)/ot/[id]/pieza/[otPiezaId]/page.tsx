import Link from "next/link";
import { notFound } from "next/navigation";
import { getOtPieza, getEstadoYOperacionActual, getContextoOtPieza } from "@/lib/data/ot";
import { getPieza, getConjunto, nombreOperacion } from "@/lib/data/maestros";
import { getHistorialOtPieza, getTiempoEstandar, resumirHistorialPorOperacion } from "@/lib/data/ejecucion";
import { formatearDuracion } from "@/lib/formato";
import { getUsuario } from "@/lib/data/usuarios";
import { getTareasRevisionDePieza, getItemsTareaRevision } from "@/lib/data/revision";
import { getAsignacionesVigentesBatch } from "@/lib/data/planificacion";
import { enviarAProduccionAction } from "@/app/actions/ot";
import {
  resolverTareaRevisionAction,
  agregarItemTareaRevisionAction,
  iniciarItemTareaRevisionAction,
  detenerItemTareaRevisionAction,
  eliminarItemTareaRevisionAction,
} from "@/app/actions/revision";
import { EstadoBadge } from "@/components/EstadoBadge";
import { AsignacionBadge } from "@/components/AsignacionBadge";


export default async function OtPiezaPage({ params }: { params: Promise<{ id: string; otPiezaId: string }> }) {
  const { id, otPiezaId } = await params;
  const otPieza = await getOtPieza(otPiezaId);
  if (!otPieza) notFound();

  const [pieza, historial, { estado, sinRouting, routing, operacionActual }, tareasRevision, asignaciones, contexto] = await Promise.all([
    getPieza(otPieza.piezaId),
    getHistorialOtPieza(otPieza.id),
    getEstadoYOperacionActual(otPieza),
    getTareasRevisionDePieza(otPieza.id),
    getAsignacionesVigentesBatch([otPieza.id]),
    getContextoOtPieza(otPieza.id),
  ]);
  const asignacion = asignaciones.get(otPieza.id);
  const conjunto = pieza ? await getConjunto(pieza.conjuntoId) : null;
  const revisionPendiente = tareasRevision.filter((t) => t.estado === "pendiente");
  const revisionResuelta = tareasRevision.filter((t) => t.estado === "resuelta");
  const itemsPorTarea = new Map(
    await Promise.all(revisionPendiente.map(async (t) => [t.id, await getItemsTareaRevision(t.id)] as const)),
  );

  const resumenPorOperacion = resumirHistorialPorOperacion(historial);
  const tiempos = await Promise.all(
    routing.map(async (op) => ({
      operacionId: op.id,
      setup: await getTiempoEstandar(op.id, "setup"),
      ejecucion: await getTiempoEstandar(op.id, "ejecucion"),
    })),
  );
  const tiempoPorOp = new Map(tiempos.map((t) => [t.operacionId, t]));

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/ot/${id}`} className="text-sm text-accent hover:underline">
            ← {contexto?.otMaquina.codigo ?? "Orden de trabajo"}
          </Link>
          <h1 className="text-xl font-semibold mt-1 font-mono">{otPieza.codigo}</h1>
          <p className="text-sm text-foreground-muted">
            {pieza?.nombre} · {conjunto?.nombre} · {pieza?.codigo}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <EstadoBadge estado={estado} sinRouting={sinRouting} />
          {!otPieza.enviadaProduccionAt && <span className="badge-estado badge-pendiente">En ingeniería</span>}
          {asignacion && <AsignacionBadge asignacion={asignacion} />}
          <Link
            href={`/ot/${id}/pieza/${otPieza.id}/imprimir`}
            className="border border-border text-sm font-medium px-3 py-2 rounded-md hover:bg-surface-muted"
          >
            Imprimir OT
          </Link>
          {otPieza.enviadaProduccionAt ? (
            <Link
              href="/planificacion"
              className="bg-accent text-accent-foreground text-sm font-medium px-3 py-2 rounded-md hover:opacity-90"
            >
              Planificar →
            </Link>
          ) : (
            <form action={enviarAProduccionAction}>
              <input type="hidden" name="otPiezaId" value={otPieza.id} />
              <button type="submit" className="bg-accent text-accent-foreground text-sm font-medium px-3 py-2 rounded-md hover:opacity-90">
                Enviar a producción
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Operación actual" value={operacionActual ? nombreOperacion(operacionActual) : estado === "terminada" ? "Terminada" : "—"} />
        <Metric label="Material" value={otPieza.material ?? pieza?.material ?? "—"} />
        <Metric label="A fabricar" value={String(otPieza.cantidadAFabricar)} />
        <Metric label="Piezas OK" value={String(otPieza.piezasOk)} />
        <Metric label="Piezas no OK" value={String(otPieza.piezasNoOk)} />
      </div>

      {(revisionPendiente.length > 0 || revisionResuelta.length > 0) && (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold">Revisión / retrabajo</h2>
          {revisionPendiente.map((t) => {
            const items = itemsPorTarea.get(t.id) ?? [];
            const itemAbierto = items.find((it) => it.inicio && !it.fin);
            const segundosTotales = items.reduce((sum, it) => sum + (it.duracionSeg ?? 0), 0);
            return (
              <div key={t.id} className="space-y-2 border border-border rounded-md p-3">
                <div className="flex flex-wrap gap-1.5 items-center">
                  {t.piezasDefectuosas > 0 && (
                    <span className="badge-estado badge-alerta">{t.piezasDefectuosas} defectuosas</span>
                  )}
                  {t.piezasRetrabajadas > 0 && (
                    <span className="badge-estado badge-en_curso">{t.piezasRetrabajadas} a retrabajar</span>
                  )}
                  <span className="text-xs text-foreground-muted">desde {new Date(t.createdAt).toLocaleString("es-AR")}</span>
                  {segundosTotales > 0 && (
                    <span className="text-xs text-foreground-muted ml-auto">
                      Total registrado: {formatearDuracion(segundosTotales)}
                    </span>
                  )}
                </div>

                {items.length > 0 && (
                  <ul className="space-y-1">
                    {items.map((it) => (
                      <li key={it.id} className="flex items-center gap-2 text-sm bg-surface-muted rounded-md px-2.5 py-1.5">
                        <span className="flex-1 truncate">{it.descripcion}</span>
                        {it.fin ? (
                          <span className="text-xs text-foreground-muted shrink-0">{formatearDuracion(it.duracionSeg)}</span>
                        ) : it.inicio ? (
                          <>
                            <span className="badge-estado badge-en_curso shrink-0">corriendo…</span>
                            <form action={detenerItemTareaRevisionAction}>
                              <input type="hidden" name="id" value={it.id} />
                              <input type="hidden" name="otMaquinaId" value={id} />
                              <input type="hidden" name="otPiezaId" value={otPieza.id} />
                              <button type="submit" className="text-xs text-accent hover:underline shrink-0">
                                ⏸ Detener
                              </button>
                            </form>
                          </>
                        ) : (
                          <>
                            <form action={iniciarItemTareaRevisionAction}>
                              <input type="hidden" name="id" value={it.id} />
                              <input type="hidden" name="tareaRevisionId" value={t.id} />
                              <input type="hidden" name="otMaquinaId" value={id} />
                              <input type="hidden" name="otPiezaId" value={otPieza.id} />
                              <button
                                type="submit"
                                disabled={!!itemAbierto}
                                className="text-xs text-accent hover:underline disabled:opacity-40 disabled:no-underline shrink-0"
                              >
                                ▶ Iniciar
                              </button>
                            </form>
                            <form action={eliminarItemTareaRevisionAction}>
                              <input type="hidden" name="id" value={it.id} />
                              <input type="hidden" name="otMaquinaId" value={id} />
                              <input type="hidden" name="otPiezaId" value={otPieza.id} />
                              <button type="submit" className="text-xs text-red-700 hover:underline shrink-0">
                                Eliminar
                              </button>
                            </form>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <form action={agregarItemTareaRevisionAction} className="flex gap-2">
                  <input type="hidden" name="tareaRevisionId" value={t.id} />
                  <input type="hidden" name="otMaquinaId" value={id} />
                  <input type="hidden" name="otPiezaId" value={otPieza.id} />
                  <input name="descripcion" placeholder="Agregar tarea (ej. reperforar eje)…" className="input flex-1 text-sm" />
                  <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap px-1">
                    + Agregar
                  </button>
                </form>

                <form action={resolverTareaRevisionAction} className="flex gap-2 pt-2 border-t border-border">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="otMaquinaId" value={id} />
                  <input type="hidden" name="otPiezaId" value={otPieza.id} />
                  <input
                    name="resolucion"
                    required
                    placeholder="¿Qué se hizo? (ej. se refabricaron 2, se reprocesó 1)"
                    className="input flex-1 text-sm"
                  />
                  <button
                    type="submit"
                    className="bg-accent text-accent-foreground text-sm font-medium px-3 rounded-md hover:opacity-90"
                  >
                    Resolver
                  </button>
                </form>
              </div>
            );
          })}
          {revisionResuelta.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-foreground-muted hover:text-foreground">
                {revisionResuelta.length} resuelta{revisionResuelta.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 space-y-1.5">
                {revisionResuelta.map((t) => (
                  <li key={t.id} className="text-foreground-muted">
                    {t.resolucion}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">Hoja de ruta</h2>
        {sinRouting ? (
          <div className="badge-estado badge-alerta">Sin operaciones definidas para esta pieza</div>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium w-10">#</th>
                  <th className="text-left px-4 py-2 font-medium">Proceso</th>
                  <th className="text-left px-4 py-2 font-medium">Operario</th>
                  <th className="text-right px-4 py-2 font-medium">Tiempo real</th>
                  <th className="text-right px-4 py-2 font-medium">Tiempo estándar</th>
                  <th className="text-right px-4 py-2 font-medium">Errores/paradas</th>
                </tr>
              </thead>
              <tbody>
                {await Promise.all(
                  routing.map(async (op, i) => {
                    const resumen = resumenPorOperacion.get(op.id);
                    const tstd = tiempoPorOp.get(op.id)?.ejecucion;
                    const operarios = resumen ? await Promise.all(resumen.usuarioIds.map((u) => getUsuario(u))) : [];
                    const esActual = operacionActual?.id === op.id;
                    return (
                      <tr key={op.id} className={`border-t border-border ${esActual ? "bg-accent/5" : ""}`}>
                        <td className="px-4 py-2.5 text-foreground-muted">{i + 1}</td>
                        <td className="px-4 py-2.5">
                          {nombreOperacion(op)}
                          {esActual && <span className="badge-estado badge-en_curso ml-2">actual</span>}
                        </td>
                        <td className="px-4 py-2.5 text-foreground-muted">
                          {operarios.map((o) => o?.nombre).filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatearDuracion(resumen?.duracionSeg ?? null)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">
                          {tstd ? `${formatearDuracion(tstd.promedio)} (n=${tstd.observaciones})` : "sin histórico"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">
                          {resumen?.paradas.length ?? 0}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2">
      <div className="text-xs text-foreground-muted">{label}</div>
      <div className="font-semibold truncate">{value}</div>
    </div>
  );
}
