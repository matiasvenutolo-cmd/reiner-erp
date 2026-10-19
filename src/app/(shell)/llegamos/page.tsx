import Link from "next/link";
import { getPlan } from "@/lib/planning/datos";
import { proximosHabiles, habilesEntre } from "@/lib/planning/calendario";
import { PageHeader } from "@/components/ui/PageHeader";
import { Vacio } from "@/components/ui/Aviso";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { fechaCorta, Estimado, CausaRaiz } from "@/components/v2/Plan";
import { diasHabiles, numero } from "@/lib/formato";
import type { ProyectoPlan } from "@/lib/planning/motor";

export const dynamic = "force-dynamic";

const TIPO = { maquina: "Máquina", repuesto: "Repuesto", stock: "Stock" } as const;

/** Línea de tiempo simple (§2.4): hoy → fin estimado → entrega, con la diferencia marcada en color. */
function LineaDeTiempo({ p, hoy, total }: { p: ProyectoPlan; hoy: string; total: (a: string, b: string) => number }) {
  const fin = [p.finEstimado, p.entrega].sort().at(-1)!;
  const largo = Math.max(1, total(hoy, fin));
  const pos = (f: string) => Math.min(100, Math.max(0, (total(hoy, f) / largo) * 100));
  const tarde = p.diferenciaDias > 0;
  const [a, b] = tarde ? [pos(p.entrega), pos(p.finEstimado)] : [pos(p.finEstimado), pos(p.entrega)];
  // La etiqueta se alinea hacia adentro cerca de los bordes, para que no se corte.
  const alinear = (x: number) => (x > 80 ? "-translate-x-full" : x < 15 ? "" : "-translate-x-1/2");
  const marca = (f: string, label: string, color: string, arriba: boolean, fuerte?: boolean) => {
    const x = pos(f);
    return (
      <div key={label} className="absolute" style={{ left: `${x}%` }}>
        <span className={`absolute top-[22px] -translate-x-1/2 w-3 h-3 rounded-full ring-2 ring-surface ${color}`} />
        <span className={`absolute ${arriba ? "top-0" : "top-[38px]"} ${alinear(x)} text-[11px] whitespace-nowrap ${fuerte ? "text-rojo-fg font-semibold" : "text-foreground-muted"}`}>{label}</span>
      </div>
    );
  };
  return (
    <div className="relative h-14 mt-2 mx-1.5">
      <div className="absolute top-[26px] left-0 right-0 h-1 rounded-full bg-surface-muted" />
      <div className={`absolute top-[26px] h-1 rounded-full ${tarde ? "bg-rojo" : "bg-verde"}`} style={{ left: `${a}%`, width: `${Math.max(0.5, b - a)}%` }} />
      {marca(hoy, "hoy", "bg-foreground", false)}
      {marca(p.entrega, `entrega ${fechaCorta(p.entrega, hoy)}`, "bg-accent", true)}
      {marca(p.finEstimado, `fin estimado ${fechaCorta(p.finEstimado, hoy)}`, tarde ? "bg-rojo" : "bg-verde", false, tarde)}
    </div>
  );
}

/**
 * ¿Llegamos? (dirección): una tarjeta por proyecto con su línea de tiempo,
 * sólo la causa raíz del atraso (no la lista de síntomas) y, al desplegar, el
 * avance por piezas. Abajo, la carga de 30 días como mapa de calor.
 */
