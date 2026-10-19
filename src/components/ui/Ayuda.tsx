"use client";

import { useState, useSyncExternalStore } from "react";
import { Icono } from "./Icono";

const leer = (clave: string) => () => {
  try {
    return localStorage.getItem(clave) === "1";
  } catch {
    return false;
  }
};

/**
 * Texto de ayuda de la pantalla (§4.6): se muestra la primera vez y después
 * queda colapsado en un ícono de información, para no leer lo mismo todos los días.
 */
export function Ayuda({ clave, children }: { clave: string; children: React.ReactNode }) {
  const k = `ayuda-vista:${clave}`;
  const vista = useSyncExternalStore(() => () => {}, leer(k), () => false);
  const [abierta, setAbierta] = useState<boolean | null>(null);
  const mostrar = abierta ?? !vista;
  const marcar = () => {
    try {
      localStorage.setItem(k, "1");
    } catch {}
  };
  if (!mostrar)
    return (
      <button type="button" onClick={() => setAbierta(true)} className="mt-1 inline-flex items-center gap-1 text-xs text-foreground-muted hover:text-accent" aria-label="Ver la ayuda de esta pantalla">
        <Icono nombre="info" className="w-3.5 h-3.5" /> ¿Qué es esta pantalla?
      </button>
    );
  return (
    <p className="text-sm text-foreground-muted mt-1 max-w-3xl">
      {children}{" "}
      <button
        type="button"
        onClick={() => {
          marcar();
          setAbierta(false);
        }}
        className="text-xs text-accent hover:underline whitespace-nowrap"
      >
        Entendido
      </button>
    </p>
  );
}
