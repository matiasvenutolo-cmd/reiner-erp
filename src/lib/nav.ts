import type { Usuario } from "@/lib/db/schema";

export const HOME_POR_ROL: Record<Usuario["rol"], string> = {
  operario: "/taller",
  taller: "/avance",
  ingenieria: "/maestros",
  direccion: "/avance",
};

export type ItemNav = { href: string; label: string };

export const NAV_POR_ROL: Record<Usuario["rol"], ItemNav[]> = {
  direccion: [
    { href: "/avance", label: "Avance" },
    { href: "/indicadores", label: "Indicadores" },
    { href: "/centros-trabajo", label: "Centros de trabajo" },
    { href: "/ot", label: "Órdenes de trabajo" },
    { href: "/revision", label: "Revisión" },
    { href: "/stock", label: "Stock" },
    { href: "/logistica", label: "Logística" },
    { href: "/remitos", label: "Remitos" },
    { href: "/maestros", label: "Maestros" },
    { href: "/usuarios", label: "Usuarios" },
  ],
  ingenieria: [
    { href: "/maestros", label: "Maestros" },
    { href: "/ot", label: "Órdenes de trabajo" },
    { href: "/revision", label: "Revisión" },
    { href: "/stock", label: "Stock" },
    { href: "/logistica", label: "Logística" },
    { href: "/remitos", label: "Remitos" },
    { href: "/avance", label: "Avance" },
    { href: "/indicadores", label: "Indicadores" },
    { href: "/centros-trabajo", label: "Centros de trabajo" },
    { href: "/usuarios", label: "Usuarios" },
  ],
  taller: [
    { href: "/avance", label: "Avance" },
    { href: "/indicadores", label: "Indicadores" },
    { href: "/centros-trabajo", label: "Centros de trabajo" },
    { href: "/ot", label: "Órdenes de trabajo" },
    { href: "/revision", label: "Revisión" },
    { href: "/stock", label: "Stock" },
    { href: "/logistica", label: "Logística" },
    { href: "/remitos", label: "Remitos" },
    { href: "/usuarios", label: "Usuarios" },
  ],
  operario: [{ href: "/taller", label: "Mi trabajo" }],
};

/** Rutas accesibles por rol para el control de acceso real en proxy.ts (ver
 * docs/05-backlog-release-2.md §6) — antes cualquier rol podía entrar a
 * cualquier URL a mano, la navegación era sólo wayfinding. Se deriva de
 * NAV_POR_ROL por prefijo, así una sola lista gobierna menú y autorización. */
export function rutaPermitida(rol: Usuario["rol"], pathname: string): boolean {
  if (pathname === "/" || pathname === "/login") return true;
  return NAV_POR_ROL[rol].some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
