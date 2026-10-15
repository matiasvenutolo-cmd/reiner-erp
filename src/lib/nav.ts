import type { Usuario } from "@/lib/db/schema";

export const HOME_POR_ROL: Record<Usuario["rol"], string> = {
  operario: "/taller",
  taller: "/inicio",
  ingenieria: "/inicio",
  direccion: "/inicio",
  compras: "/compras",
};

export const ROL_LABEL: Record<Usuario["rol"], string> = {
  operario: "Operario",
  taller: "Taller",
  ingenieria: "Ingeniería",
  direccion: "Dirección",
  compras: "Compras",
};

export type GrupoNav = "produccion" | "materiales" | "seguimiento" | "admin";

export const GRUPO_LABEL: Record<GrupoNav, string> = {
  produccion: "Producción",
  materiales: "Materiales",
  seguimiento: "Seguimiento",
  admin: "Administración",
};

export type ItemNav = { href: string; label: string; grupo?: GrupoNav; ayuda?: string };

type NavEntry = ItemNav & {
  roles: Usuario["rol"][];
  /** false = no tiene ítem propio en el menú: se llega por una pestaña de `dentroDe`. Igual habilita la ruta. */
  enMenu?: boolean;
  /** Ítem del menú que queda marcado al estar en esta ruta. */
  dentroDe?: string;
};

const STAFF: Usuario["rol"][] = ["direccion", "ingenieria", "taller"];
const COMPRAS: Usuario["rol"][] = ["compras"];

/**
 * Estructura de navegación única. Un solo array gobierna menú y permisos: el
 * rol sólo filtra qué ve (pedido del cliente en Release 3: "todos los perfiles
 * deberían tener una estructura de navegación similar y consistente").
 *
 * Fase 3.2 (rediseño de usabilidad): el menú se ordena por área de trabajo y
 * las vistas que miran lo mismo desde otro ángulo pasan a ser pestañas de una
 * sola sección — Avance y "todas las piezas" dentro de Órdenes de trabajo,
 * las colas por centro dentro de Planificación, Compras de producción dentro
 * de Stock, Remitos dentro de Tercerizados. Las rutas y los roles de cada una
 * no cambiaron (`enMenu: false` sigue habilitando la ruta), así que los
 * permisos son exactamente los mismos que antes.
 */
const NAV_ITEMS: NavEntry[] = [
  { href: "/inicio", label: "Inicio", roles: STAFF, ayuda: "Lo que hay que atender hoy" },

  { href: "/ot", label: "Órdenes de trabajo", roles: STAFF, grupo: "produccion", ayuda: "Generar órdenes y seguir cada pieza" },
  { href: "/avance", label: "Avance de máquinas", roles: STAFF, grupo: "produccion", enMenu: false, dentroDe: "/ot" },
  { href: "/planificacion", label: "Planificación", roles: STAFF, grupo: "produccion", ayuda: "Quién hace qué y cuándo" },
  { href: "/centros-trabajo", label: "Colas por centro", roles: STAFF, grupo: "produccion", enMenu: false, dentroDe: "/planificacion" },

  { href: "/stock", label: "Stock", roles: STAFF, grupo: "materiales", ayuda: "Almacén, fabricación y compras de producción" },
  { href: "/tercerizados", label: "Tercerizados", roles: STAFF, grupo: "materiales", ayuda: "Mandar piezas afuera y registrar la vuelta" },
  { href: "/compras", label: "Compras", roles: COMPRAS, grupo: "materiales", ayuda: "Solicitudes, cotizaciones y gastos" },

  { href: "/indicadores", label: "Indicadores", roles: STAFF, grupo: "seguimiento", ayuda: "Tiempos, paradas y rechazos" },

  { href: "/maestros", label: "Piezas y hojas de ruta", roles: STAFF, grupo: "admin", ayuda: "Maestros de máquinas, conjuntos y piezas" },
  { href: "/operaciones", label: "Operaciones y centros", roles: STAFF, grupo: "admin" },
  { href: "/proveedores", label: "Proveedores", roles: [...STAFF, ...COMPRAS], grupo: "admin" },
  { href: "/usuarios", label: "Usuarios", roles: STAFF, grupo: "admin" },

  { href: "/taller", label: "Mi trabajo", roles: ["operario"] },
];

export type SeccionNav = { grupo: GrupoNav | null; items: ItemNav[] };

/** Menú del rol, agrupado por área en el orden de NAV_ITEMS. */
export function getMenu(rol: Usuario["rol"]): SeccionNav[] {
  const secciones: SeccionNav[] = [];
  for (const item of NAV_ITEMS) {
    if (!item.roles.includes(rol) || item.enMenu === false) continue;
    const grupo = item.grupo ?? null;
    let seccion = secciones.find((s) => s.grupo === grupo);
    if (!seccion) secciones.push((seccion = { grupo, items: [] }));
    seccion.items.push({ href: item.href, label: item.label, grupo: item.grupo, ayuda: item.ayuda });
  }
  return secciones;
}

/** Ítem del menú que corresponde a una ruta (las pestañas marcan a su sección). */
export function itemDelMenu(pathname: string): string | null {
  const entrada = NAV_ITEMS.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  if (!entrada) return pathname.startsWith("/remitos") ? "/tercerizados" : null;
  return entrada.dentroDe ?? entrada.href;
}

/** Rutas accesibles por rol para el control de acceso real en proxy.ts (ver
 * docs/05-backlog-release-2.md §6) — antes cualquier rol podía entrar a
 * cualquier URL a mano, la navegación era sólo wayfinding. Se deriva de
 * NAV_ITEMS por prefijo, así una sola lista gobierna menú y autorización. */
export function rutaPermitida(rol: Usuario["rol"], pathname: string): boolean {
  if (pathname === "/" || pathname === "/login") return true;

  // Release 3: Remitos se fusionó con Tercerizados (antes "Logística") en el
  // menú (docs/06-backlog-release-3.md §12), pero /remitos sigue existiendo
  // como historial + vista imprimible — accesible para todo el que ya puede
  // entrar a Tercerizados, aunque no tenga su propio ítem de menú.
  if (STAFF.includes(rol) && /^\/remitos(\/|$)/.test(pathname)) return true;

  return NAV_ITEMS.filter((item) => item.roles.includes(rol)).some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
}
