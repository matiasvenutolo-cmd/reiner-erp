"use client";

import { useState } from "react";
import { Icono } from "./Icono";

/**
 * Texto de ayuda de la pantalla (simplificación §4.4): oculto por defecto,
 * disponible en un ícono de información junto al título. Si una pantalla
 * necesita un párrafo para entenderse, hay que simplificar la pantalla.
 */
export function Ayuda({ titulo, children }: { titulo: React.ReactNode; children: React.ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight flex flex-wrap items-center gap-2">
        {titulo}
        <button
          type="button"
          onClick={() => setAbierta((a) => !a)}
          aria-expanded={abierta}
          aria-label="¿Qué es esta pantalla?"
          title="¿Qué es esta pantalla?"
          className={`rounded-full p-1 ${abierta ? "text-accent bg-accent-soft" : "text-foreground-muted hover:text-accent"}`}
        >
          <Icono nombre="info" className="w-4 h-4" />
        </button>
      </h1>
      {abierta && <p className="text-sm text-foreground-muted mt-1 max-w-3xl">{children}</p>}
    </>
  );
}
