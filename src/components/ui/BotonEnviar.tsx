"use client";

import { useFormStatus } from "react-dom";

/** Botón de envío que avisa mientras trabaja, para operaciones que tardan unos segundos (confirmar una orden). */
export function BotonEnviar({
  children,
  enviando,
  className = "btn",
  disabled,
  name,
  value,
}: {
  children: React.ReactNode;
  enviando: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending, data } = useFormStatus();
  // Con varios botones en el mismo formulario, sólo el que se tocó dice "enviando".
  const esEste = !name || data?.get(name) === value;
  return (
    <button type="submit" className={className} disabled={disabled || pending} aria-busy={pending} name={name} value={value}>
      {pending && esEste ? enviando : children}
    </button>
  );
}
