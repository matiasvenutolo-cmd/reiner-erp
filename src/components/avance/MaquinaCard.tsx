"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EstadoBadge } from "@/components/EstadoBadge";
import { cambiarEstadoPiezaAction, cambiarEstadoConjuntoAction } from "@/app/actions/ot";
import type { EstadoCalculado, SeccionPieza } from "@/lib/data/ot";

const COLOR_SECCION: Record<EstadoCalculado, string> = {
  pendiente: "bg-surface-muted",
  en_curso: "bg-accent",
  terminada: "bg-brand-teal",
};

const ESTADO_LABEL: Record<EstadoCalculado, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  terminada: "Terminada",
};

export type SeccionResumen = {
  otConjuntoId: string;
  nombre: string;
  total: number;
  terminadas: number;
  estado: EstadoCalculado;
  piezas: SeccionPieza[];
};

function enviar(action: (fd: FormData) => Promise<void>, campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return action(fd);
}

/**
 * Tarjeta de una OT de máquina en /avance. Clic en la tarjeta → la OT; clic
 * en un cuadradito de "Por sección" → despliega ese conjunto acá mismo.
 *
 * Devolución del cliente (2ª ronda): "que se puedan modificar los estados de
 * la pieza desde el avance y no tener que entrar a cada pieza (tanto así como
 * de conjunto)". Cada pieza tiene su selector de estado y cada conjunto un
 * selector que cambia todas sus piezas juntas. Es un estado cargado a mano
 * (`ot_pieza.estado_manual`): no cronometra ni inventa registros — eso
 * sigue siendo del operario en /taller. "Automático" lo devuelve al estado
 * que calcula taller.
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
  otPiezaIdsConRetrabajo,
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
  /** Piezas con un retrabajo pendiente — se marcan para poder entrar a cronometrarlo. */
  otPiezaIdsConRetrabajo: string[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [seccionAbierta, setSeccionAbierta] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function abrirSeccion(id: string) {
    setAbierto(true);
    setSeccionAbierta((actual) => (actual === id ? null : id));
  }

  return (
    <div
      onClick={() => router.push(`/ot/${otId}`)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && router.push(`/ot/${otId}`)}
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
        <div onClick={(e) => e.stopPropagation()} className="cursor-default">
          <div className="text-xs text-foreground-muted mb-1">Por sección — clic para ver y cambiar estados</div>
          <div className="flex flex-wrap gap-1">
            {secciones.map((s) => (
              <button
                key={s.otConjuntoId}
                type="button"
                title={`${s.nombre}: ${s.terminadas}/${s.total} piezas`}
                onClick={() => abrirSeccion(s.otConjuntoId)}
                className={`h-5 w-4 rounded-sm ${COLOR_SECCION[s.estado]} hover:opacity-75 hover:ring-2 hover:ring-accent transition ${
                  seccionAbierta === s.otConjuntoId ? "ring-2 ring-accent" : ""
                }`}
              />
            ))}
          </div>

          <button type="button" onClick={() => setAbierto((v) => !v)} className="text-xs text-accent hover:underline mt-2">
            {abierto ? "▾ Ocultar secciones" : "▸ Ver secciones y piezas"}
          </button>

          {abierto && (
            <div className={`mt-2 border border-border rounded-md divide-y divide-border ${pendiente ? "opacity-60" : ""}`}>
              {secciones.map((s) => {
                const desplegada = seccionAbierta === s.otConjuntoId;
                const hayManual = s.piezas.some((p) => p.manual);
                return (
                  <div key={s.otConjuntoId}>
                    <div className="flex items-center gap-2 px-2.5 py-2">
                      <button
                        type="button"
                        onClick={() => setSeccionAbierta(desplegada ? null : s.otConjuntoId)}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left"
                      >
                        <span className="text-xs text-foreground-muted w-3">{desplegada ? "▾" : "▸"}</span>
                        <span className={`h-3 w-3 rounded-sm shrink-0 ${COLOR_SECCION[s.estado]}`} />
                        <span className="text-sm truncate">{s.nombre}</span>
                        <span className="text-xs text-foreground-muted tabular-nums shrink-0">
                          {s.terminadas}/{s.total}
                        </span>
                      </button>
                      <select
                        aria-label={`Estado del conjunto ${s.nombre}`}
                        value=""
                        disabled={pendiente}
                        onChange={(e) => {
                          const estado = e.target.value;
                          if (!estado) return;
                          startTransition(() => enviar(cambiarEstadoConjuntoAction, { otConjuntoId: s.otConjuntoId, estado }));
                        }}
                        className="input text-xs py-1 w-auto shrink-0"
                      >
                        <option value="">Cambiar todo a…</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="en_curso">En curso</option>
                        <option value="terminada">Terminada</option>
                        {hayManual && <option value="auto">Automático (según taller)</option>}
                      </select>
                    </div>

                    {desplegada && (
                      <ul className="px-2.5 pb-2 space-y-1">
                        {s.piezas.map((p) => (
                          <li key={p.otPiezaId} className="flex items-center gap-2 bg-surface-muted rounded-md px-2.5 py-1.5 text-sm">
                            <div className="min-w-0 flex-1">
                              <div className="truncate">{p.piezaNombre}</div>
                              <div className="text-xs text-foreground-muted truncate">
                                {p.otPiezaCodigo}
                                {p.estado !== "terminada" && p.operacionActualNombre ? ` · ${p.operacionActualNombre}` : ""}
                                {p.manual && <span className="ml-1 badge-estado badge-pendiente">manual</span>}
                                {otPiezaIdsConRetrabajo.includes(p.otPiezaId) && (
                                  <Link href={`/ot/${otId}/pieza/${p.otPiezaId}`} className="ml-1 badge-estado badge-alerta hover:underline">
                                    retrabajo →
                                  </Link>
                                )}
                              </div>
                            </div>
                            <select
                              aria-label={`Estado de ${p.piezaNombre}`}
                              value={p.estado}
                              disabled={pendiente}
                              onChange={(e) =>
                                startTransition(() =>
                                  enviar(cambiarEstadoPiezaAction, { otPiezaId: p.otPiezaId, estado: e.target.value }),
                                )
                              }
                              className="input text-xs py-1 w-28 shrink-0"
                            >
                              {(Object.keys(ESTADO_LABEL) as EstadoCalculado[]).map((e) => (
                                <option key={e} value={e}>
                                  {ESTADO_LABEL[e]}
                                </option>
                              ))}
                              {p.manual && <option value="auto">↺ Automático</option>}
                            </select>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
