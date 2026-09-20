import Link from "next/link";
import { listarRemitos } from "@/lib/data/remitos";

export default async function RemitosPage() {
  const remitos = await listarRemitos();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Remitos</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Generados desde /logistica al mover piezas hacia afuera de la fábrica (pedido de Horacio,
          ver docs/05-backlog-release-2.md §4).
        </p>
      </div>

      {remitos.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-6 text-center text-foreground-muted text-sm">
          Todavía no se generó ningún remito.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">N°</th>
                <th className="text-left px-4 py-2 font-medium">Fecha</th>
                <th className="text-left px-4 py-2 font-medium">Pieza</th>
                <th className="text-right px-4 py-2 font-medium">Cantidad</th>
                <th className="text-left px-4 py-2 font-medium">Destino</th>
                <th className="text-left px-4 py-2 font-medium">Generado por</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {remitos.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5 font-mono text-xs">{String(r.numero).padStart(4, "0")}</td>
                  <td className="px-4 py-2.5 text-foreground-muted whitespace-nowrap">
                    {new Date(r.fecha).toLocaleDateString("es-AR")}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs text-foreground-muted mr-1">{r.piezaCodigo}</span>
                    {r.piezaNombre}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.cantidad}</td>
                  <td className="px-4 py-2.5">{r.destino}</td>
                  <td className="px-4 py-2.5 text-foreground-muted">{r.usuarioNombre}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/remitos/${r.id}`} className="text-xs text-accent hover:underline">
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
