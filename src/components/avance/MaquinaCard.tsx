"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EstadoBadge } from "@/components/EstadoBadge";
import { iniciarOperacionAction, finalizarOperacionAction } from "@/app/actions/ejecucion";
import type { EstadoCalculado, SeccionPieza } from "@/lib/data/ot";

const COLOR_SECCION: Record<EstadoCalculado, string> = {
  pendiente: "bg-surface-muted",
  en_curso: "bg-accent",
  terminada: "bg-brand-teal",
};

export type SeccionResumen = {
  otConjuntoId: string;
  nombre: string;
  total: number;
  terminadas: number;
  estado: EstadoCalculado;
  piezas: SeccionPieza[];
};

/**
 * Tarjeta de una OT de máquina en /avance — pedido de Matías (docs/06-
 * backlog-release-3.md): la tarjeta entera tiene que llevar a la OT con un
 * solo clic, no sólo el código. Es un componente cliente (no un <Link> que
 * envuelve todo) porque los bloques de "Por sección" necesitan su propio
 * destino (#seccion-X) sin disparar también la navegación de la tarjeta —
 * cada bloque corta la propagación del clic antes de navegar a su ancla.
 *
 * "Ver piezas" (devolución de la 2ª ronda del cliente: "que se puedan
 * modificar los estados de la pieza desde el avance y no tener que entrar a
 * cada pieza, tanto así como de conjunto") agrega/quita una lista expandida,
 * agrupada por conjunto, con Iniciar/Finalizar inline — mismas acciones que
 * usa /taller, sin navegar.
 */
