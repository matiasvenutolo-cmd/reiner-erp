import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { configuracion, conjunto, pieza, piezaConfiguracion } from "@/lib/db/schema";
import { getGrillaTiempos, type PasoGrilla } from "@/lib/data/grilla-tiempos";
import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasMaestros } from "@/components/ui/PestanasSecciones";
import { Aviso } from "@/components/ui/Aviso";
import { guardarGrillaAction, importarTiemposCsvAction, copiarRutaAction } from "@/app/actions/v2";

export const dynamic = "force-dynamic";

const FILTROS = [
  ["todas", "Todas"],
  ["sin-tiempo", "Con pasos sin tiempo propio"],
  ["sin-ruta", "Sin hoja de ruta"],
] as const;

function Celda({ s }: { s: PasoGrilla }) {
  if (s.tipo !== "interno")
    return (
      <div className="rounded-md bg-surface-muted/60 px-2 py-1.5 min-w-32">
        <div className="text-[11px] font-medium truncate">{s.secuencia}. {s.proceso}</div>
        <div className="text-[11px] text-foreground-muted">{s.tipo === "tercerizado" ? "Tercerizado" : "Compra"} · {s.plazo ?? "?"} días</div>
      </div>
    );
  const propio = s.minPorUnidad != null;
  return (
    <div className={`rounded-md border px-2 py-1.5 min-w-32 ${propio ? "border-[#bbf7d0] bg-[#f0fdf4]" : "border-border"}`}>
      <div className="text-[11px] font-medium truncate" title={s.proceso}>
        {s.secuencia}. {s.proceso}
      </div>
      <div className="flex gap-1 mt-1">
        <input type="hidden" name={`orig_setup__${s.id}`} value={s.setupMin ?? ""} />
        <input type="hidden" name={`orig_min__${s.id}`} value={s.minPorUnidad ?? ""} />
        <input name={`setup__${s.id}`} defaultValue={s.setupMin ?? ""} placeholder={String(s.defSetup ?? "")} inputMode="decimal" className="input text-xs py-0.5 px-1 w-12" aria-label="Setup en minutos" title="Setup (min)" />
        <input name={`min__${s.id}`} defaultValue={s.minPorUnidad ?? ""} placeholder={String(s.defMin ?? "")} inputMode="decimal" className="input text-xs py-0.5 px-1 w-14" aria-label="Minutos por unidad" title="Min por unidad" />
      </div>
    </div>
  );
}

/**
 * Grilla de tiempos (ingeniería): una fila por pieza, una celda por paso.
 * Se completa de corrido con Tab; vacío = usa el tiempo por defecto del
 * proceso (el gris). Para cargar mucho de una vez: exportar a CSV, completar
 * en Excel e importar.
 */
