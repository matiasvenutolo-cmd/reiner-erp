/** Íconos de línea simples (24×24, trazo) para el menú y los accesos — sin dependencias. */
const TRAZOS: Record<string, string> = {
  inicio: "M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10",
  ot: "M9 4h6v3H9zM7 5.5H5.5A1.5 1.5 0 0 0 4 7v12.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H17M8 12h8M8 16h5",
  planificacion: "M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 10h16M8.5 3v4M15.5 3v4",
  stock: "M3.5 8 12 4l8.5 4v8L12 20l-8.5-4zM3.5 8 12 12l8.5-4M12 12v8",
  tercerizados: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  compras: "M4 5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.3h7.6a1.5 1.5 0 0 0 1.5-1.2L20 8H7M10 20.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  indicadores: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
  maestros: "M12 3 4 7.5l8 4.5 8-4.5zM4 12l8 4.5 8-4.5M4 16.5 12 21l8-4.5",
  operaciones: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3.9a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.5 7.5 0 0 0-2.6 1.5l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-.9a7.5 7.5 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.5 7.5 0 0 0 2.6-1.5l2.3.9 2-3.4z",
  proveedores: "M4 20V9l8-5 8 5v11M9 20v-6h6v6M4 20h16",
  usuarios: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6.5 6.5 0 0 1 3.5 6",
  taller: "M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.6-.6-.6-2.6z",
  flecha: "M5 12h14M13 6l6 6-6 6",
  alerta: "M12 4 2.5 20h19zM12 10v4.5M12 17.5v.5",
  ok: "M5 12.5 10 17.5 19 7",
  reloj: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
};

export function Icono({ nombre, className = "w-5 h-5" }: { nombre: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={TRAZOS[nombre] ?? TRAZOS.flecha} />
    </svg>
  );
}

/** Ícono de cada sección del menú, por su ruta. */
export const ICONO_RUTA: Record<string, string> = {
  "/inicio": "inicio",
  "/ot": "ot",
  "/planificacion": "planificacion",
  "/stock": "stock",
  "/tercerizados": "tercerizados",
  "/compras": "compras",
  "/indicadores": "indicadores",
  "/maestros": "maestros",
  "/operaciones": "operaciones",
  "/proveedores": "proveedores",
  "/usuarios": "usuarios",
  "/taller": "taller",
};
