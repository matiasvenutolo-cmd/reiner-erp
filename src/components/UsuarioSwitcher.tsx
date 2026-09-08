"use client";

import type { Usuario } from "@/lib/db/schema";

const ROL_LABEL: Record<string, string> = {
  operario: "Operario",
  taller: "Taller",
  ingenieria: "Ingeniería",
  direccion: "Dirección",
};

export function UsuarioSwitcher({ usuarios, usuarioId }: { usuarios: Usuario[]; usuarioId: string }) {
  return (
    <select
      name="usuarioId"
      defaultValue={usuarioId}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="text-sm border border-border rounded-md px-2 py-1.5 bg-surface"
    >
      {usuarios.map((u) => (
        <option key={u.id} value={u.id}>
          {u.nombre} — {ROL_LABEL[u.rol]}
        </option>
      ))}
    </select>
  );
}
