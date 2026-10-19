import Link from "next/link";
import { getPlan } from "@/lib/planning/datos";
import { proximosHabiles } from "@/lib/planning/calendario";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pestanas } from "@/components/ui/Pestanas";
import { Vacio } from "@/components/ui/Aviso";
import { fechaCorta, Estimado } from "@/components/v2/Plan";

export const dynamic = "force-dynamic";

const TIPO = { maquina: "Máquina", repuesto: "Repuesto", stock: "Stock" } as const;

function Diferencia({ dias }: { dias: number }) {
  const [txt, cls] =
    dias > 0
      ? [`${dias} día${dias === 1 ? "" : "s"} tarde`, "bg-rojo-bg text-rojo-fg"]
      : dias >= -3
        ? [dias === 0 ? "justo a tiempo" : `${-dias} día${dias === -1 ? "" : "s"} antes`, "bg-naranja-bg text-naranja-fg"]
        : [`${-dias} días antes`, "bg-verde-bg text-verde-fg"];
  return <span className={`inline-block rounded-lg px-3 py-1.5 text-lg font-semibold ${cls}`}>{txt}</span>;
}

/**
 * ¿Llegamos? (dirección; reemplaza Avance): una tarjeta por proyecto con su
 * fecha estimada de fin contra la entrega comprometida, qué conjuntos lo
 * atrasan y la carga de los centros para ver los cuellos de botella.
 */
export default async function LlegamosPage() {
  const { resultado: r, entrada, centros, proyectosInfo } = await getPlan();
  const dias = proximosHabiles(entrada.hoy, 22, entrada.calendario);
  const proyectos = [...r.proyectos].sort((a, b) => b.diferenciaDias - a.diferenciaDias);

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="¿Llegamos?"
        descripcion="Cada máquina y orden activa con su fecha estimada de fin contra la entrega comprometida. Se recalcula sola con cada avance, atraso, compra o vuelta de un tercerizado."
      >
        <Pestanas
          actual="/llegamos"
          items={[
            { href: "/llegamos", label: "¿Llegamos?" },
            { href: "/avance", label: "Avance por piezas" },
          ]}
        />
      </PageHeader>

      {proyectos.length === 0 ? (
        <Vacio accion={<Link href="/proyectos" className="btn btn-sm">Ver proyectos</Link>}>No hay proyectos activos: activá uno cargando su fecha de entrega.</Vacio>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4 [&>*]:min-w-0">
          {proyectos.map((p) => {
            const info = proyectosInfo.get(p.id);
            const atrasan = p.conjuntos.filter((c) => c.atrasoDias > 0).sort((a, b) => b.atrasoDias - a.atrasoDias);
            return (
              <Link key={p.id} href={`/proyectos/${p.id}`} className="tarjeta p-5 hover:border-accent transition-colors block">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{p.codigo}</span>
                      <span className="badge-estado bg-surface-muted text-foreground">{TIPO[p.tipo]}</span>
                      {p.prioridad === "alta" && <span className="badge-estado badge-alerta">Prioridad alta</span>}
                      {info?.esDemo && <span className="badge-estado bg-demo-bg text-demo-fg">demo</span>}
                    </div>
                    <div className="text-sm text-foreground-muted mt-0.5">
                      {[info?.cliente, info?.configuracion].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <Diferencia dias={p.diferenciaDias} />
                </div>
                <dl className="grid grid-cols-3 gap-3 mt-4 text-sm">
                  <div>
                    <dt className="text-xs text-foreground-muted">Entrega comprometida</dt>
                    <dd className="font-semibold">{fechaCorta(p.entrega)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-foreground-muted">Fin estimado</dt>
                    <dd className="font-semibold">{fechaCorta(p.finEstimado)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-foreground-muted">Avance en horas</dt>
                    <dd className="font-semibold tabular-nums">
                      {p.avancePct}% <span className="text-xs font-normal text-foreground-muted">({Math.round(p.horasHechas)} de {Math.round(p.horasTotales)} h)</span>
                    </dd>
                  </div>
                </dl>
                <div className="h-2 rounded-full bg-surface-muted mt-2 overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${p.avancePct}%` }} />
                </div>
                <div className="mt-4">
                  <div className="text-xs font-semibold text-foreground-muted mb-1">{atrasan.length ? "Lo que lo atrasa" : "Ningún conjunto viene atrasado"}</div>
                  <ul className="text-sm space-y-1">
                    {atrasan.slice(0, 4).map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2">
                        <span>
                          {c.codigo} {c.nombre}
                        </span>
                        <span className="text-xs text-foreground-muted">
                          {c.motivoAtraso} · <span className="text-rojo-fg font-semibold">+{c.atrasoDias} días</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-3">
                  <Estimado pct={p.pctEstimado} />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold">Carga de los próximos 30 días</h2>
        <p className="text-sm text-foreground-muted mb-3">Horas planificadas sobre horas disponibles, por centro y por día. Los rojos son los cuellos de botella.</p>
        <div className="tarjeta overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left font-medium px-3 py-2 sticky left-0 bg-surface">Centro</th>
                {dias.map((d) => (
                  <th key={d} className="font-medium px-1 py-2 text-foreground-muted whitespace-nowrap">
                    {d.slice(8, 10)}/{d.slice(5, 7)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {centros.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-1.5 font-medium whitespace-nowrap sticky left-0 bg-surface">{c.nombre}</td>
                  {dias.map((d) => {
                    const usado = r.carga.get(c.id)?.get(d) ?? 0;
                    const cap = r.capacidad.get(c.id)?.get(d) ?? 0;
                    const pct = cap ? usado / cap : 0;
                    const bg = !cap ? "bg-surface-muted" : pct >= 0.99 ? "bg-rojo-medio" : pct > 0.75 ? "bg-naranja-medio" : pct > 0.3 ? "bg-verde-medio" : pct > 0 ? "bg-verde-tenue" : "";
                    return (
                      <td key={d} className={`px-1 py-1.5 text-center tabular-nums ${bg}`} title={`${c.nombre} ${fechaCorta(d)}: ${Math.round(usado * 10) / 10} de ${Math.round(cap * 10) / 10} h`}>
                        {usado ? Math.round((pct || 0) * 100) : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-foreground-muted mt-2">Cada celda es el % de la capacidad del día usado por el plan. Gris: día sin capacidad (feriado o sin operarios).</p>
      </section>
    </div>
  );
}
