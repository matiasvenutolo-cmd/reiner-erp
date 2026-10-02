"use client";

import { actualizarTipoPiezaAction } from "@/app/actions/maestros";

/** Fabricada / comprada, con auto-submit — Release 3, docs/06-backlog-release-3.md §7. */
export function TipoPiezaSelect({ piezaId, tipoActual }: { piezaId: string; tipoActual: "fabricada" | "comprada" }) {
  return (
    // key: React 19 resetea el form tras la acción; así se rearma con el valor guardado.
    <form action={actualizarTipoPiezaAction} key={tipoActual}>
      <input type="hidden" name="piezaId" value={piezaId} />
      <select
        name="tipo"
        defaultValue={tipoActual}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="input"
      >
        <option value="fabricada">Fabricada</option>
        <option value="comprada">Sólo compra</option>
      </select>
    </form>
  );
}
