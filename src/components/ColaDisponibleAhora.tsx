"use client";

import { useEffect, useRef, useState } from "react";
import { reordenarColaAction } from "@/app/actions/produccion";
import type { ItemCola } from "@/lib/data/produccion";

/**
 * Lista reordenable por arrastre (mouse o touch) — reemplaza las flechas de
 * subir/bajar de Release 2 (ver docs/06-backlog-release-3.md §13, pedido
 * explícito del cliente). Usa Pointer Events + `elementFromPoint` en vez del
 * drag&drop nativo de HTML5 porque este último no funciona en touch sin
 * trabajo extra — así un mismo mecanismo sirve para desktop y para el
 * celular/tablet que puede usar dirección o taller parados en el piso.
 */
export function ColaDisponibleAhora({ centroId, items }: { centroId: string; items: ItemCola[] }) {
  const [lista, setLista] = useState(items);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const listaRef = useRef(lista);
  const arrastrandoIdxRef = useRef<number | null>(null);

  useEffect(() => setLista(items), [items]);
  useEffect(() => {
    listaRef.current = lista;
  }, [lista]);

  useEffect(() => {
    if (arrastrando === null) return;

    function onMove(e: PointerEvent) {
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-ot-pieza-id]");
      const destinoId = el?.getAttribute("data-ot-pieza-id");
      const desdeIdx = arrastrandoIdxRef.current;
      if (!destinoId || desdeIdx === null) return;
      const destinoIdx = listaRef.current.findIndex((it) => it.otPieza.id === destinoId);
      if (destinoIdx === -1 || destinoIdx === desdeIdx) return;

      setLista((prev) => {
        const next = [...prev];
        const [movido] = next.splice(desdeIdx, 1);
        next.splice(destinoIdx, 0, movido);
        return next;
      });
      arrastrandoIdxRef.current = destinoIdx;
    }

    function onUp() {
      setArrastrando(null);
      arrastrandoIdxRef.current = null;
      reordenarColaAction(centroId, listaRef.current.map((it) => it.otPieza.id));
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [arrastrando, centroId]);

  function iniciar(e: React.PointerEvent, id: string, idx: number) {
    e.preventDefault();
    arrastrandoIdxRef.current = idx;
    setArrastrando(id);
  }

  return (
    <ul className="space-y-1.5">
      {lista.map((item) => (
        <li
          key={item.otPieza.id}
          data-ot-pieza-id={item.otPieza.id}
          onPointerDown={(e) => iniciar(e, item.otPieza.id, lista.indexOf(item))}
          className={`flex items-center gap-2 bg-surface-muted rounded-md px-2.5 py-2 select-none touch-none cursor-grab active:cursor-grabbing ${
            arrastrando === item.otPieza.id ? "ring-2 ring-accent opacity-70" : ""
          }`}
        >
          <span className="text-foreground-muted/70 text-sm leading-none shrink-0" aria-hidden>
            ⠿
          </span>
          <ItemColaTexto item={item} />
        </li>
      ))}
    </ul>
  );
}

function ItemColaTexto({ item }: { item: ItemCola }) {
  return (
    <div className="min-w-0">
      <div className="font-medium text-sm truncate">{item.piezaNombre}</div>
      <div className="text-xs text-foreground-muted truncate">
        {item.otMaquinaCodigo} · {item.conjuntoNombre} · op. {item.operacionSecuencia}/{item.totalOperaciones}
      </div>
    </div>
  );
}
