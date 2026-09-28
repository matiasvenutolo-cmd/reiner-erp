import Link from "next/link";
import { getPiezasEnProceso } from "@/lib/data/stock";

export const dynamic = "force-dynamic";

export default async function StockEnProcesoPage() {
  const items = await getPiezasEnProceso();
  const totalUnidades = items.reduce((sum, it) => sum + it.cantidad, 0);
  const piezasDistintas = new Set(items.map((it) => it.piezaId)).size;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/stock" className="text-sm text-accent hover:underline">
          ← Stock
        </Link>
        <h1 className="text-xl font-semibold mt-1">En proceso</h1>
        <p className="text-sm text-foreground-muted mt-1">
          {piezasDistintas} pieza{piezasDistintas === 1 ? "" : "s"} distinta{piezasDistintas === 1 ? "" : "s"} en {items.length}{" "}
          {items.length === 1 ? "orden" : "órdenes"} de trabajo, en todas las etapas · {totalUnidades} unidades.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-6 text-center text-foreground-muted text-sm">
          No hay piezas en proceso en este momento.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Pieza</th>
                <th className="text-left px-4 py-2 font-medium">Etapa</th>
                <th className="text-left px-4 py-2 font-medium">OT pieza</th>
                <th className="text-left px-4 py-2 font-medium">Máquina</th>
                <th className="text-right px-4 py-2 font-medium">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.otPiezaId} className="border-t border-border hover:bg-surface-muted/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/maestros/pieza/${it.piezaId}`} className="font-mono text-xs text-accent hover:underline mr-1">
                      {it.piezaCodigo}
                    </Link>
                    {it.piezaNombre}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="badge-estado badge-en_curso">{it.procesoNombre}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/ot/${it.otMaquinaId}/pieza/${it.otPiezaId}`} className="font-mono text-xs text-accent hover:underline">
                      {it.otPiezaCodigo}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/ot/${it.otMaquinaId}`} className="text-accent hover:underline">
                      {it.otMaquinaCodigo}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{it.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
