"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moverTareaDirecto, fijarTareaAction, moverTareaAction } from "@/app/actions/v2";
import { NIVEL } from "./Plan";
import type { Nivel } from "@/lib/planning/motor";

export type Tarjeta = {
  clave: string;
  dia: string;
  titulo: string;
  sub: string;
  nivel: Nivel;
  holgura: number;
  horas: number;
  dias: number;
  operarioId: string | null;
  fijada: boolean;
  movida: boolean;
  tarde: boolean;
  enCurso: boolean;
  futura: boolean;
  resaltada: boolean;
};

export type FilaPlan = {
  id: string;
  nombre: string;
  sinLimite?: boolean;
  usado: number;
  disponible: number;
  /** Horas que deberían empezar esta semana (para avisar la sobrecarga). */
  demanda?: number;
  porDia: { dia: string; usado: number; disponible: number }[];
  tarjetas: Tarjeta[];
  operarios: { id: string; nombre: string }[];
};

/**
 * Grilla del plan: filas = centros (o operarios), columnas = días. Las
 * tarjetas se arrastran entre días de la misma fila; el candado las fija y
 * el operario se cambia desde la tarjeta. El color del borde es la holgura.
 */
export function GrillaPlan({ dias, filas, feriados, nombresDia, volver }: { dias: string[]; filas: FilaPlan[]; feriados: Record<string, string>; nombresDia: string[]; volver: string }) {
  const router = useRouter();
  const [arrastrando, setArrastrando] = useState<{ clave: string; fila: string } | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function soltar(fila: string, dia: string) {
    if (!arrastrando || arrastrando.fila !== fila) return;
    const clave = arrastrando.clave;
    setArrastrando(null);
    setDestino(null);
    startTransition(async () => {
      await moverTareaDirecto(clave, dia);
      router.refresh();
    });
  }

  return (
    <div className={`tarjeta overflow-x-auto ${pendiente ? "opacity-70" : ""}`}>
      <table className="w-full text-sm border-collapse min-w-[980px]">
        <thead>
          <tr className="text-xs text-foreground-muted">
            <th className="text-left font-medium px-3 py-2 w-48 sticky left-0 bg-surface">Centro</th>
            {dias.map((d, i) => (
              <th key={d} className={`text-left font-medium px-2 py-2 ${feriados[d] ? "text-naranja-fg" : ""}`}>
                {nombresDia[i]} {d.slice(8, 10)}/{d.slice(5, 7)}
                {feriados[d] && <span className="block font-normal">{feriados[d]}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const pct = f.disponible ? Math.round((f.usado / f.disponible) * 100) : 0;
            const pctDemanda = f.disponible && f.demanda ? Math.round((f.demanda / f.disponible) * 100) : 0;
            return (
              <tr key={f.id} className="border-t border-border align-top">
                <td className="px-3 py-2 sticky left-0 bg-surface">
                  <div className="font-semibold">{f.nombre}</div>
                  {f.sinLimite ? (
                    <div className="text-xs text-foreground-muted">sin límite de horas</div>
                  ) : (
                    <>
                      <div className="text-xs tabular-nums text-foreground-muted">
                        {Math.round(f.usado)} h / {Math.round(f.disponible)} h planificadas
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-muted mt-1 overflow-hidden">
                        <div className={`h-full rounded-full ${pctDemanda > 100 ? "bg-rojo" : pct > 85 ? "bg-naranja" : "bg-accent"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      {pctDemanda > 100 && (
                        <div className="text-xs text-rojo-fg font-semibold mt-1" title="Horas de tareas que deberían empezar esta semana, contra las horas disponibles del centro">
                          Sobrecargado: {pctDemanda}% ({Math.round(f.demanda!)} h necesarias)
                        </div>
                      )}
                    </>
                  )}
                </td>
                {dias.map((d) => {
                  const del = f.tarjetas.filter((t) => t.dia === d);
                  const cap = f.porDia.find((x) => x.dia === d);
                  const lleno = cap && cap.disponible > 0 && cap.usado > cap.disponible + 0.01;
                  const esDestino = destino === `${f.id}|${d}`;
                  return (
                    <td
                      key={d}
                      className={`px-1.5 py-1.5 min-w-[150px] ${feriados[d] ? "bg-naranja-tenue" : ""} ${lleno ? "bg-rojo-tenue" : ""} ${esDestino ? "outline outline-2 outline-accent -outline-offset-2" : ""}`}
                      onDragOver={(e) => {
                        if (arrastrando?.fila === f.id) {
                          e.preventDefault();
                          setDestino(`${f.id}|${d}`);
                        }
                      }}
                      onDragLeave={() => setDestino(null)}
                      onDrop={() => soltar(f.id, d)}
                    >
                      <div className="space-y-1.5">
                        {del.map((t) => (
                          <div
                            key={t.clave}
                            draggable={!t.fijada && !f.sinLimite}
                            onDragStart={() => setArrastrando({ clave: t.clave, fila: f.id })}
                            onDragEnd={() => setArrastrando(null)}
                            className={`rounded-md border border-border border-l-4 ${NIVEL[t.nivel].borde} bg-surface px-2 py-1.5 text-xs shadow-sm ${t.fijada || f.sinLimite ? "" : "cursor-grab active:cursor-grabbing"} ${t.futura ? "opacity-60" : ""} ${t.resaltada ? "ring-2 ring-accent" : ""}`}
                            title={`${t.titulo} — ${NIVEL[t.nivel].label}${t.tarde ? " · termina después de su fecha límite" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="font-medium leading-tight">{t.titulo}</span>
                              {!f.sinLimite && (
                                <form action={fijarTareaAction}>
                                  <input type="hidden" name="clave" value={t.clave} />
                                  <input type="hidden" name="fijar" value={t.fijada ? "0" : "1"} />
                                  <input type="hidden" name="volver" value={volver} />
                                  <button type="submit" className={`leading-none ${t.fijada ? "text-foreground" : "text-foreground-muted/50 hover:text-foreground"}`} title={t.fijada ? "Fijada: el recálculo no la mueve. Tocá para soltarla." : "Fijar con candado"}>
                                    {t.fijada ? "🔒" : "🔓"}
                                  </button>
                                </form>
                              )}
                            </div>
                            <div className="text-foreground-muted mt-0.5">{t.sub}</div>
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {!f.sinLimite && <span className="tabular-nums">{Math.round(t.horas * 10) / 10} h{t.dias > 1 ? ` · ${t.dias} días` : ""}</span>}
                              {t.tarde && <span className="text-rojo-fg font-semibold">· tarde</span>}
                              {t.enCurso && <span className="text-naranja-fg font-semibold">· en curso</span>}
                              {t.movida && !t.fijada && <span className="text-foreground-muted">· movida</span>}
                              {t.futura && <span className="text-foreground-muted">· sin liberar</span>}
                            </div>
                            {!f.sinLimite && f.operarios.length > 0 && (
                              <form action={moverTareaAction} className="mt-1">
                                <input type="hidden" name="clave" value={t.clave} />
                                <input type="hidden" name="fecha" value={t.dia} />
                                <input type="hidden" name="volver" value={volver} />
                                <select
                                  name="operarioId"
                                  defaultValue={t.operarioId ?? ""}
                                  onChange={(e) => e.currentTarget.form?.requestSubmit()}
                                  className="w-full rounded border border-border bg-surface px-1 py-0.5 text-[11px]"
                                  aria-label="Operario"
                                >
                                  <option value="">Sin operario</option>
                                  {f.operarios.map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {o.nombre}
                                    </option>
                                  ))}
                                </select>
                              </form>
                            )}
                          </div>
                        ))}
                        {cap && !f.sinLimite && cap.disponible > 0 && (
                          <div className={`text-[10px] tabular-nums ${lleno ? "text-rojo-fg font-semibold" : "text-foreground-muted/70"}`}>
                            {Math.round(cap.usado * 10) / 10} / {Math.round(cap.disponible * 10) / 10} h
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
