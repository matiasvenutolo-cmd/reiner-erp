"use client";

import { useState } from "react";
import { ConjuntoAccordion, type ConjuntoData } from "./ConjuntoAccordion";

/** `lanzada` (reunión 20/11): con la orden ya confirmada, "A fabricar" no se edita; para sumar, + Pieza suelta. */
export function ConjuntosView({ otMaquinaId, conjuntos, lanzada }: { otMaquinaId: string; conjuntos: ConjuntoData[]; lanzada: boolean }) {
  const [ocultarTerminadas, setOcultarTerminadas] = useState(false);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-foreground-muted">
        <input
          type="checkbox"
          checked={ocultarTerminadas}
          onChange={(e) => setOcultarTerminadas(e.target.checked)}
          className="rounded border-border"
        />
        Ocultar piezas terminadas
      </label>
      <div className="space-y-4">
        {conjuntos.map((c) => (
          <ConjuntoAccordion key={c.otConjuntoId} otMaquinaId={otMaquinaId} conjunto={c} ocultarTerminadas={ocultarTerminadas} lanzada={lanzada} />
        ))}
      </div>
    </div>
  );
}
