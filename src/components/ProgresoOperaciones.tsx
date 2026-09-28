/**
 * Cuántos pasos de la hoja de ruta ya pasó una pieza puntual — pedido de
 * Matías (docs/06-backlog-release-3.md, comentarios sobre lo pusheado):
 * "es mas valioso todo lo que se arma para cada OT que la OT en si misma".
 * Una OT de máquina no cambia seguido (2-3 al año), pero el avance real de
 * cada pieza dentro de ella sí — esto reemplaza el badge plano de estado
 * por algo que se lee de un vistazo.
 */
export function ProgresoOperaciones({
  totalOps,
  completadas,
  sinRouting,
}: {
  totalOps: number;
  completadas: number;
  sinRouting: boolean;
}) {
  if (sinRouting) {
    return <span className="badge-estado badge-alerta">Sin hoja de ruta</span>;
  }
  const terminada = completadas >= totalOps;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: totalOps }, (_, i) => (
          <span
            key={i}
            className={`block h-2 w-2 rounded-sm ${
              i < completadas ? (terminada ? "bg-brand-teal" : "bg-accent") : "bg-surface-muted border border-border"
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-foreground-muted tabular-nums">
        {completadas}/{totalOps}
      </span>
    </div>
  );
}
