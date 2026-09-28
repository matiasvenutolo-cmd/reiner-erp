"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Filtros de conjunto / máquina / tipo para los listados de Stock —
 * devolución del cliente (docs/06-backlog-release-3.md): "el listado de
 * piezas es difícil de visualizar... poder filtrar por conjunto y/o máquina
 * al que se aplica, y por si es una pieza comprada o que ya se fabricó".
 * Cada select actualiza su propio query param sin pisar los otros.
 */
export function FiltrosStock({
  conjuntos,
  configuraciones,
}: {
  conjuntos: { id: string; nombre: string }[];
  configuraciones: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function actualizar(clave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    router.push(params.size ? `${pathname}?${params.toString()}` : pathname);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <select
        className="input text-sm"
        value={searchParams.get("conjunto") ?? ""}
        onChange={(e) => actualizar("conjunto", e.target.value)}
      >
        <option value="">Todos los conjuntos</option>
        {conjuntos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <select
        className="input text-sm"
        value={searchParams.get("maquina") ?? ""}
        onChange={(e) => actualizar("maquina", e.target.value)}
      >
        <option value="">Todas las máquinas</option>
        {configuraciones.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <select className="input text-sm" value={searchParams.get("tipo") ?? ""} onChange={(e) => actualizar("tipo", e.target.value)}>
        <option value="">Compradas y fabricadas</option>
        <option value="fabricada">Sólo fabricadas</option>
        <option value="comprada">Sólo compradas</option>
      </select>
    </div>
  );
}
