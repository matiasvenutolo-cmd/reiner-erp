import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasTercerizados } from "@/components/ui/PestanasSecciones";
import Link from "next/link";
import { listarRemitos } from "@/lib/data/remitos";

export default async function RemitosPage() {
  const remitos = await listarRemitos();

  return (
    <div className="space-y-6">
      <PageHeader titulo="Tercerizados" descripcion="Remitos: todos los envíos registrados. Un remito nuevo se arma en Envíos y vueltas.">
        <PestanasTercerizados actual="/remitos" />
      </PageHeader>

      {remitos.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-6 text-center text-foreground-muted text-sm">
          Todavía no se generó ningún remito.
        </div>
      ) : (
        <div className="tarjeta overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-foreground-muted text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium">N°</th>
                <th className="text-left px-4 py-2 font-medium">Fecha</th>
                <th className="text-left px-4 py-2 font-medium">Destino</th>
                <th className="text-right px-4 py-2 font-medium">Piezas</th>
                <th className="text-right px-4 py-2 font-medium">Unidades</th>
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
                  <td className="px-4 py-2.5">{r.destino}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.cantidadItems}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.cantidadPiezas}</td>
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
