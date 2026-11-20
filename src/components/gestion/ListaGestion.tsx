"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type DragEvent } from "react";
import type { FilaGestion, EstadoGestion } from "@/lib/data/gestion";
import { fechaCorta } from "@/lib/formato";
import { asignarTareasAction, cambiarCentroAction, ordenarCentroAction, ordenarCentroPorUrgenciaAction } from "@/app/actions/gestion";

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

/** La lista ya viene ordenada por urgencia; el punto sólo marca lo que conviene hacer primero (prueba 1: sin "días tarde"). */
function Urgencia({ f }: { f: FilaGestion }) {
  if (f.nivel === "atrasada" || f.holgura < 0) return <span className="w-2 h-2 rounded-full bg-rojo inline-block shrink-0" title="Primero: es lo que más corre el fin estimado" />;
  if (f.nivel === "urgente") return <span className="w-2 h-2 rounded-full bg-naranja inline-block shrink-0" title="Urgente" />;
  return <span className="w-2 h-2 rounded-full bg-border inline-block shrink-0" title="En plazo" />;
}

const habilitados = (operarios: Operario[], centroId: string | null) => operarios.filter((o) => !o.centros.length || (centroId != null && o.centros.includes(centroId)));

/**
 * La lista de Gestión (reorganización 30/10 §3.1): asignar es elegir el operario en la fila y se guarda al
 * instante. Reunión 20/11: cada centro es una cola que se ordena arrastrando la tarea de la manija (⠿), tenga o
 * no operario; el orden queda guardado y es el que siguen el calendario y la tablet. `ordenable` es la cola
 * completa de un centro (sin filtros que dejen afuera tareas).
 */
