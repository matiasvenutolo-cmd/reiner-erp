import Link from "next/link";
import { listarOtMaquinas } from "@/lib/data/ot";
import { getResumenWipEnCursoPorProceso } from "@/lib/data/stock";
import { EstadoBadge } from "@/components/EstadoBadge";

const COLOR_SECCION: Record<"pendiente" | "en_curso" | "terminada", string> = {
  pendiente: "bg-surface-muted",
  en_curso: "bg-accent",
  terminada: "bg-brand-teal",
};

export default async function AvancePage() {
  const [ordenes, wip] = await Promise.all([listarOtMaquinas(), getResumenWipEnCursoPorProceso()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Avance de fabricación</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Cómo viene cada máquina y, sobre todo, cómo viene avanzando cada una de sus partes.
        </p>
      </div>

      {ordenes.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center text-foreground-muted text-sm">
          Todavía no hay OT de máquina generadas.{" "}
          <Link href="/ot/nueva" className="text-accent hover:underline">
            Generar una →
          </Link>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {ordenes.map((ot) => {
            const pct = ot.totalPiezasAFabricar > 0 ? Math.round((ot.piezasTerminadas / ot.totalPiezasAFabricar) * 100) : 0;
            return (
              <div key={ot.id} className="bg-surface border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/ot/${ot.id}`} className="font-semibold font-mono text-sm hover:text-accent hover:underline">
                      {ot.codigo}
                    </Link>
                    <div className="text-xs text-foreground-muted">{ot.configuracion?.nombre}</div>
                  </div>
                  <EstadoBadge estado={ot.estadoCalculado} />
                </div>

                <div>
                  <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-xs text-foreground-muted mt-1.5 tabular-nums">
                    {ot.piezasTerminadas} / {ot.totalPiezasAFabricar} piezas terminadas
                    {ot.plazoEntrega ? ` · plazo: ${ot.plazoEntrega}` : ""}
                  </div>
                </div>

                {ot.secciones.length > 0 && (
                  <div>
                    <div className="text-xs text-foreground-muted mb-1">Por sección</div>
                    <div className="flex flex-wrap gap-1">
                      {ot.secciones.map((s) => (
                        <Link
                          key={s.otConjuntoId}
                          href={`/ot/${ot.id}#seccion-${s.otConjuntoId}`}
                          title={`${s.nombre}: ${s.terminadas}/${s.total} piezas`}
                          className={`h-5 w-4 rounded-sm ${COLOR_SECCION[s.estado]} hover:opacity-75 transition-opacity`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {wip.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Piezas en proceso, por etapa</h2>
          <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Etapa</th>
                  <th className="text-right px-4 py-2 font-medium">Piezas</th>
                  <th className="text-right px-4 py-2 font-medium">Unidades</th>
                </tr>
              </thead>
              <tbody>
                {wip
                  .sort((a, b) => b.unidades - a.unidades)
                  .map((w) => (
                    <tr key={w.procesoId} className="border-t border-border">
                      <td className="px-4 py-2.5">{w.procesoNombre}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{w.piezas}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{w.unidades}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
