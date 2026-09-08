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
    { href: "/ot", label: "Órdenes de trabajo" },
    { href: "/stock", label: "Stock" },
    { href: "/maestros", label: "Maestros" },
  ],
  ingenieria: [
    { href: "/maestros", label: "Maestros" },
    { href: "/ot", label: "Órdenes de trabajo" },
    { href: "/stock", label: "Stock" },
    { href: "/avance", label: "Avance" },
  ],
  taller: [
    { href: "/avance", label: "Avance" },
    { href: "/ot", label: "Órdenes de trabajo" },
    { href: "/stock", label: "Stock" },
  ],
  operario: [{ href: "/taller", label: "Mi trabajo" }],
};
