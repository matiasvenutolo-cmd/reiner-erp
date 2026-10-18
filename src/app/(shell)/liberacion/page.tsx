import Link from "next/link";
import { getPlan, getParametros } from "@/lib/planning/datos";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso, Vacio } from "@/components/ui/Aviso";
import { Holgura, fechaCorta } from "@/components/v2/Plan";
import { liberarAction } from "@/app/actions/v2";
import type { Tarea } from "@/lib/planning/motor";

export const dynamic = "force-dynamic";

/**
 * Liberación de piezas (ingeniería): no se libera todo junto. El sistema
 * propone la tanda de piezas cuyo primer paso tiene que empezar dentro del
 * horizonte (15 días hábiles por defecto); ingeniería la revisa y la libera.
 * Recién liberada, la pieza entra al plan de la semana y a los centros.
 */
export default async function LiberacionPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const [{ resultado: r, proyectosInfo }, parametros] = await Promise.all([getPlan(), getParametros()]);
  const { horizonte, exigirPlano } = parametros;

  const primerPaso = new Map<string, Tarea>();
  for (const t of r.tareas) if (t.posicion === 1) primerPaso.set(t.otPiezaId, t);
  const proyectos = r.proyectos
    .map((p) => {
      const tanda = r.tandas.find((x) => x.proyectoId === p.id);
      const enTanda = new Set(tanda?.otPiezaIds ?? []);
      const sinPlano = new Set(tanda?.sinPlano ?? []);
      const despues = [...primerPaso.values()].filter((t) => t.proyectoId === p.id && t.estado === "futura" && !enTanda.has(t.otPiezaId) && !sinPlano.has(t.otPiezaId));
      return {
        p,
        tanda: [...enTanda].map((id) => primerPaso.get(id)).filter((t): t is Tarea => !!t).sort((a, b) => a.holgura - b.holgura),
        sinPlano: [...sinPlano].map((id) => primerPaso.get(id)).filter((t): t is Tarea => !!t),
        despues: despues.sort((a, b) => a.inicioMasTardio.localeCompare(b.inicioMasTardio)),
      };
    })
    .filter((x) => x.tanda.length || x.sinPlano.length || x.despues.length);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Liberación de piezas"
        descripcion={`Las piezas se liberan por tandas: el sistema propone las que tienen que empezar en los próximos ${horizonte} días hábiles. Revisá, destildá lo que no quieras y liberá. Lo liberado entra al plan de la semana.`}
      />
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {proyectos.length === 0 && <Vacio>No hay piezas para liberar: todo lo que tiene que empezar pronto ya está en producción.</Vacio>}

      {proyectos.map(({ p, tanda, sinPlano, despues }) => {
        const info = proyectosInfo.get(p.id);
        return (
          <section key={p.id} id={p.id} className="tarjeta overflow-hidden scroll-mt-20">
            <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-border">
              <div>
                <Link href={`/proyectos/${p.id}`} className="font-mono font-semibold hover:text-accent hover:underline">
                  {p.codigo}
                </Link>
                <span className="text-sm text-foreground-muted"> · {[info?.cliente, info?.configuracion].filter(Boolean).join(" · ")} · entrega {fechaCorta(p.entrega)}</span>
              </div>
              <span className="text-sm text-foreground-muted">
                {tanda.length} en la tanda · {despues.length} para más adelante
              </span>
            </div>
            {tanda.length > 0 ? (
              <form action={liberarAction}>
                <input type="hidden" name="volver" value={`/liberacion#${p.id}`} />
                <table className="w-full text-sm">
                  <tbody>
                    {tanda.map((t) => (
                      <tr key={t.otPiezaId} className="border-t border-border first:border-t-0">
                        <td className="pl-4 py-2 w-8">
                          <input type="checkbox" name="otPiezaId" value={t.otPiezaId} defaultChecked aria-label={`Liberar ${t.piezaNombre}`} />
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-medium">
                            {t.piezaNombre} × {t.cantidad}
                          </div>
                          <div className="text-xs text-foreground-muted">
                            <span className="font-mono">{t.piezaCodigo}</span> · arranca por {t.paso}
                          </div>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="text-xs text-foreground-muted">Tiene que empezar el</div>
                          <div className="font-semibold">{fechaCorta(t.inicioMasTardio)}</div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Holgura nivel={t.nivel} dias={t.holgura} corto />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end px-4 py-3 border-t border-border bg-surface-muted/50">
                  <button className="btn">Liberar las piezas tildadas</button>
                </div>
              </form>
            ) : (
              <p className="px-4 py-3 text-sm text-foreground-muted">Nada que liberar en este horizonte.</p>
            )}
            {sinPlano.length > 0 && (
              <div className="px-4 py-3 border-t border-border bg-[#fffbeb] text-sm">
                <strong className="text-[#92400e]">Sin plano ({sinPlano.length}):</strong> no se pueden liberar hasta que ingeniería cargue el plano{exigirPlano ? "" : " (regla desactivada en Admin)"}.
                <div className="text-xs text-foreground-muted mt-1">{sinPlano.map((t) => t.piezaCodigo).join(", ")}</div>
              </div>
            )}
            {despues.length > 0 && (
              <details className="px-4 py-3 border-t border-border text-sm">
                <summary className="cursor-pointer text-foreground-muted">Fuera del horizonte: {despues.length} piezas, la próxima empieza el {fechaCorta(despues[0].inicioMasTardio)}</summary>
                <ul className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                  {despues.map((t) => (
                    <li key={t.otPiezaId} className="flex justify-between gap-2">
                      <span>{t.piezaNombre}</span>
                      <span className="text-foreground-muted whitespace-nowrap">{fechaCorta(t.inicioMasTardio)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
