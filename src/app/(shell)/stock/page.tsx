import Link from "next/link";
import {
  getResumenWipEnCursoPorProceso,
  getStockDisponible,
  getComprometido,
  getWipEnCursoDePieza,
  getResumenStockGeneral,
  getPiezasStockBajo,
} from "@/lib/data/stock";
import { getPiezasCompraPendientes } from "@/lib/data/produccion";
import { getPedidosPendientes, getOtPiezaIdsConPedidoAbierto } from "@/lib/data/compras";
import { buscarPiezas, getPiezas } from "@/lib/data/maestros";
import { MetricCard } from "@/components/MetricCard";
import { PiezaSelect } from "@/components/PiezaSelect";

// Datos en vivo (stock/producción cambian todo el tiempo) — nunca prerenderizar en build.
export const dynamic = "force-dynamic";

/**
 * Stock separado en los cuatro grupos que pidió el cliente (2ª ronda, pregunta
 * 5) y el socio ("no sabés cuáles son existencias reales en el almacén,
 * cuáles están en proceso de compra o ya compradas esperando que lleguen"):
 * almacén libre, comprometido para una máquina vendida, stock futuro (en
 * fabricación) y compras. Cada pieza abre su ficha de stock (no Maestros),
 * desde donde se retira registrando quién y para qué.
 */
export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [wip, resumen, stockBajo, compraPendiente, pedidos, todasLasPiezas] = await Promise.all([
    getResumenWipEnCursoPorProceso(),
    getResumenStockGeneral(),
    getPiezasStockBajo(),
    getPiezasCompraPendientes(),
    getPedidosPendientes(),
    getPiezas(),
  ]);
  const conPedido = await getOtPiezaIdsConPedidoAbierto(compraPendiente.map((c) => c.otPiezaId));
  const porPedir = compraPendiente.filter((c) => !conPedido.has(c.otPiezaId)).length;
  const unidadesFuturo = wip.reduce((sum, w) => sum + w.unidades, 0);
  const libre = resumen.unidadesFinalizadas - resumen.unidadesComprometidas;
  const wipOrdenado = [...wip].sort((a, b) => b.unidades - a.unidades);

  const piezasParaSelect = [...todasLasPiezas]
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((p) => ({ codigo: p.codigo, nombre: p.nombre }));

  const query = (q ?? "").trim();
  const piezasEncontradas = query ? await buscarPiezas(query) : [];
  const resultados = await Promise.all(
    piezasEncontradas.map(async (p) => ({
      pieza: p,
      almacen: await getStockDisponible(p.id),
      comprometido: await getComprometido(p.id),
      enProceso: await getWipEnCursoDePieza(p.id),
    })),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Stock</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Cada unidad está en uno de estos lugares: en el <strong>almacén</strong> (libre o ya comprometida para una máquina
          vendida), <strong>en fabricación</strong> (stock futuro: va a entrar cuando termine su hoja de ruta) o en{" "}
          <strong>compras</strong> (pendiente de pedir, o pedida y esperando que llegue).
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="En almacén, libres para usar" value={libre} href="/stock/finalizado" />
        <MetricCard label="En almacén, comprometidas para máquinas vendidas" value={resumen.unidadesComprometidas} href="/stock/finalizado" />
        <MetricCard label="Stock futuro — en fabricación" value={unidadesFuturo} href="/stock/en-proceso" />
        <MetricCard label={`Compras pedidas esperando llegar · ${porPedir} por pedir`} value={pedidos.length} href="/stock/compras" />
      </div>

      <div id="minimo">
        <h2 className="text-sm font-semibold mb-2">Por debajo del mínimo</h2>
        {stockBajo.length === 0 ? (
          <p className="text-sm text-foreground-muted">Ninguna pieza está por debajo de su mínimo en este momento.</p>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Pieza</th>
                  <th className="text-right px-4 py-2 font-medium">En almacén</th>
                  <th className="text-right px-4 py-2 font-medium">Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {stockBajo.map((p) => (
                  <tr key={p.piezaId} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <Link href={`/stock/pieza/${p.piezaId}`} className="font-mono text-xs text-accent hover:underline mr-1">
                        {p.piezaCodigo}
                      </Link>
                      {p.piezaNombre}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-700">{p.disponible}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">{p.minimo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div id="etapas">
        <h2 className="text-sm font-semibold mb-2">Stock futuro — en qué etapa de fabricación está</h2>
        {wipOrdenado.length === 0 ? (
          <p className="text-sm text-foreground-muted">No hay piezas en fabricación en este momento.</p>
        ) : (
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
                {wipOrdenado.map((w) => (
                  <tr key={w.procesoId} className="border-t border-border hover:bg-surface-muted/50">
                    <td className="px-4 py-2.5">
                      <Link href={`/stock/etapa/${w.procesoId}`} className="text-accent hover:underline">
                        {w.procesoNombre}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{w.piezas}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{w.unidades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Buscar una pieza puntual</h2>
        <div className="max-w-md mb-3 grid sm:grid-cols-2 gap-2">
          <form>
            <input type="search" name="q" defaultValue={q ?? ""} placeholder="Buscar pieza por código o nombre…" className="input" />
          </form>
          <PiezaSelect basePath="/stock" piezas={piezasParaSelect} />
        </div>

        {query && (
          <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Pieza</th>
                  <th className="text-right px-4 py-2 font-medium">En almacén</th>
                  <th className="text-right px-4 py-2 font-medium">Comprometido</th>
                  <th className="text-left px-4 py-2 font-medium">En fabricación</th>
                </tr>
              </thead>
              <tbody>
                {resultados.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-foreground-muted">
                      Sin resultados para &ldquo;{q}&rdquo;
                    </td>
                  </tr>
                ) : (
                  resultados.map(({ pieza, almacen, comprometido, enProceso }) => (
                    <tr key={pieza.id} className="border-t border-border hover:bg-surface-muted/50">
                      <td className="px-4 py-2.5">
                        <Link href={`/stock/pieza/${pieza.id}`} className="font-mono text-xs text-accent hover:underline mr-1">
                          {pieza.codigo}
                        </Link>
                        {pieza.nombre}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{almacen}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">{comprometido || "—"}</td>
                      <td className="px-4 py-2.5">
                        {enProceso.length === 0 ? (
                          <span className="text-foreground-muted">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {enProceso.map((e) => (
                              <span key={e.procesoNombre} className="badge-estado badge-en_curso">
                                {e.cantidad} en {e.procesoNombre}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
