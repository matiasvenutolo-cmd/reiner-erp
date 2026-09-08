"use client";

import { actualizarCantidadAction } from "@/app/actions/ot";

export function CantidadAFabricarForm({
  otPiezaId,
  otMaquinaId,
  cantidadInicial,
}: {
  otPiezaId: string;
  otMaquinaId: string;
  cantidadInicial: number;
}) {
  return (
    <form action={actualizarCantidadAction} className="inline-flex items-center gap-1 justify-end">
      <input type="hidden" name="otPiezaId" value={otPiezaId} />
      <input type="hidden" name="otMaquinaId" value={otMaquinaId} />
      <input
        type="number"
        name="cantidad"
        min={0}
        defaultValue={cantidadInicial}
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-16 text-right border border-border rounded px-1.5 py-0.5 text-sm tabular-nums"
      />
    </form>
  );
}
