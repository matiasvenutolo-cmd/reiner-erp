import Link from "next/link";
import { buscarPiezas } from "@/lib/data/maestros";
import { getStockDisponible } from "@/lib/data/stock";
import { getProveedores, listarMovimientos } from "@/lib/data/logistica";
import { getPiezasAfueraTercerizado } from "@/lib/data/produccion";
import { registrarIngresoAction, registrarVueltaAction } from "@/app/actions/logistica";
import { TipoMovimientoSelect } from "@/components/TipoMovimientoSelect";
import { MovimientosTabla } from "@/components/MovimientosTabla";
import { ArmadoRemito } from "@/components/logistica/ArmadoRemito";
import type { MovimientoStock, Proveedor } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * Logística de tercerizados, en el orden del circuito real: lo que está
 * afuera esperando volver → mandar algo afuera (remito, que ya genera el
 * egreso solo) → historial. El egreso manual se sacó (devolución del socio:
 * "no se debería poder registrar un egreso, se autocarga cuando generás el
 * remito"); el ingreso suelto queda plegado al final para casos sin pedido.
 */
export default async function TercerizadosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string; error?: string }>;
}) {
  const { q, tipo, error } = await searchParams;
  const query = (q ?? "").trim();
  const tipoFiltro = (tipo ?? "") as MovimientoStock["tipo"] | "";

  const [piezasEncontradas, proveedores, afuera, movimientos] = await Promise.all([
    query ? buscarPiezas(query) : Promise.resolve([]),
    getProveedores(),
    getPiezasAfueraTercerizado(),
    listarMovimientos(tipoFiltro || undefined),
  ]);
  const resultados = await Promise.all(
    piezasEncontradas.map(async (p) => ({ pieza: p, stock: await getStockDisponible(p.id) })),
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Tercerizados</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Piezas que salen a un proceso tercerizado (Cromado, Pavonado, Anodizado...) y vuelven.
            Las compras a proveedores se manejan desde{" "}
            <Link href="/stock/compras" className="text-accent hover:underline">
              Stock → Compras
            </Link>
            .
          </p>
        </div>
        <Link href="/remitos" className="text-sm text-accent hover:underline whitespace-nowrap">
          Ver remitos anteriores →
        </Link>
      </div>

      {error && <div className="badge-estado badge-alerta text-sm px-3 py-2 block">{error}</div>}

      <div id="esperando">
        <h2 className="text-sm font-semibold mb-1">Afuera, esperando que vuelvan ({afuera.length})</h2>
        <p className="text-xs text-foreground-muted mb-2">
          En manos del proveedor. Al registrar la vuelta con control OK, la pieza pasa sola a su siguiente paso.
        </p>
        {afuera.length === 0 ? (
          <p className="text-sm text-foreground-muted">No hay piezas afuera en este momento.</p>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Pieza</th>
                  <th className="text-left px-4 py-2 font-medium">OT</th>
                  <th className="text-left px-4 py-2 font-medium">Proceso</th>
                  <th className="text-left px-4 py-2 font-medium">Registrar vuelta</th>
                </tr>
              </thead>
              <tbody>
                {afuera.map((a) => (
                  <tr key={a.otPiezaId} className="border-t border-border align-top">
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-xs text-foreground-muted">{a.piezaCodigo}</div>
                      <div>{a.piezaNombre}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/ot/${a.otMaquinaId}/pieza/${a.otPiezaId}`} className="font-mono text-xs text-accent hover:underline">
                        {a.otPiezaCodigo}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{a.procesoNombre}</td>
                    <td className="px-4 py-2.5">
                      <form action={registrarVueltaAction} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="otPiezaId" value={a.otPiezaId} />
                        <input type="hidden" name="operacionId" value={a.operacionId} />
                        <input name="cantidad" type="number" min={1} defaultValue={a.cantidad} className="input w-16 text-xs py-1" />
                        <ProveedorSelect proveedores={proveedores} />
                        <ControlSelect />
                        <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap">
                          Guardar
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-1">Mandar piezas afuera — armar remito</h2>
        <p className="text-xs text-foreground-muted mb-2">El remito registra solo el egreso de cada pieza.</p>
        <ArmadoRemito />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Movimientos recientes</h2>
          <form className="flex items-center gap-1.5">
            {q && <input type="hidden" name="q" value={q} />}
            <TipoMovimientoSelect valorActual={tipo ?? ""} />
          </form>
        </div>
        <MovimientosTabla movimientos={movimientos} />
      </div>

      <details open={!!query} className="bg-surface border border-border rounded-lg p-4">
        <summary className="cursor-pointer text-sm font-semibold">Registrar un ingreso sin pedido ni remito previo</summary>
        <p className="text-xs text-foreground-muted mt-2 mb-3">
          Para lo que llega sin haber salido con remito ni pedido (ej. una devolución). Buscá la pieza y cargá el ingreso con su control.
        </p>
        <form className="max-w-md mb-3">
          <input type="search" name="q" defaultValue={q ?? ""} placeholder="Código o nombre de la pieza…" className="input" />
        </form>
        {query &&
          (resultados.length === 0 ? (
            <p className="text-sm text-foreground-muted">Sin resultados para &ldquo;{q}&rdquo;</p>
          ) : (
            <ul className="space-y-2">
              {resultados.map(({ pieza, stock }) => (
                <li key={pieza.id} className="border border-border rounded-md px-3 py-2">
                  <div className="text-sm">
                    <span className="font-mono text-xs text-foreground-muted mr-2">{pieza.codigo}</span>
                    {pieza.nombre}
                    <span className="text-xs text-foreground-muted ml-2">· en almacén: {stock}</span>
                  </div>
                  <form action={registrarIngresoAction} className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <input type="hidden" name="piezaId" value={pieza.id} />
                    <input name="cantidad" type="number" min={1} placeholder="Cant." required className="input w-16 text-xs py-1" />
                    <ProveedorSelect proveedores={proveedores} />
                    <ControlSelect />
                    <input name="observacion" placeholder="Motivo" className="input text-xs py-1 w-40" />
                    <button type="submit" className="text-xs bg-accent text-accent-foreground px-2.5 py-1 rounded-md hover:opacity-90">
                      Registrar ingreso
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ))}
      </details>
    </div>
  );
}

function ProveedorSelect({ proveedores }: { proveedores: Proveedor[] }) {
  return (
    <select name="proveedorId" className="input text-xs py-1 w-36" defaultValue="">
      <option value="">Proveedor…</option>
      {proveedores.map((p) => (
        <option key={p.id} value={p.id}>
          {p.razonSocial}
        </option>
      ))}
    </select>
  );
}

function ControlSelect() {
  return (
    <select name="controlResultado" required className="input text-xs py-1" defaultValue="">
      <option value="" disabled>
        Control…
      </option>
      <option value="ok">OK</option>
      <option value="no_ok">NO OK</option>
    </select>
  );
}
