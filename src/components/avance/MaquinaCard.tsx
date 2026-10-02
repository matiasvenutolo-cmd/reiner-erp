"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { EstadoBadge } from "@/components/EstadoBadge";
import type { EstadoCalculado } from "@/lib/data/ot";

const COLOR_SECCION: Record<EstadoCalculado, string> = {
  pendiente: "bg-surface-muted",
  en_curso: "bg-accent",
  terminada: "bg-brand-teal",
};

export type SeccionResumen = {
  otConjuntoId: string;
  nombre: string;
  total: number;
  terminadas: number;
  estado: EstadoCalculado;
};

/**
 * Tarjeta de una OT en /avance — sólo lectura: Avance es el tablero de
 * seguimiento; cambiar cosas (enviar a producción, cantidades, piezas
 * sueltas) se hace en la OT. Clic en la tarjeta → la OT; clic en un bloque de
 * "Por sección" → esa sección dentro de la OT.
 */
export function MaquinaCard({
  otId,
  codigo,
  subtitulo,
  estadoCalculado,
  pct,
  piezasTerminadas,
  totalPiezasAFabricar,
  plazoEntrega,
  secciones,
}: {
  otId: string;
  codigo: string;
  subtitulo?: string;
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
          <div className="text-xs text-foreground-muted">{subtitulo}</div>
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

      {secciones.length > 1 && (
        <div>
          <div className="text-xs text-foreground-muted mb-1">Por sección (conjunto)</div>
          <div className="flex flex-wrap gap-1">
            {secciones.map((s) => (
              <Link
                key={s.otConjuntoId}
                href={`/ot/${otId}#seccion-${s.otConjuntoId}`}
                title={`${s.nombre}: ${s.terminadas}/${s.total} piezas terminadas`}
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
