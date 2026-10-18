/* Semilla de la v2: estimaciones + migración de órdenes + escenario de demo. Idempotente. Sólo contra la base v2. */
import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";
import { sembrarEstimaciones, migrarOrdenesExistentes, cargarDemo } from "@/lib/data/v2-semillas";
import { getPlan } from "@/lib/planning/datos";
async function main() {
  const [{ db: base }] = await db.execute<{ db: string }>(sql`select current_database() db`);
  if (base !== "reiner_v2") throw new Error(`Esto corre sólo contra reiner_v2 (conectado a ${base})`);
  for (const l of await sembrarEstimaciones()) console.log("·", l);
  for (const l of await migrarOrdenesExistentes()) console.log("·", l);
  if (process.argv.includes("--demo")) for (const l of await cargarDemo("julian")) console.log("·", l);
  const plan = await getPlan();
  const r = plan.resultado;
  console.log(`plan en ${plan.ms} ms: ${r.tareas.length} tareas, ${r.compras.length} compras, ${r.proyectos.length} proyectos`);
  for (const p of r.proyectos) console.log(`  ${p.codigo}: entrega ${p.entrega} · fin estimado ${p.finEstimado} · diferencia ${p.diferenciaDias} días · ${p.avancePct}% · estimado ${p.pctEstimado}%`);
  console.log("  tandas:", r.tandas.map((t) => `${t.proyectoId.slice(0, 6)}: ${t.otPiezaIds.length} (+${t.sinPlano.length} sin plano)`).join(" | "));
  const est = r.tareas.reduce((m, t) => m.set(t.estado, (m.get(t.estado) ?? 0) + 1), new Map<string, number>());
  console.log("  estados:", Object.fromEntries(est));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
