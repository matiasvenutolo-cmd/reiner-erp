import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { configuracion, montajeConjunto, conjunto } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { moverMontajeAction, guardarMontajeAction } from "@/app/actions/v2";

export const dynamic = "force-dynamic";

/**
 * Secuencias de montaje: en qué orden se montan los conjuntos de cada
 * configuración y cuántos días lleva cada uno. El plan calcula hacia atrás
 * desde la entrega: montaje final → conjuntos en este orden → piezas.
 */
export default async function MontajePage({ searchParams }: { searchParams: Promise<{ config?: string; ok?: string; error?: string }> }) {
  const { config, ok, error } = await searchParams;
  const configs = await db.select().from(configuracion).orderBy(configuracion.codigo);
  const actual = configs.find((c) => c.id === config) ?? configs[0];
  const filas = actual
    ? await db
        .select({ m: montajeConjunto, codigo: conjunto.codigo, nombre: conjunto.nombre })
        .from(montajeConjunto)
        .innerJoin(conjunto, eq(conjunto.id, montajeConjunto.conjuntoId))
        .where(eq(montajeConjunto.configuracionId, actual.id))
        .orderBy(asc(montajeConjunto.orden))
    : [];
  const totalDias = filas.reduce((s, f) => s + f.m.dias, 0) + (actual?.montajeFinalDias ?? 0);
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader titulo="Secuencias de montaje" descripcion="El orden en que se montan los conjuntos de cada máquina. Cada conjunto necesita sus piezas terminadas unos días antes de su montaje (el margen)." />
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex flex-wrap gap-2">
        {configs.map((c) => (
          <Link key={c.id} href={`/admin/montaje?config=${c.id}`} className={`rounded-md border px-3 py-1.5 text-sm ${c.id === actual?.id ? "border-accent bg-accent-soft text-accent font-semibold" : "border-border hover:bg-surface-muted"}`}>
            {c.codigo}
          </Link>
        ))}
      </div>
      {actual && (
        <>
          {actual.montajeOrigen !== "definido" && <Aviso tipo="atencion">Secuencia estimada por el sistema para mostrar la idea. Ajustala con el orden real de montaje de REINER.</Aviso>}
          <form action={guardarMontajeAction} className="tarjeta overflow-hidden">
            <input type="hidden" name="configuracionId" value={actual.id} />
            <table className="w-full text-sm">
              <thead className="text-xs text-foreground-muted">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 font-medium w-12">#</th>
                  <th className="text-left px-3 py-2 font-medium">Conjunto</th>
                  <th className="text-left px-3 py-2 font-medium">Días de montaje</th>
                  <th className="px-4 py-2 font-medium text-right">Orden</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={f.m.conjuntoId} className="border-t border-border">
                    <td className="px-4 py-2 tabular-nums text-foreground-muted">{i + 1}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-foreground-muted mr-2">{f.codigo}</span>
                      {f.nombre}
                    </td>
                    <td className="px-3 py-2">
                      <input name={`dias_${f.m.conjuntoId}`} type="number" min="0" defaultValue={f.m.dias} className="input text-sm py-1 w-20" aria-label={`Días de ${f.nombre}`} />
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {(["arriba", "abajo"] as const).map((dir) => (
                        <button
                          key={dir}
                          formAction={moverMontajeAction}
                          name="mover"
                          value={`${dir}|${f.m.conjuntoId}`}
                          disabled={(dir === "arriba" && i === 0) || (dir === "abajo" && i === filas.length - 1)}
                          className="btn-secundario btn-sm ml-1 disabled:opacity-30"
                          aria-label={dir === "arriba" ? "Subir" : "Bajar"}
                          formNoValidate
                        >
                          {dir === "arriba" ? "↑" : "↓"}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-end gap-4 px-4 py-3 border-t border-border bg-surface-muted/50 text-sm">
              <label>
                Montaje final y pruebas (días)
                <input name="montajeFinalDias" type="number" min="0" defaultValue={actual.montajeFinalDias} className="input block mt-0.5 w-28" />
              </label>
              <label>
                Margen: piezas listas antes del montaje (días)
                <input name="margenMontajeDias" type="number" min="0" defaultValue={actual.margenMontajeDias} className="input block mt-0.5 w-28" />
              </label>
              <span className="text-foreground-muted">Total de montaje: {totalDias} días hábiles</span>
              <button className="btn ml-auto">Guardar</button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
