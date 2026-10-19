import type { Usuario } from "@/lib/db/schema";

/**
 * Cada perfil entra a su pantalla (mejoras de usabilidad §1.1): el jefe de
 * planta al Plan de la semana, compras a Pedir esta semana, dirección a
 * ¿Llegamos?, ingeniería a Liberación de piezas. El acceso a todo lo demás
 * sigue igual: sólo cambia lo que se ve primero.
 */
export const HOME_POR_ROL: Record<Usuario["rol"], string> = {
  operario: "/taller",
  taller: "/planificacion",
  ingenieria: "/liberacion",
  direccion: "/llegamos",
  compras: "/pedir",
};

/** Áreas del menú que cada perfil ve abiertas; las demás quedan colapsadas (se abren con un toque). */
export const AREAS_DEL_ROL: Record<Usuario["rol"], GrupoNav[]> = {
  operario: [],
  taller: ["produccion"],
  ingenieria: ["ingenieria", "admin"],
  direccion: ["produccion"],
  compras: ["compras", "stock"],
};

export const ROL_LABEL: Record<Usuario["rol"], string> = {
  operario: "Operario",
  taller: "Taller",
  ingenieria: "Ingeniería",
  direccion: "Dirección",
  compras: "Compras",
};

export type GrupoNav = "produccion" | "taller" | "compras" | "stock" | "ingenieria" | "admin";

export const GRUPO_LABEL: Record<GrupoNav, string> = {
  produccion: "Producción",
  taller: "Taller",
  compras: "Compras",
  stock: "Stock",
  ingenieria: "Ingeniería",
  admin: "Admin",
};

export type ItemNav = { href: string; label: string; grupo?: GrupoNav; ayuda?: string; contador?: number };

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
  // v2 — menú por área y por frecuencia de uso: primero lo diario, al final los maestros y ADMIN.
  { href: "/inicio", label: "Hoy", roles: STAFF, ayuda: "Qué hay que hacer hoy y qué está trabado" },

  { href: "/planificacion", label: "Plan de la semana", roles: STAFF, grupo: "produccion", ayuda: "Qué se hace en cada centro esta semana" },
  { href: "/centros-trabajo", label: "Colas por centro", roles: STAFF, grupo: "produccion", enMenu: false, dentroDe: "/planificacion" },
  { href: "/proyectos", label: "Proyectos y órdenes", roles: STAFF, grupo: "produccion", ayuda: "Cada máquina con su fecha de entrega" },
  { href: "/ot", label: "Órdenes de trabajo", roles: STAFF, grupo: "produccion", enMenu: false, dentroDe: "/proyectos" },
  { href: "/tercerizados", label: "Tercerizados", roles: STAFF, grupo: "produccion", ayuda: "Para mandar, afuera y vueltas" },
  { href: "/llegamos", label: "¿Llegamos?", roles: STAFF, grupo: "produccion", ayuda: "¿Cada máquina llega a su fecha?" },
  { href: "/avance", label: "Avance de máquinas", roles: STAFF, grupo: "produccion", enMenu: false, dentroDe: "/llegamos" },
  { href: "/indicadores", label: "Indicadores", roles: STAFF, grupo: "produccion", ayuda: "Tiempos, paradas y rechazos" },

  { href: "/pedir", label: "Pedir esta semana", roles: [...STAFF, ...COMPRAS], grupo: "compras", ayuda: "Qué hay que pedir y a quién" },
  { href: "/compras", label: "Compras", roles: COMPRAS, grupo: "compras", ayuda: "Cotizaciones, gastos y pagos" },
  { href: "/proveedores", label: "Proveedores", roles: [...STAFF, ...COMPRAS], grupo: "compras" },

  { href: "/stock", label: "Stock", roles: STAFF, grupo: "stock", ayuda: "Materia prima, insumos, en proceso y terminados" },

  { href: "/maestros", label: "Piezas y hojas de ruta", roles: STAFF, grupo: "ingenieria", ayuda: "Máquinas, conjuntos, piezas, rutas y tiempos" },
  { href: "/liberacion", label: "Liberación de piezas", roles: STAFF, grupo: "ingenieria", ayuda: "Qué piezas entran al plan" },

  { href: "/admin/configuracion", label: "Configuración pendiente", roles: STAFF, grupo: "admin", ayuda: "Datos que faltan cargar para que el plan sea confiable" },
  { href: "/operaciones", label: "Operaciones y centros", roles: STAFF, grupo: "admin", ayuda: "Tiempos por proceso y capacidad" },
  { href: "/admin/calendario", label: "Calendario", roles: STAFF, grupo: "admin", ayuda: "Feriados, cierres y ausencias" },
  { href: "/admin/montaje", label: "Secuencias de montaje", roles: STAFF, grupo: "admin" },
  { href: "/admin/completitud", label: "Completitud de datos", roles: STAFF, grupo: "admin" },
  { href: "/usuarios", label: "Usuarios", roles: STAFF, grupo: "admin" },
  { href: "/admin/demo", label: "Datos de demo", roles: STAFF, grupo: "admin" },

  { href: "/taller/centro", label: "Pantalla de un centro", roles: [...STAFF, "operario"], grupo: "produccion", ayuda: "Para la tablet fija en una máquina" },
  { href: "/taller", label: "Mi próxima tarea", roles: ["operario"] },
];

export type SeccionNav = { grupo: GrupoNav | null; items: ItemNav[]; abierta: boolean };

/** Menú del rol, agrupado por área en el orden de NAV_ITEMS. */
export function getMenu(rol: Usuario["rol"], contadores: Record<string, number> = {}): SeccionNav[] {
  const secciones: SeccionNav[] = [];
  for (const item of NAV_ITEMS) {
    if (!item.roles.includes(rol) || item.enMenu === false) continue;
    const grupo = item.grupo ?? null;
    let seccion = secciones.find((s) => s.grupo === grupo);
    if (!seccion) secciones.push((seccion = { grupo, items: [], abierta: !grupo || AREAS_DEL_ROL[rol].includes(grupo) }));
    seccion.items.push({ href: item.href, label: item.label, grupo: item.grupo, ayuda: item.ayuda, contador: contadores[item.href] || undefined });
  }
  return secciones;
}

/** Ítem del menú que corresponde a una ruta (las pestañas marcan a su sección). */
export function itemDelMenu(pathname: string): string | null {
  const entrada = NAV_ITEMS.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  if (!entrada) return pathname.startsWith("/remitos") ? "/tercerizados" : null;
  // Las fichas de una orden y la creación de órdenes viven dentro de Proyectos.
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
