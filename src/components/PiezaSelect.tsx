"use client";

import { useRouter } from "next/navigation";

/** Elegir una pieza de un listado completo en vez de escribir — pedido de
 * Matías: "podríamos poner un seleccionable de todo lo que se puede
 * buscar". Navega con el código elegido como query de búsqueda, misma
 * pantalla de resultados que si se hubiera escrito a mano. */
export function PiezaSelect({ basePath, piezas }: { basePath: string; piezas: { codigo: string; nombre: string }[] }) {
  const router = useRouter();

  return (
    <select
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) router.push(`${basePath}?q=${encodeURIComponent(e.target.value)}`);
      }}
      className="input"
    >
      <option value="" disabled>
        …o elegí una pieza de la lista
      </option>
      {piezas.map((p) => (
        <option key={p.codigo} value={p.codigo}>
          {p.codigo} — {p.nombre}
        </option>
      ))}
    </select>
  );
}
