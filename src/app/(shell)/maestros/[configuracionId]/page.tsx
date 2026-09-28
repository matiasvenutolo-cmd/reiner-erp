import Link from "next/link";
import { notFound } from "next/navigation";
import { getConfiguracion, getResumenConjuntosDeConfiguracion } from "@/lib/data/maestros";

export default async function ConfiguracionPage({ params }: { params: Promise<{ configuracionId: string }> }) {
  const { configuracionId } = await params;
  const [configuracion, conjuntos] = await Promise.all([
    getConfiguracion(configuracionId),
    getResumenConjuntosDeConfiguracion(configuracionId),
  ]);
  if (!configuracion) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/maestros" className="text-sm text-accent hover:underline">
          ← Maestros
        </Link>
        <h1 className="text-xl font-semibold mt-1">{configuracion.nombre}</h1>
        <p className="text-sm text-foreground-muted">{configuracion.codigo}</p>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Conjunto</th>
              <th className="text-left px-4 py-2 font-medium">Código</th>
              <th className="text-right px-4 py-2 font-medium">A producir</th>
              <th className="text-right px-4 py-2 font-medium">A comprar</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {conjuntos.map(({ conjunto, aProducir, aComprar }) => (
              <tr key={conjunto.id} className="border-t border-border hover:bg-surface-muted/50">
                <td className="px-4 py-2.5 font-medium">{conjunto.nombre}</td>
                <td className="px-4 py-2.5 text-foreground-muted font-mono text-xs">{conjunto.codigo}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{aProducir}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {aComprar > 0 ? <span className="badge-estado bg-accent-soft text-accent">{aComprar}</span> : "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/maestros/${configuracionId}/${conjunto.id}`}
                    className="text-accent hover:underline text-sm font-medium"
                  >
                    Ver piezas →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
