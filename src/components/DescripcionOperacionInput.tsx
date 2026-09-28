"use client";

import { actualizarDescripcionOperacionAction } from "@/app/actions/maestros";

export function DescripcionOperacionInput({
  operacionId,
  piezaId,
  procesoNombre,
  descripcionInicial,
}: {
  operacionId: string;
  piezaId: string;
  procesoNombre: string;
  descripcionInicial: string | null;
}) {
  return (
    <form action={actualizarDescripcionOperacionAction}>
      <input type="hidden" name="operacionId" value={operacionId} />
      <input type="hidden" name="piezaId" value={piezaId} />
      <input
        name="descripcion"
        defaultValue={descripcionInicial ?? ""}
        placeholder={`ej. ${procesoNombre} — Operación 1`}
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full border border-border rounded px-2 py-1 text-sm bg-surface"
      />
    </form>
  );
}
