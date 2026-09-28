"use client";

import { useState } from "react";
import { ConjuntoAccordion, type ConjuntoData } from "./ConjuntoAccordion";

export function ConjuntosView({ otMaquinaId, conjuntos }: { otMaquinaId: string; conjuntos: ConjuntoData[] }) {
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
          <ConjuntoAccordion key={c.otConjuntoId} otMaquinaId={otMaquinaId} conjunto={c} ocultarTerminadas={ocultarTerminadas} />
        ))}
      </div>
    </div>
  );
}
