"use client";

import Link from "next/link";
import { useState } from "react";
import type { CargaOperario, CargaPorDia, TramoCarga } from "@/lib/data/gestion";
import { horas } from "@/lib/formato";

type Vista = "centro" | "operario";
// Reunión 20/11: se recorre semana a semana (o de a dos, o por mes) con las flechas.
const RANGOS = [
  { dias: 5, label: "Semana" },
  { dias: 10, label: "2 semanas" },
  { dias: 20, label: "Mes" },
] as const;

// Un color por operario, legible en claro y en oscuro (fondo suave, texto fuerte del mismo tono).
const TONOS = [205, 25, 140, 280, 345, 50, 175, 230];
// Sin operario asignado (prueba 19/11): gris.
const SIN_ASIGNAR = { background: "var(--surface-muted)", color: "var(--foreground-muted)", borderColor: "var(--border)", borderStyle: "dashed" } as const;
const colorDe = (i: number) => {
  const h = TONOS[i % TONOS.length];
  return { background: `hsl(${h} 75% 86%)`, color: `hsl(${h} 70% 22%)`, borderColor: `hsl(${h} 55% 60%)` };
};

const DIA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const etiquetaDia = (f: string) => {
  const d = new Date(`${f}T12:00:00Z`);
  return { dia: DIA[d.getUTCDay()], num: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`, lunes: d.getUTCDay() === 1 };
};

type Barra = { clave: string; otPiezaId: string; operarioId: string; pieza: string; paso: string; posicion: number; totalPasos: number; orden: string; inicio: number; fin: number; horas: number; totalHoras: number; carril: number };

/**
 * Los tramos de cada tarea se juntan en una barra, medida en días (con la parte del día que ocupa: una tarea que
 * termina a la mañana y la siguiente que empieza a la tarde quedan una al lado de la otra). Las que se superponen
 * (dos operarios en el mismo centro) van en carriles distintos.
 */
function barras(tramos: TramoCarga[], dias: string[], minDias: number): { lista: Barra[]; carriles: number } {
  const pos = new Map(dias.map((d, i) => [d, i]));
  const porTarea = new Map<string, Barra>();
  for (const t of tramos) {
    const i = pos.get(t.dia);
    if (i === undefined) continue;
    const k = `${t.operarioId}|${t.clave}`;
    const b = porTarea.get(k);
    if (b) {
      b.inicio = Math.min(b.inicio, i + t.desde);
      b.fin = Math.max(b.fin, i + t.hasta);
      b.horas += t.horas;
    } else
      porTarea.set(k, { clave: t.clave, otPiezaId: t.otPiezaId, operarioId: t.operarioId, pieza: t.pieza, paso: t.paso, posicion: t.posicion, totalPasos: t.totalPasos, orden: t.orden, inicio: i + t.desde, fin: i + t.hasta, horas: t.horas, totalHoras: t.totalHoras, carril: 0 });
  }
  // Mejoras 22/11: una tarea corta se dibuja con un ancho mínimo para que se lea; los carriles lo tienen en cuenta.
  for (const b of porTarea.values()) b.fin = Math.min(dias.length, Math.max(b.fin, b.inicio + minDias));
  const lista = [...porTarea.values()].sort((a, b) => a.inicio - b.inicio || b.fin - a.fin);
  const finDe: number[] = [];
  for (const b of lista) {
    let c = finDe.findIndex((fin) => fin <= b.inicio + 0.001);
    if (c < 0) {
      c = finDe.length;
      finDe.push(0);
    }
    finDe[c] = b.fin;
    b.carril = c;
  }
  return { lista, carriles: Math.max(1, finDe.length) };
}

/** Una tarea en la carga. Reunión 20/11: el calendario es sólo para ver; tocarla abre la ficha de la pieza. */
function BarraTarea({ b, dias, estilo, operario, conOperario, alto }: { b: Barra; dias: string[]; estilo: React.CSSProperties; operario: string; conOperario: boolean; alto: number }) {
  const dosRenglones = alto > 2;
  return (
    <Link
      href={`/gestion/pieza/${b.otPiezaId}`}
      title={`${b.pieza} · ${b.paso} (paso ${b.posicion} de ${b.totalPasos}) · ${b.orden}\n${operario} · ${horas(b.totalHoras)} en total${b.horas < b.totalHoras - 0.05 ? ` (${horas(b.horas)} en estos días)` : ""}`}
      className={`absolute rounded border px-1.5 overflow-hidden hover:brightness-95 ${dosRenglones ? "py-1 text-[11px] leading-tight" : "text-[11px] leading-7 truncate"}`}
      style={{ ...estilo, height: `${alto}rem`, left: `calc(${(b.inicio / dias.length) * 100}% + 1px)`, width: `calc(${((b.fin - b.inicio) / dias.length) * 100}% - 2px)`, top: `${b.carril * (alto + 0.25)}rem` }}
    >
      {dosRenglones ? (
        <>
          <span className="block font-semibold truncate">{b.pieza}</span>
          <span className="block truncate opacity-80">
            {conOperario ? `${operario} · ` : ""}
            {b.paso} {b.posicion}/{b.totalPasos} · {horas(b.horas)}
          </span>
        </>
      ) : (
        <>
          {conOperario ? `${operario} · ` : ""}
          {b.pieza} · {b.paso} {b.posicion}/{b.totalPasos}
        </>
      )}
    </Link>
  );
}

/**
 * Carga de trabajo (prueba 1, 05/11): en Gestión mismo, después de asignar. Por centro (quién trabaja en cada
 * máquina cada día, un color por operario) o por operario (su cola en el calendario). Una tarea larga se ve como
 * una barra de varios días. Es la cola de cada operario repartida en sus horas disponibles: no reprograma nada.
 */
export function CargaTrabajo({ carga, resumen, operarios, centros, hoy }: { carga: CargaPorDia; resumen: CargaOperario[]; operarios: { id: string; nombre: string }[]; centros: { id: string; nombre: string }[]; hoy: string }) {
  const [vista, setVista] = useState<Vista>("centro");
  const [rango, setRango] = useState<number>(10);
  const [desde, setDesde] = useState(0);
  const dias = carga.dias.slice(desde, desde + rango);
  const ultimo = Math.max(0, carga.dias.length - rango);
  const mover = (n: number) => setDesde((d) => Math.min(ultimo, Math.max(0, d + n)));
  const fechaDe = (f: string) => `${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}`;
  const indice = new Map(operarios.map((o, i) => [o.id, i]));
  const nombre = new Map(operarios.map((o) => [o.id, o.nombre]));
  const enRango = carga.tramos.filter((t) => t.dia >= dias[0] && t.dia <= dias.at(-1)!);

  const filas =
    vista === "operario"
      ? operarios.map((o) => {
          const r = resumen.find((x) => x.id === o.id);
          const suyos = enRango.filter((t) => t.operarioId === o.id);
          const ocupadas = suyos.reduce((n, t) => n + t.horas, 0);
          const disponibles = dias.reduce((n, d) => n + (carga.capacidad[o.id]?.[d] ?? 0), 0);
          // Lo que se ve es lo que puede hacer en estos días: si tiene cola pero no la llena, espera pasos anteriores.
          const detalle = !r?.horasPendientes ? "sin tareas asignadas" : `${horas(r.horasPendientes)} en cola · ${horas(ocupadas)} de ${horas(disponibles)} en estos días`;
          return { id: o.id, titulo: o.nombre, detalle, href: `/gestion?operario=${o.id}`, tramos: suyos, capacidad: carga.capacidad[o.id] };
        })
      : centros
          .map((c) => {
            const sa = carga.sinAsignar[c.id];
            return { id: c.id, titulo: c.nombre, detalle: sa ? `${sa.tareas} sin asignar · ${horas(sa.horas)}` : "", href: `/gestion?centro=${c.id}`, tramos: enRango.filter((t) => t.centroId === c.id), capacidad: undefined };
          })
          // Mejoras 22/11: siempre todos los centros, aunque en estos días no tengan carga.
          ;

  const columnas = { gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` };

  return (
    <section className="tarjeta p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Carga de trabajo</h2>
          <p className="text-xs text-foreground-muted">Cómo quedan las colas repartidas en las horas de cada día, desde ahora. Es sólo para ver: el orden se cambia arriba, en la cola de cada centro. Tocá una tarea para ver la pieza.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {(["centro", "operario"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setVista(v)} className={`px-3 py-1 ${vista === v ? "bg-accent text-accent-foreground" : "hover:bg-surface-muted"}`}>
                Por {v}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {RANGOS.map((r) => (
              <button
                key={r.dias}
                type="button"
                onClick={() => {
                  setRango(r.dias);
                  setDesde((d) => Math.min(d, Math.max(0, carga.dias.length - r.dias)));
                }}
                className={`px-3 py-1 ${rango === r.dias ? "bg-accent text-accent-foreground" : "hover:bg-surface-muted"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center rounded-md border border-border overflow-hidden">
            <button type="button" onClick={() => mover(-rango)} disabled={desde === 0} className="px-2.5 py-1 hover:bg-surface-muted disabled:opacity-30" aria-label="Anterior">
              ←
            </button>
            <button type="button" onClick={() => setDesde(0)} disabled={desde === 0} className="px-2 py-1 text-xs tabular-nums hover:bg-surface-muted disabled:hover:bg-transparent" title="Volver a hoy">
              {fechaDe(dias[0])} al {fechaDe(dias.at(-1)!)}
            </button>
            <button type="button" onClick={() => mover(rango)} disabled={desde >= ultimo} className="px-2.5 py-1 hover:bg-surface-muted disabled:opacity-30" aria-label="Siguiente">
              →
            </button>
          </div>
        </div>
      </div>

      {vista === "centro" && (
        <div className="flex flex-wrap gap-3 text-xs">
          {operarios.map((o, i) => (
            <span key={o.id} className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm border" style={colorDe(i)} />
              {o.nombre}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-foreground-muted">
            <span className="w-3 h-3 rounded-sm border" style={SIN_ASIGNAR} />
            Sin asignar
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[44rem]">
          {/* Encabezado: los días hábiles, con la semana marcada. */}
          <div className="flex text-[11px] text-foreground-muted border-b border-border pb-1">
            <div className="w-40 shrink-0" />
            <div className="flex-1 grid" style={columnas}>
              {dias.map((d) => {
                const e = etiquetaDia(d);
                return (
                  <div key={d} className={`text-center leading-tight ${e.lunes ? "border-l border-border" : ""} ${d === hoy ? "text-accent font-semibold" : ""}`}>
                    <div>{e.dia}</div>
                    <div>{e.num}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {filas.length === 0 && <p className="text-sm text-foreground-muted py-4">Todavía no hay tareas asignadas para mostrar.</p>}
          {filas.map((f) => {
            // Semana: barras más altas, con dos renglones; 2 semanas o mes: un renglón.
            const alto = dias.length <= 5 ? 2.5 : 1.75;
            const { lista, carriles } = barras(f.tramos, dias, dias.length <= 5 ? 0.45 : dias.length <= 10 ? 0.5 : 0.8);
            const usadas = new Map<string, number>();
            for (const t of f.tramos) usadas.set(t.dia, (usadas.get(t.dia) ?? 0) + t.horas);
            return (
              <div key={f.id} className="flex border-b border-border last:border-b-0 py-1.5">
                <div className="w-40 shrink-0 pr-2">
                  <Link href={f.href} className="text-sm font-medium hover:text-accent hover:underline">
                    {f.titulo}
                  </Link>
                  {f.detalle && <div className="text-[11px] text-foreground-muted leading-tight">{f.detalle}</div>}
                </div>
                <div className="flex-1 relative">
                  {/* Fondo: un casillero por día; gris si el operario no tiene horas ese día. */}
                  <div className="absolute inset-0 grid" style={columnas}>
                    {dias.map((d) => {
                      const cap = f.capacidad?.[d];
                      return (
                        <div
                          key={d}
                          title={cap === 0 ? "No tiene horas este día" : cap !== undefined ? `${horas(usadas.get(d) ?? 0)} de ${horas(cap)}` : undefined}
                          className={`${etiquetaDia(d).lunes ? "border-l border-border" : ""} ${cap === 0 ? "bg-surface-muted" : ""} ${d === hoy ? "bg-accent-soft/40" : ""}`}
                        />
                      );
                    })}
                  </div>
                  <div className="relative" style={{ height: `${carriles * (alto + 0.25)}rem` }}>
                    {lista.map((b) => (
                      <BarraTarea
                        key={`${b.operarioId}|${b.clave}`}
                        b={b}
                        dias={dias}
                        estilo={b.operarioId ? colorDe(indice.get(b.operarioId) ?? 0) : SIN_ASIGNAR}
                        operario={b.operarioId ? (nombre.get(b.operarioId) ?? "") : "Sin asignar"}
                        conOperario={vista === "centro"}
                        alto={alto}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {vista === "operario" && <p className="text-[11px] text-foreground-muted">En gris, los días que el operario no tiene horas (ausencia cargada en el calendario).</p>}
    </section>
  );
}
