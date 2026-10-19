"use client";

import { useState } from "react";
import { Icono } from "./Icono";

/**
 * Código de pieza u orden (§4.4): monoespaciada, chico y gris, siempre debajo
 * o al lado del nombre — nunca antes. Al pasar el mouse aparece "copiar".
 * `completo` es el código entero (se ve al pasar el mouse) cuando se muestra una versión corta.
 */
export function Codigo({ valor, completo, className = "" }: { valor: string; completo?: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <span className={`group inline-flex items-center gap-1 font-mono text-[13px] text-foreground-muted ${className}`} title={completo ?? valor}>
      {valor}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          navigator.clipboard?.writeText(completo ?? valor).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1200);
          });
        }}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-foreground-muted hover:text-accent"
        aria-label={`Copiar ${completo ?? valor}`}
      >
        <Icono nombre={copiado ? "ok" : "copiar"} className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}
