/**
 * Usuarios. REINER todavía no envió su listado real de operarios y puestos
 * (insumo pendiente #11 del PDF de reunión) — los cuatro usuarios de demo
 * (Adrián, Julián, Horacio, Nico) están sembrados en la base por
 * scripts/seed-db.ts, con los cuatro roles mínimos de RF-12.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { usuario } from "@/lib/db/schema";
import type { Usuario } from "@/lib/db/schema";

export async function getUsuario(id: string): Promise<Usuario | undefined> {
  const [row] = await db.select().from(usuario).where(eq(usuario.id, id));
  return row;
}

export async function getUsuarios(): Promise<Usuario[]> {
  return db.select().from(usuario);
}
