"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FilaGestion, EstadoGestion } from "@/lib/data/gestion";
import { asignarTareasAction, cambiarCentroAction, moverEnColaAction, ordenarPorUrgenciaAction } from "@/app/actions/gestion";

type Operario = { id: string; nombre: string; centros: string[] };
type Centro = { id: string; nombre: string };

const ESTADO: Record<EstadoGestion, { label: string; clase: string }> = {
  sin_asignar: { label: "Sin asignar", clase: "bg-naranja-bg text-naranja-fg" },
  asignada: { label: "Asignada", clase: "bg-accent-soft text-accent-hover" },
  en_curso: { label: "En curso", clase: "bg-accent text-accent-foreground" },
  espera: { label: "Espera paso anterior", clase: "bg-gris-bg text-gris-fg" },
  afuera: { label: "Afuera", clase: "bg-accent-soft text-accent-hover" },
  para_mandar: { label: "Para mandar", clase: "bg-naranja-bg text-naranja-fg" },
  trabada: { label: "Trabada", clase: "bg-rojo-bg text-rojo-fg" },
};

function Urgencia({ f }: { f: FilaGestion }) {
  if (f.nivel === "atrasada" || f.holgura < 0) return <span className="inline-flex items-center gap-1.5 text-xs text-rojo-fg font-semibold"><span className="w-2 h-2 rounded-full bg-rojo" />{Math.abs(f.holgura)} día{Math.abs(f.holgura) === 1 ? "" : "s"} tarde</span>;
  if (f.nivel === "urgente") return <span className="inline-flex items-center gap-1.5 text-xs text-naranja-fg font-semibold"><span className="w-2 h-2 rounded-full bg-naranja" />{f.holgura} día{f.holgura === 1 ? "" : "s"} de margen</span>;
  return <span className="w-2 h-2 rounded-full bg-border inline-block" aria-label="En plazo" />;
}

const habilitados = (operarios: Operario[], centroId: string | null) => operarios.filter((o) => !o.centros.length || (centroId != null && o.centros.includes(centroId)));

/**
 * La lista de Gestión (reorganización 30/10 §3.1): asignar es elegir el operario en la fila y se guarda al
 * instante. Con un operario filtrado se ve su cola, en orden, con flechas para cambiarlo (§3.2).
 */
