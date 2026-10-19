import Link from "next/link";
import { Icono } from "./Icono";
import { AvisoFlotante } from "./AvisoFlotante";

const ESTILO = {
  error: "bg-rojo-bg text-rojo-fg border-rojo-borde",
  atencion: "bg-naranja-tenue text-naranja-fg border-naranja-borde",
  ok: "bg-verde-bg text-verde-fg border-verde-borde",
  info: "bg-accent-soft text-accent-hover border-accent-borde",
} as const;
const ICONO = { error: "error", atencion: "alerta", ok: "ok", info: "info" } as const;

/**
 * Mensaje que explica qué pasó o qué falta — mismo formato en todas las pantallas.
 * El de "ok" (después de una acción) es un aviso breve abajo que desaparece solo (§4.7).
 */
export function Aviso({ tipo = "info", children }: { tipo?: keyof typeof ESTILO; children: React.ReactNode }) {
  if (tipo === "ok") return <AvisoFlotante>{children}</AvisoFlotante>;
  return (
    <div role={tipo === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm mb-4 ${ESTILO[tipo]}`}>
      <Icono nombre={ICONO[tipo]} className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Estado vacío (§4.7): una línea con ícono verde ("Nada trabado"), no un bloque
 * grande. Si el vacío pide una acción, va el botón al lado.
 */
export function Vacio({ children, accion, neutro }: { children: React.ReactNode; accion?: React.ReactNode; neutro?: boolean }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm py-1 ${neutro ? "text-foreground-muted" : "text-verde-fg"}`}>
      <Icono nombre={neutro ? "info" : "okCirculo"} className="w-4 h-4 shrink-0" />
      <span>{children}</span>
      {accion}
    </p>
  );
}

/**
 * Sugerencia del sistema (§2.7): fondo suave, ícono de idea y el botón que la
 * resuelve. El mismo estilo en todas las pantallas.
 */
export function Sugerencia({ children, accion, href }: { children: React.ReactNode; accion?: string; href?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-accent-borde bg-accent-soft px-3 py-2.5 text-sm text-accent-hover">
      <Icono nombre="idea" className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0">{children}</span>
      {accion && href && (
        <Link href={href} className="btn-texto btn-sm">
          {accion} →
        </Link>
      )}
    </div>
  );
}
