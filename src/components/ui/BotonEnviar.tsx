"use client";

import { useFormStatus } from "react-dom";

/** Botón de envío que avisa mientras trabaja, para operaciones que tardan unos segundos (confirmar una orden). */
export function BotonEnviar({ children, enviando, className = "btn", disabled }: { children: React.ReactNode; enviando: string; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={disabled || pending} aria-busy={pending}>
      {pending ? enviando : children}
    </button>
  );
}
