"use client";

import { actualizarCentroOperacionAction } from "@/app/actions/maestros";

/**
 * Dónde se hace este paso para ESTA pieza. Por defecto, el centro que tiene
 * su tipo de operación en Administración → Operaciones y centros; se puede
 * elegir otro sólo para esta pieza. Si el tipo de operación todavía no tiene
 * centro, lo dice en vez de inventar uno.
 */
export function CentroOperacionSelect({
  operacionId,
  piezaId,
  centroElegido,
  centroPorDefecto,
  centros,
}: {
  operacionId: string;
  piezaId: string;
  centroElegido: string | null;
  centroPorDefecto: { id: string; nombre: string } | null;
  centros: { id: string; nombre: string }[];
}) {
  const sinCentro = !centroElegido && !centroPorDefecto;
  return (
    // key: React 19 resetea el form tras la acción; así se rearma con el valor guardado.
    <form action={actualizarCentroOperacionAction} key={centroElegido ?? ""}>
      <input type="hidden" name="operacionId" value={operacionId} />
      <input type="hidden" name="piezaId" value={piezaId} />
      <select
        name="centroTrabajoId"
        defaultValue={centroElegido ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`input text-sm py-1 ${sinCentro ? "border-amber-400 text-amber-800" : ""}`}
      >
        <option value="">{centroPorDefecto ? `${centroPorDefecto.nombre} (por defecto)` : "Asignar centro de trabajo…"}</option>
        {centros
          .filter((c) => c.id !== centroPorDefecto?.id)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
      </select>
    </form>
  );
}
