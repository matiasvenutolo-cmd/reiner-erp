import Link from "next/link";
import { notFound } from "next/navigation";
import { getPieza, getConjunto, getRoutingPieza, modeloDeCodigo, getNotasPieza } from "@/lib/data/maestros";
import { getStockDisponible, getWipPorPieza } from "@/lib/data/stock";
import { actualizarMaterialAction, crearNotaPiezaAction } from "@/app/actions/maestros";

const TIPO_NOTA_LABEL: Record<string, string> = {
  ingenieria: "Ingeniería",
  produccion: "Producción",
};

export default async function PiezaPage({ params }: { params: Promise<{ piezaId: string }> }) {
  const { piezaId } = await params;
  const pieza = await getPieza(piezaId);
  if (!pieza) notFound();

  const [conjunto, routing, stock, wip, notas] = await Promise.all([
    getConjunto(pieza.conjuntoId),
    getRoutingPieza(pieza.id),
    getStockDisponible(pieza.id),
    getWipPorPieza(pieza.id),
    getNotasPieza(pieza.id),
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

      <div className="bg-surface border border-border rounded-lg p-3">
        <form action={actualizarMaterialAction} className="flex items-end gap-2">
          <input type="hidden" name="piezaId" value={pieza.id} />
          <label className="flex-1 block">
            <span className="block text-xs font-medium text-foreground-muted mb-1">Material</span>
            <input name="material" defaultValue={pieza.material ?? ""} placeholder="ej. Acero SAE 1045" className="input" />
          </label>
          <button type="submit" className="text-sm text-accent hover:underline px-1 py-2">
            Guardar
          </button>
        </form>
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

      <div>
        <h2 className="text-sm font-semibold mb-2">
          Bitácora — versiones, cambios de diseño y observaciones de producción
        </h2>
        <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
          <form action={crearNotaPiezaAction} className="space-y-2">
            <input type="hidden" name="piezaId" value={pieza.id} />
            <div className="flex gap-3">
              <textarea
                name="texto"
                required
                rows={2}
                placeholder="Nueva observación…"
                className="input flex-1 resize-none"
              />
              <div className="flex flex-col gap-2">
                <select name="tipo" defaultValue="ingenieria" className="input">
                  <option value="ingenieria">Ingeniería</option>
                  <option value="produccion">Producción</option>
                </select>
                <button
                  type="submit"
                  className="bg-accent text-accent-foreground font-medium text-sm py-1.5 rounded-md hover:opacity-90"
                >
                  Agregar
                </button>
              </div>
            </div>
          </form>

          {notas.length === 0 ? (
            <p className="text-sm text-foreground-muted">Todavía no hay observaciones cargadas.</p>
          ) : (
            <ul className="space-y-3">
              {notas.map((nota) => (
                <li key={nota.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`badge-estado ${nota.tipo === "ingenieria" ? "bg-accent-soft text-accent" : "badge-terminada"}`}
                    >
                      {TIPO_NOTA_LABEL[nota.tipo]}
                    </span>
                    <span className="text-xs text-foreground-muted">
                      {nota.autorNombre} · {new Date(nota.createdAt).toLocaleDateString("es-AR")}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{nota.texto}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
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
