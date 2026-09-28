import Link from "next/link";
import {
  getResumenWipEnCursoPorProceso,
  getStockDisponible,
  getWipEnCursoDePieza,
  getResumenStockGeneral,
  getPiezasStockBajo,
} from "@/lib/data/stock";
import { getPiezasFueraDeFabrica } from "@/lib/data/logistica";
import { buscarPiezas, getPiezas } from "@/lib/data/maestros";
import { getUsuarioActual } from "@/lib/session";
import { ajustarStockAction } from "@/app/actions/stock";
import { MetricCard } from "@/components/MetricCard";
import { PiezaSelect } from "@/components/PiezaSelect";

// Datos en vivo (stock/producción cambian todo el tiempo) — nunca prerenderizar en build.
export const dynamic = "force-dynamic";

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [usuario, wip, resumen, stockBajo, fueraDeFabrica, todasLasPiezas] = await Promise.all([
    getUsuarioActual(),
    getResumenWipEnCursoPorProceso(),
    getResumenStockGeneral(),
    getPiezasStockBajo(),
    getPiezasFueraDeFabrica(),
    getPiezas(),
  ]);
  const puedeAjustar = usuario.rol === "taller";
  const unidadesEnProceso = wip.reduce((sum, w) => sum + w.unidades, 0);
  const unidadesTercerizadas = fueraDeFabrica.reduce((sum, f) => sum + f.cantidad, 0);
  const wipOrdenado = [...wip].sort((a, b) => b.unidades - a.unidades);
  const maxUnidades = wipOrdenado[0]?.unidades ?? 0;

  const piezasParaSelect = [...todasLasPiezas]
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((p) => ({ codigo: p.codigo, nombre: p.nombre }));

  const query = (q ?? "").trim();
  const piezasEncontradas = query ? await buscarPiezas(query) : [];
  const resultados = await Promise.all(
    piezasEncontradas.map(async (p) => ({
      pieza: p,
      finalizado: await getStockDisponible(p.id),
      enProceso: await getWipEnCursoDePieza(p.id),
    })),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Stock</h1>
        <p className="text-sm text-foreground-muted mt-1">
          El stock no es un número único: cada pieza está &ldquo;Finalizada&rdquo; (disponible) o
          en alguna etapa intermedia del proceso — se calcula en vivo desde la fabricación real,
          la misma base que usan Avance y Centros de trabajo.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Piezas por debajo del mínimo" value={stockBajo.length} href="#minimo" />
        <MetricCard label="Unidades finalizadas en stock" value={resumen.unidadesFinalizadas} href="#etapas" />
        <MetricCard label="Unidades en proceso" value={unidadesEnProceso} href="#etapas" />
        <MetricCard label="Unidades en proceso tercerizado" value={unidadesTercerizadas} href="/logistica" />
      </div>

      {stockBajo.length > 0 && (
        <div id="minimo">
          <h2 className="text-sm font-semibold mb-2">Por debajo del mínimo</h2>
          <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Pieza</th>
                  <th className="text-right px-4 py-2 font-medium">Disponible</th>
                  <th className="text-right px-4 py-2 font-medium">Mínimo</th>
                  {puedeAjustar && <th className="text-left px-4 py-2 font-medium">Ajustar</th>}
                </tr>
              </thead>
              <tbody>
                {stockBajo.map((p) => (
                  <tr key={p.piezaId} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <Link href={`/maestros/pieza/${p.piezaId}`} className="font-mono text-xs text-accent hover:underline mr-1">
                        {p.piezaCodigo}
                      </Link>
                      {p.piezaNombre}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-700">{p.disponible}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">{p.minimo}</td>
                    {puedeAjustar && (
                      <td className="px-4 py-2.5">
                        <form action={ajustarStockAction} className="flex items-center gap-1.5">
                          <input type="hidden" name="piezaId" value={p.piezaId} />
                          <input
                            name="cantidadNueva"
                            type="number"
                            min={0}
                            defaultValue={p.disponible}
                            className="input w-16 text-xs py-1"
                          />
                          <input name="observacion" type="text" placeholder="Motivo (opcional)" className="input w-32 text-xs py-1" />
                          <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap">
                            Guardar
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div id="etapas">
        <h2 className="text-sm font-semibold mb-2">En proceso ahora mismo, por etapa</h2>
        <p className="text-xs text-foreground-muted mb-2">Clickeá una etapa para ver qué piezas la componen.</p>
        {wipOrdenado.length === 0 ? (
          <p className="text-sm text-foreground-muted">No hay piezas en proceso registradas en este momento.</p>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-4 space-y-2.5">
            {wipOrdenado.map((w) => (
              <Link
                key={w.procesoId}
                href={`/stock/etapa/${w.procesoId}`}
                className="flex items-center gap-3 group -mx-2 px-2 py-1 rounded hover:bg-surface-muted"
              >
                <div className="w-32 shrink-0 text-sm truncate group-hover:text-accent">{w.procesoNombre}</div>
                <div className="flex-1 h-5 rounded bg-surface-muted overflow-hidden">
                  <div
                    className="h-full rounded bg-accent group-hover:opacity-80"
                    style={{ width: `${maxUnidades > 0 ? Math.max(4, (w.unidades / maxUnidades) * 100) : 0}%` }}
                  />
                </div>
                <div className="w-28 shrink-0 text-xs text-foreground-muted text-right tabular-nums">
                  {w.unidades} u. · {w.piezas} pieza{w.piezas === 1 ? "" : "s"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Buscar una pieza puntual</h2>
        <div className="max-w-md mb-3 grid sm:grid-cols-2 gap-2">
          <form>
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Buscar pieza por código o nombre…"
              className="input"
            />
          </form>
          <PiezaSelect basePath="/stock" piezas={piezasParaSelect} />
        </div>

        {query && (
          <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Código</th>
                  <th className="text-left px-4 py-2 font-medium">Nombre</th>
                  <th className="text-left px-4 py-2 font-medium">En proceso</th>
                  <th className="text-right px-4 py-2 font-medium">Finalizado</th>
                  {puedeAjustar && <th className="text-left px-4 py-2 font-medium">Ajustar</th>}
                </tr>
              </thead>
              <tbody>
                {resultados.length === 0 ? (
                  <tr>
                    <td colSpan={puedeAjustar ? 5 : 4} className="px-4 py-6 text-center text-foreground-muted">
                      Sin resultados para &ldquo;{q}&rdquo;
                    </td>
                  </tr>
                ) : (
                  resultados.map(({ pieza, finalizado, enProceso }) => (
                    <tr key={pieza.id} className="border-t border-border hover:bg-surface-muted/50">
                      <td className="px-4 py-2.5">
                        <Link href={`/maestros/pieza/${pieza.id}`} className="font-mono text-xs text-accent hover:underline">
                          {pieza.codigo}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">{pieza.nombre}</td>
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
                      <td className="px-4 py-2.5 text-right tabular-nums">{finalizado}</td>
                      {puedeAjustar && (
                        <td className="px-4 py-2.5">
                          <form action={ajustarStockAction} className="flex items-center gap-1.5">
                            <input type="hidden" name="piezaId" value={pieza.id} />
                            <input
                              name="cantidadNueva"
                              type="number"
                              min={0}
                              defaultValue={finalizado}
                              className="input w-16 text-xs py-1"
                            />
                            <input
                              name="observacion"
                              type="text"
                              placeholder="Motivo (opcional)"
                              className="input w-32 text-xs py-1"
                            />
                            <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap">
                              Guardar
                            </button>
                          </form>
                        </td>
                      )}
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
