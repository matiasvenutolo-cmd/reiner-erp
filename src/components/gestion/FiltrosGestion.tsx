"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** Filtros de Gestión (§3.1): centro, operario, orden y "Solo sin asignar". Se aplican al elegir. */
export function FiltrosGestion({ centros, operarios, ordenes }: { centros: { id: string; nombre: string }[]; operarios: { id: string; nombre: string }[]; ordenes: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const poner = (k: string, v: string) => {
    const q = new URLSearchParams(sp.toString());
    if (v) q.set(k, v);
    else q.delete(k);
    router.push(`/gestion${q.size ? `?${q}` : ""}`);
  };
  const sel = (k: string, label: string, items: { id: string; nombre: string }[]) => (
    <select value={sp.get(k) ?? ""} onChange={(e) => poner(k, e.target.value)} className="input py-1.5 w-auto" aria-label={label}>
      <option value="">{label}: todos</option>
      {items.map((x) => (
        <option key={x.id} value={x.id}>
          {x.nombre}
        </option>
      ))}
    </select>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {sel("centro", "Centro", centros)}
      {sel("operario", "Operario", operarios)}
      {sel("orden", "Orden", ordenes)}
      <label className="inline-flex items-center gap-1.5 cursor-pointer">
        <input type="checkbox" checked={sp.get("sin") === "1"} onChange={(e) => poner("sin", e.target.checked ? "1" : "")} />
        Solo sin asignar
      </label>
      {sp.size > 0 && (
        <button className="btn-texto btn-sm" onClick={() => router.push("/gestion")}>
          Ver todas
        </button>
      )}
    </div>
  );
}
