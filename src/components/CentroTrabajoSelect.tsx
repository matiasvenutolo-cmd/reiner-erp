"use client";

import type { CentroTrabajo } from "@/lib/db/schema";

/** Select de centro de trabajo con auto-submit — usado en /usuarios para que
 * un operario quede "parado" en un centro y así filtrar su cola en /taller
 * (docs/05-backlog-release-2.md §5). */
export function CentroTrabajoSelect({
  centros,
  centroTrabajoId,
}: {
  centros: CentroTrabajo[];
  centroTrabajoId: string | null;
}) {
  return (
    <select
      name="centroTrabajoId"
      defaultValue={centroTrabajoId ?? ""}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="text-sm border border-border rounded-md px-1.5 py-1 bg-surface max-w-[11rem]"
    >
      <option value="">Sin asignar (ve todo)</option>
      {centros.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </select>
  );
}
