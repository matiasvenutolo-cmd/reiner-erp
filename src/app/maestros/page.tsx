import Link from "next/link";
import { getConjuntos, getModelos, contarPiezasPorConjunto } from "@/lib/data/maestros";

export default async function MaestrosPage() {
  const [modelos, conjuntosRD, conjuntosPS, conteoRD, conteoPS] = await Promise.all([
    getModelos(),
    getConjuntos("RD"),
    getConjuntos("PS"),
    contarPiezasPorConjunto("RD"),
    contarPiezasPorConjunto("PS"),
  ]);

  const conjuntoIds = new Set([...conjuntosRD.map((c) => c.id), ...conjuntosPS.map((c) => c.id)]);
  const todos = await getConjuntos();
  const conjuntos = todos.filter((c) => conjuntoIds.has(c.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Maestros</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Modelo → configuración → conjunto → pieza. Migrado desde los Excel de {modelos.map((m) => m.codigo).join(" y ")} (RF-01).
        </p>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Conjunto</th>
              <th className="text-left px-4 py-2 font-medium">Código</th>
              <th className="text-right px-4 py-2 font-medium">Piezas RD</th>
              <th className="text-right px-4 py-2 font-medium">Piezas PS</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {conjuntos
              .sort((a, b) => a.orden - b.orden)
              .map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-surface-muted/50">
                  <td className="px-4 py-2.5 font-medium">{c.nombre}</td>
                  <td className="px-4 py-2.5 text-foreground-muted font-mono text-xs">{c.codigo}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{conteoRD[c.id] ?? 0}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{conteoPS[c.id] ?? 0}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/maestros/${c.id}`} className="text-accent hover:underline text-sm font-medium">
                      Ver piezas →
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-foreground-muted">
        Ver el detalle de lo migrado y las asunciones tomadas en{" "}
        <code className="bg-surface-muted px-1 py-0.5 rounded">docs/migracion-datos.md</code>.
      </p>
    </div>
  );
}
