"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { moverTareaDirecto, fijarTareaAction, moverTareaAction, partirEnLotesAction } from "@/app/actions/v2";
import { Icono } from "@/components/ui/Icono";
import { NIVEL } from "./Plan";
import type { Nivel } from "@/lib/planning/motor";

export type Tarjeta = {
  /** Clave de la tarea (una tarea de varios días tiene una tarjeta por día, con la misma clave). */
  clave: string;
  dia: string;
  titulo: string;
  cantidad: number;
  paso: string;
  proyecto: string;
  colorProyecto: string;
  nivel: Nivel;
  textoMargen: string;
  horas: number;
  parte: { n: number; de: number } | null;
  lote: { n: number; de: number } | null;
  operarioId: string | null;
  operarioNombre: string | null;
  fijada: boolean;
  movida: boolean;
  tarde: boolean;
  enCurso: boolean;
  futura: boolean;
  resaltada: boolean;
  planoHref: string | null;
  centroNombre: string;
  limite: string;
};

export type FilaPlan = {
  id: string;
  nombre: string;
  /** "Torno · lauti" */
  subtitulo?: string;
  sinLimite?: boolean;
  usado: number;
  disponible: number;
  /** Horas que deberían empezar esta semana (para avisar la sobrecarga). */
  demanda?: number;
  porDia: { dia: string; usado: number; disponible: number }[];
  tarjetas: Tarjeta[];
  operarios: { id: string; nombre: string }[];
};

const num = (n: number) => (Math.round(n * 10) / 10).toLocaleString("es-AR");
const h = (n: number) => (n < 1 ? `${Math.max(1, Math.round(n * 60))} min` : `${num(n)} h`);

/**
 * Grilla del plan (mejoras de usabilidad §2.2): filas = centros (u operarios),
 * columnas = días. Tarjeta mínima: pieza, cantidad, horas y la franja de color
 * del margen; el color del proyecto en la esquina. Al tocarla se abre el panel
 * con todo lo demás (operario, candado, mover de día, plano, lotes). En
 * pantallas angostas la grilla pasa a una lista por día (§1.9).
 */
