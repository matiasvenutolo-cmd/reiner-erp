import Link from "next/link";
import { getModelos, getConfiguraciones, contarPiezasPorConfiguracion } from "@/lib/data/maestros";

/**
 * Entra por máquina (configuración), no por conjunto — devolución del
 * cliente (docs/06-backlog-release-3.md): "que aparezca por Máquina, no por
 * conjunto". Antes el índice listaba los conjuntos sueltos, mezclando piezas
 * de RD y PS en la misma fila; ahora cada máquina tiene su propia página con
 * sus conjuntos y sus piezas.
 */
export default async function MaestrosPage() {
  const [modelos, configuraciones, conteo] = await Promise.all([
    getModelos(),
    getConfiguraciones(),
    contarPiezasPorConfiguracion(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Maestros</h1>
        <p className="text-sm text-foreground-muted mt-1">Máquina → conjunto → pieza → operación.</p>
      </div>

      <div className="space-y-6">
        {modelos.map((m) => (
          <div key={m.id}>
            <h2 className="text-sm font-semibold mb-2">{m.nombre}</h2>
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Máquina</th>
                    <th className="text-left px-4 py-2 font-medium">Código</th>
                    <th className="text-right px-4 py-2 font-medium">Piezas</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {configuraciones
                    .filter((c) => c.modeloId === m.id)
                    .map((c) => (
                      <tr key={c.id} className="border-t border-border hover:bg-surface-muted/50">
                        <td className="px-4 py-2.5 font-medium">{c.nombre}</td>
                        <td className="px-4 py-2.5 text-foreground-muted font-mono text-xs">{c.codigo}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{conteo[c.id] ?? 0}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Link href={`/maestros/${c.id}`} className="text-accent hover:underline text-sm font-medium">
                            Ver conjuntos →
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-foreground-muted">
        Ver el detalle de lo migrado y las asunciones tomadas en{" "}
        <code className="bg-surface-muted px-1 py-0.5 rounded">docs/migracion-datos.md</code>.
      </p>
    </div>
  );
}
