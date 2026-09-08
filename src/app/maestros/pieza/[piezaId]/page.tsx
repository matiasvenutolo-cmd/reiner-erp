import Link from "next/link";
import { notFound } from "next/navigation";
import { getPieza, getConjunto, getRoutingPieza, modeloDeCodigo } from "@/lib/data/maestros";
import { getStockDisponible, getWipPorPieza } from "@/lib/data/stock";

export default async function PiezaPage({ params }: { params: Promise<{ piezaId: string }> }) {
  const { piezaId } = await params;
  const pieza = await getPieza(piezaId);
  if (!pieza) notFound();

  const [conjunto, routing, stock, wip] = await Promise.all([
    getConjunto(pieza.conjuntoId),
    getRoutingPieza(pieza.id),
    getStockDisponible(pieza.id),
    getWipPorPieza(pieza.id),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href={`/maestros/${pieza.conjuntoId}`} className="text-sm text-accent hover:underline">
          ← {conjunto?.nombre ?? pieza.conjuntoId}
        </Link>
        <h1 className="text-xl font-semibold mt-1">{pieza.nombre}</h1>
        <p className="text-sm text-foreground-muted font-mono">{pieza.codigo}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Modelo" value={modeloDeCodigo(pieza.codigo)} />
        <Metric label="Revisión" value={pieza.revision ?? "—"} />
        <Metric label="Stock disponible" value={String(stock)} />
        <Metric label="En proceso" value={String(wip.reduce((a, w) => a + w.cantidad, 0)) || "0"} />
      </div>

      {wip.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">En proceso, por etapa</h2>
          <div className="flex flex-wrap gap-2">
            {wip.map((w) => (
              <span key={w.procesoId} className="badge-estado bg-surface-muted text-foreground">
                {w.procesoNombre}: {w.cantidad}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">Hoja de ruta</h2>
        {routing.length === 0 ? (
          <div className="badge-estado badge-alerta">
            Sin operaciones definidas — falta el insumo de routing para esta pieza (ver docs/migracion-datos.md)
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium w-12">#</th>
                  <th className="text-left px-4 py-2 font-medium">Proceso</th>
                  <th className="text-left px-4 py-2 font-medium">Dispositivo</th>
                  <th className="text-right px-4 py-2 font-medium">OPS</th>
                </tr>
              </thead>
              <tbody>
                {routing.map((op) => (
                  <tr key={op.id} className="border-t border-border">
                    <td className="px-4 py-2.5 text-foreground-muted">{op.secuencia}</td>
                    <td className="px-4 py-2.5">
                      {op.proceso.nombre}
                      {op.proceso.esExterno && (
                        <span className="ml-2 text-xs text-foreground-muted">(tercerizado)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-muted">{op.dispositivoNombre ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{op.ops}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2">
      <div className="text-xs text-foreground-muted">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
