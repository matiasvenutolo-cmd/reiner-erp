import { Aviso } from "@/components/ui/Aviso";
import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasStock } from "@/components/ui/PestanasSecciones";
import Link from "next/link";
import { getPiezasCompraPendientes } from "@/lib/data/produccion";
import { getPedidosPendientes } from "@/lib/data/compras";
import { getProveedores } from "@/lib/data/logistica";
import { getSolicitudesAbiertasPorOtPieza } from "@/lib/data/gestion-compras";
import { marcarPedidoAction, cancelarPedidoAction, registrarLlegadaAction } from "@/app/actions/stock";
import type { Proveedor } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * Compras en dos pasos (devolución del socio sobre Stock): pendiente de pedir
 * → pedida al proveedor, esperando que llegue → recibida (con control). Al
 * recibir una pieza comprada entera suma al almacén reservada para su OT; si
 * era material de una pieza fabricada, cierra el paso de Compras y la pieza
 * pasa sola a su siguiente etapa.
 */
export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ ot?: string; error?: string }> }) {
  const { ot, error } = await searchParams;
  const [pendientes, pedidos, proveedores, enCompras] = await Promise.all([
    getPiezasCompraPendientes(),
    getPedidosPendientes(),
    getProveedores(),
    getSolicitudesAbiertasPorOtPieza(),
  ]);

  const pedidoPorOtPieza = new Set(pedidos.map((p) => p.otPiezaId));
  const operacionCompraPorOtPieza = new Map(pendientes.map((p) => [p.otPiezaId, p.operacionCompraId]));
  const porPedir = pendientes.filter((p) => !pedidoPorOtPieza.has(p.otPiezaId));
  const ots = [...new Set(porPedir.map((p) => p.otMaquinaCodigo))].sort();
  const porPedirFiltrado = ot ? porPedir.filter((p) => p.otMaquinaCodigo === ot) : porPedir;

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Stock"
        descripcion="Compras de producción: lo que falta comprar para las órdenes abiertas. Se marca como pedido (a qué proveedor) y, cuando llega, se registra con su control de calidad."
      >
        <PestanasStock actual="/stock/compras" />
      </PageHeader>

      {error && <Aviso tipo="error">{error}</Aviso>}

      <div>
        <h2 className="text-sm font-semibold mb-2">Pedidas, esperando que lleguen ({pedidos.length})</h2>
        {pedidos.length === 0 ? (
          <p className="text-sm text-foreground-muted">No hay compras pedidas pendientes de llegar.</p>
        ) : (
          <div className="tarjeta overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Pieza</th>
                  <th className="text-left px-4 py-2 font-medium">OT</th>
                  <th className="text-left px-4 py-2 font-medium">Proveedor</th>
                  <th className="text-left px-4 py-2 font-medium">Pedida</th>
                  <th className="text-right px-4 py-2 font-medium">Cant.</th>
                  <th className="text-left px-4 py-2 font-medium">Registrar llegada</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id} className="border-t border-border align-top">
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-xs text-foreground-muted">{p.piezaCodigo}</div>
                      <div>{p.piezaNombre}</div>
                      <div className="text-xs text-foreground-muted">{p.tipoPieza === "comprada" ? "pieza de compra" : "material para fabricar"}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{p.otPiezaCodigo}</td>
                    <td className="px-4 py-2.5 text-foreground-muted">
                      {p.proveedorNombre ?? "—"}
                      {p.observacion?.startsWith("Compra Nº") && <div className="text-xs">Confirmada por Compras ({p.observacion})</div>}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-muted whitespace-nowrap">{new Date(p.fechaPedido).toLocaleDateString("es-AR")}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.cantidad}</td>
                    <td className="px-4 py-2.5">
                      <form action={registrarLlegadaAction} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="pedidoId" value={p.id} />
                        <input type="hidden" name="operacionCompraId" value={operacionCompraPorOtPieza.get(p.otPiezaId) ?? ""} />
                        <select name="controlResultado" required className="input text-xs py-1" defaultValue="">
                          <option value="" disabled>
                            Control…
                          </option>
                          <option value="ok">OK</option>
                          <option value="no_ok">NO OK</option>
                        </select>
                        <input name="observacion" placeholder="Nota" className="input text-xs py-1 w-28" />
                        <button type="submit" className="text-xs text-accent hover:underline">
                          Guardar
                        </button>
                      </form>
                      <form action={cancelarPedidoAction} className="mt-1">
                        <input type="hidden" name="pedidoId" value={p.id} />
                        <ConfirmarBoton mensaje="¿Cancelar este pedido? Vuelve a quedar como pendiente de pedir." className="text-xs text-foreground-muted hover:text-rojo-fg hover:underline">
                          Cancelar pedido
                        </ConfirmarBoton>
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
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold">Pendientes de pedir ({porPedir.length})</h2>
          <form className="flex items-center gap-1.5">
            <select name="ot" defaultValue={ot ?? ""} className="input text-xs py-1">
              <option value="">Todas las OT</option>
              {ots.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button type="submit" className="text-xs text-accent hover:underline">
              Filtrar
            </button>
          </form>
        </div>
        {porPedirFiltrado.length === 0 ? (
          <p className="text-sm text-foreground-muted">No hay nada pendiente de pedir.</p>
        ) : (
          <div className="tarjeta overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Pieza</th>
                  <th className="text-left px-4 py-2 font-medium">OT</th>
                  <th className="text-left px-4 py-2 font-medium">Qué falta</th>
                  <th className="text-left px-4 py-2 font-medium">Marcar como pedida</th>
                </tr>
              </thead>
              <tbody>
                {porPedirFiltrado.map((p) => (
                  <tr key={p.otPiezaId} className="border-t border-border align-top">
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-xs text-foreground-muted">{p.piezaCodigo}</div>
                      <div>{p.piezaNombre}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/ot/${p.otMaquinaId}/pieza/${p.otPiezaId}`} className="font-mono text-xs text-accent hover:underline">
                        {p.otPiezaCodigo}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-foreground-muted">
                      {p.detalle}
                      {/* Aviso, no bloqueo: la puede estar cotizando Compras (Fase 3.2). */}
                      {enCompras.has(p.otPiezaId) && (
                        <div className="mt-1">
                          <span className="badge-estado bg-accent-soft text-accent">Compras la está cotizando · Nº {enCompras.get(p.otPiezaId)}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <form action={marcarPedidoAction} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="otPiezaId" value={p.otPiezaId} />
                        <input name="cantidad" type="number" min={1} defaultValue={p.cantidad} className="input w-16 text-xs py-1" />
                        <ProveedorSelect proveedores={proveedores} />
                        <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap">
                          Pedido
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
