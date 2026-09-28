"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { EstadoBadge } from "@/components/EstadoBadge";
import type { EstadoCalculado } from "@/lib/data/ot";

const COLOR_SECCION: Record<EstadoCalculado, string> = {
  pendiente: "bg-surface-muted",
  en_curso: "bg-accent",
  terminada: "bg-brand-teal",
};

export type SeccionResumen = { otConjuntoId: string; nombre: string; total: number; terminadas: number; estado: EstadoCalculado };

/**
 * Tarjeta de una OT de máquina en /avance — pedido de Matías (docs/06-
 * backlog-release-3.md): la tarjeta entera tiene que llevar a la OT con un
 * solo clic, no sólo el código. Es un componente cliente (no un <Link> que
 * envuelve todo) porque los bloques de "Por sección" necesitan su propio
 * destino (#seccion-X) sin disparar también la navegación de la tarjeta —
 * cada bloque corta la propagación del clic antes de navegar a su ancla.
 */
export function MaquinaCard({
  otId,
  codigo,
  configuracionNombre,
  estadoCalculado,
  pct,
  piezasTerminadas,
  totalPiezasAFabricar,
  plazoEntrega,
  secciones,
}: {
  otId: string;
  codigo: string;
  configuracionNombre?: string;
  estadoCalculado: EstadoCalculado;
  pct: number;
  piezasTerminadas: number;
  totalPiezasAFabricar: number;
  plazoEntrega: string | null;
  secciones: SeccionResumen[];
}) {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push(`/ot/${otId}`)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/ot/${otId}`)}
      className="bg-surface border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:border-accent transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold font-mono text-sm">{codigo}</div>
          <div className="text-xs text-foreground-muted">{configuracionNombre}</div>
        </div>
        <EstadoBadge estado={estadoCalculado} />
      </div>

      <div>
        <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-foreground-muted mt-1.5 tabular-nums">
          {piezasTerminadas} / {totalPiezasAFabricar} piezas terminadas
          {plazoEntrega ? ` · plazo: ${plazoEntrega}` : ""}
        </div>
      </div>

      {secciones.length > 0 && (
        <div>
          <div className="text-xs text-foreground-muted mb-1">Por sección</div>
          <div className="flex flex-wrap gap-1">
            {secciones.map((s) => (
              <Link
                key={s.otConjuntoId}
                href={`/ot/${otId}#seccion-${s.otConjuntoId}`}
                title={`${s.nombre}: ${s.terminadas}/${s.total} piezas`}
                onClick={(e) => e.stopPropagation()}
                className={`h-5 w-4 rounded-sm ${COLOR_SECCION[s.estado]} hover:opacity-75 hover:ring-2 hover:ring-accent transition`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
