import { hoyISO } from "@/lib/fecha";
import type { AsignacionVigente } from "@/lib/data/planificacion";

function etiquetaFecha(fecha: string): string {
  const hoy = hoyISO();
  if (fecha === hoy) return "hoy";
  const [, m, d] = fecha.split("-");
  return `el ${d}/${m}`;
}

export function AsignacionBadge({ asignacion, className = "" }: { asignacion: AsignacionVigente; className?: string }) {
  return (
    <span className={`badge-estado badge-terminada inline-block ${className}`}>
      Asignada {etiquetaFecha(asignacion.fecha)} a {asignacion.operarioNombre}
    </span>
  );
}
