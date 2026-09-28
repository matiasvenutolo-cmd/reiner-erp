"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { OtPieza, Pieza, Procedimiento } from "@/lib/db/schema";
import type { EstadoCalculado } from "@/lib/data/ot";
import type { ControlArmadoConDetalle } from "@/lib/data/armado";
import { EstadoBadge } from "@/components/EstadoBadge";
import { ProgresoOperaciones } from "@/components/ProgresoOperaciones";
import { CantidadAFabricarForm } from "@/components/CantidadAFabricarForm";
import { agregarPiezaSueltaAction } from "@/app/actions/ot";
import { registrarControlArmadoAction } from "@/app/actions/armado";

export type FilaPieza = {
  otPieza: OtPieza;
  estado: EstadoCalculado;
  sinRouting: boolean;
  totalOps: number;
  completadas: number;
  pieza?: Pieza;
  tieneRevisionPendiente: boolean;
};

export type ConjuntoData = {
  otConjuntoId: string;
  otConjuntoCodigo: string;
  conjuntoNombre: string;
  estadoConjunto: EstadoCalculado;
  filas: FilaPieza[];
  piezasParaAgregar: { id: string; codigo: string; nombre: string }[];
  controlesArmado: ControlArmadoConDetalle[];
  procedimientos: Procedimiento[];
};

/**
 * Sección de una OT de máquina, colapsable — pedido de Matías (docs/06-
 * backlog-release-3.md, comentarios sobre lo pusheado): una máquina cambia
 * poco (2-3/año), lo que se mira todos los días es CÓMO AVANZA cada
 * sección dentro de ella, no la OT en sí. Abierta por defecto sólo si está
 * en curso — terminada o sin empezar no necesita ocupar pantalla.
 *
 * Se sincroniza con el link de "Por sección" de /avance
 * (`/ot/[id]#seccion-[otConjuntoId]`): si el hash de la URL apunta acá, se
 * abre sola al montar, además del scroll nativo del navegador al ancla.
 */
