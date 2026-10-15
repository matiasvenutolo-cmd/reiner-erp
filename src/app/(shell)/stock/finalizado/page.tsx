import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasStock } from "@/components/ui/PestanasSecciones";
import Link from "next/link";
import { getPiezasFinalizadas } from "@/lib/data/stock";
import { getConjuntos, getConfiguraciones } from "@/lib/data/maestros";
import { FiltrosStock } from "@/components/FiltrosStock";

export const dynamic = "force-dynamic";

export default async function StockFinalizadoPage({
  searchParams,
}: {
  searchParams: Promise<{ conjunto?: string; maquina?: string; tipo?: string }>;
}) {
  const { conjunto, maquina, tipo } = await searchParams;
  const tipoFiltro = tipo === "fabricada" || tipo === "comprada" ? tipo : undefined;

  const [piezas, conjuntos, configuraciones] = await Promise.all([
    getPiezasFinalizadas({ conjuntoId: conjunto, configuracionId: maquina, tipo: tipoFiltro }),
    getConjuntos(),
    getConfiguraciones(),
  ]);
  const totalUnidades = piezas.reduce((sum, p) => sum + p.disponible, 0);
  const totalComprometido = piezas.reduce((sum, p) => sum + p.comprometido, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Stock"
        descripcion={`Almacén: existencias físicas reales. ${piezas.length} pieza${piezas.length === 1 ? "" : "s"} distinta${piezas.length === 1 ? "" : "s"} · ${totalUnidades} unidades, ${totalComprometido} ya reservadas para una máquina vendida.`}
      >
        <PestanasStock actual="/stock/finalizado" />
      </PageHeader>

      <FiltrosStock
        conjuntos={conjuntos.map((c) => ({ id: c.id, nombre: c.nombre }))}
        configuraciones={configuraciones.map((c) => ({ id: c.id, nombre: c.nombre }))}
      />

      {piezas.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-6 text-center text-foreground-muted text-sm">
          No hay piezas con stock finalizado que coincidan con el filtro.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Pieza</th>
                <th className="text-left px-4 py-2 font-medium">Conjunto</th>
                <th className="text-left px-4 py-2 font-medium">Tipo</th>
                <th className="text-right px-4 py-2 font-medium">En almacén</th>
                <th className="text-right px-4 py-2 font-medium">Comprometido</th>
                <th className="text-right px-4 py-2 font-medium">Libre</th>
              </tr>
            </thead>
            <tbody>
              {piezas.map((p) => (
                <tr key={p.piezaId} className="border-t border-border hover:bg-surface-muted/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/stock/pieza/${p.piezaId}`} className="font-mono text-xs text-accent hover:underline mr-1">
                      {p.piezaCodigo}
                    </Link>
                    {p.piezaNombre}
                  </td>
                  <td className="px-4 py-2.5 text-foreground-muted">{p.conjuntoNombre}</td>
                  <td className="px-4 py-2.5">
                    {p.tipo === "comprada" ? (
                      <span className="badge-estado bg-surface-muted text-foreground-muted">Compra</span>
                    ) : (
                      <span className="text-foreground-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.disponible}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">{p.comprometido || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{p.disponible - p.comprometido}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
