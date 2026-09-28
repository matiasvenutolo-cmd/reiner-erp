import Link from "next/link";
import { notFound } from "next/navigation";
import { getConjunto, getConfiguracion, getPiezasPorConfiguracionYConjunto, getRoutingPieza } from "@/lib/data/maestros";
import { getStockDisponible, getWipTotalEnCursoDePieza } from "@/lib/data/stock";

/** Piezas de un conjunto, dentro de UNA máquina puntual (Release 3,
 * devolución del cliente): antes se mezclaban piezas de RD y PS en la misma
 * lista; ahora cada máquina ve sólo las suyas. Separadas en "A producir" y
 * "A comprar" — el otro pedido de la misma devolución: "que de cada
 * conjunto diferencie piezas a comprar y a producir". */
export default async function ConjuntoDeMaquinaPage({
  params,
}: {
  params: Promise<{ configuracionId: string; conjuntoId: string }>;
}) {
  const { configuracionId, conjuntoId } = await params;
  const [configuracion, conjunto] = await Promise.all([getConfiguracion(configuracionId), getConjunto(conjuntoId)]);
  if (!configuracion || !conjunto) notFound();

  const piezas = await getPiezasPorConfiguracionYConjunto(configuracionId, conjuntoId);
  const filas = await Promise.all(
    piezas.map(async (p) => ({
      pieza: p,
      routing: await getRoutingPieza(p.id),
      stock: await getStockDisponible(p.id),
      wip: await getWipTotalEnCursoDePieza(p.id),
    })),
  );
  filas.sort((a, b) => a.pieza.codigo.localeCompare(b.pieza.codigo));

  const aProducir = filas.filter((f) => f.pieza.tipo !== "comprada");
  const aComprar = filas.filter((f) => f.pieza.tipo === "comprada");

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/maestros/${configuracionId}`} className="text-sm text-accent hover:underline">
          ← {configuracion.nombre}
        </Link>
        <h1 className="text-xl font-semibold mt-1">{conjunto.nombre}</h1>
        <p className="text-sm text-foreground-muted">
          {conjunto.codigo} · {configuracion.nombre} · {piezas.length} pieza{piezas.length === 1 ? "" : "s"} (
          {aProducir.length} a producir · {aComprar.length} a comprar)
        </p>
      </div>

      <TablaPiezas titulo="A producir" filas={aProducir} />
      <TablaPiezas titulo="A comprar" filas={aComprar} />
    </div>
  );
}

type Fila = {
  pieza: { id: string; codigo: string; nombre: string; tipo: "fabricada" | "comprada"; cantidadNecesaria: number };
  routing: { id: string }[];
  stock: number;
  wip: number;
};

function TablaPiezas({ titulo, filas }: { titulo: string; filas: Fila[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold mb-2">
        {titulo} ({filas.length})
      </h2>
      {filas.length === 0 ? (
        <p className="text-sm text-foreground-muted">Ninguna pieza de este conjunto es &ldquo;{titulo.toLowerCase()}&rdquo;.</p>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Código</th>
                <th className="text-left px-4 py-2 font-medium">Nombre</th>
                <th className="text-right px-4 py-2 font-medium">Cant. necesaria</th>
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
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">{pieza.cantidadNecesaria}</td>
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
      )}
    </div>
  );
}
