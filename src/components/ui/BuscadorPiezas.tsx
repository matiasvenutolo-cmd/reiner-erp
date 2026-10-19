"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icono } from "./Icono";
import { normalizarBusqueda } from "@/lib/formato";

/**
 * Buscador con autocompletado (§2.6 y §4.4): busca por código o por nombre a
 * medida que se escribe, sin importar mayúsculas ni acentos. Reemplaza los
 * selectores de cientos de piezas.
 */
export function BuscadorPiezas({ piezas, destino, placeholder = "Buscar una pieza por código o nombre…" }: { piezas: { codigo: string; nombre: string }[]; destino: string; placeholder?: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [activo, setActivo] = useState(0);
  const indice = useMemo(() => piezas.map((p) => ({ ...p, clave: normalizarBusqueda(`${p.codigo} ${p.nombre}`) })), [piezas]);
  const q = normalizarBusqueda(texto);
  const resultados = q.length < 2 ? [] : indice.filter((p) => q.split(/\s+/).every((w) => p.clave.includes(w))).slice(0, 8);
  const ir = (codigo: string) => router.push(`${destino}${encodeURIComponent(codigo)}`);
  return (
    <div className="relative max-w-lg">
      <Icono nombre="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
      <input
        type="search"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setActivo(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActivo((a) => Math.min(a + 1, resultados.length - 1));
          if (e.key === "ArrowUp") setActivo((a) => Math.max(a - 1, 0));
          if (e.key === "Enter" && resultados[activo]) {
            e.preventDefault();
            ir(resultados[activo].codigo);
          }
        }}
        placeholder={placeholder}
        className="input pl-9"
        aria-label={placeholder}
        role="combobox"
        aria-expanded={resultados.length > 0}
        aria-controls="buscador-piezas-lista"
      />
      {resultados.length > 0 && (
        <ul id="buscador-piezas-lista" className="absolute z-30 mt-1 w-full tarjeta py-1 max-h-80 overflow-y-auto" role="listbox">
          {resultados.map((p, i) => (
            <li key={p.codigo} role="option" aria-selected={i === activo}>
              <button type="button" onMouseEnter={() => setActivo(i)} onClick={() => ir(p.codigo)} className={`w-full text-left px-3 py-2 ${i === activo ? "bg-surface-muted" : ""}`}>
                <span className="block text-sm font-medium">{p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1)}</span>
                <span className="block font-mono text-[13px] text-foreground-muted">{p.codigo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