export default async function GrillaTiemposPage({ searchParams }: { searchParams: Promise<{ config?: string; conjunto?: string; filtro?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const filtro = sp.filtro ?? "todas";
  const configs = await db.select().from(configuracion).orderBy(configuracion.codigo);
  const config = configs.find((c) => c.id === sp.config) ?? configs[0];
  const conjuntos = await db
    .selectDistinct({ id: conjunto.id, codigo: conjunto.codigo, nombre: conjunto.nombre })
    .from(conjunto)
    .innerJoin(pieza, eq(pieza.conjuntoId, conjunto.id))
    .innerJoin(piezaConfiguracion, eq(piezaConfiguracion.piezaId, pieza.id))
    .where(eq(piezaConfiguracion.configuracionId, config.id))
    .orderBy(asc(conjunto.codigo));
  const conj = sp.conjunto === "todos" || filtro !== "todas" ? null : conjuntos.find((c) => c.id === sp.conjunto) ?? conjuntos[0];
  const todas = await getGrillaTiempos(config.id, conj?.id);
  const internos = todas.flatMap((p) => p.pasos.filter((s) => s.tipo === "interno"));
  const pctPropio = internos.length ? Math.round((internos.filter((s) => s.minPorUnidad != null).length / internos.length) * 100) : 100;
  const filas =
    filtro === "sin-ruta"
      ? todas.filter((p) => p.pasos.length === 0 && p.clase !== "comercial")
      : filtro === "sin-tiempo"
        ? todas.filter((p) => p.pasos.some((s) => s.tipo === "interno" && s.minPorUnidad == null))
        : todas;
  const conRuta = todas.filter((p) => p.pasos.length > 0);
  const q = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams({ config: config.id, ...(conj ? { conjunto: conj.id } : {}), filtro, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)) as Record<string, string> });
    return `/maestros/tiempos?${u}`;
  };
  const volver = q({});

  return (
    <div className="space-y-4">
      <PageHeader titulo="Grilla de tiempos" descripcion="Tiempo de setup y minutos por unidad de cada paso, pieza por pieza. Vacío = usa el tiempo por defecto del proceso (en gris). Pasá de una celda a la otra con Tab y guardá al final.">
        <PestanasMaestros actual="/maestros/tiempos" />
      </PageHeader>
      {sp.ok && <Aviso tipo="ok">{sp.ok}</Aviso>}
      {sp.error && <Aviso tipo="error">{sp.error}</Aviso>}

      <div className="flex flex-wrap items-center gap-2">
        {configs.map((c) => (
          <Link key={c.id} href={`/maestros/tiempos?config=${c.id}&filtro=${filtro}`} className={`rounded-md border px-3 py-1 text-sm ${c.id === config.id ? "border-accent bg-accent-soft text-accent font-semibold" : "border-border hover:bg-surface-muted"}`}>
            {c.codigo}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {filtro === "todas" && (
            <form className="flex items-center gap-1">
              <input type="hidden" name="config" value={config.id} />
              <select name="conjunto" defaultValue={conj?.id ?? "todos"} className="input text-sm py-1">
                {conjuntos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} {c.nombre}
                  </option>
                ))}
                <option value="todos">Todos los conjuntos</option>
              </select>
              <button className="btn-secundario btn-sm">Ver</button>
            </form>
          )}
          <div className="flex rounded-md border border-border overflow-hidden">
            {FILTROS.map(([v, l]) => (
              <Link key={v} href={`/maestros/tiempos?config=${config.id}&filtro=${v}`} className={`px-3 py-1 ${filtro === v ? "bg-accent text-accent-foreground" : "hover:bg-surface-muted"}`}>
                {l}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className={`font-semibold ${pctPropio >= 90 ? "text-[#00755d]" : pctPropio >= 50 ? "text-[#9a3412]" : "text-[#991b1b]"}`}>{pctPropio}% con tiempo propio</span>
          <a href={`/maestros/tiempos/csv?config=${config.id}${conj ? `&conjunto=${conj.id}` : ""}`} className="btn-secundario btn-sm">
            Exportar CSV
          </a>
          <form action={importarTiemposCsvAction} className="flex items-center gap-1">
            <input type="hidden" name="volver" value={volver} />
            <input type="file" name="archivo" accept=".csv,text/csv" required className="text-xs w-44" aria-label="Archivo CSV" />
            <button className="btn-secundario btn-sm">Importar</button>
          </form>
        </div>
      </div>

      {filtro === "sin-ruta" ? (
        filas.length === 0 ? (
          <Aviso tipo="ok">Todas las piezas fabricadas de {config.codigo} tienen hoja de ruta.</Aviso>
        ) : (
          <form action={copiarRutaAction} className="tarjeta overflow-hidden">
            <input type="hidden" name="volver" value={volver} />
            <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-border bg-surface-muted/50 text-sm">
              <label className="flex-1 min-w-64">
                Copiar la hoja de ruta y los tiempos de
                <select name="origen" required className="input block w-full mt-0.5">
                  {conRuta.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} · {p.nombre} ({p.pasos.length} pasos)
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn">a las piezas tildadas</button>
            </div>
            <ul className="divide-y divide-border text-sm">
              {filas.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                  <input type="checkbox" name="destino" value={p.id} aria-label={p.nombre} />
                  <Link href={`/maestros/pieza/${p.id}`} className="font-mono text-xs text-accent hover:underline w-36">
                    {p.codigo}
                  </Link>
                  <span>{p.nombre}</span>
                </li>
              ))}
            </ul>
          </form>
        )
      ) : (
        <form action={guardarGrillaAction} className="space-y-3">
          <input type="hidden" name="volver" value={volver} />
          <div className="tarjeta overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead>
                <tr className="text-xs text-foreground-muted">
                  <th className="text-left font-medium px-3 py-2 sticky left-0 bg-surface min-w-56">Pieza</th>
                  <th className="text-left font-medium px-2 py-2" colSpan={12}>
                    Pasos · <span className="font-normal">setup (min) · min por unidad</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 sticky left-0 bg-surface">
                      <Link href={`/maestros/pieza/${p.id}`} className="font-mono text-xs text-accent hover:underline">
                        {p.codigo}
                      </Link>
                      <div className="text-xs leading-tight">{p.nombre}</div>
                      {p.clase !== "fabricada" && <span className="badge-estado bg-surface-muted text-foreground text-[10px]">{p.clase === "comercial" ? "Comercial" : "A medida"}</span>}
                    </td>
                    {p.pasos.length === 0 ? (
                      <td className="px-2 py-2 text-xs text-foreground-muted">{p.clase === "comercial" ? "Se compra hecha: no lleva ruta." : "Sin hoja de ruta"}</td>
                    ) : (
                      p.pasos.map((s) => (
                        <td key={s.id} className="px-1 py-1.5">
                          <Celda s={s} />
                        </td>
                      ))
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sticky bottom-0 flex items-center justify-between gap-3 bg-surface/95 backdrop-blur border border-border rounded-lg px-4 py-2.5">
            <span className="text-xs text-foreground-muted">
              {filas.length} piezas · verde = tiempo propio cargado · gris = usa el del proceso
            </span>
            <button className="btn">Guardar tiempos</button>
          </div>
        </form>
      )}
    </div>
  );
}
