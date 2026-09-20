import Link from "next/link";
import { notFound } from "next/navigation";
import { getOtMaquinaDetalle } from "@/lib/data/ot";
import { getPiezasPorIds, getPiezasPorConfiguracion } from "@/lib/data/maestros";
import { EstadoBadge } from "@/components/EstadoBadge";
import { CantidadAFabricarForm } from "@/components/CantidadAFabricarForm";
import { completarOtConjuntoAction, agregarPiezaSueltaAction } from "@/app/actions/ot";

export default async function OtMaquinaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detalle = await getOtMaquinaDetalle(id);
  if (!detalle) notFound();
  const { otMaquina, clienteNombre, configuracion, conjuntos, estadoCalculado } = detalle;

  const piezaIds = conjuntos.flatMap((c) => c.piezas.map((p) => p.otPieza.piezaId));
  const [piezasPorId, piezasConfigTodas] = await Promise.all([
    getPiezasPorIds(piezaIds),
    configuracion ? getPiezasPorConfiguracion(configuracion.id) : Promise.resolve([]),
  ]);
  const piezasConfigPorConjunto = new Map<string, typeof piezasConfigTodas>();
  for (const p of piezasConfigTodas) {
    const arr = piezasConfigPorConjunto.get(p.conjuntoId) ?? [];
    arr.push(p);
    piezasConfigPorConjunto.set(p.conjuntoId, arr);
  }

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
            <form
              action={agregarPiezaSueltaAction}
              className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-t border-border bg-surface-muted/50"
            >
              <input type="hidden" name="otMaquinaId" value={otMaquina.id} />
              <input type="hidden" name="otConjuntoId" value={otConjunto.id} />
              <span className="text-xs text-foreground-muted">+ Pieza suelta</span>
              <select name="piezaId" required defaultValue="" className="input text-xs py-1 flex-1 min-w-[10rem]">
                <option value="" disabled>
                  Elegir pieza…
                </option>
                {(piezasConfigPorConjunto.get(otConjunto.conjuntoId) ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} — {p.nombre}
                  </option>
                ))}
              </select>
              <input name="cantidad" type="number" min={1} placeholder="Cant." required className="input text-xs py-1 w-16" />
              <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap">
                Agregar
              </button>
            </form>
          </div>
        ))}
      </div>

      {conjuntosSinFabricar.length > 0 && (
        <div className="text-sm">
          <h2 className="text-sm font-semibold mb-2 text-foreground-muted">
            {conjuntosSinFabricar.length} conjunto{conjuntosSinFabricar.length === 1 ? "" : "s"} sin piezas a
            fabricar (el stock cubría la necesidad al generar la OT)
          </h2>
          <ul className="space-y-1.5">
            {conjuntosSinFabricar.map((c) => (
              <li key={c.otConjunto.id} className="flex items-center justify-between bg-surface border border-border rounded-md px-3 py-2">
                <span>{c.conjunto?.nombre}</span>
                <form action={completarOtConjuntoAction}>
                  <input type="hidden" name="otMaquinaId" value={otMaquina.id} />
                  <input type="hidden" name="otConjuntoId" value={c.otConjunto.id} />
                  <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap">
                    Generar OT de todas formas →
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
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
