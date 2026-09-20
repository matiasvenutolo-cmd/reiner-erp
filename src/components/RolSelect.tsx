"use client";

import type { Usuario } from "@/lib/db/schema";

const ROL_LABEL: Record<string, string> = {
  operario: "Operario",
  taller: "Taller",
  ingenieria: "Ingeniería",
  direccion: "Dirección",
};

/** Select de rol que dispara el submit del form al cambiar — usado en
 * /usuarios para cambiar el rol de un usuario en un solo toque. */
export function RolSelect({ rol }: { rol: Usuario["rol"] }) {
  return (
    <select
      name="rol"
      defaultValue={rol}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="text-sm border border-border rounded-md px-1.5 py-1 bg-surface"
    >
      {Object.entries(ROL_LABEL).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
