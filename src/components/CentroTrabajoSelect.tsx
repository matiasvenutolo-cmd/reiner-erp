"use client";

import { useState } from "react";
import { asignarCentroTrabajoAction } from "@/app/actions/produccion";
import type { CentroTrabajo } from "@/lib/db/schema";

/**
 * Centros de trabajo de un operario — de varios a varios (Release 3, 2ª
 * ronda de devolución de Fase 2: "un operario puede ocupar dos puestos, un
 * puesto de trabajo puede ser ocupado por dos operarios también"). Antes un
 * `<select>` de uno solo; ahora una lista de checkboxes compacta detrás de
 * un `<details>` para no romper el ancho de la fila en /usuarios. Cada
 * click llama a la acción directo con la lista completa ya actualizada, sin
 * depender de que el DOM de los hidden inputs se sincronice a tiempo con un
 * `requestSubmit()`.
 */
export function CentroTrabajoSelect({
  usuarioId,
  centros,
  centroTrabajoIds,
}: {
  usuarioId: string;
  centros: CentroTrabajo[];
  centroTrabajoIds: string[];
}) {
  const [seleccionados, setSeleccionados] = useState(new Set(centroTrabajoIds));

  async function toggle(id: string) {
    const siguiente = new Set(seleccionados);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    setSeleccionados(siguiente);

    const formData = new FormData();
    formData.set("usuarioId", usuarioId);
    for (const centroId of siguiente) formData.append("centroTrabajoId", centroId);
    await asignarCentroTrabajoAction(formData);
  }

  const resumen = seleccionados.size === 0 ? "Sin asignar (ve todo)" : `${seleccionados.size} centro${seleccionados.size === 1 ? "" : "s"}`;

  return (
    <details className="text-sm">
      <summary className="cursor-pointer border border-border rounded-md px-1.5 py-1 bg-surface-muted max-w-[11rem] truncate list-none">
        {resumen}
      </summary>
      <div className="mt-1 bg-surface-muted rounded-md p-2 space-y-1 max-h-40 overflow-y-auto w-48">
        {centros.map((c) => (
          <label key={c.id} className="flex items-center gap-1.5 text-xs hover:bg-surface rounded px-1 py-0.5 cursor-pointer">
            <input type="checkbox" checked={seleccionados.has(c.id)} onChange={() => toggle(c.id)} />
            {c.nombre}
          </label>
        ))}
      </div>
    </details>
  );
}
