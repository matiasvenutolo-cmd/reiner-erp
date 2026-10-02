"use client";

import { asignarTipoOperacionAction } from "@/app/actions/operaciones";

/** Dónde se hace por defecto un tipo de operación — auto-submit. */
export function DestinoOperacionSelect({
  procesoId,
  valor,
  centros,
}: {
  procesoId: string;
  valor: string;
  centros: { id: string; nombre: string }[];
}) {
  return (
    // key: React 19 resetea el form tras la acción; así se rearma con el valor guardado.
    <form action={asignarTipoOperacionAction} key={valor}>
      <input type="hidden" name="procesoId" value={procesoId} />
      <select
        name="destino"
        defaultValue={valor}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`input text-sm py-1 w-auto ${valor === "" ? "border-amber-400 text-amber-800" : ""}`}
      >
        <option value="">Asignar centro de trabajo…</option>
        <optgroup label="Centros de trabajo">
          {centros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </optgroup>
        <option value="tercerizado">Tercerizado (va a Tercerizados)</option>
      </select>
    </form>
  );
}
