import Link from "next/link";
import { notFound } from "next/navigation";
import { getOtMaquinaDetalle } from "@/lib/data/ot";
import { getPiezasPorIds } from "@/lib/data/maestros";
import { EstadoBadge } from "@/components/EstadoBadge";
import { CantidadAFabricarForm } from "@/components/CantidadAFabricarForm";

export default async function OtMaquinaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detalle = await getOtMaquinaDetalle(id);
  if (!detalle) notFound();
  const { otMaquina, clienteNombre, configuracion, conjuntos, estadoCalculado } = detalle;

  const piezaIds = conjuntos.flatMap((c) => c.piezas.map((p) => p.otPieza.piezaId));
  const piezasPorId = await getPiezasPorIds(piezaIds);

  const conjuntosConPiezas = conjuntos
    .filter((c) => c.piezas.length > 0)
    .map((c) => ({
      ...c,
      filas: c.piezas.map(({ otPieza, estado, sinRouting }) => ({
        otPieza,
        estado,
        sinRouting,
        pieza: piezasPorId.get(otPieza.piezaId),
      })),
    }));
  const conjuntosSinFabricar = conjuntos.filter((c) => c.piezas.length === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/ot" className="text-sm text-accent hover:underline">
            ← Órdenes de trabajo
          </Link>
          <h1 className="text-xl font-semibold mt-1">{otMaquina.codigo}</h1>
          <p className="text-sm text-foreground-muted">
            {configuracion?.nombre} · Serie {otMaquina.numeroSerie} · {clienteNombre}
          </p>
        </div>
        <EstadoBadge estado={estadoCalculado} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Emitido por" value={otMaquina.emitidoPor ?? "—"} />
        <Metric label="Orden de compra" value={otMaquina.ordenCompra ?? "—"} />
        <Metric label="Plazo de entrega" value={otMaquina.plazoEntrega ?? "—"} />
        <Metric label="Conjuntos a fabricar" value={String(conjuntosConPiezas.length)} />
      </div>

      <div className="space-y-4">
        {conjuntosConPiezas.map(({ otConjunto, conjunto, filas, estadoConjunto }) => (
          <div key={otConjunto.id} className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-surface-muted">
              <div>
                <span className="font-mono text-xs text-foreground-muted mr-2">{otConjunto.codigo}</span>
                <span className="font-medium text-sm">{conjunto?.nombre}</span>
              </div>
              <EstadoBadge estado={estadoConjunto} />
            </div>
            <table className="w-full text-sm">
              <thead className="text-foreground-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">OT pieza</th>
                  <th className="text-left px-4 py-2 font-medium">Pieza</th>
                  <th className="text-right px-4 py-2 font-medium">Necesaria</th>
                  <th className="text-right px-4 py-2 font-medium">Stock al generar</th>
                  <th className="text-right px-4 py-2 font-medium">A fabricar</th>
                  <th className="text-left px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ otPieza, estado, sinRouting, pieza }) => (
                  <tr key={otPieza.id} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/ot/${otMaquina.id}/pieza/${otPieza.id}`}
                        className="font-mono text-xs text-accent hover:underline"
                      >
                        {otPieza.codigo}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{pieza?.nombre ?? otPieza.piezaId}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{otPieza.cantidadNecesaria}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">
                      {otPieza.stockAlGenerar}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <CantidadAFabricarForm
                        otPiezaId={otPieza.id}
                        otMaquinaId={otMaquina.id}
                        cantidadInicial={otPieza.cantidadAFabricar}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <EstadoBadge estado={estado} sinRouting={sinRouting} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {conjuntosSinFabricar.length > 0 && (
        <details className="text-sm text-foreground-muted">
          <summary className="cursor-pointer hover:text-foreground">
            {conjuntosSinFabricar.length} conjunto{conjuntosSinFabricar.length === 1 ? "" : "s"} sin piezas a
            fabricar (el stock cubre la necesidad)
          </summary>
          <ul className="mt-2 pl-4 list-disc space-y-1">
            {conjuntosSinFabricar.map((c) => (
              <li key={c.otConjunto.id}>{c.conjunto?.nombre}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2">
      <div className="text-xs text-foreground-muted">{label}</div>
      <div className="font-semibold truncate">{value}</div>
    </div>
  );
}
