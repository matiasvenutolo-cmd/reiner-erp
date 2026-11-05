import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasIndicadores } from "@/components/ui/PestanasSecciones";
import { Vacio } from "@/components/ui/Aviso";
import { getTiempos } from "@/lib/data/indicadores-vista";

export const dynamic = "force-dynamic";

const min = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-AR", { maximumFractionDigits: n < 10 ? 1 : 0 })} min`);

function Desvio({ v }: { v: number | null }) {
  if (v == null) return <span className="text-foreground-muted">—</span>;
  const clase = Math.abs(v) <= 10 ? "text-verde-fg" : Math.abs(v) <= 30 ? "text-naranja-fg" : "text-rojo-fg";
  return <span className={`font-semibold tabular-nums ${clase}`}>{v > 0 ? `+${v}` : v}%</span>;
}

/**
 * Indicadores → Tiempos (reorganización 30/10 §4.3): ¿los tiempos cargados son reales? Real contra estimado por
 * pieza y paso, de mayor a menor desvío. Corregir un tiempo se hace en Ingeniería (la hoja de ruta), no acá.
 */
export default async function TiemposPage() {
  const { tiempos, porCentro } = await getTiempos();
  return (
    <div className="space-y-6">
      <PageHeader titulo="Indicadores" descripcion="Tiempos reales contra estimados. Sólo para mirar: el tiempo estándar lo corrige ingeniería en la hoja de ruta.">
        <PestanasIndicadores actual="/indicadores/tiempos" />
      </PageHeader>

      {tiempos.length === 0 ? (
        <Vacio neutro>Todavía no hay tiempos registrados: aparecen cuando los operarios empiecen a usar la tablet.</Vacio>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Setup sobre horas totales, por centro</h2>
            <ul className="tarjeta divide-y divide-border text-sm">
              {porCentro.map((c) => {
                const p = c.total > 0 ? Math.round((c.setup / c.total) * 100) : 0;
                return (
                  <li key={c.centro} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-44 shrink-0 font-medium">{c.centro}</span>
                    <span className="flex-1 h-2 rounded-full bg-surface-muted overflow-hidden">
                      <span className="block h-full bg-naranja" style={{ width: `${p}%` }} />
                    </span>
                    <span className="tabular-nums text-foreground-muted w-48 text-right">
                      {p}% setup · {c.setup.toLocaleString("es-AR", { maximumFractionDigits: 1 })} de {c.total.toLocaleString("es-AR", { maximumFractionDigits: 1 })} h
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Real contra estimado, por pieza y paso</h2>
            <p className="text-sm text-foreground-muted">Ordenado por mayor desvío: arriba, los tiempos para corregir primero.</p>
            <div className="tarjeta overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-foreground-muted">
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 font-medium">Pieza y paso</th>
                    <th className="text-right px-2 py-2 font-medium">Setup estimado</th>
                    <th className="text-right px-2 py-2 font-medium">Setup real</th>
                    <th className="text-right px-2 py-2 font-medium">Diferencia</th>
                    <th className="text-right px-2 py-2 font-medium">Por unidad estimado</th>
                    <th className="text-right px-2 py-2 font-medium">Por unidad real</th>
                    <th className="text-right px-2 py-2 font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {tiempos.map((t) => (
                    <tr key={t.operacionId} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="font-medium">{t.pieza}</div>
                        <div className="text-xs text-foreground-muted">
                          <span className="font-mono">{t.codigo}</span> · paso {t.secuencia}: {t.paso} · {t.registros} registro{t.registros === 1 ? "" : "s"}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{min(t.setupEst)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{min(t.setupReal)}</td>
                      <td className="px-2 py-2 text-right">
                        <Desvio v={t.desvioSetup} />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{min(t.unidadEst)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{min(t.unidadReal)}</td>
                      <td className="px-2 py-2 text-right">
                        <Desvio v={t.desvioUnidad} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
