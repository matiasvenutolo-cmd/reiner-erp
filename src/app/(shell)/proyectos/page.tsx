import Link from "next/link";
import { db } from "@/lib/db/client";
import { otMaquina, configuracion, cliente } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getPlan } from "@/lib/planning/datos";
import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasOt } from "@/components/ui/PestanasSecciones";
import { fechaCorta } from "@/components/v2/Plan";
import type { ProyectoPlan } from "@/lib/planning/motor";

type FilaProyecto = { m: typeof otMaquina.$inferSelect; config: string | null; cliente: string | null };

export const dynamic = "force-dynamic";

const TIPO = { maquina: "Máquina", repuesto: "Repuesto", stock: "Stock" } as const;
const ESTADO: Record<string, [string, string]> = {
  borrador: ["Borrador", "badge-pendiente"],
  activo: ["Activo", "bg-accent-soft text-accent"],
  en_montaje: ["En montaje", "badge-en_curso"],
  terminado: ["Terminado", "badge-terminada"],
  entregado: ["Entregado", "badge-terminada"],
  pausado: ["Pausado", "badge-alerta"],
};

/** La máquina es un proyecto con fecha de entrega; las órdenes de pieza y de conjunto usan el mismo modelo, con un solo nivel. */
export default async function ProyectosPage() {
  const [plan, todos] = await Promise.all([
    getPlan(),
    db
      .select({ m: otMaquina, config: configuracion.nombre, cliente: cliente.razonSocial })
      .from(otMaquina)
      .leftJoin(configuracion, eq(configuracion.id, otMaquina.configuracionId))
      .leftJoin(cliente, eq(cliente.id, otMaquina.clienteId))
      .orderBy(desc(otMaquina.createdAt)),
  ]);
  const planDe = new Map(plan.resultado.proyectos.map((p) => [p.id, p]));
  const activos = todos.filter((x) => planDe.has(x.m.id));
  const paraActivar = todos.filter((x) => !planDe.has(x.m.id) && ["borrador", "pausado", "activo"].includes(x.m.estadoProyecto));
  const cerrados = todos.filter((x) => ["terminado", "entregado"].includes(x.m.estadoProyecto));

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Proyectos y órdenes"
        descripcion="Cada máquina es un proyecto con fecha de entrega; debajo, todo se descompone en tareas con fecha. Los repuestos y las órdenes para stock funcionan igual, con un solo nivel."
        acciones={
          <Link href="/ot/nueva" className="btn">
            + Generar orden
          </Link>
        }
      >
        <PestanasOt actual="/proyectos" />
      </PageHeader>

      {paraActivar.length > 0 && (
        <section>
          <h2 className="text-base font-semibold">Para activar ({paraActivar.length})</h2>
          <p className="text-xs text-foreground-muted mb-2">Sin fecha de entrega comprometida no se pueden planificar: cargala para que el sistema arme sus tareas y compras.</p>
          <Tabla filas={paraActivar} planDe={planDe} />
        </section>
      )}
      <section>
        <h2 className="text-base font-semibold mb-2">En curso ({activos.length})</h2>
        <Tabla filas={activos} planDe={planDe} />
      </section>
      {cerrados.length > 0 && (
        <details className="tarjeta px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">Terminados y entregados ({cerrados.length})</summary>
          <div className="mt-3">
            <Tabla filas={cerrados} planDe={planDe} />
          </div>
        </details>
      )}
    </div>
  );
}

function Fila({ x, p }: { x: FilaProyecto; p?: ProyectoPlan }) {
  const [estado, cls] = ESTADO[x.m.estadoProyecto] ?? [x.m.estadoProyecto, "badge-pendiente"];
  return (
    <tr className="border-t border-border first:border-t-0 hover:bg-surface-muted/50">
      <td className="px-4 py-3">
        <Link href={`/proyectos/${x.m.id}`} className="font-mono font-semibold hover:text-accent hover:underline">
          {x.m.codigo}
        </Link>
        <div className="text-xs text-foreground-muted">{[x.cliente, x.config].filter(Boolean).join(" · ")}</div>
      </td>
      <td className="px-3 py-3">
        <span className="badge-estado bg-surface-muted text-foreground">{TIPO[x.m.destino as keyof typeof TIPO] ?? x.m.destino}</span>
        {x.m.esDemo && <span className="badge-estado bg-[#efe9fb] text-[#5b3aa8] ml-1">demo</span>}
      </td>
      <td className="px-3 py-3">
        <span className={`badge-estado ${cls}`}>{estado}</span>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">{x.m.fechaEntrega ? fechaCorta(x.m.fechaEntrega) : <span className="text-foreground-muted">sin fecha{x.m.plazoEntrega ? ` (plazo: ${x.m.plazoEntrega})` : ""}</span>}</td>
      <td className="px-3 py-3 whitespace-nowrap">{p ? fechaCorta(p.finEstimado) : "—"}</td>
      <td className="px-3 py-3 whitespace-nowrap">
        {p ? (
          <span className={`font-semibold ${p.diferenciaDias > 0 ? "text-[#991b1b]" : p.diferenciaDias >= -3 ? "text-[#9a3412]" : "text-[#00755d]"}`}>
            {p.diferenciaDias > 0 ? `${p.diferenciaDias} día${p.diferenciaDias === 1 ? "" : "s"} tarde` : p.diferenciaDias === 0 ? "justo" : `${-p.diferenciaDias} día${p.diferenciaDias === -1 ? "" : "s"} antes`}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-3 tabular-nums">{p ? `${p.avancePct}%` : "—"}</td>
      <td className="px-4 py-3 text-right">
        <Link href={`/proyectos/${x.m.id}`} className="btn-secundario btn-sm">
          {p ? "Ver" : "Activar"} →
        </Link>
      </td>
    </tr>
  );
}

function Tabla({ filas, planDe }: { filas: FilaProyecto[]; planDe: Map<string, ProyectoPlan> }) {
return (
  <div className="tarjeta overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="text-xs text-foreground-muted">
        <tr className="border-b border-border">
          <th className="text-left px-4 py-2 font-medium">Proyecto u orden</th>
          <th className="text-left px-3 py-2 font-medium">Tipo</th>
          <th className="text-left px-3 py-2 font-medium">Estado</th>
          <th className="text-left px-3 py-2 font-medium">Entrega</th>
          <th className="text-left px-3 py-2 font-medium">Fin estimado</th>
          <th className="text-left px-3 py-2 font-medium">¿Llega?</th>
          <th className="text-left px-3 py-2 font-medium">Avance</th>
          <th className="px-4 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {filas.map((x) => (
          <Fila key={x.m.id} x={x} p={planDe.get(x.m.id)} />
        ))}
      </tbody>
    </table>
  </div>
);
}