export function GrillaPlan({ dias, filas, feriados, nombresDia, volver, vista }: { dias: string[]; filas: FilaPlan[]; feriados: Record<string, string>; nombresDia: string[]; volver: string; vista: string }) {
  const router = useRouter();
  const [arrastrando, setArrastrando] = useState<{ clave: string; fila: string } | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<{ t: Tarjeta; fila: FilaPlan } | null>(null);
  const [pendiente, startTransition] = useTransition();

  function mover(clave: string, dia: string) {
    startTransition(async () => {
      await moverTareaDirecto(clave, dia);
      setAbierta(null);
      router.refresh();
    });
  }
  function soltar(fila: string, dia: string) {
    if (!arrastrando || arrastrando.fila !== fila) return;
    const clave = arrastrando.clave;
    setArrastrando(null);
    setDestino(null);
    mover(clave, dia);
  }

  const conCarga = filas.filter((f) => f.tarjetas.length || f.sinLimite);
  const vacias = filas.filter((f) => !f.tarjetas.length && !f.sinLimite);

  const tarjetaMin = (t: Tarjeta, f: FilaPlan, key: string) => (
    <button
      key={key}
      type="button"
      draggable={!t.fijada && !f.sinLimite}
      onDragStart={() => setArrastrando({ clave: t.clave, fila: f.id })}
      onDragEnd={() => setArrastrando(null)}
      onClick={() => setAbierta({ t, fila: f })}
      className={`relative w-full text-left rounded-md border border-border franja ${NIVEL[t.nivel].borde} bg-surface pl-2 pr-5 py-1.5 text-xs shadow-sm ${t.fijada || f.sinLimite ? "" : "cursor-grab active:cursor-grabbing"} ${t.futura ? "opacity-60" : ""} ${t.resaltada ? "ring-2 ring-accent" : ""} hover:border-foreground-muted`}
      title={`${t.titulo} · ${t.proyecto} · ${NIVEL[t.nivel].label}${t.tarde ? " · termina después de su fecha límite" : ""}`}
    >
      <span className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-sm ${t.colorProyecto}`} aria-label={`Proyecto ${t.proyecto}`} />
      <span className="block font-semibold leading-tight">
        {t.titulo} × {t.cantidad}
      </span>
      <span className="flex flex-wrap items-center gap-1 mt-0.5 text-foreground-muted">
        <span className="tabular-nums">{f.sinLimite ? t.paso : h(t.horas)}</span>
        {t.lote && <span>· lote {t.lote.n}/{t.lote.de}</span>}
        {t.parte && <span>· parte {t.parte.n} de {t.parte.de}</span>}
        {t.fijada && <Icono nombre="candado" className="w-3 h-3 text-foreground" />}
        {t.tarde && <span className="text-rojo-fg font-semibold">· tarde</span>}
        {!t.operarioId && !f.sinLimite && <span className="text-rojo-fg font-semibold">· sin operario</span>}
      </span>
    </button>
  );

  return (
    <div className={pendiente ? "opacity-70" : ""}>
      {/* Escritorio y tablet: grilla centros × días */}
      <div className="hidden md:block tarjeta overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 w-52 sticky left-0 bg-surface">{vista === "operario" ? "Operario" : "Centro"}</th>
              {dias.map((d, i) => (
                <th key={d} className={`text-left px-2 py-2 ${feriados[d] ? "text-naranja-fg" : ""}`}>
                  {nombresDia[i]} {d.slice(8, 10)}/{d.slice(5, 7)}
                  {feriados[d] && <span className="block font-normal">{feriados[d]}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {conCarga.map((f) => {
              const pct = f.disponible ? Math.round((f.usado / f.disponible) * 100) : 0;
              const pctDemanda = f.disponible && f.demanda ? Math.round((f.demanda / f.disponible) * 100) : 0;
              const rojo = pct > 100 || pctDemanda > 100;
              return (
                <tr key={f.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 sticky left-0 bg-surface">
                    <div className="font-semibold">{f.nombre}</div>
                    {f.subtitulo && <div className="text-xs text-foreground-muted">{f.subtitulo}</div>}
                    {f.sinLimite ? (
                      <div className="text-xs text-foreground-muted">sin límite de horas</div>
                    ) : (
                      <>
                        <div className="h-2 rounded-full bg-surface-muted mt-1.5 overflow-hidden" title={`${num(f.usado)} de ${num(f.disponible)} h`}>
                          <div className={`h-full rounded-full ${rojo ? "bg-rojo" : pct > 85 ? "bg-naranja" : "bg-accent"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <div className={`text-xs tabular-nums mt-0.5 ${rojo ? "text-rojo-fg font-semibold" : "text-foreground-muted"}`}>
                          {num(f.usado)} de {num(f.disponible)} h{pctDemanda > 100 ? ` · necesita ${num(f.demanda!)} h (${pctDemanda}%)` : ""}
                        </div>
                      </>
                    )}
                  </td>
                  {dias.map((d) => {
                    const del = f.tarjetas.filter((t) => t.dia === d);
                    const cap = f.porDia.find((x) => x.dia === d);
                    const pctDia = cap && cap.disponible > 0 ? (cap.usado / cap.disponible) * 100 : 0;
                    const esDestino = destino === `${f.id}|${d}`;
                    return (
                      <td
                        key={d}
                        className={`px-1.5 py-1.5 min-w-[140px] ${feriados[d] ? "bg-naranja-tenue" : ""} ${esDestino ? "outline outline-2 outline-accent -outline-offset-2" : ""}`}
                        onDragOver={(e) => {
                          if (arrastrando?.fila === f.id) {
                            e.preventDefault();
                            setDestino(`${f.id}|${d}`);
                          }
                        }}
                        onDragLeave={() => setDestino(null)}
                        onDrop={() => soltar(f.id, d)}
                      >
                        {cap && !f.sinLimite && cap.disponible > 0 && (
                          <div className="flex items-center gap-1.5 mb-1.5" title={`${num(cap.usado)} de ${num(cap.disponible)} h`}>
                            <div className="h-1 flex-1 rounded-full bg-surface-muted overflow-hidden">
                              <div className={`h-full ${pctDia > 100.5 ? "bg-rojo" : "bg-gris"}`} style={{ width: `${Math.min(100, pctDia)}%` }} />
                            </div>
                            <span className={`text-[10px] tabular-nums ${pctDia > 100.5 ? "text-rojo-fg font-semibold" : "text-foreground-muted"}`}>
                              {num(cap.usado)}/{num(cap.disponible)} h
                            </span>
                          </div>
                        )}
                        <div className="space-y-1.5">{del.map((t) => tarjetaMin(t, f, `${t.clave}|${t.dia}`))}</div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {vacias.length > 0 && <p className="px-3 py-2 border-t border-border text-xs text-foreground-muted">Sin carga esta semana: {vacias.map((f) => f.nombre).join(", ")}.</p>}
      </div>

      {/* Celular: lista por día que se despliega por centro (§1.9) */}
      <div className="md:hidden space-y-3">
        {dias.map((d, i) => {
          const filasDia = conCarga.filter((f) => f.tarjetas.some((t) => t.dia === d));
          return (
            <details key={d} className="tarjeta" open={i === 0}>
              <summary className="px-4 py-3 font-semibold cursor-pointer list-none flex items-center justify-between">
                <span>
                  {nombresDia[i]} {d.slice(8, 10)}/{d.slice(5, 7)} {feriados[d] && <span className="text-naranja-fg font-normal">· {feriados[d]}</span>}
                </span>
                <span className="text-sm text-foreground-muted font-normal">{filasDia.reduce((n, f) => n + f.tarjetas.filter((t) => t.dia === d).length, 0)} tareas</span>
              </summary>
              <div className="px-3 pb-3 space-y-2">
                {filasDia.map((f) => (
                  <details key={f.id} className="rounded-lg border border-border">
                    <summary className="px-3 py-2 text-sm font-medium cursor-pointer list-none">
                      {f.nombre} <span className="text-foreground-muted font-normal">· {f.tarjetas.filter((t) => t.dia === d).length}</span>
                    </summary>
                    <div className="px-2 pb-2 space-y-1.5">
                      {f.tarjetas.filter((t) => t.dia === d).map((t) => tarjetaMin(t, f, `${t.clave}|m`))}
                    </div>
                  </details>
                ))}
                {filasDia.length === 0 && <p className="text-sm text-foreground-muted px-1">Nada planificado.</p>}
              </div>
            </details>
          );
        })}
      </div>

      {/* Panel de la tarjeta: todo lo que no entra en la tarjeta mínima */}
      {abierta && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Detalle de la tarea">
          <button type="button" className="absolute inset-0 bg-black/25" aria-label="Cerrar" onClick={() => setAbierta(null)} />
          <div className="relative w-full max-w-sm h-full bg-surface border-l border-border shadow-xl overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold leading-tight">
                  {abierta.t.titulo} × {abierta.t.cantidad}
                </div>
                <div className="text-sm text-foreground-muted">
                  {abierta.t.paso} · {abierta.t.centroNombre}
                </div>
              </div>
              <button type="button" onClick={() => setAbierta(null)} className="btn-texto" aria-label="Cerrar">
                <Icono nombre="cerrar" className="w-5 h-5" />
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-foreground-muted">Proyecto</dt>
                <dd className="font-medium flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-sm ${abierta.t.colorProyecto}`} />
                  {abierta.t.proyecto}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-foreground-muted">Margen</dt>
                <dd className="font-medium">{abierta.t.textoMargen}</dd>
              </div>
              <div>
                <dt className="text-xs text-foreground-muted">Horas</dt>
                <dd className="font-medium">
                  {h(abierta.t.horas)}
                  {abierta.t.parte ? ` (parte ${abierta.t.parte.n} de ${abierta.t.parte.de})` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-foreground-muted">Tiene que terminar</dt>
                <dd className="font-medium">{abierta.t.limite}</dd>
              </div>
            </dl>
            {!abierta.fila.sinLimite && (
              <>
                <form action={moverTareaAction} className="space-y-1">
                  <input type="hidden" name="clave" value={abierta.t.clave} />
                  <input type="hidden" name="fecha" value={abierta.t.dia} />
                  <input type="hidden" name="volver" value={volver} />
                  <label className="text-xs text-foreground-muted block">
                    Operario
                    <select name="operarioId" defaultValue={abierta.t.operarioId ?? ""} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="input mt-0.5">
                      <option value="">Sin operario</option>
                      {abierta.fila.operarios.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </form>
                <div>
                  <div className="text-xs text-foreground-muted mb-1">Pasar a</div>
                  <div className="flex flex-wrap gap-1.5">
                    {dias.map((d, i) => (
                      <button key={d} type="button" disabled={d === abierta.t.dia || abierta.t.fijada} onClick={() => mover(abierta.t.clave, d)} className="btn-secundario btn-sm disabled:opacity-40">
                        {nombresDia[i]}
                      </button>
                    ))}
                  </div>
                </div>
                <form action={fijarTareaAction}>
                  <input type="hidden" name="clave" value={abierta.t.clave} />
                  <input type="hidden" name="fijar" value={abierta.t.fijada ? "0" : "1"} />
                  <input type="hidden" name="volver" value={volver} />
                  <button className="btn-secundario w-full">
                    <Icono nombre={abierta.t.fijada ? "candadoAbierto" : "candado"} className="w-4 h-4" />
                    {abierta.t.fijada ? "Soltar el candado" : "Fijar con candado"}
                  </button>
                </form>
                <form action={partirEnLotesAction} className="flex items-end gap-2">
                  <input type="hidden" name="clave" value={abierta.t.clave} />
                  <input type="hidden" name="volver" value={volver} />
                  <label className="text-xs text-foreground-muted flex-1">
                    {abierta.t.lote ? `Partida en ${abierta.t.lote.de} lotes · nuevo tamaño (0 = sin lotes)` : "Partir en lotes de"}
                    <input name="tamano" type="number" min={0} placeholder="ej. 30" className="input mt-0.5" />
                  </label>
                  <button className="btn-secundario">{abierta.t.lote ? "Cambiar" : "Partir"}</button>
                </form>
              </>
            )}
            {abierta.t.planoHref ? (
              <Link href={abierta.t.planoHref} className="btn-texto">
                <Icono nombre="plano" className="w-4 h-4" /> Ver plano
              </Link>
            ) : (
              <p className="text-sm text-foreground-muted">Sin plano cargado.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
