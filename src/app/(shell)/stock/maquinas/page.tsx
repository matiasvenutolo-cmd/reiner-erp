import Link from "next/link";
import { desc, eq, inArray, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otMaquina, configuracion, cliente } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasStock } from "@/components/ui/PestanasSecciones";
import { fechaCorta } from "@/components/v2/Plan";

export const dynamic = "force-dynamic";

const ESTADO: Record<string, [string, string]> = {
  en_montaje: ["En montaje y pruebas", "badge-en_curso"],
  terminado: ["Lista para entregar", "badge-terminada"],
  entregado: ["Despachada", "bg-surface-muted text-foreground"],
};

/** Máquinas terminadas: en planta desde que cierra el montaje final hasta el despacho. */
export default async function MaquinasPage() {
  const filas = await db
    .select({ m: otMaquina, config: configuracion.nombre, cliente: cliente.razonSocial })
    .from(otMaquina)
    .leftJoin(configuracion, eq(configuracion.id, otMaquina.configuracionId))
    .leftJoin(cliente, eq(cliente.id, otMaquina.clienteId))
    .where(and(eq(otMaquina.destino, "maquina"), inArray(otMaquina.estadoProyecto, ["en_montaje", "terminado", "entregado"])))
    .orderBy(desc(otMaquina.updatedAt));
  return (
    <div className="space-y-5">
      <PageHeader titulo="Stock" descripcion="Máquinas con el montaje en curso o terminado, en planta hasta su entrega.">
        <PestanasStock actual="/stock/maquinas" />
      </PageHeader>
      <div className="tarjeta overflow-x-auto">
        {filas.length === 0 ? (
          <p className="p-4 text-sm text-foreground-muted">No hay máquinas en montaje ni terminadas en planta.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-foreground-muted">
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 font-medium">Nº de serie</th>
                <th className="text-left px-3 py-2 font-medium">Configuración</th>
                <th className="text-left px-3 py-2 font-medium">Cliente</th>
                <th className="text-left px-3 py-2 font-medium">Entrega</th>
                <th className="text-left px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ m, config, cliente: cli }) => {
                const [label, cls] = ESTADO[m.estadoProyecto] ?? [m.estadoProyecto, "badge-pendiente"];
                return (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <Link href={`/proyectos/${m.id}`} className="font-mono font-semibold hover:text-accent hover:underline">
                        {m.numeroSerie || m.codigo}
                      </Link>
                      <div className="text-xs text-foreground-muted">{m.codigo}</div>
                    </td>
                    <td className="px-3 py-2">{config}</td>
                    <td className="px-3 py-2">{cli ?? "—"}</td>
                    <td className="px-3 py-2">{m.fechaEntrega ? fechaCorta(m.fechaEntrega) : "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`badge-estado ${cls}`}>{label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