export function ConjuntoAccordion({
  otMaquinaId,
  conjunto,
  ocultarTerminadas,
}: {
  otMaquinaId: string;
  conjunto: ConjuntoData;
  ocultarTerminadas: boolean;
}) {
  const { otConjuntoId, otConjuntoCodigo, conjuntoNombre, estadoConjunto, filas, piezasParaAgregar, controlesArmado, procedimientos } =
    conjunto;
  const [abierto, setAbierto] = useState(estadoConjunto === "en_curso");

  useEffect(() => {
    if (window.location.hash === `#seccion-${otConjuntoId}`) setAbierto(true);
  }, [otConjuntoId]);

  const terminadas = filas.filter((f) => f.estado === "terminada").length;
  const filasVisibles = ocultarTerminadas ? filas.filter((f) => f.estado !== "terminada") : filas;

  return (
    <div id={`seccion-${otConjuntoId}`} className="bg-surface border border-border rounded-lg overflow-hidden scroll-mt-4">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-surface-muted text-left hover:bg-surface-muted/70"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-foreground-muted transition-transform inline-block ${abierto ? "rotate-90" : ""}`}>›</span>
          <span className="font-mono text-xs text-foreground-muted shrink-0">{otConjuntoCodigo}</span>
          <span className="font-medium text-sm truncate">{conjuntoNombre}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2 w-28">
            <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden">
              <div
                className={`h-full rounded-full ${estadoConjunto === "terminada" ? "bg-brand-teal" : "bg-accent"}`}
                style={{ width: `${filas.length > 0 ? Math.round((terminadas / filas.length) * 100) : 0}%` }}
              />
            </div>
            <span className="text-xs text-foreground-muted tabular-nums">
              {terminadas}/{filas.length}
            </span>
          </div>
          <EstadoBadge estado={estadoConjunto} />
        </div>
      </button>

      {abierto && (
        <>
          <table className="w-full text-sm">
            <thead className="text-foreground-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">OT pieza</th>
                <th className="text-left px-4 py-2 font-medium">Pieza</th>
                <th className="text-right px-4 py-2 font-medium">Necesaria</th>
                <th className="text-right px-4 py-2 font-medium">Stock al generar</th>
                <th className="text-right px-4 py-2 font-medium">A fabricar</th>
                <th className="text-left px-4 py-2 font-medium">Progreso</th>
              </tr>
            </thead>
            <tbody>
              {filasVisibles.map(({ otPieza, sinRouting, totalOps, completadas, pieza, tieneRevisionPendiente }) => (
                <tr key={otPieza.id} className="border-t border-border">
                  <td className="px-4 py-2.5">
                    <Link href={`/ot/${otMaquinaId}/pieza/${otPieza.id}`} className="font-mono text-xs text-accent hover:underline">
                      {otPieza.codigo}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{pieza?.nombre ?? otPieza.piezaId}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{otPieza.cantidadNecesaria}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">{otPieza.stockAlGenerar}</td>
                  <td className="px-4 py-2.5 text-right">
                    <CantidadAFabricarForm otPiezaId={otPieza.id} otMaquinaId={otMaquinaId} cantidadInicial={otPieza.cantidadAFabricar} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <ProgresoOperaciones totalOps={totalOps} completadas={completadas} sinRouting={sinRouting} />
                      {tieneRevisionPendiente && (
                        <Link href={`/ot/${otMaquinaId}/pieza/${otPieza.id}`} className="badge-estado badge-alerta hover:opacity-80">
                          revisión
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filasVisibles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-foreground-muted text-xs">
                    Todas las piezas de esta sección están terminadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <form
            action={agregarPiezaSueltaAction}
            className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-t border-border bg-surface-muted/50"
          >
            <input type="hidden" name="otMaquinaId" value={otMaquinaId} />
            <input type="hidden" name="otConjuntoId" value={otConjuntoId} />
            <span className="text-xs text-foreground-muted">+ Pieza suelta</span>
            <select name="piezaId" required defaultValue="" className="input text-xs py-1 flex-1 min-w-[10rem]">
              <option value="" disabled>
                Elegir pieza…
              </option>
              {piezasParaAgregar.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.nombre}
                </option>
              ))}
            </select>
            <input name="cantidad" type="number" min={1} placeholder="Cant." required className="input text-xs py-1 w-16" />
            <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap">
              Agregar
            </button>
          </form>

          {estadoConjunto === "terminada" && (
            <div className="px-4 py-3 border-t border-border bg-surface-muted/30 space-y-3">
              <h3 className="text-xs font-semibold text-foreground-muted uppercase">Control de armado</h3>
              {controlesArmado.length > 0 && (
                <ul className="space-y-1.5">
                  {controlesArmado.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <span className={`badge-estado ${c.resultado === "ok" ? "badge-terminada" : "badge-alerta"}`}>
                        {c.resultado === "ok" ? "Funciona OK" : "NO OK"}
                      </span>
                      <span className="text-foreground-muted">
                        {c.revisadoPorNombre} · {new Date(c.fecha).toLocaleDateString("es-AR")}
                        {c.procedimientoCodigo ? ` · ${c.procedimientoCodigo}` : ""}
                      </span>
                      {c.observacion && <span>— {c.observacion}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <form action={registrarControlArmadoAction} className="flex flex-wrap items-center gap-1.5">
                <input type="hidden" name="otMaquinaId" value={otMaquinaId} />
                <input type="hidden" name="otConjuntoId" value={otConjuntoId} />
                <select name="procedimientoId" className="input text-xs py-1" defaultValue="">
                  <option value="">Sin procedimiento</option>
                  {procedimientos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} — {p.titulo}
                    </option>
                  ))}
                </select>
                <select name="resultado" required className="input text-xs py-1" defaultValue="">
                  <option value="" disabled>
                    Resultado…
                  </option>
                  <option value="ok">Funciona OK</option>
                  <option value="no_ok">NO OK</option>
                </select>
                <input name="observacion" placeholder="Observación" className="input text-xs py-1 flex-1 min-w-[8rem]" />
                <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap">
                  Registrar control
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
