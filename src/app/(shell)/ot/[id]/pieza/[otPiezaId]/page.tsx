import Link from "next/link";
import { notFound } from "next/navigation";
import { getOtPieza, getEstadoYOperacionActual } from "@/lib/data/ot";
import { getPieza, getConjunto, nombreOperacion } from "@/lib/data/maestros";
import { getHistorialOtPieza, getTiempoEstandar } from "@/lib/data/ejecucion";
import { getUsuario } from "@/lib/data/usuarios";
import { getTareasRevisionDePieza } from "@/lib/data/revision";
import { getAsignacionesVigentesBatch } from "@/lib/data/planificacion";
import { resolverTareaRevisionAction } from "@/app/actions/revision";
import { EstadoBadge } from "@/components/EstadoBadge";
import { AsignacionBadge } from "@/components/AsignacionBadge";

function formatearDuracion(seg: number | null): string {
  if (seg === null) return "—";
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

export default async function OtPiezaPage({ params }: { params: Promise<{ id: string; otPiezaId: string }> }) {
  const { id, otPiezaId } = await params;
  const otPieza = await getOtPieza(otPiezaId);
  if (!otPieza) notFound();

  const [pieza, historial, { estado, sinRouting, routing, operacionActual }, tareasRevision, asignaciones] = await Promise.all([
    getPieza(otPieza.piezaId),
    getHistorialOtPieza(otPieza.id),
    getEstadoYOperacionActual(otPieza),
    getTareasRevisionDePieza(otPieza.id),
    getAsignacionesVigentesBatch([otPieza.id]),
  ]);
  const asignacion = asignaciones.get(otPieza.id);
  const conjunto = pieza ? await getConjunto(pieza.conjuntoId) : null;
  const revisionPendiente = tareasRevision.filter((t) => t.estado === "pendiente");
  const revisionResuelta = tareasRevision.filter((t) => t.estado === "resuelta");

  const registrosPorOperacion = new Map(historial.map((h) => [h.registro.operacionId, h]));
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
            ← {id}
          </Link>
          <h1 className="text-xl font-semibold mt-1 font-mono">{otPieza.codigo}</h1>
          <p className="text-sm text-foreground-muted">
            {pieza?.nombre} · {conjunto?.nombre} · {pieza?.codigo}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <EstadoBadge estado={estado} sinRouting={sinRouting} />
          {asignacion && <AsignacionBadge asignacion={asignacion} />}
          <Link
            href={`/taller/${otPieza.id}`}
            className="bg-accent text-accent-foreground text-sm font-medium px-3 py-2 rounded-md hover:opacity-90"
          >
            Abrir en taller →
          </Link>
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
          {revisionPendiente.map((t) => (
            <div key={t.id} className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {t.piezasDefectuosas > 0 && (
                  <span className="badge-estado badge-alerta">{t.piezasDefectuosas} defectuosas</span>
                )}
                {t.piezasRetrabajadas > 0 && (
                  <span className="badge-estado badge-en_curso">{t.piezasRetrabajadas} a retrabajar</span>
                )}
                <span className="text-xs text-foreground-muted self-center">
                  desde {new Date(t.createdAt).toLocaleString("es-AR")}
                </span>
              </div>
              <form action={resolverTareaRevisionAction} className="flex gap-2">
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
          ))}
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
                  routing.map(async (op) => {
                    const registro = registrosPorOperacion.get(op.id);
                    const tstd = tiempoPorOp.get(op.id)?.ejecucion;
                    const operario = registro ? await getUsuario(registro.registro.usuarioId) : null;
                    const esActual = operacionActual?.id === op.id;
                    return (
                      <tr key={op.id} className={`border-t border-border ${esActual ? "bg-accent/5" : ""}`}>
                        <td className="px-4 py-2.5 text-foreground-muted">{op.secuencia}</td>
                        <td className="px-4 py-2.5">
                          {nombreOperacion(op)}
                          {esActual && <span className="badge-estado badge-en_curso ml-2">actual</span>}
                        </td>
                        <td className="px-4 py-2.5 text-foreground-muted">{operario?.nombre ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatearDuracion(registro?.registro.duracionSeg ?? null)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">
                          {tstd ? `${formatearDuracion(tstd.promedio)} (n=${tstd.observaciones})` : "sin histórico"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">
                          {registro?.paradas.length ?? 0}
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
