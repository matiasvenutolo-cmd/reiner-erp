"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type DragEvent } from "react";
import type { FilaGestion, EstadoGestion } from "@/lib/data/gestion";
import { fechaCorta } from "@/lib/formato";
import { asignarTareasAction, cambiarCentroAction, ordenarCentroAction, ordenarCentroPorUrgenciaAction, decidirDesvioAction } from "@/app/actions/gestion";
import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";

type Operario = { id: string; nombre: string; centros: string[] };
type Centro = { id: string; nombre: string };

// Mejoras 22/11: la fila entera se pinta según el estado, para ver de un vistazo cómo está cada centro.
const ESTADO: Record<EstadoGestion, { label: string; clase: string; fila: string }> = {
  sin_asignar: { label: "Sin asignar", clase: "bg-naranja-bg text-naranja-fg", fila: "" },
  asignada: { label: "Lista para producir", clase: "bg-accent text-accent-foreground", fila: "bg-accent-soft" },
  en_curso: { label: "Produciendo", clase: "bg-verde text-white", fila: "bg-verde-bg" },
  espera: { label: "Espera paso anterior", clase: "bg-white/70 text-gris-fg", fila: "bg-gris-bg" },
  afuera: { label: "Enviado", clase: "bg-accent-soft text-accent-hover", fila: "" },
  para_mandar: { label: "Para mandar", clase: "bg-naranja-bg text-naranja-fg", fila: "" },
  trabada: { label: "Trabada", clase: "bg-rojo text-white", fila: "bg-rojo-bg" },
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
export function ListaGestion({ titulo, filas, operarios, centros, ordenable, tercerizados = false, hoy }: { titulo: React.ReactNode; filas: FilaGestion[]; operarios: Operario[]; centros: Centro[]; ordenable: boolean; tercerizados?: boolean; hoy: string }) {
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
        {/* Mejoras 22/11: mismas columnas y mismos anchos en todas las tablas, para que queden alineadas. */}
        <table className="w-full text-sm table-fixed min-w-[60rem]">
          <colgroup>
            <col style={{ width: "1.75rem" }} />
            <col />
            <col style={{ width: "12.5rem" }} />
            <col style={{ width: "4rem" }} />
            <col style={{ width: "10.5rem" }} />
            <col style={{ width: "19rem" }} />
          </colgroup>
          <thead className="text-xs text-foreground-muted">
            <tr className="border-b border-border">
              <th aria-label="Orden" />
              <th className="text-left px-3 py-2 font-medium">Pieza y orden</th>
              <th className="text-left px-2 py-2 font-medium">Paso y centro</th>
              <th className="text-right px-2 py-2 font-medium">Horas</th>
              <th className="text-left px-2 py-2 font-medium">{tercerizados ? "Proveedor" : "Operario"}</th>
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
                  className={`border-t border-border first:border-t-0 align-middle ${ESTADO[estado].fila} ${f.estado === "espera" ? "text-foreground-muted" : ""} ${arrastrada === f.clave ? "opacity-40" : ""} ${
                    sobre?.clave === f.clave && arrastrada !== f.clave ? (sobre.abajo ? "shadow-[inset_0_-2px_0_var(--accent)]" : "shadow-[inset_0_2px_0_var(--accent)]") : ""
                  }`}
                >
                  {!ordenable ? (
                    <td />
                  ) : (
                    <td className="pl-2 py-2">
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
                    <div className="flex items-center gap-2 min-w-0">
                      <Urgencia f={f} />
                      {/* Prueba 1 (05/11): la ficha de la pieza muestra todos sus pasos, asignaciones y tiempos, y se imprime. */}
                      <Link href={`/gestion/pieza/${f.otPiezaId}`} className="font-medium hover:text-accent hover:underline truncate">
                        {f.pieza} × {f.cantidad}
                      </Link>
                    </div>
                    <div className="text-[12px] text-foreground-muted pl-4 truncate">
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
                      <div className="leading-tight">
                        <div className={f.proveedor ? "" : "text-foreground-muted"}>{f.proveedor ?? "Sin asignar"}</div>
                        {estado === "afuera" && <div className="text-xs text-accent-hover">Enviado</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`badge-estado ${ESTADO[estado].clase}`}>
                      {estado === "para_mandar" && f.proveedor ? `Para mandar a ${f.proveedor}` : ESTADO[estado].label}
                    </span>
                    {estado === "afuera" && f.vuelta && <div className="text-xs text-foreground-muted mt-0.5">vuelve el {fechaCorta(f.vuelta, hoy)}</div>}
                    {f.motivo && estado === "trabada" && <div className="text-xs text-rojo-fg mt-0.5">{f.motivo}</div>}
                    {/* Mejoras 22/11: lo que salió mal se decide también acá, en el centro donde quedó trabado. */}
                    {f.desvioId && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <form action={decidirDesvioAction}>
                          <input type="hidden" name="id" value={f.desvioId} />
                          <input type="hidden" name="decision" value="reprocesar" />
                          <button className="btn btn-sm">Reprocesar</button>
                        </form>
                        <form action={decidirDesvioAction}>
                          <input type="hidden" name="id" value={f.desvioId} />
                          <input type="hidden" name="decision" value="scrap" />
                          <ConfirmarBoton mensaje={`¿Mandar ${f.pieza} a scrap y rehacerla desde el paso 1? Se crea una pieza nueva en la misma orden y, si hace falta, pide material a Compras.`} className="btn-secundario btn-sm">
                            Scrap y rehacer
                          </ConfirmarBoton>
                        </form>
                      </div>
                    )}
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