export default async function LlegamosPage() {
  const { resultado: r, entrada, centros, proyectosInfo } = await getPlan();
  const cal = entrada.calendario;
  const hoy = entrada.hoy;
  const dias = proximosHabiles(hoy, 22, cal);
  const proyectos = [...r.proyectos].sort((a, b) => b.diferenciaDias - a.diferenciaDias);
  const total = (a: string, b: string) => habilesEntre(a, b, cal);

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="¿Llegamos?"
        descripcion="Cada máquina y orden activa con su fin estimado contra la entrega comprometida. Se recalcula sola con cada avance, atraso, compra o vuelta de un tercerizado."
      />

      {proyectos.length === 0 ? (
        <Vacio neutro accion={<Link href="/proyectos" className="btn-texto btn-sm">Ver proyectos →</Link>}>
          No hay proyectos activos: activá uno cargando su fecha de entrega.
        </Vacio>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4 [&>*]:min-w-0">
          {proyectos.map((p) => {
            const info = proyectosInfo.get(p.id);
            const terminadas = p.conjuntos.reduce((s, c) => s + c.piezas.terminadas, 0);
            const piezas = p.conjuntos.reduce((s, c) => s + c.piezas.total, 0);
            return (
              <article key={p.id} className={`tarjeta franja ${p.diferenciaDias > 0 ? "border-l-rojo" : p.diferenciaDias >= -3 ? "border-l-naranja" : "border-l-verde"} p-5`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/proyectos/${p.id}`} className="text-lg font-bold hover:text-accent hover:underline">
                      {info?.cliente ?? info?.configuracion ?? p.codigo}
                    </Link>
                    <div className="text-sm text-foreground-muted">
                      {[info?.cliente ? info?.configuracion : null, p.codigo, TIPO[p.tipo]].filter(Boolean).join(" · ")}
                      {info?.esDemo && <span className="badge-estado bg-demo-bg text-demo-fg ml-2">demo</span>}
                    </div>
                  </div>
                  {p.diferenciaDias > 0 ? (
                    <Etiqueta tono="rojo">{diasHabiles(p.diferenciaDias)} tarde</Etiqueta>
                  ) : (
                    <Etiqueta tono={p.diferenciaDias >= -3 ? "naranja" : "verde"}>{p.diferenciaDias === 0 ? "justo a tiempo" : `${diasHabiles(-p.diferenciaDias)} antes`}</Etiqueta>
                  )}
                </div>
                <LineaDeTiempo p={p} hoy={hoy} total={total} />
                <div className="mt-3">
                  {p.causas.length ? <CausaRaiz codigo={p.codigo} causas={p.causas.slice(0, 1)} hoy={hoy} chico /> : <p className="text-sm text-verde-fg">Ningún conjunto viene atrasado.</p>}
                </div>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-foreground-muted">
                    Avance: {p.avancePct}% en horas · {numero(terminadas)} de {numero(piezas)} piezas terminadas
                  </summary>
                  <ul className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-1">
                    {p.conjuntos
                      .filter((c) => c.piezas.total > 0)
                      .map((c) => (
                        <li key={c.id} className="flex items-center gap-2">
                          <span className="flex-1 min-w-0 truncate">
                            {c.codigo} {c.nombre}
                          </span>
                          <span className="h-1.5 w-16 rounded-full bg-surface-muted overflow-hidden">
                            <span className="block h-full bg-verde" style={{ width: `${(c.piezas.terminadas / c.piezas.total) * 100}%` }} />
                          </span>
                          <span className="tabular-nums text-xs text-foreground-muted w-10 text-right">
                            {c.piezas.terminadas}/{c.piezas.total}
                          </span>
                        </li>
                      ))}
                  </ul>
                </details>
                <div className="mt-3">
                  <Estimado pct={p.pctEstimado} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold">Carga de los próximos 30 días</h2>
        <p className="text-sm text-foreground-muted mb-3">Cada celda es un día de un centro: de blanco (libre) a rojo (lleno o sobrecargado). Pasá el mouse para ver las horas.</p>
        <div className="tarjeta overflow-x-auto p-3">
          <table className="text-xs border-separate border-spacing-0.5">
            <thead>
              <tr>
                <th className="text-left px-2 py-1 sticky left-0 bg-surface">Centro</th>
                {dias.map((d) => (
                  <th key={d} className="px-0.5 py-1 whitespace-nowrap font-normal">
                    {d.slice(8, 10)}/{d.slice(5, 7)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {centros.map((c) => (
                <tr key={c.id}>
                  <td className="px-2 py-1 font-medium whitespace-nowrap sticky left-0 bg-surface">{c.nombre}</td>
                  {dias.map((d) => {
                    const usado = r.carga.get(c.id)?.get(d) ?? 0;
                    const cap = r.capacidad.get(c.id)?.get(d) ?? 0;
                    const pct = cap ? usado / cap : 0;
                    const bg = !cap ? "bg-surface-muted" : pct >= 0.99 ? "bg-rojo-medio" : pct > 0.75 ? "bg-naranja-medio" : pct > 0.4 ? "bg-naranja-bg" : pct > 0 ? "bg-naranja-tenue" : "bg-surface border border-border";
                    return <td key={d} className={`w-6 h-6 rounded ${bg}`} title={`${c.nombre} · ${fechaCorta(d, hoy)}: ${numero(Math.round(usado * 10) / 10, 1)} de ${numero(Math.round(cap * 10) / 10, 1)} h (${Math.round(pct * 100)}%)`} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-2 mt-2 text-xs text-foreground-muted">
            <span>libre</span>
            {["bg-surface border border-border", "bg-naranja-tenue", "bg-naranja-bg", "bg-naranja-medio", "bg-rojo-medio"].map((c) => (
              <span key={c} className={`w-4 h-4 rounded ${c}`} />
            ))}
            <span>lleno</span>
            <span className="ml-3 w-4 h-4 rounded bg-surface-muted" /> <span>sin capacidad (feriado)</span>
          </div>
        </div>
      </section>
    </div>
  );
}
