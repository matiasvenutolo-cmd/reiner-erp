"use client";

import { Icono } from "@/components/ui/Icono";

/** Errores en lenguaje de la planta y con qué hacer (§4.7), nunca códigos técnicos. */
export default function ErrorPantalla({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="tarjeta max-w-lg mx-auto mt-10 p-6 text-center space-y-3">
      <Icono nombre="error" className="w-8 h-8 mx-auto text-rojo" />
      <h1 className="text-lg font-semibold">No se pudo abrir esta pantalla</h1>
      <p className="text-sm text-foreground-muted">Revisá la conexión y probá de nuevo. Si vuelve a pasar, avisale a quien administra el sistema.</p>
      <button type="button" onClick={reset} className="btn">
        Probar de nuevo
      </button>
    </div>
  );
}
