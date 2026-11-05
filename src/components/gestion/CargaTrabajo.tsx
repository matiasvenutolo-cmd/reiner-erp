"use client";

import Link from "next/link";
import { useState } from "react";
import type { CargaOperario, CargaPorDia, TramoCarga } from "@/lib/data/gestion";
import { horas } from "@/lib/formato";

type Vista = "centro" | "operario";
const RANGOS = [
  { dias: 5, label: "1 semana" },
  { dias: 10, label: "2 semanas" },
  { dias: 20, label: "4 semanas" },
] as const;

// Un color por operario, legible en claro y en oscuro (fondo suave, texto fuerte del mismo tono).
const TONOS = [205, 25, 140, 280, 345, 50, 175, 230];
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
function barras(tramos: TramoCarga[], dias: string[]): { lista: Barra[]; carriles: number } {
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

/**
 * Carga de trabajo (prueba 1, 05/11): en Gestión mismo, después de asignar. Por centro (quién trabaja en cada
 * máquina cada día, un color por operario) o por operario (su cola en el calendario). Una tarea larga se ve como
 * una barra de varios días. Es la cola de cada operario repartida en sus horas disponibles: no reprograma nada.
 */
export function CargaTrabajo({ carga, resumen, operarios, centros, hoy }: { carga: CargaPorDia; resumen: CargaOperario[]; operarios: { id: string; nombre: string }[]; centros: { id: string; nombre: string }[]; hoy: string }) {
  const [vista, setVista] = useState<Vista>("centro");
  const [rango, setRango] = useState<number>(10);
  const dias = carga.dias.slice(0, rango);
  const indice = new Map(operarios.map((o, i) => [o.id, i]));
  const nombre = new Map(operarios.map((o) => [o.id, o.nombre]));
  const enRango = carga.tramos.filter((t) => t.dia <= dias.at(-1)!);

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
          .filter((f) => f.tramos.length || f.detalle);

  const columnas = { gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` };

  return (
    <section className="tarjeta p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Carga de trabajo</h2>
          <p className="text-xs text-foreground-muted">La cola de cada operario repartida en sus horas de cada día. Tocá una barra para ver la pieza.</p>
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
              <button key={r.dias} type="button" onClick={() => setRango(r.dias)} className={`px-3 py-1 ${rango === r.dias ? "bg-accent text-accent-foreground" : "hover:bg-surface-muted"}`}>
                {r.label}
              </button>
            ))}
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
            const { lista, carriles } = barras(f.tramos, dias);
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
                  <div className="relative" style={{ height: `${carriles * 2}rem` }}>
                    {lista.map((b) => (
                      <Link
                        key={`${b.operarioId}|${b.clave}`}
                        href={`/gestion/pieza/${b.otPiezaId}`}
                        title={`${b.pieza} · ${b.paso} (paso ${b.posicion} de ${b.totalPasos}) · ${b.orden}\n${nombre.get(b.operarioId) ?? ""} · ${horas(b.totalHoras)} en total${b.horas < b.totalHoras - 0.05 ? ` (${horas(b.horas)} en estos días)` : ""}`}
                        className="absolute h-7 rounded border px-1.5 text-[11px] leading-7 truncate hover:brightness-95"
                        style={{ ...colorDe(indice.get(b.operarioId) ?? 0), left: `calc(${(b.inicio / dias.length) * 100}% + 1px)`, width: `calc(${((b.fin - b.inicio) / dias.length) * 100}% - 2px)`, top: `${b.carril * 2}rem` }}
                      >
                        {vista === "centro" ? `${nombre.get(b.operarioId) ?? ""} · ` : ""}
                        {b.pieza} · {b.paso} {b.posicion}/{b.totalPasos}
                      </Link>
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
