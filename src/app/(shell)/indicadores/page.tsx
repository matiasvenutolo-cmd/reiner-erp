import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasIndicadores } from "@/components/ui/PestanasSecciones";
import { EsqueletoBloques } from "@/components/ui/EsqueletoBloques";
import { Vacio } from "@/components/ui/Aviso";
import { getCarga, getEspacioLibre } from "@/lib/data/indicadores-vista";
import { fechaCorta } from "@/lib/formato";

export const dynamic = "force-dynamic";

type Params = { vista?: string; por?: string };
const h = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: n < 10 ? 1 : 0 })} h`;

/**
 * Indicadores → Carga (reorganización 30/10 §4.1): la vista de calendario del Plan de la semana, sólo para
 * mirar. Las tareas caen en el día en que se estima que se van a hacer según el orden de cada cola: es una
 * estimación para ver huecos, no un compromiso. Para cambiar algo se va a Gestión.
 */
export default async function CargaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const vista = sp.vista === "mes" ? "mes" : "semana";
  const por = sp.por === "centro" ? "centro" : "operario";
  const link = (k: string, v: string) => {
    const q = new URLSearchParams({ vista, por, [k]: v });
    return `/indicadores?${q}`;
  };
  return (
    <div className="space-y-4">
      <PageHeader titulo="Indicadores" descripcion="Cómo vamos. Sólo para mirar: para asignar o reordenar, Gestión.">
        <PestanasIndicadores actual="/indicadores" />
      </PageHeader>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="inline-flex rounded-md border border-border overflow-hidden">
          {(["semana", "mes"] as const).map((v) => (
            <Link key={v} href={link("vista", v)} className={`px-3 py-1.5 ${vista === v ? "bg-accent text-accent-foreground" : "hover:bg-surface-muted"}`}>
              {v === "semana" ? "Semana" : "Mes"}
            </Link>
          ))}
        </span>
        <span className="inline-flex rounded-md border border-border overflow-hidden">
          {(["operario", "centro"] as const).map((v) => (
            <Link key={v} href={link("por", v)} className={`px-3 py-1.5 ${por === v ? "bg-accent text-accent-foreground" : "hover:bg-surface-muted"}`}>
              {v === "operario" ? "Por operario" : "Por centro"}
            </Link>
          ))}
        </span>
      </div>
      <Suspense fallback={<EsqueletoBloques bloques={4} />}>
        <Carga vista={vista} por={por} />
      </Suspense>
    </div>
  );
}

async function Carga({ vista, por }: { vista: "semana" | "mes"; por: "operario" | "centro" }) {
  const [{ columnas, filas, hoy }, libre] = await Promise.all([getCarga(vista, por), getEspacioLibre()]);
  const libres = [...libre.operarios, ...libre.centros];
  const nada = filas.every((f) => f.celdas.every((c) => c.ocupadas === 0));
  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="font-semibold">Espacio libre en las próximas dos semanas: </span>
        {libres.length ? libres.map((x) => `${x.nombre} ${h(x.horas)}`).join(" · ") : <span className="text-foreground-muted">nadie tiene horas libres.</span>}
      </p>
      {nada && (
        <Vacio neutro>
          {por === "operario" ? "Todavía no hay tareas asignadas: aparecen cuando el jefe de planta las asigna en Gestión." : "Todavía no hay tareas en el plan para estas fechas."}
        </Vacio>
      )}
      <div className="tarjeta overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-foreground-muted">
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 font-medium">{por === "operario" ? "Operario" : "Centro"}</th>
              {columnas.map((c) => (
                <th key={c.clave} className="text-left px-2 py-2 font-medium whitespace-nowrap">
                  {vista === "semana" ? fechaCorta(c.label, hoy) : `Semana del ${fechaCorta(c.label, hoy)}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-border align-top">
                <td className="px-3 py-2 font-medium whitespace-nowrap">
                  {por === "operario" ? (
                    <Link href={`/gestion?operario=${f.id}`} className="hover:text-accent hover:underline">
                      {f.nombre}
                    </Link>
                  ) : (
                    f.nombre
                  )}
                </td>
                {f.celdas.map((c, i) => {
                  const lleno = c.disponibles > 0 ? Math.min(100, (c.ocupadas / c.disponibles) * 100) : c.ocupadas > 0 ? 100 : 0;
                  return (
                    <td key={i} className="px-2 py-2 min-w-28" title={c.tareas.join(" · ")}>
                      <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                        <div className={`h-full ${c.ocupadas > c.disponibles + 0.01 ? "bg-rojo" : lleno >= 100 ? "bg-naranja" : "bg-accent"}`} style={{ width: `${lleno}%` }} />
                      </div>
                      <div className="text-xs text-foreground-muted mt-1 tabular-nums">{c.disponibles > 0 || c.ocupadas > 0 ? `${h(c.ocupadas)} de ${h(c.disponibles)}` : "—"}</div>
                      {c.tareas.length > 0 && vista === "semana" && <div className="text-[11px] text-foreground-muted truncate max-w-36">{c.tareas.slice(0, 2).join(", ")}{c.tareas.length > 2 ? ` y ${c.tareas.length - 2} más` : ""}</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-foreground-muted">
        {por === "operario"
          ? "Cada cola se llena en orden con las horas del operario según el calendario. Es una estimación para ver huecos, no un compromiso."
          : "Lo que el plan ubica en cada centro contra su capacidad (horas por día × máquinas × eficiencia)."}
      </p>
    </div>
  );
}
