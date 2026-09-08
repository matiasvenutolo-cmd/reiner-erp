import Link from "next/link";
import { listarOtMaquinas } from "@/lib/data/ot";
import { getResumenWipPorProceso } from "@/lib/data/stock";
import { EstadoBadge } from "@/components/EstadoBadge";

export default async function AvancePage() {
  const [ordenes, wip] = await Promise.all([listarOtMaquinas(), getResumenWipPorProceso()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Avance de fabricación</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Vista única del estado de cada máquina en curso (RF-09) — pensada para mirar todos los días.
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ordenes.map((ot) => {
            const pct = ot.totalPiezasAFabricar > 0 ? Math.round((ot.piezasTerminadas / ot.totalPiezasAFabricar) * 100) : 0;
            return (
              <Link
                key={ot.id}
                href={`/ot/${ot.id}`}
                className="bg-surface border border-border rounded-lg p-4 hover:border-accent transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold font-mono text-sm">{ot.codigo}</div>
                    <div className="text-xs text-foreground-muted">{ot.configuracion?.nombre}</div>
                  </div>
                  <EstadoBadge estado={ot.estadoCalculado} />
                </div>
                <div className="text-xs text-foreground-muted mb-1.5">{ot.observaciones}</div>
                <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-xs text-foreground-muted mt-1.5 tabular-nums">
                  {ot.piezasTerminadas} / {ot.totalPiezasAFabricar} piezas terminadas
                  {ot.plazoEntrega ? ` · plazo: ${ot.plazoEntrega}` : ""}
                </div>
              </Link>
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