export function ListaGestion({ titulo, filas, operarios, centros, ordenable, hoy }: { titulo: React.ReactNode; filas: FilaGestion[]; operarios: Operario[]; centros: Centro[]; ordenable: boolean; hoy: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Lo elegido se ve al instante, mientras se guarda.
  const [operarioDe, setOperarioDe] = useState<Record<string, string | null>>({});
  const [centroDe, setCentroDe] = useState<Record<string, string>>({});
  const nombreCentro = new Map(centros.map((c) => [c.id, c.nombre]));
  // El orden se ve al instante al soltar, mientras se guarda; cuando llega la lista nueva, manda la del servidor.
  const firma = filas.map((f) => f.clave).join("|");
  const [local, setLocal] = useState<{ firma: string; claves: string[] } | null>(null);
  const porClave = new Map(filas.map((f) => [f.clave, f]));
  const visibles = local?.firma === firma ? local.claves.map((c) => porClave.get(c)).filter((f): f is FilaGestion => !!f) : filas;
  const [arrastrada, setArrastrada] = useState<string | null>(null);
  const [sobre, setSobre] = useState<{ clave: string; abajo: boolean } | null>(null);

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

  const soltar = (e: DragEvent, destino: string) => {
    e.preventDefault();
    const origen = arrastrada;
    const abajo = sobre?.abajo ?? false;
    setArrastrada(null);
    setSobre(null);
    if (!origen || origen === destino) return;
    const claves = visibles.map((f) => f.clave).filter((c) => c !== origen);
    claves.splice(claves.indexOf(destino) + (abajo ? 1 : 0), 0, origen);
    setLocal({ firma, claves });
    ejecutar(() => ordenarCentroAction(claves));
  };
  const ordenadaAMano = filas.some((f) => f.lugar != null);

  return (
    <div className="space-y-2">
      {error && <div className="rounded-lg border border-rojo/40 bg-rojo-bg text-rojo-fg px-3 py-2 text-sm">{error}</div>}
      {pendiente && (
        <div className="fixed bottom-4 right-4 z-30 rounded-lg bg-foreground text-background px-3 py-2 text-sm shadow-lg" role="status">
          Guardando…
        </div>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="font-semibold">{titulo}</h2>
        {ordenable && ordenadaAMano && (
          <button className="btn-texto btn-sm" disabled={pendiente} onClick={() => ejecutar(() => ordenarCentroPorUrgenciaAction(filas.map((f) => f.clave)))}>
            Volver a ordenar por urgencia
          </button>
        )}
      </div>

      <div className="tarjeta overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-foreground-muted">
            <tr className="border-b border-border">
              {ordenable && <th className="w-6" aria-label="Orden" />}
              <th className="text-left px-3 py-2 font-medium">Pieza y orden</th>
              <th className="text-left px-2 py-2 font-medium">Paso y centro</th>
              <th className="text-right px-2 py-2 font-medium">Horas</th>
              <th className="text-left px-2 py-2 font-medium">Operario</th>
              <th className="text-left px-2 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const operarioId = f.clave in operarioDe ? operarioDe[f.clave] : f.operarioId;
              const centroId = centroDe[f.clave] ?? f.centroId;
              const estado: EstadoGestion = f.estado === "sin_asignar" && operarioId ? "asignada" : f.estado === "asignada" && !operarioId ? "sin_asignar" : f.estado;
              const interno = f.tipo === "interno";
              const opciones = habilitados(operarios, centroId);
              const fueraDeLista = operarioId && !opciones.some((o) => o.id === operarioId) ? operarios.find((o) => o.id === operarioId) : null;
              return (
                <tr
                  key={f.clave}
                  onDragOver={(e) => {
                    if (!arrastrada) return;
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    const abajo = e.clientY > r.top + r.height / 2;
                    if (sobre?.clave !== f.clave || sobre.abajo !== abajo) setSobre({ clave: f.clave, abajo });
                  }}
                  onDrop={(e) => soltar(e, f.clave)}
                  className={`border-t border-border first:border-t-0 align-middle ${f.estado === "espera" ? "text-foreground-muted" : ""} ${arrastrada === f.clave ? "opacity-40" : ""} ${
                    sobre?.clave === f.clave && arrastrada !== f.clave ? (sobre.abajo ? "shadow-[inset_0_-2px_0_var(--accent)]" : "shadow-[inset_0_2px_0_var(--accent)]") : ""
                  }`}
                >
                  {ordenable && (
                    <td className="pl-2 py-2 w-6">
                      <span
                        draggable={!pendiente}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", f.clave);
                          const fila = e.currentTarget.closest("tr");
                          if (fila) e.dataTransfer.setDragImage(fila, 16, 16);
                          setArrastrada(f.clave);
                        }}
                        onDragEnd={() => {
                          setArrastrada(null);
                          setSobre(null);
                        }}
                        title="Arrastrá para cambiar el orden"
                        className="cursor-grab active:cursor-grabbing text-foreground-muted select-none px-0.5"
                      >
                        ⠿
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Urgencia f={f} />
                      {/* Prueba 1 (05/11): la ficha de la pieza muestra todos sus pasos, asignaciones y tiempos, y se imprime. */}
                      <Link href={`/gestion/pieza/${f.otPiezaId}`} className="font-medium hover:text-accent hover:underline">
                        {f.pieza} × {f.cantidad}
                      </Link>
                    </div>
                    <div className="text-[12px] text-foreground-muted pl-4">
                      <span className="font-mono">{f.codigo}</span> ·{" "}
                      <Link href={`/proyectos/${f.ordenId}`} className="hover:text-accent hover:underline">
                        {f.orden}
                      </Link>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="whitespace-nowrap">
                      {f.paso} <span className="text-foreground-muted">· {f.posicion} de {f.totalPasos}</span>
                      {f.reproceso && <span className="ml-1.5 badge-estado bg-naranja-bg text-naranja-fg">Reproceso</span>}
                    </div>
                    {interno && f.centros.length > 1 ? (
                      <select
                        value={centroId ?? ""}
                        disabled={pendiente}
                        onChange={(e) => {
                          setCentroDe((m) => ({ ...m, [f.clave]: e.target.value }));
                          ejecutar(() => cambiarCentroAction(f.clave, e.target.value));
                        }}
                        className="input py-0.5 text-xs w-auto mt-0.5"
                      >
                        {f.centros.map((c) => (
                          <option key={c} value={c}>
                            {nombreCentro.get(c) ?? c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-xs text-foreground-muted whitespace-nowrap">{interno ? (nombreCentro.get(centroId ?? "") ?? "—") : "Tercerizado"}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{interno ? f.horas.toLocaleString("es-AR", { maximumFractionDigits: 1 }) : "—"}</td>
                  <td className="px-2 py-2">
                    {interno ? (
                      <select value={operarioId ?? ""} disabled={pendiente || f.estado === "en_curso"} onChange={(e) => asignar([f.clave], e.target.value || null)} className="input py-1 w-auto min-w-28">
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
                    <span className={`badge-estado ${ESTADO[estado].clase}`}>
                      {estado === "para_mandar" && f.proveedor ? `Para mandar a ${f.proveedor}` : ESTADO[estado].label}
                    </span>
                    {estado === "afuera" && (f.proveedor || f.vuelta) && (
                      <div className="text-xs text-foreground-muted mt-0.5">{[f.proveedor, f.vuelta && `vuelve el ${fechaCorta(f.vuelta, hoy)}`].filter(Boolean).join(" · ")}</div>
                    )}
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
