import Link from "next/link";
import { getPlan, getParametros } from "@/lib/planning/datos";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso, Vacio } from "@/components/ui/Aviso";
import { Holgura, fechaCorta } from "@/components/v2/Plan";
import { liberarAction } from "@/app/actions/v2";
import { avisarAction } from "@/app/actions/operario";
import { Codigo } from "@/components/ui/Codigo";
import { capitalizar, plural } from "@/lib/formato";
import type { Tarea } from "@/lib/planning/motor";

export const dynamic = "force-dynamic";

/**
 * Liberación de piezas (ingeniería). Con entrada automática (simplificación
 * §4.3, el modo por defecto) sólo lista las piezas que esperan plano o revisión.
 * Con "A mano, por tandas" (ADMIN) es la de siempre: no se libera todo junto. El sistema
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

  // Simplificación §4.3: con entrada automática, esta pantalla sólo muestra lo que espera a ingeniería.
  if (parametros.entradaAutomatica) {
    const esperan = proyectos.filter((x) => x.sinPlano.length);
    return (
      <div className="space-y-6">
        <PageHeader titulo="Entrada al plan" descripcion="Las piezas entran solas al plan: al confirmar la orden si tienen material y, si no, cuando llega la compra. Acá quedan sólo las que esperan a ingeniería." />
        <p className="text-sm font-medium">Piezas que esperan plano o revisión de ingeniería</p>
        {ok && <Aviso tipo="ok">{ok}</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}
        {esperan.length === 0 && (
          <Vacio>
            Ninguna pieza espera plano o revisión.
            {!exigirPlano && " Hoy ADMIN no exige plano para entrar al plan."}
          </Vacio>
        )}
        {esperan.map(({ p, sinPlano }) => {
          const info = proyectosInfo.get(p.id);
          return (
            <section key={p.id} id={p.id} className="tarjeta overflow-hidden scroll-mt-20">
              <div className="px-4 py-3 border-b border-border">
                <Link href={`/proyectos/${p.id}`} className="font-mono font-semibold hover:text-accent hover:underline">
                  {p.codigo}
                </Link>
                <span className="text-sm text-foreground-muted"> · {[info?.cliente, info?.configuracion].filter(Boolean).join(" · ")} · entrega {fechaCorta(p.entrega)}</span>
              </div>
              <ul className="divide-y divide-border">
                {sinPlano.map((t) => (
                  <li key={t.otPiezaId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span>
                      {capitalizar(t.piezaNombre)} <Codigo valor={t.piezaCodigo} />
                      <span className="text-xs text-foreground-muted"> · tiene que empezar el {fechaCorta(t.inicioMasTardio)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Link href={`/maestros/pieza/${encodeURIComponent(t.piezaCodigo)}`} className="btn-texto btn-sm">
                        Cargar plano
                      </Link>
                      <form action={avisarAction}>
                        <input type="hidden" name="tipo" value="falta_plano" />
                        <input type="hidden" name="otPiezaId" value={t.otPiezaId} />
                        <input type="hidden" name="texto" value={`Falta el plano o la revisión de ${t.piezaNombre} (${t.piezaCodigo}) para que pueda entrar al plan`} />
                        <input type="hidden" name="volver" value={`/liberacion#${p.id}`} />
                        <button className="btn-secundario btn-sm">Avisar a ingeniería</button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Entrada al plan"
        descripcion={`El sistema propone qué piezas pasan al plan: las que tienen que empezar en las próximas ${Math.round(horizonte / 5)} semanas. Revisá, destildá lo que no quieras y pasalas al plan.`}
      />
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {proyectos.length === 0 && <Vacio>No hay piezas para pasar al plan: todo lo que tiene que empezar pronto ya está en el plan.</Vacio>}

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
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-accent-soft/60 border-b border-border">
                  <span className="text-sm">El sistema sugiere pasar {plural(tanda.length, "pieza")} al plan: las que tienen que empezar en las próximas {Math.round(horizonte / 5)} semanas.</span>
                  <button className="btn">Pasar las {tanda.length} al plan</button>
                </div>
                <details className="group">
                  <summary className="px-4 py-2 text-sm text-accent cursor-pointer list-none hover:underline">Ver la lista para destildar excepciones</summary>
                <table className="w-full text-sm">
                  <tbody>
                    {tanda.map((t) => (
                      <tr key={t.otPiezaId} className="border-t border-border first:border-t-0">
                        <td className="pl-4 py-2 w-8">
                          <input type="checkbox" name="otPiezaId" value={t.otPiezaId} defaultChecked aria-label={`Pasar al plan ${t.piezaNombre}`} />
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-medium">
                            {capitalizar(t.piezaNombre)} × {t.cantidad}
                          </div>
                          <div className="text-xs text-foreground-muted flex flex-wrap gap-2 items-center">
                            <Codigo valor={t.piezaCodigo} /> · arranca por {t.paso}
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
                </details>
              </form>
            ) : (
              <p className="px-4 py-3 text-sm text-foreground-muted">Nada para pasar al plan por ahora.</p>
            )}
            {sinPlano.length > 0 && (
              <div className="px-4 py-3 border-t border-border bg-naranja-tenue text-sm space-y-2">
                <div className="font-semibold text-naranja-fg">No pueden entrar al plan todavía ({sinPlano.length}): les falta el plano o la revisión{exigirPlano ? "" : " (regla desactivada en Admin)"}.</div>
                <ul className="space-y-1.5">
                  {sinPlano.map((t) => (
                    <li key={t.otPiezaId} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {capitalizar(t.piezaNombre)} <Codigo valor={t.piezaCodigo} />
                      </span>
                      <form action={avisarAction}>
                        <input type="hidden" name="tipo" value="falta_plano" />
                        <input type="hidden" name="otPiezaId" value={t.otPiezaId} />
                        <input type="hidden" name="texto" value={`Falta el plano o la revisión de ${t.piezaNombre} (${t.piezaCodigo}) para que pueda entrar al plan`} />
                        <input type="hidden" name="volver" value={`/liberacion#${p.id}`} />
                        <button className="btn-secundario btn-sm">Avisar a ingeniería</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {despues.length > 0 && (
              <details className="px-4 py-3 border-t border-border text-sm">
                <summary className="cursor-pointer text-foreground-muted">Más adelante: {despues.length} piezas, la próxima empieza el {fechaCorta(despues[0].inicioMasTardio)}</summary>
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
