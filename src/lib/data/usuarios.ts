/**
 * Usuarios de demo. REINER todavía no envió su listado real de operarios y
 * puestos (insumo pendiente #11 del PDF de reunión) — estos nombres son los
 * mencionados en la reunión del 04/09, para que la demo se sienta real.
 * Cuatro roles mínimos por RF-12: operario, taller, ingenieria, direccion.
 */
import type { Usuario } from "@/lib/db/schema";

export const USUARIOS_DEMO: Usuario[] = [
  {
    id: "adrian",
    nombre: "Adrián",
    email: "adrian@reiner.com.ar",
    pinHash: null,
    passwordHash: null,
    rol: "direccion",
    activo: true,
    createdAt: new Date("2026-09-01"),
    updatedAt: new Date("2026-09-01"),
  },
  {
    id: "julian",
    nombre: "Julián",
    email: "julian@reiner.com.ar",
    pinHash: null,
    passwordHash: null,
    rol: "ingenieria",
    activo: true,
    createdAt: new Date("2026-09-01"),
    updatedAt: new Date("2026-09-01"),
  },
  {
    id: "horacio",
    nombre: "Horacio",
    email: "horacio@reiner.com.ar",
    pinHash: null,
    passwordHash: null,
    rol: "taller",
    activo: true,
    createdAt: new Date("2026-09-01"),
    updatedAt: new Date("2026-09-01"),
  },
  {
    id: "nico",
    nombre: "Nico",
    email: null,
    pinHash: "0000",
    passwordHash: null,
    rol: "operario",
    activo: true,
    createdAt: new Date("2026-09-01"),
    updatedAt: new Date("2026-09-01"),
  },
];

export async function getUsuario(id: string): Promise<Usuario | undefined> {
  return USUARIOS_DEMO.find((u) => u.id === id);
}

export async function getUsuarios(): Promise<Usuario[]> {
  return USUARIOS_DEMO;
}
