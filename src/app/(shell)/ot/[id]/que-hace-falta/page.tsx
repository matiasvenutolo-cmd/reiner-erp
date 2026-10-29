import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otMaquina, otConjunto, otPieza, configuracion, cliente } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueHaceFalta } from "@/components/asistente/QueHaceFalta";
import { queHaceFaltaDeOrden } from "@/lib/data/que-hace-falta";
import { getPlan } from "@/lib/planning/datos";
import { estadoDePieza, ESTADO_VISIBLE } from "@/lib/estado-pieza";
import { getEsperaMaterialDeOrden } from "@/lib/data/gestion-compras";
import type { Tono } from "@/components/ui/Etiqueta";

export const dynamic = "force-dynamic";

/**
 * "Ver qué hace falta" de una orden ya confirmada (simplificación §1 y §2,
 * "Volver a mirar"): la misma pantalla, en modo consulta y con el estado al
 * día — qué se cubrió con stock y en qué estado está cada pieza.
 */
export default async function QueHaceFaltaOrdenPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ver?: string }> }) {
  const [{ id }, { ver }] = await Promise.all([params, searchParams]);
  const [[fila], plan] = await Promise.all([
    db
      .select({ m: otMaquina, config: configuracion.nombre, cliente: cliente.razonSocial })
      .from(otMaquina)
      .leftJoin(configuracion, eq(configuracion.id, otMaquina.configuracionId))
      .leftJoin(cliente, eq(cliente.id, otMaquina.clienteId))
      .where(eq(otMaquina.id, id)),
    getPlan(),
  ]);
  if (!fila) notFound();
  const m = fila.m;

  // Estado al día de cada pieza, con los mismos cinco estados del detalle de la orden (simplificación §4.2).
  const [ops, esperaMaterial] = await Promise.all([
    db.select({ id: otPieza.id, piezaId: otPieza.piezaId }).from(otPieza).innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId)).where(eq(otConjunto.otMaquinaId, id)),
    getEsperaMaterialDeOrden(id),
  ]);
  const tareas = plan.resultado.tareas.filter((t) => t.proyectoId === id);
  const compras = new Map(plan.resultado.compras.filter((c) => c.proyectoId === id).map((c) => [c.otPiezaId, c]));
  const estados = new Map<string, { texto: string; tono: Tono }>();
  for (const op of ops) {
    const e = estadoDePieza(tareas.filter((t) => t.otPiezaId === op.id), compras.get(op.id), esperaMaterial.get(op.id));
    const v = ESTADO_VISIBLE[e.estado];
    estados.set(op.piezaId, { texto: e.motivo ? `${v.label} · ${e.motivo}` : v.label, tono: v.tono });
  }
  const datos = await queHaceFaltaDeOrden(id, estados);
  const tipo = m.tipo === "suelta" ? (m.alcance === "pieza" ? "pieza" : "conjunto") : "maquina";

  return (
    <div className="space-y-4">
      <PageHeader
        migas={[{ href: "/proyectos", label: "Órdenes" }, { href: `/proyectos/${id}`, label: m.codigo }, { label: "Qué hace falta" }]}
        titulo={`Qué hace falta · ${m.codigo}`}
        acciones={
          <Link href={`/proyectos/${id}`} className="btn-secundario">
            Volver a la orden
          </Link>
        }
      />
      <p className="text-sm text-foreground-muted">
        {[fila.cliente ?? (m.destino === "stock" ? "Para stock" : null), fila.config].filter(Boolean).join(" · ")} · modo consulta: lo que está en &ldquo;Ya lo tengo&rdquo; es lo reservado para esta orden.
      </p>
      <QueHaceFalta datos={datos} tipo={tipo} ver={ver} base={`/ot/${id}/que-hace-falta`} />
    </div>
  );
}
