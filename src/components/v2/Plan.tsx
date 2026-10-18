import type { Nivel, EstadoTarea } from "@/lib/planning/motor";

/** Color de holgura (especificación): rojo atrasada, naranja urgente, verde en plazo, gris futura. */
export const NIVEL: Record<Nivel, { label: string; chip: string; borde: string; punto: string }> = {
  atrasada: { label: "Atrasada", chip: "bg-[#fde2e2] text-[#991b1b]", borde: "border-l-[#dc2626]", punto: "bg-[#dc2626]" },
  urgente: { label: "Urgente", chip: "bg-[#ffedd5] text-[#9a3412]", borde: "border-l-[#ea580c]", punto: "bg-[#ea580c]" },
  en_plazo: { label: "En plazo", chip: "bg-[#d9f0ea] text-[#00755d]", borde: "border-l-[#16a34a]", punto: "bg-[#16a34a]" },
  futura: { label: "Futura", chip: "bg-surface-muted text-foreground-muted", borde: "border-l-[#9ca3af]", punto: "bg-[#9ca3af]" },
};

export function Holgura({ nivel, dias, corto }: { nivel: Nivel; dias: number; corto?: boolean }) {
  const n = NIVEL[nivel];
  const texto = dias < 0 ? `${-dias} día${dias === -1 ? "" : "s"} tarde` : dias === 0 ? "vence hoy" : `${dias} día${dias === 1 ? "" : "s"} de margen`;
  return (
    <span className={`badge-estado ${n.chip}`} title={`${n.label}: ${texto}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${n.punto}`} />
      {corto ? texto : `${n.label} · ${texto}`}
    </span>
  );
}

const ESTADO: Record<EstadoTarea, [string, string]> = {
  futura: ["Futura", "badge-pendiente"],
  liberada: ["Liberada", "bg-accent-soft text-accent"],
  lista: ["Lista para hacer", "badge-terminada"],
  en_curso: ["En curso", "badge-en_curso"],
  pausada: ["Pausada", "badge-en_curso"],
  terminada: ["Terminada", "badge-terminada"],
  trabada: ["Trabada", "badge-alerta"],
};

export function EstadoTareaChip({ estado }: { estado: EstadoTarea }) {
  const [l, c] = ESTADO[estado];
  return <span className={`badge-estado ${c}`}>{l}</span>;
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
/** "2026-10-20" → "mar 20/10". */
export function fechaCorta(f: string | null | undefined): string {
  if (!f) return "—";
  const d = new Date(`${f}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${f.slice(8, 10)}/${f.slice(5, 7)}`;
}

export function Estimado({ pct }: { pct: number }) {
  if (pct <= 0) return null;
  return (
    <span className="text-xs text-foreground-muted" title="Los tiempos que todavía no cargó REINER salen de la tabla de estimados; se ajustan desde Admin.">
      Plan calculado con {pct}% de tiempos estimados
    </span>
  );
}
