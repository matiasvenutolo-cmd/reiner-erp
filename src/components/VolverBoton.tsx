"use client";

import { useRouter } from "next/navigation";

/** "Volver" que usa el historial del navegador en vez de un destino fijo —
 * pensado para /taller/[otPiezaId], que ahora abre gente que no vino de
 * /taller (ingeniería/dirección/taller llegan desde /ot, ver
 * docs/05-backlog-release-2.md §9). Un link fijo a /taller los mandaría a
 * una ruta que no tienen permitida. */
export function VolverBoton({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.back()} className={className}>
      {children}
    </button>
  );
}
