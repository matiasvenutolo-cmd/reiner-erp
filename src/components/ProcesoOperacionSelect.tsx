"use client";

import { actualizarProcesoOperacionAction } from "@/app/actions/maestros";

/** Cambiar a qué proceso corresponde un paso de la hoja de ruta, con
 * auto-submit — devolución del cliente: "todos los campos de las piezas
 * deberían ser editables... hojas de ruta". */
export function ProcesoOperacionSelect({
  operacionId,
  piezaId,
  procesoIdActual,
  procesos,
}: {
  operacionId: string;
  piezaId: string;
  procesoIdActual: string;
  procesos: { id: string; nombre: string }[];
}) {
  return (
    // key: React 19 resetea el form tras la acción; así se rearma con el valor guardado.
    <form action={actualizarProcesoOperacionAction} key={procesoIdActual}>
      <input type="hidden" name="operacionId" value={operacionId} />
      <input type="hidden" name="piezaId" value={piezaId} />
      <select
        name="procesoId"
        defaultValue={procesoIdActual}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="input text-sm py-1"
      >
        {procesos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
    </form>
  );
}
