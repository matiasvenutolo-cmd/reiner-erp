import type { Usuario } from "@/lib/db/schema";

export const HOME_POR_ROL: Record<Usuario["rol"], string> = {
  operario: "/taller",
  taller: "/avance",
  ingenieria: "/avance",
  direccion: "/avance",
};

export type ItemNav = { href: string; label: string };

type NavEntry = ItemNav & { roles: Usuario["rol"][]; grupo?: "admin" };

const STAFF: Usuario["rol"][] = ["direccion", "ingenieria", "taller"];

/**
 * Estructura de navegación única para ingeniería/dirección/taller — antes
 * cada rol tenía su propio orden en un array separado. Pedido explícito del
 * cliente en la reunión de Release 3 (docs/06-backlog-release-3.md §2):
 * "todos los perfiles deberían tener una estructura de navegación similar y
 * consistente, aunque después cada uno pueda tener diferentes permisos o
 * elementos visibles". Un solo array gobierna orden + permisos: el rol sólo
 * filtra qué ve, nunca reordena.
 *
 * Maestros y Usuarios quedan marcados `grupo: "admin"` — el cliente pidió
 * explícitamente que Maestros deje de competir con las pantallas operativas
 * diarias ("no debería ser una sección de uso habitual para todos los
 * perfiles"). El layout (AppShell/Sidebar) los muestra aparte y
 * visualmente secundarios, no los saca del menú.
 */
const NAV_ITEMS: NavEntry[] = [
  { href: "/avance", label: "Avance", roles: STAFF },
  { href: "/ot", label: "Órdenes de trabajo", roles: STAFF },
  { href: "/centros-trabajo", label: "Centros de trabajo", roles: STAFF },
  { href: "/stock", label: "Stock", roles: STAFF },
  { href: "/logistica", label: "Logística", roles: STAFF },
  { href: "/remitos", label: "Remitos", roles: STAFF },
  { href: "/revision", label: "Revisión", roles: STAFF },
  { href: "/indicadores", label: "Indicadores", roles: STAFF },
  { href: "/maestros", label: "Maestros", roles: STAFF, grupo: "admin" },
  { href: "/usuarios", label: "Usuarios", roles: STAFF, grupo: "admin" },
  { href: "/taller", label: "Mi trabajo", roles: ["operario"] },
];

export function getNavPrincipal(rol: Usuario["rol"]): ItemNav[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(rol) && item.grupo !== "admin");
}

export function getNavAdmin(rol: Usuario["rol"]): ItemNav[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(rol) && item.grupo === "admin");
}

/** Rutas accesibles por rol para el control de acceso real en proxy.ts (ver
 * docs/05-backlog-release-2.md §6) — antes cualquier rol podía entrar a
 * cualquier URL a mano, la navegación era sólo wayfinding. Se deriva de
 * NAV_ITEMS por prefijo, así una sola lista gobierna menú y autorización. */
export function rutaPermitida(rol: Usuario["rol"], pathname: string): boolean {
  if (pathname === "/" || pathname === "/login") return true;

  // El botón "Abrir en taller →" de /ot/[id]/pieza/[otPiezaId] existe desde
  // Fase 1 y lleva a /taller/[otPiezaId] — quedó roto para todo el que no
  // fuera operario cuando se agregó el control de acceso real (Release 2,
  // detectado por Matías el 2026-09-25). Se habilita el detalle de UNA
  // pieza puntual para el resto de los roles; la lista /taller (la cola
  // personal del operario) sigue siendo sólo de operario — el equivalente
  // para el resto es /centros-trabajo.
  if (rol !== "operario" && /^\/taller\/[^/]+$/.test(pathname)) return true;

  return NAV_ITEMS.filter((item) => item.roles.includes(rol)).some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
}
