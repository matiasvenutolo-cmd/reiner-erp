import { unstable_cache } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { avisoPlanta, pieza, configuracion, centroTrabajo, proceso } from "@/lib/db/schema";
import { getPlan } from "@/lib/planning/datos";
import { lunesDe, sumarHabiles } from "@/lib/planning/calendario";

/**
 * Números del menú (mejoras de usabilidad §1.1): sólo cuando hay algo que
 * hacer ("Pedir esta semana · 18"). Se cachean un minuto para no recalcular
 * el plan en cada pantalla; las acciones los invalidan al guardar.
 */
export const getContadoresMenu = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const { resultado: r, entrada } = await getPlan();
    const viernes = sumarHabiles(lunesDe(entrada.hoy), 4, entrada.calendario);
    const pendientes = await contarConfiguracionPendiente();
    return {
      "/pedir": r.compras.filter((c) => !c.pedido && c.pedirAntes <= viernes).length,
      "/liberacion": r.tandas.reduce((s, t) => s + t.otPiezaIds.length, 0),
      "/tercerizados": r.tareas.filter((t) => t.tipo === "tercerizado" && t.estado === "lista").length,
      "/admin/configuracion": pendientes,
    };
  },
  ["contadores-menu", process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local"],
  { revalidate: 60, tags: ["contadores"] },
);

/** Cuántos temas de configuración están pendientes (cada uno es una línea de Configuración pendiente). */
export async function contarConfiguracionPendiente(): Promise<number> {
  const [[a], [b], [c], [d], [e], [f]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(pieza).where(sql`${pieza.claseSugerida} is not null`),
    db.select({ n: sql<number>`count(*)::int` }).from(configuracion).where(eq(configuracion.montajeOrigen, "estimado")),
    db.select({ n: sql<number>`count(*)::int` }).from(centroTrabajo).where(eq(centroTrabajo.capacidadOrigen, "estimado")),
    db.select({ n: sql<number>`count(*)::int` }).from(proceso).where(and(eq(proceso.tiempoOrigen, "estimado"), eq(proceso.tipo, "interno"))),
    db.select({ n: sql<number>`count(*)::int` }).from(avisoPlanta).where(and(eq(avisoPlanta.tipo, "falta_plano"), isNull(avisoPlanta.resueltoAt))),
    db.execute<{ n: number }>(sql`select count(*)::int n from pieza p where p.clase <> 'comercial' and not exists (select 1 from operacion o where o.pieza_id = p.id)`),
  ]);
  return [a.n, b.n, c.n, d.n, e.n, f.n].filter((n) => Number(n) > 0).length;
}