export function MaquinaCard({
  otId,
  codigo,
  configuracionNombre,
  estadoCalculado,
  pct,
  piezasTerminadas,
  totalPiezasAFabricar,
  plazoEntrega,
  secciones,
  otPiezaIdAbierta,
  registroOperacionIdAbierta,
}: {
  otId: string;
  codigo: string;
  configuracionNombre?: string;
  estadoCalculado: EstadoCalculado;
  pct: number;
  piezasTerminadas: number;
  totalPiezasAFabricar: number;
  plazoEntrega: string | null;
  secciones: SeccionResumen[];
  /** OT de pieza y registro donde el usuario actual tiene una operación abierta (si tiene una en curso en algún lado) — sólo ahí se puede Finalizar. */
  otPiezaIdAbierta: string | null;
  registroOperacionIdAbierta: string | null;
}) {
  const router = useRouter();
  const [expandido, setExpandido] = useState(false);
  const seccionesConPendientes = secciones.filter((s) => s.piezas.some((p) => p.estado !== "terminada" && !p.sinRouting));

  return (
    <div
      onClick={() => router.push(`/ot/${otId}`)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/ot/${otId}`)}
      className="bg-surface border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:border-accent transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold font-mono text-sm">{codigo}</div>
          <div className="text-xs text-foreground-muted">{configuracionNombre}</div>
        </div>
        <EstadoBadge estado={estadoCalculado} />
      </div>

      <div>
        <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-foreground-muted mt-1.5 tabular-nums">
          {piezasTerminadas} / {totalPiezasAFabricar} piezas terminadas
          {plazoEntrega ? ` · plazo: ${plazoEntrega}` : ""}
        </div>
      </div>

      {secciones.length > 0 && (
        <div>
          <div className="text-xs text-foreground-muted mb-1">Por sección</div>
          <div className="flex flex-wrap gap-1">
            {secciones.map((s) => (
              <Link
                key={s.otConjuntoId}
                href={`/ot/${otId}#seccion-${s.otConjuntoId}`}
                title={`${s.nombre}: ${s.terminadas}/${s.total} piezas`}
                onClick={(e) => e.stopPropagation()}
                className={`h-5 w-4 rounded-sm ${COLOR_SECCION[s.estado]} hover:opacity-75 hover:ring-2 hover:ring-accent transition`}
              />
            ))}
          </div>
        </div>
      )}

      {seccionesConPendientes.length > 0 && (
        <div onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className="text-xs text-accent hover:underline"
          >
            {expandido ? "▾ Ocultar piezas" : "▸ Ver piezas"}
          </button>

          {expandido && (
            <div className="mt-2 space-y-3">
              {seccionesConPendientes.map((s) => (
                <div key={s.otConjuntoId}>
                  <div className="text-xs font-medium text-foreground-muted mb-1">{s.nombre}</div>
                  <ul className="space-y-1.5">
                    {s.piezas
                      .filter((p) => p.estado !== "terminada" && !p.sinRouting)
                      .map((p) => (
                        <li key={p.otPiezaId} className="bg-surface-muted rounded-md px-2.5 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate">{p.piezaNombre}</div>
                              <div className="text-xs text-foreground-muted truncate">
                                {p.otPiezaCodigo} · {p.operacionActualNombre ?? "—"}
                              </div>
                            </div>
                            {p.estado === "pendiente" && p.operacionActualId && !otPiezaIdAbierta && (
                              <form action={iniciarOperacionAction}>
                                <input type="hidden" name="otPiezaId" value={p.otPiezaId} />
                                <input type="hidden" name="operacionId" value={p.operacionActualId} />
                                <input type="hidden" name="tipo" value="ejecucion" />
                                <button
                                  type="submit"
                                  className="text-xs bg-accent text-accent-foreground px-2.5 py-1.5 rounded-md hover:opacity-90 shrink-0"
                                >
                                  ▶ Iniciar
                                </button>
                              </form>
                            )}
                            {p.estado === "en_curso" && otPiezaIdAbierta !== p.otPiezaId && (
                              <span className="text-xs text-foreground-muted shrink-0">en curso</span>
                            )}
                          </div>
                          {otPiezaIdAbierta === p.otPiezaId && p.operacionActualId && (
                            <form
                              action={finalizarOperacionAction}
                              className="mt-2 pt-2 border-t border-border space-y-1.5"
                            >
                              <input type="hidden" name="registroOperacionId" value={registroOperacionIdAbierta ?? ""} />
                              <input type="hidden" name="otPiezaId" value={p.otPiezaId} />
                              <input type="hidden" name="operacionId" value={p.operacionActualId} />
                              <div className="flex items-center gap-1.5">
                                <label className="text-xs text-foreground-muted">
                                  OK
                                  <input type="number" name="piezasOk" min={0} defaultValue={1} className="input w-14 text-xs py-1 ml-1" />
                                </label>
                                <label className="text-xs text-foreground-muted">
                                  Rechaz.
                                  <input
                                    type="number"
                                    name="piezasRechazadas"
                                    min={0}
                                    defaultValue={0}
                                    className="input w-14 text-xs py-1 ml-1"
                                  />
                                </label>
                                {p.esUltimaOperacion && (
                                  <>
                                    <label className="text-xs text-foreground-muted">
                                      No OK
                                      <input type="number" name="piezasNoOk" min={0} defaultValue={0} className="input w-14 text-xs py-1 ml-1" />
                                    </label>
                                    <label className="text-xs text-foreground-muted">
                                      Defect.
                                      <input
                                        type="number"
                                        name="piezasDefectuosas"
                                        min={0}
                                        defaultValue={0}
                                        className="input w-14 text-xs py-1 ml-1"
                                      />
                                    </label>
                                    <label className="text-xs text-foreground-muted">
                                      Retrab.
                                      <input
                                        type="number"
                                        name="piezasRetrabajadas"
                                        min={0}
                                        defaultValue={0}
                                        className="input w-14 text-xs py-1 ml-1"
                                      />
                                    </label>
                                  </>
                                )}
                                <button
                                  type="submit"
                                  className="text-xs bg-brand-teal text-white px-2.5 py-1.5 rounded-md hover:opacity-90 ml-auto"
                                >
                                  ✔ Finalizar
                                </button>
                              </div>
                            </form>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
