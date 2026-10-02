/**
 * Operaciones y centros de trabajo (revisión del 2026-10-02): una cosa es la
 * operación que una pieza tiene que hacer (Roscado, Rectificado, CNC...) y
 * otra el centro donde se ejecuta. Cada tipo de operación (`proceso`) tiene
 * un destino por defecto, editable desde Administración: un centro interno,
 * "Tercerizado" (va a Tercerizados, no a una cola de taller) o nada todavía
 * ("Asignar centro de trabajo" — no se inventa). Cada pieza puede además
 * usar otro centro para un paso puntual (`operacion.centroTrabajoId`).
 * Compras no se edita acá: se resuelve con stock, no es un centro ni un
 * tercerizado (devolución del cliente).
 */
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { centroTrabajo, proceso } from "@/lib/db/schema";

function idDeNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type CentroConUso = {
  id: string;
  nombre: string;
  tiposPorDefecto: number;
  operacionesDePiezas: number;
  operarios: number;
};

export async function getCentrosConUso(): Promise<CentroConUso[]> {
  return db
    .select({
      id: centroTrabajo.id,
      nombre: centroTrabajo.nombre,
      // Subconsultas con alias explícitos: con columnas interpoladas drizzle las
      // escribe sin tabla y la correlación con el centro de afuera se pierde.
      tiposPorDefecto: sql<number>`(select count(*) from proceso p where p.centro_trabajo_id = centro_trabajo.id)`.mapWith(Number),
      operacionesDePiezas: sql<number>`(select count(*) from operacion o where o.centro_trabajo_id = centro_trabajo.id)`.mapWith(Number),
      operarios: sql<number>`(select count(*) from usuario_centro_trabajo u where u.centro_trabajo_id = centro_trabajo.id)`.mapWith(Number),
    })
    .from(centroTrabajo)
    .orderBy(asc(centroTrabajo.orden), asc(centroTrabajo.nombre));
}

export type TipoOperacion = {
  id: string;
  nombre: string;
  tipo: "interno" | "tercerizado" | "compras";
  centroTrabajoId: string | null;
  operacionesEnHojasDeRuta: number;
  conCentroPropio: number;
};

export async function getTiposOperacion(): Promise<TipoOperacion[]> {
  return db
    .select({
      id: proceso.id,
      nombre: proceso.nombre,
      tipo: proceso.tipo,
      centroTrabajoId: proceso.centroTrabajoId,
      operacionesEnHojasDeRuta: sql<number>`(select count(*) from operacion o where o.proceso_id = proceso.id)`.mapWith(Number),
      conCentroPropio: sql<number>`(select count(*) from operacion o where o.proceso_id = proceso.id and o.centro_trabajo_id is not null)`.mapWith(Number),
    })
    .from(proceso)
    .orderBy(asc(proceso.ordenFlujo));
}

/** destino: id de un centro, "tercerizado", o "" (sin asignar todavía). */
export async function asignarTipoOperacion(procesoId: string, destino: string): Promise<void> {
  const [p] = await db.select().from(proceso).where(eq(proceso.id, procesoId));
  if (!p) throw new Error("Tipo de operación inexistente.");
  if (p.tipo === "compras") throw new Error("Compras se resuelve con stock: no se asigna a un centro.");
  if (destino === "tercerizado") {
    await db.update(proceso).set({ tipo: "tercerizado", centroTrabajoId: null }).where(eq(proceso.id, procesoId));
  } else {
    await db.update(proceso).set({ tipo: "interno", centroTrabajoId: destino || null }).where(eq(proceso.id, procesoId));
  }
}

export async function crearCentro(nombre: string): Promise<void> {
  const limpio = nombre.trim();
  if (!limpio) throw new Error("Falta el nombre del centro.");
  const id = idDeNombre(limpio);
  const [existe] = await db.select({ id: centroTrabajo.id }).from(centroTrabajo).where(eq(centroTrabajo.id, id));
  if (existe) throw new Error(`Ya existe un centro "${limpio}".`);
  const [max] = await db.select({ orden: sql<number>`coalesce(max(${centroTrabajo.orden}), 0)`.mapWith(Number) }).from(centroTrabajo);
  await db.insert(centroTrabajo).values({ id, codigo: id, nombre: limpio, orden: (max?.orden ?? 0) + 10 });
}

export async function renombrarCentro(id: string, nombre: string): Promise<void> {
  if (!nombre.trim()) throw new Error("Falta el nombre del centro.");
  await db.update(centroTrabajo).set({ nombre: nombre.trim() }).where(eq(centroTrabajo.id, id));
}

/** Sólo si nada lo usa: ni tipos de operación, ni operaciones de piezas, ni operarios. */
export async function eliminarCentro(id: string): Promise<void> {
  const uso = (await getCentrosConUso()).find((c) => c.id === id);
  if (!uso) return;
  if (uso.tiposPorDefecto || uso.operacionesDePiezas || uso.operarios) {
    throw new Error(`"${uso.nombre}" todavía se usa: primero reasigná sus operaciones y operarios.`);
  }
  await db.delete(centroTrabajo).where(eq(centroTrabajo.id, id));
}
