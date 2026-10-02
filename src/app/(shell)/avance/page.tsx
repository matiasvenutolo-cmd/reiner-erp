import Link from "next/link";
import { listarOtMaquinas } from "@/lib/data/ot";
import { getResumenWipEnCursoPorProceso } from "@/lib/data/stock";
import { getParadasActivas } from "@/lib/data/ejecucion";
import { getPiezasFueraDeFabrica } from "@/lib/data/logistica";
import { getTareasRevision } from "@/lib/data/revision";
import { MaquinaCard } from "@/components/avance/MaquinaCard";
import { MetricCard } from "@/components/MetricCard";

// Datos en vivo (producción cambia todo el tiempo) — nunca prerenderizar en build.
export const dynamic = "force-dynamic";

export default async function AvancePage() {
  const [ordenes, wip, paradas, fueraDeFabrica, retrabajos] = await Promise.all([
    listarOtMaquinas(),
    getResumenWipEnCursoPorProceso(),
    getParadasActivas(),
    getPiezasFueraDeFabrica(),
    getTareasRevision("pendiente"),
  ]);
  const otPiezaIdsConRetrabajo = [...new Set(retrabajos.map((t) => t.otPiezaId))];

  const enCurso = ordenes.filter((o) => o.estadoCalculado === "en_curso").length;
  const piezasTerminadas = ordenes.reduce((sum, o) => sum + o.piezasTerminadas, 0);
  const piezasTotal = ordenes.reduce((sum, o) => sum + o.totalPiezasAFabricar, 0);
  const piezasFueraDeFabrica = fueraDeFabrica.reduce((sum, p) => sum + p.cantidad, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Avance de fabricación</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Cómo viene cada máquina y, sobre todo, cómo viene avanzando cada una de sus partes.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="OT de máquina en curso" value={enCurso} href="/ot" />
        <MetricCard label="Piezas terminadas / total" value={`${piezasTerminadas}/${piezasTotal}`} href="/ot" />
        <MetricCard label="Frenado ahora mismo" value={paradas.length} href="/centros-trabajo" />
        <MetricCard label="Piezas en proceso tercerizado" value={piezasFueraDeFabrica} href="/tercerizados" />
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
              <MaquinaCard
                key={ot.id}
                otId={ot.id}
                codigo={ot.codigo}
                configuracionNombre={ot.configuracion?.nombre}
                estadoCalculado={ot.estadoCalculado}
                pct={pct}
                piezasTerminadas={ot.piezasTerminadas}
                totalPiezasAFabricar={ot.totalPiezasAFabricar}
                plazoEntrega={ot.plazoEntrega}
                secciones={ot.secciones}
                otPiezaIdsConRetrabajo={otPiezaIdsConRetrabajo}
              />
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
