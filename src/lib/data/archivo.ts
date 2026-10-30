/**
 * Datos archivados (reorganización 30/10, §6.1). Lo archivado no aparece en
 * ninguna pantalla ni en los cálculos, pero no se borra: se puede desarchivar
 * desde ADMIN → Datos archivados y vuelve igual que estaba.
 *
 * - Una configuración de máquina archivada no se ofrece para cargar órdenes ni
 *   aparece en maestros, tiempos ni filtros.
 * - Una orden archivada pasa al estado "archivado" (guarda el que tenía): sale
 *   del plan, de Órdenes, de Compras y de producción, y su stock reservado deja
 *   de contar como reservado. La reserva no se borra: vuelve a contar si se desarchiva.
 */
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { configuracion, otMaquina, cliente, proyectoEvento } from "@/lib/db/schema";

export const ESTADO_ARCHIVADO = "archivado";

/** Para filtrar órdenes: las archivadas no se muestran ni se calculan. */
export const ordenNoArchivada = sql`${otMaquina.estadoProyecto} <> ${ESTADO_ARCHIVADO}`;

export async function listarParaArchivo() {
  const [configs, ordenes] = await Promise.all([
    db.select().from(configuracion).orderBy(asc(configuracion.codigo)),
    db
      .select({ m: otMaquina, config: configuracion.nombre, cliente: cliente.razonSocial })
      .from(otMaquina)
      .leftJoin(configuracion, eq(configuracion.id, otMaquina.configuracionId))
      .leftJoin(cliente, eq(cliente.id, otMaquina.clienteId))
      .orderBy(desc(otMaquina.createdAt)),
  ]);
  return { configs, ordenes };
}

export async function archivarConfiguracion(id: string, archivar: boolean): Promise<void> {
  await db.update(configuracion).set({ archivada: archivar }).where(eq(configuracion.id, id));
}

export async function archivarOrden(id: string, usuarioId: string): Promise<void> {
  const [m] = await db.select({ estado: otMaquina.estadoProyecto }).from(otMaquina).where(eq(otMaquina.id, id));
  if (!m) throw new Error("Esa orden no existe.");
  if (m.estado === ESTADO_ARCHIVADO) return;
  await db.update(otMaquina).set({ estadoAntesDeArchivar: m.estado, estadoProyecto: ESTADO_ARCHIVADO, updatedAt: new Date() }).where(eq(otMaquina.id, id));
  await db.insert(proyectoEvento).values({ otMaquinaId: id, tipo: "archivado", texto: `Archivada (estaba ${m.estado})`, usuarioId });
}

export async function desarchivarOrden(id: string, usuarioId: string): Promise<void> {
  const [m] = await db.select({ estado: otMaquina.estadoProyecto, antes: otMaquina.estadoAntesDeArchivar }).from(otMaquina).where(eq(otMaquina.id, id));
  if (!m || m.estado !== ESTADO_ARCHIVADO) return;
  const vuelve = m.antes ?? "borrador";
  await db.update(otMaquina).set({ estadoProyecto: vuelve, estadoAntesDeArchivar: null, updatedAt: new Date() }).where(eq(otMaquina.id, id));
  await db.insert(proyectoEvento).values({ otMaquinaId: id, tipo: "desarchivado", texto: `Desarchivada: vuelve a ${vuelve}`, usuarioId });
}
