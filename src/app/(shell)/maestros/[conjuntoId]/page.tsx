import Link from "next/link";
import { notFound } from "next/navigation";
import { getConjunto, getPiezasPorConjunto, getRoutingPieza, modeloDeCodigo } from "@/lib/data/maestros";
import { getStockDisponible, getWipTotalPorPieza } from "@/lib/data/stock";

export default async function ConjuntoPage({ params }: { params: Promise<{ conjuntoId: string }> }) {
  const { conjuntoId } = await params;
  const conjunto = await getConjunto(conjuntoId);
  if (!conjunto) notFound();

  const piezas = await getPiezasPorConjunto(conjuntoId);
  const filas = await Promise.all(
    piezas.map(async (p) => ({
      pieza: p,
      routing: await getRoutingPieza(p.id),
      stock: await getStockDisponible(p.id),
      wip: await getWipTotalPorPieza(p.id),
    })),
  );
  filas.sort((a, b) => a.pieza.codigo.localeCompare(b.pieza.codigo));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/maestros" className="text-sm text-accent hover:underline">
          ← Maestros
        </Link>
        <h1 className="text-xl font-semibold mt-1">{conjunto.nombre}</h1>
        <p className="text-sm text-foreground-muted">
          {conjunto.codigo} · {piezas.length} pieza{piezas.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Código</th>
              <th className="text-left px-4 py-2 font-medium">Nombre</th>
              <th className="text-left px-4 py-2 font-medium">Modelo</th>
              <th className="text-right px-4 py-2 font-medium">Stock</th>
              <th className="text-right px-4 py-2 font-medium">En proceso</th>
              <th className="text-right px-4 py-2 font-medium">Operaciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ pieza, routing, stock, wip }) => (
              <tr key={pieza.id} className="border-t border-border hover:bg-surface-muted/50">
                <td className="px-4 py-2.5">
                  <Link href={`/maestros/pieza/${pieza.id}`} className="font-mono text-xs text-accent hover:underline">
                    {pieza.codigo}
                  </Link>
                </td>
                <td className="px-4 py-2.5">{pieza.nombre}</td>
                <td className="px-4 py-2.5 text-foreground-muted">{modeloDeCodigo(pieza.codigo)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{stock}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">{wip || "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">
                  {routing.length || <span className="text-red-700">sin datos</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
