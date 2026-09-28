import type { PasoOperacion } from "@/lib/data/ot";

/**
 * Cuántos pasos de la hoja de ruta ya pasó una pieza puntual — pedido de
 * Matías (docs/06-backlog-release-3.md, comentarios sobre lo pusheado):
 * "es mas valioso todo lo que se arma para cada OT que la OT en si misma".
 * Una OT de máquina no cambia seguido (2-3 al año), pero el avance real de
 * cada pieza dentro de ella sí — esto reemplaza el badge plano de estado
 * por algo que se lee de un vistazo. Cada segmento lleva el nombre del
 * proceso en `title` — se ve al pasar el mouse, sin clickear.
 */
export function ProgresoOperaciones({ pasos, sinRouting }: { pasos: PasoOperacion[]; sinRouting: boolean }) {
  if (sinRouting) {
    return <span className="badge-estado badge-alerta">Sin hoja de ruta</span>;
  }
  const completadas = pasos.filter((p) => p.completado).length;
  const terminada = completadas >= pasos.length;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {pasos.map((paso, i) => (
          <span
            key={i}
            title={`${paso.nombre} — ${paso.completado ? "hecho" : "pendiente"}`}
            className={`block h-2 w-2 rounded-sm cursor-default ${
              paso.completado ? (terminada ? "bg-brand-teal" : "bg-accent") : "bg-surface-muted border border-border"
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-foreground-muted tabular-nums">
        {completadas}/{pasos.length}
      </span>
    </div>
  );
}
