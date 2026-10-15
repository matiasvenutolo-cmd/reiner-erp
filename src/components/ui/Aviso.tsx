import { Icono } from "./Icono";

const ESTILO = {
  error: "bg-[var(--estado-alerta-bg)] text-[var(--estado-alerta-fg)] border-[#f3c4c4]",
  atencion: "bg-[var(--estado-en-curso-bg)] text-[var(--estado-en-curso-fg)] border-[#f5dfa0]",
  ok: "bg-[var(--estado-terminada-bg)] text-[var(--estado-terminada-fg)] border-[#b9e2d7]",
  info: "bg-accent-soft text-[var(--accent-hover)] border-[#c5e3ef]",
} as const;
const ICONO = { error: "alerta", atencion: "alerta", ok: "ok", info: "reloj" } as const;

/** Mensaje que explica qué pasó o qué falta — mismo formato en todas las pantallas. */
export function Aviso({ tipo = "info", children }: { tipo?: keyof typeof ESTILO; children: React.ReactNode }) {
  return (
    <div role={tipo === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm mb-4 ${ESTILO[tipo]}`}>
      <Icono nombre={ICONO[tipo]} className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Estado vacío con la siguiente acción posible, en vez de una tabla en blanco. */
export function Vacio({ children, accion }: { children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <div className="tarjeta px-4 py-6 text-center text-sm text-foreground-muted">
      <p>{children}</p>
      {accion && <div className="mt-3">{accion}</div>}
    </div>
  );
}
