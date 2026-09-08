import type { EstadoCalculado } from "@/lib/data/ot";

const LABEL: Record<EstadoCalculado, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  terminada: "Terminada",
};

export function EstadoBadge({ estado, sinRouting }: { estado: EstadoCalculado; sinRouting?: boolean }) {
  if (sinRouting) {
    return <span className="badge-estado badge-alerta">Sin hoja de ruta</span>;
  }
  return <span className={`badge-estado badge-${estado}`}>{LABEL[estado]}</span>;
}
