"use client";

import { useState } from "react";

/** Formulario que atenúa y tacha al instante lo que se mandó (§2.5), mientras el servidor confirma. */
export function FormAtenuar({ action, children, className = "" }: { action: (fd: FormData) => void | Promise<void>; children: React.ReactNode; className?: string }) {
  const [enviado, setEnviado] = useState(false);
  return (
    <form action={action} onSubmit={() => setEnviado(true)} className={`${className} ${enviado ? "opacity-50 [&_.linea]:line-through pointer-events-none" : ""}`}>
      {children}
    </form>
  );
}
