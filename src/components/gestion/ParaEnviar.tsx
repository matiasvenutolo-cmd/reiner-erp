"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FilaParaEnviar } from "@/lib/data/gestion";
import { horas, numero, plural } from "@/lib/formato";
import { enviarAProduccionAction } from "@/app/actions/gestion";

/**
 * Para enviar a producción (prueba 1, 05/11): al confirmar una orden sus piezas quedan esperando acá, y el jefe
 * de planta elige cuáles manda. Recién enviadas, sus tareas aparecen abajo para asignar y en la tablet.
 * Las que no tienen material (o plano, si ADMIN lo exige) se ven, pero no se pueden elegir hasta que lo tengan.
 */
export function ParaEnviar({ filas }: { filas: FilaParaEnviar[] }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [abierta, setAbierta] = useState(true);

  const ordenes = [...new Map(filas.map((f) => [f.ordenId, f.orden])).entries()];
  const sePueden = filas.filter((f) => !f.motivo);
  const alternar = (ids: string[], si: boolean) =>
    setElegidas((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (si) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  const enviar = () =>
    startTransition(async () => {
      setMensaje(null);
      const r = await enviarAProduccionAction([...elegidas]);
      if (!r.ok) setMensaje({ ok: false, texto: r.error });
      else {
        setMensaje({ ok: true, texto: `${plural(r.enviadas, "pieza")} enviada${r.enviadas === 1 ? "" : "s"} a producción: sus tareas ya están abajo para asignar.${r.esperan ? ` ${plural(r.esperan, "pieza")} todavía no se puede${r.esperan === 1 ? "" : "n"} mandar.` : ""}` });
        setElegidas(new Set());
      }
      router.refresh();
    });

  return (
    <section className="tarjeta">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button type="button" onClick={() => setAbierta((x) => !x)} className="text-left">
          <h2 className="font-semibold">
            Para enviar a producción <span className="text-foreground-muted font-normal">· {plural(filas.length, "pieza")}</span>
          </h2>
          <p className="text-xs text-foreground-muted">
            {sePueden.length === filas.length
              ? "Elegí qué piezas mandás al taller. Recién ahí aparecen para asignar."
              : sePueden.length === 0
                ? "Todas esperan el material: cuando Compras lo reciba, se van a poder mandar."
                : `${plural(sePueden.length, "pieza")} se ${sePueden.length === 1 ? "puede" : "pueden"} mandar ya; las otras esperan el material.`}
          </p>
        </button>
        {abierta && (
          <div className="flex flex-wrap items-center gap-2">
            {sePueden.length > 0 && (
              <button type="button" className="btn-texto btn-sm" onClick={() => alternar(sePueden.map((f) => f.otPiezaId), elegidas.size < sePueden.length)}>
                {elegidas.size < sePueden.length ? "Elegir todas las que se pueden" : "No elegir ninguna"}
              </button>
            )}
            <button type="button" className="btn btn-sm" disabled={!elegidas.size || pendiente} onClick={enviar}>
              {pendiente ? "Enviando…" : elegidas.size ? `Enviar ${plural(elegidas.size, "pieza")} a producción` : "Enviar a producción"}
            </button>
          </div>
        )}
      </div>
      {mensaje && <div className={`mx-4 mb-3 rounded-lg px-3 py-2 text-sm ${mensaje.ok ? "bg-verde-bg text-verde-fg" : "bg-rojo-bg text-rojo-fg"}`}>{mensaje.texto}</div>}
      {abierta &&
        ordenes.map(([ordenId, orden]) => {
          const deLaOrden = filas.filter((f) => f.ordenId === ordenId);
          const listas = deLaOrden.filter((f) => !f.motivo).map((f) => f.otPiezaId);
          return (
            <div key={ordenId} className="border-t border-border">
              <div className="flex items-center justify-between gap-2 px-4 py-2 bg-surface-muted text-xs">
                <span className="font-semibold">{orden}</span>
                {listas.length > 0 && (
                  <button type="button" className="text-accent hover:underline" onClick={() => alternar(listas, !listas.every((id) => elegidas.has(id)))}>
                    {listas.every((id) => elegidas.has(id)) ? "Sacar las de esta orden" : "Elegir las de esta orden"}
                  </button>
                )}
              </div>
              <ul className="divide-y divide-border">
                {deLaOrden.map((f) => (
                  <li key={f.otPiezaId}>
                    <label className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm ${f.motivo ? "text-foreground-muted" : "cursor-pointer hover:bg-surface-muted"}`}>
                      <input type="checkbox" disabled={!!f.motivo} checked={elegidas.has(f.otPiezaId)} onChange={(e) => alternar([f.otPiezaId], e.target.checked)} />
                      <span className="flex-1 min-w-48">
                        <span className="font-medium text-foreground">{f.pieza.charAt(0).toUpperCase() + f.pieza.slice(1)}</span> × {numero(f.cantidad)}
                        <span className="block font-mono text-[12px] text-foreground-muted">{f.codigo}</span>
                      </span>
                      <span className="text-xs text-foreground-muted w-40">
                        {plural(f.pasos, "paso")} · {horas(f.horas)} de taller
                      </span>
                      {f.motivo ? (
                        <span className="badge-estado bg-naranja-bg text-naranja-fg">{f.motivo}</span>
                      ) : (
                        <span className="badge-estado bg-accent-soft text-accent-hover">Se puede mandar</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
    </section>
  );
}