export function ListaGestion({ filas, operarios, centros, operarioFiltro }: { filas: FilaGestion[]; operarios: Operario[]; centros: Centro[]; operarioFiltro: string | null }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tildadas, setTildadas] = useState<Set<string>>(new Set());
  const [paraVarias, setParaVarias] = useState("");
  // Lo elegido se ve al instante, mientras se guarda.
  const [operarioDe, setOperarioDe] = useState<Record<string, string | null>>({});
  const [centroDe, setCentroDe] = useState<Record<string, string>>({});
  const nombreCentro = new Map(centros.map((c) => [c.id, c.nombre]));

  const ejecutar = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "No se pudo guardar.");
      router.refresh();
    });

  const asignar = (claves: string[], operarioId: string | null) => {
    setOperarioDe((m) => ({ ...m, ...Object.fromEntries(claves.map((c) => [c, operarioId])) }));
    ejecutar(() => asignarTareasAction(claves, operarioId));
  };

  const asignables = filas.filter((f) => f.tipo === "interno" && f.estado !== "en_curso");
  const todasTildadas = asignables.length > 0 && asignables.every((f) => tildadas.has(f.clave));

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg border border-rojo/40 bg-rojo-bg text-rojo-fg px-3 py-2 text-sm">{error}</div>}
      {pendiente && (
        <div className="fixed bottom-4 right-4 z-30 rounded-lg bg-foreground text-background px-3 py-2 text-sm shadow-lg" role="status">
          Guardando…
        </div>
      )}

      {operarioFiltro && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-foreground-muted">Cola de {operarios.find((o) => o.id === operarioFiltro)?.nombre}, en el orden en que la ve en su tablet.</span>
          <button className="btn-secundario btn-sm" disabled={pendiente} onClick={() => ejecutar(() => ordenarPorUrgenciaAction(operarioFiltro))}>
            Ordenar por urgencia
          </button>
        </div>
      )}

      {tildadas.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm">
          <span className="font-semibold">{tildadas.size} tildada{tildadas.size === 1 ? "" : "s"}</span>
          <select value={paraVarias} onChange={(e) => setParaVarias(e.target.value)} className="input py-1 w-auto">
            <option value="">Asignar a…</option>
            {operarios.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
            <option value="-">— Sin asignar —</option>
          </select>
          <button
            className="btn btn-sm"
            disabled={!paraVarias || pendiente}
            onClick={() => {
              asignar([...tildadas], paraVarias === "-" ? null : paraVarias);
              setTildadas(new Set());
              setParaVarias("");
            }}
          >
            Asignar
          </button>
          <button className="btn-texto btn-sm" onClick={() => setTildadas(new Set())}>
            Destildar
          </button>
        </div>
      )}

      <div className="tarjeta overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-foreground-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  aria-label="Tildar todas"
                  checked={todasTildadas}
                  onChange={(e) => setTildadas(e.target.checked ? new Set(asignables.map((f) => f.clave)) : new Set())}
                />
              </th>
              {operarioFiltro && <th className="px-1 py-2 font-medium">Orden</th>}
              <th className="text-left px-2 py-2 font-medium">Urgencia</th>
              <th className="text-left px-2 py-2 font-medium">Pieza</th>
              <th className="text-left px-2 py-2 font-medium">Orden de trabajo</th>
              <th className="text-left px-2 py-2 font-medium">Paso</th>
              <th className="text-left px-2 py-2 font-medium">Centro</th>
              <th className="text-right px-2 py-2 font-medium">Horas</th>
              <th className="text-left px-2 py-2 font-medium">Operario</th>
              <th className="text-left px-2 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const operarioId = f.clave in operarioDe ? operarioDe[f.clave] : f.operarioId;
              const centroId = centroDe[f.clave] ?? f.centroId;
              const estado: EstadoGestion = f.estado === "sin_asignar" && operarioId ? "asignada" : f.estado === "asignada" && !operarioId ? "sin_asignar" : f.estado;
              const interno = f.tipo === "interno";
              const opciones = habilitados(operarios, centroId);
              const fueraDeLista = operarioId && !opciones.some((o) => o.id === operarioId) ? operarios.find((o) => o.id === operarioId) : null;
              return (
                <tr key={f.clave} className={`border-t border-border first:border-t-0 align-middle ${f.estado === "espera" ? "text-foreground-muted" : ""}`}>
                  <td className="px-3 py-2">
                    {interno && f.estado !== "en_curso" && (
                      <input
                        type="checkbox"
                        aria-label={`Tildar ${f.pieza}`}
                        checked={tildadas.has(f.clave)}
                        onChange={(e) => {
                          const s = new Set(tildadas);
                          if (e.target.checked) s.add(f.clave);
                          else s.delete(f.clave);
                          setTildadas(s);
                        }}
                      />
                    )}
                  </td>
                  {operarioFiltro && (
                    <td className="px-1 py-2 whitespace-nowrap">
                      <button className="px-1.5 rounded hover:bg-surface-muted disabled:opacity-30" disabled={i === 0 || pendiente} aria-label="Subir" onClick={() => ejecutar(() => moverEnColaAction(f.clave, "arriba"))}>
                        ↑
                      </button>
                      <button
                        className="px-1.5 rounded hover:bg-surface-muted disabled:opacity-30"
                        disabled={i === filas.length - 1 || pendiente}
                        aria-label="Bajar"
                        onClick={() => ejecutar(() => moverEnColaAction(f.clave, "abajo"))}
                      >
                        ↓
                      </button>
                    </td>
                  )}
                  <td className="px-2 py-2 whitespace-nowrap">
                    <Urgencia f={f} />
                  </td>
                  <td className="px-2 py-2 min-w-48">
                    <div className="font-medium">
                      {f.pieza} × {f.cantidad}
                    </div>
                    <div className="font-mono text-[12px] text-foreground-muted">{f.codigo}</div>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <Link href={`/proyectos/${f.ordenId}`} className="hover:text-accent hover:underline">
                      {f.orden}
                    </Link>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {f.paso} · {f.posicion} de {f.totalPasos}
                  </td>
                  <td className="px-2 py-2">
                    {interno && f.centros.length > 1 ? (
                      <select
                        value={centroId ?? ""}
                        disabled={pendiente}
                        onChange={(e) => {
                          setCentroDe((m) => ({ ...m, [f.clave]: e.target.value }));
                          ejecutar(() => cambiarCentroAction(f.clave, e.target.value));
                        }}
                        className="input py-1 w-auto"
                      >
                        {f.centros.map((c) => (
                          <option key={c} value={c}>
                            {nombreCentro.get(c) ?? c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="whitespace-nowrap">{interno ? (nombreCentro.get(centroId ?? "") ?? "—") : "Tercerizado"}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{interno ? f.horas.toLocaleString("es-AR", { maximumFractionDigits: 1 }) : "—"}</td>
                  <td className="px-2 py-2">
                    {interno ? (
                      <select value={operarioId ?? ""} disabled={pendiente || f.estado === "en_curso"} onChange={(e) => asignar([f.clave], e.target.value || null)} className="input py-1 w-auto min-w-32">
                        <option value="">— Sin asignar —</option>
                        {fueraDeLista && <option value={fueraDeLista.id}>{fueraDeLista.nombre} (otro centro)</option>}
                        {opciones.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nombre}
                          </option>
                        ))}
                      </select>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className={`badge-estado ${ESTADO[estado].clase}`}>{ESTADO[estado].label}</span>
                    {f.motivo && estado === "trabada" && <div className="text-xs text-rojo-fg mt-0.5">{f.motivo}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
