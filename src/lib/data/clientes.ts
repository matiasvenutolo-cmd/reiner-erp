import { db } from "@/lib/db/client";
import { cliente } from "@/lib/db/schema";
import type { Cliente } from "@/lib/db/schema";

export async function getClientes(): Promise<Cliente[]> {
  return db.select().from(cliente);
}
