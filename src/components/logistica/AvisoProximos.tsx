"use client";

import { useSyncExternalStore } from "react";

export type ProximoTercerizado = { clave: string; servicio: string; pieza: string; cantidad: number; orden: string; fechaTexto: string };

const CLAVE = "reiner-aviso-tercerizados-oculto";
const EVENTO = "reiner-aviso-tercerizados";

function leer(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

function suscribir(cb: () => void) {
  window.addEventListener(EVENTO, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * "Importante" arriba de Tercerizados (tanda 2, 05/11): las piezas que se estima que van a estar listas para mandar
 * en los próximos días, para ir hablando con el proveedor. Se puede ocultar, pero queda a mano para volver a verlo.
 * Si aparece una pieza nueva, el aviso se vuelve a abrir solo.
 */
export function AvisoProximos({ proximos }: { proximos: ProximoTercerizado[] }) {
  const firma = proximos.map((p) => p.clave).join("|");
  // Lo ocultado se recuerda en este navegador; sin almacenamiento, el aviso queda abierto.
  const guardada = useSyncExternalStore(suscribir, leer, () => null);
  const oculto = guardada === firma;
  const cambiar = (o: boolean) => {
    try {
      if (o) localStorage.setItem(CLAVE, firma);
      else localStorage.removeItem(CLAVE);
    } catch {
      // nada
    }
    window.dispatchEvent(new Event(EVENTO));
  };
  if (!proximos.length) return null;
  if (oculto)
    return (
      <button type="button" onClick={() => cambiar(false)} className="btn-secundario btn-sm">
        Ver lo que se viene para mandar ({proximos.length})
      </button>
    );
  const porServicio = [...proximos.reduce((m, p) => m.set(p.servicio, [...(m.get(p.servicio) ?? []), p]), new Map<string, ProximoTercerizado[]>())];
  return (
    <section className="rounded-lg border border-naranja-borde bg-naranja-tenue px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-naranja-fg">Importante: se viene para mandar</h2>
          <p className="text-xs text-foreground-muted">Fechas estimadas según el plan: para ir avisándole al proveedor.</p>
        </div>
        <button type="button" onClick={() => cambiar(true)} className="btn-texto btn-sm">
          Ocultar
        </button>
      </div>
      {porServicio.map(([servicio, ps]) => (
        <div key={servicio} className="text-sm">
          <div className="font-semibold">{servicio}</div>
          <ul className="space-y-0.5">
            {ps.map((p) => (
              <li key={p.clave}>
                Para el <strong>{p.fechaTexto}</strong>: {p.pieza} × {p.cantidad} <span className="text-foreground-muted">· {p.orden}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
