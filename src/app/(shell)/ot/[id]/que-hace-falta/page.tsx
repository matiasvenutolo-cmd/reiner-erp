import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otMaquina, configuracion, cliente } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueHaceFalta } from "@/components/asistente/QueHaceFalta";
import { queHaceFaltaDeOrden } from "@/lib/data/que-hace-falta";
import { getPlan } from "@/lib/planning/datos";
import { fechaCorta } from "@/lib/formato";

export const dynamic = "force-dynamic";

/**
 * "Ver qué hace falta" de una orden ya confirmada (simplificación §1 y §2,
 * "Volver a mirar"): la misma pantalla, en modo consulta y con el estado al
 * día — qué se cubrió con stock, qué ya se fabricó, qué está pedido o falta pedir.
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
  const hoy = plan.entrada.hoy;

  // Estado al día de cada pieza, a partir del plan (lo fabricado) y de las compras (pedido o no).
  const estados = new Map<string, string>();
  const tareas = plan.resultado.tareas.filter((t) => t.proyectoId === id);
  for (const codigo of new Set(tareas.map((t) => t.piezaCodigo))) {
    const ts = tareas.filter((t) => t.piezaCodigo === codigo);
    if (ts.every((t) => t.estado === "terminada")) estados.set(codigo, "Ya se fabricó");
    else if (ts.some((t) => t.estado === "en_curso" || t.estado === "pausada")) estados.set(codigo, "En fabricación");
  }
  for (const c of plan.resultado.compras.filter((x) => x.proyectoId === id)) {
    if (estados.has(c.piezaCodigo)) continue;
    estados.set(c.piezaCodigo, c.pedido ? `Pedido${c.llegadaPrevista ? ` · llega el ${fechaCorta(c.llegadaPrevista, hoy)}` : ""}` : "Falta pedir");
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
