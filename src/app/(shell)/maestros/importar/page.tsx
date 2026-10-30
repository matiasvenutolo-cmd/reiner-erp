import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { BotonEnviar } from "@/components/ui/BotonEnviar";
import { analizar, getImportacion, HOJA_PIEZAS, HOJA_PASOS, type Problema } from "@/lib/data/importar";
import { subirExcelAction, confirmarImportacionAction } from "@/app/actions/importar";
import { numero } from "@/lib/formato";

export const dynamic = "force-dynamic";

function Tabla({ titulo, items, tono }: { titulo: string; items: Problema[]; tono: "rojo" | "naranja" }) {
  if (!items.length) return null;
  const color = tono === "rojo" ? "border-rojo/40 bg-rojo-bg text-rojo-fg" : "border-naranja-borde bg-naranja-tenue text-naranja-fg";
  return (
    <section className={`rounded-lg border ${color}`}>
      <h2 className="px-4 py-2 font-semibold">
        {titulo} ({items.length})
      </h2>
      <table className="w-full text-sm bg-surface text-foreground">
        <thead className="text-xs text-foreground-muted">
          <tr className="border-t border-border">
            <th className="text-left px-4 py-1.5 font-medium w-32">Hoja</th>
            <th className="text-left px-2 py-1.5 font-medium w-14">Fila</th>
            <th className="text-left px-2 py-1.5 font-medium">Qué pasa</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => (
            <tr key={i} className="border-t border-border align-top">
              <td className="px-4 py-1.5">{p.hoja}</td>
              <td className="px-2 py-1.5 tabular-nums">{p.fila}</td>
              <td className="px-2 py-1.5">{p.texto}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * Importar desde Excel (reorganización 30/10 §6.2): plantilla, subir el archivo, vista previa con errores y
 * avisos por hoja y fila, y confirmar. Se puede traer un solo conjunto y reimportar sin duplicar.
 */
export default async function ImportarPage({ searchParams }: { searchParams: Promise<{ id?: string; ok?: string; error?: string }> }) {
  const { id, ok, error } = await searchParams;
  const imp = id ? await getImportacion(id) : null;
  const a = imp && !imp.aplicadaAt ? await analizar(imp.datos) : null;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader titulo="Importar desde Excel" descripcion="Carga o actualiza piezas y hojas de ruta de una máquina desde una planilla. Puede traer sólo un conjunto." />
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {!a && (
        <section className="tarjeta p-5 space-y-4">
          <ol className="space-y-3 text-sm">
            <li>
              <span className="font-semibold">1. Bajá la plantilla</span> y completala: una fila por pieza en la hoja &ldquo;{HOJA_PIEZAS}&rdquo; y una fila por paso en &ldquo;{HOJA_PASOS}&rdquo;.
              <div className="mt-2">
                {/* Descarga de un archivo (route handler), no una página: va un <a> común. */}
                <a href="/maestros/importar/plantilla" download className="btn-secundario btn-sm">
                  Bajar la plantilla (.xlsx)
                </a>
              </div>
            </li>
            <li>
              <span className="font-semibold">2. Subí el archivo.</span> Antes de guardar vas a ver qué se carga, qué se actualiza y si hay errores.
              <form action={subirExcelAction} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="file" name="archivo" accept=".xlsx,.xls" required className="text-sm" />
                <BotonEnviar enviando="Leyendo el archivo…">Ver vista previa</BotonEnviar>
              </form>
            </li>
          </ol>
          <p className="text-xs text-foreground-muted">
            Si una pieza o un paso ya existe, se actualiza (por código de pieza y número de paso). Una celda vacía no borra lo que ya estaba cargado. Los tiempos importados quedan como
            definidos por REINER.
          </p>
        </section>
      )}

      {a && imp && (
        <>
          <section className="tarjeta p-5 space-y-3">
            <div className="text-sm text-foreground-muted">
              Archivo <strong className="text-foreground">{imp.archivo}</strong>
              {a.configuraciones.length > 0 && <> · {a.configuraciones.join(", ")}</>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["Piezas nuevas", a.piezasNuevas],
                ["Piezas que se actualizan", a.piezasActualizadas],
                ["Pasos nuevos", a.pasosNuevos],
                ["Pasos que se actualizan", a.pasosActualizados],
              ].map(([l, n]) => (
                <div key={l as string} className="rounded-lg border border-border px-3 py-2">
                  <div className="text-2xl font-semibold tabular-nums">{numero(n as number)}</div>
                  <div className="text-xs text-foreground-muted">{l}</div>
                </div>
              ))}
            </div>
            {a.conjuntosNuevos.length > 0 && <p className="text-sm">Conjuntos nuevos: {a.conjuntosNuevos.join(" · ")}.</p>}
          </section>

          <Tabla titulo="Errores: hay que corregirlos en el Excel" items={a.errores} tono="rojo" />
          <Tabla titulo="Avisos: no frenan la importación" items={a.avisos} tono="naranja" />

          <div className="flex flex-wrap justify-between gap-2">
            <Link href="/maestros/importar" className="btn-secundario">
              Subir otro archivo
            </Link>
            {a.errores.length ? (
              <span className="text-sm text-rojo-fg self-center">Corregí los errores en el Excel y volvé a subirlo: todavía no se guardó nada.</span>
            ) : (
              <form action={confirmarImportacionAction}>
                <input type="hidden" name="id" value={imp.id} />
                <BotonEnviar enviando="Guardando…">Confirmar e importar</BotonEnviar>
              </form>
            )}
          </div>
        </>
      )}
      {imp?.aplicadaAt && <Aviso tipo="info">Esta importación ya se guardó. Para cargar otro archivo, subilo de nuevo.</Aviso>}
    </div>
  );
}
