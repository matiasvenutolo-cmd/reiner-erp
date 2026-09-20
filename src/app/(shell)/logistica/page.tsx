import { buscarPiezas } from "@/lib/data/maestros";
import { getStockDisponible } from "@/lib/data/stock";
import { getProveedores, listarMovimientos, getPiezasFueraDeFabrica } from "@/lib/data/logistica";
import { registrarIngresoAction, registrarEgresoAction } from "@/app/actions/logistica";
import { TipoMovimientoSelect } from "@/components/TipoMovimientoSelect";
import type { MovimientoStock } from "@/lib/db/schema";

const TIPO_LABEL: Record<string, string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
  ajuste: "Ajuste",
  retiro_ot: "Retiro por OT",
};

export default async function LogisticaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string }>;
}) {
  const { q, tipo } = await searchParams;
  const query = (q ?? "").trim();
  const tipoFiltro = (tipo ?? "") as MovimientoStock["tipo"] | "";

  const [piezasEncontradas, proveedores, fueraDeFabrica, movimientos] = await Promise.all([
    query ? buscarPiezas(query) : Promise.resolve([]),
    getProveedores(),
    getPiezasFueraDeFabrica(),
    listarMovimientos(tipoFiltro || undefined),
  ]);
  const resultados = await Promise.all(
    piezasEncontradas.map(async (p) => ({ pieza: p, stock: await getStockDisponible(p.id) })),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Logística</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Ingresos, egresos y control de calidad al recibir materia prima o una pieza que vuelve de
          un proceso tercerizado (pedido de Horacio y Julián en la devolución del 2026-09-19, ver
          docs/05-backlog-release-2.md §4).
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Registrar ingreso o egreso</h2>
        <form className="max-w-md mb-3">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar pieza por código o nombre…"
            className="input"
          />
        </form>

        {query && (
          <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Pieza</th>
                  <th className="text-right px-4 py-2 font-medium">Stock</th>
                  <th className="text-left px-4 py-2 font-medium">Ingreso (con control de calidad)</th>
                  <th className="text-left px-4 py-2 font-medium">Egreso</th>
                </tr>
              </thead>
              <tbody>
                {resultados.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-foreground-muted">
                      Sin resultados para &ldquo;{q}&rdquo;
                    </td>
                  </tr>
                ) : (
                  resultados.map(({ pieza, stock }) => (
                    <tr key={pieza.id} className="border-t border-border align-top">
                      <td className="px-4 py-2.5">
                        <div className="font-mono text-xs text-foreground-muted">{pieza.codigo}</div>
                        <div>{pieza.nombre}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{stock}</td>
                      <td className="px-4 py-2.5">
                        <form action={registrarIngresoAction} className="flex flex-wrap items-center gap-1.5">
                          <input type="hidden" name="piezaId" value={pieza.id} />
                          <input name="cantidad" type="number" min={1} placeholder="Cant." className="input w-16 text-xs py-1" />
                          <select name="proveedorId" className="input text-xs py-1 w-32" defaultValue="">
                            <option value="">Proveedor…</option>
                            {proveedores.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.razonSocial}
                              </option>
                            ))}
                          </select>
                          <select name="controlResultado" required className="input text-xs py-1" defaultValue="">
                            <option value="" disabled>
                              Control…
                            </option>
                            <option value="ok">OK</option>
                            <option value="no_ok">NO OK</option>
                          </select>
                          <input name="observacion" placeholder="Motivo" className="input text-xs py-1 w-24" />
                          <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap">
                            Guardar
                          </button>
                        </form>
                      </td>
                      <td className="px-4 py-2.5">
                        <form action={registrarEgresoAction} className="flex flex-wrap items-center gap-1.5">
                          <input type="hidden" name="piezaId" value={pieza.id} />
                          <input name="cantidad" type="number" min={1} placeholder="Cant." className="input w-16 text-xs py-1" />
                          <input name="observacion" placeholder="Motivo" className="input text-xs py-1 w-24" />
                          <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap">
                            Guardar
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">
          Piezas fuera de fábrica ({fueraDeFabrica.length}) — en un proceso tercerizado
        </h2>
        {fueraDeFabrica.length === 0 ? (
          <p className="text-sm text-foreground-muted">No hay piezas afuera en este momento.</p>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Pieza</th>
                  <th className="text-left px-4 py-2 font-medium">Proceso tercerizado</th>
                  <th className="text-right px-4 py-2 font-medium">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {fueraDeFabrica.map((f) => (
                  <tr key={`${f.piezaId}-${f.procesoNombre}`} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-foreground-muted mr-2">{f.piezaCodigo}</span>
                      {f.piezaNombre}
                    </td>
                    <td className="px-4 py-2.5">{f.procesoNombre}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{f.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Movimientos recientes</h2>
          <form className="flex items-center gap-1.5">
            {q && <input type="hidden" name="q" value={q} />}
            <TipoMovimientoSelect valorActual={tipo ?? ""} />
          </form>
        </div>
        {movimientos.length === 0 ? (
          <p className="text-sm text-foreground-muted">Todavía no hay movimientos registrados.</p>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Fecha</th>
                  <th className="text-left px-4 py-2 font-medium">Tipo</th>
                  <th className="text-left px-4 py-2 font-medium">Pieza</th>
                  <th className="text-right px-4 py-2 font-medium">Cantidad</th>
                  <th className="text-left px-4 py-2 font-medium">Proveedor</th>
                  <th className="text-left px-4 py-2 font-medium">Control</th>
                  <th className="text-left px-4 py-2 font-medium">Usuario</th>
                  <th className="text-left px-4 py-2 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-4 py-2.5 text-foreground-muted whitespace-nowrap">
                      {new Date(m.fecha).toLocaleDateString("es-AR")}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="badge-estado bg-surface-muted text-foreground-muted">{TIPO_LABEL[m.tipo]}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-foreground-muted mr-1">{m.piezaCodigo}</span>
                      {m.piezaNombre}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {m.tipo === "egreso" || m.tipo === "retiro_ot" ? "−" : "+"}
                      {m.cantidad}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-muted">{m.proveedorNombre ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {m.controlResultado ? (
                        <span className={`badge-estado ${m.controlResultado === "ok" ? "badge-terminada" : "badge-alerta"}`}>
                          {m.controlResultado === "ok" ? "OK" : "NO OK"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-muted">{m.usuarioNombre}</td>
                    <td className="px-4 py-2.5 text-foreground-muted">{m.observacion ?? "—"}</td>
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
