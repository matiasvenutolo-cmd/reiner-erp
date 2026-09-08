import Link from "next/link";
import { getResumenWipPorProceso } from "@/lib/data/stock";
import { FIXTURES } from "@/lib/data/fixtures-loader";

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const wip = await getResumenWipPorProceso();

  const query = (q ?? "").trim().toLowerCase();
  const resultados = query
    ? FIXTURES.piezas
        .filter((p) => p.codigo.toLowerCase().includes(query) || p.nombre.toLowerCase().includes(query))
        .slice(0, 30)
        .map((p) => ({
          pieza: p,
          stock: FIXTURES.stockPieza.find((s) => s.piezaId === p.id)?.cantidadDisponible ?? 0,
        }))
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Stock</h1>
        <p className="text-sm text-foreground-muted mt-1">
          El stock no es un número único: cada pieza está &ldquo;Finalizada&rdquo; (disponible) o en alguna
          etapa intermedia del proceso. Ver docs/01-analisis.md §3.1.
        </p>
      </div>

      <form className="max-w-md">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar pieza por código o nombre…"
          className="input"
        />
      </form>

      {query && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Código</th>
                <th className="text-left px-4 py-2 font-medium">Nombre</th>
                <th className="text-right px-4 py-2 font-medium">Stock disponible</th>
              </tr>
            </thead>
            <tbody>
              {resultados.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-foreground-muted">
                    Sin resultados para &ldquo;{q}&rdquo;
                  </td>
                </tr>
              ) : (
                resultados.map(({ pieza, stock }) => (
                  <tr key={pieza.id} className="border-t border-border hover:bg-surface-muted/50">
                    <td className="px-4 py-2.5">
                      <Link href={`/maestros/pieza/${pieza.id}`} className="font-mono text-xs text-accent hover:underline">
                        {pieza.codigo}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{pieza.nombre}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{stock}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">Piezas en proceso, por etapa (todos los modelos)</h2>
        <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Etapa</th>
                <th className="text-right px-4 py-2 font-medium">Piezas distintas</th>
                <th className="text-right px-4 py-2 font-medium">Unidades</th>
              </tr>
            </thead>
            <tbody>
              {wip
                .sort((a, b) => b.unidades - a.unidades)
                .map((w) => (
                  <tr key={w.procesoId} className="border-t border-border">
                    <td className="px-4 py-2.5">{w.procesoNombre}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{w.piezas}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{w.unidades}</td>
                  </tr>
                ))}
              {wip.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-foreground-muted">
                    No hay piezas en proceso registradas en este momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
