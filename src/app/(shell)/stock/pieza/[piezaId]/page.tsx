import Link from "next/link";
import { notFound } from "next/navigation";
import { getPieza, getConjunto } from "@/lib/data/maestros";
import { getStockDisponible, getReservasDePieza, getWipEnCursoDePieza } from "@/lib/data/stock";
import { getPedidosPendientes } from "@/lib/data/compras";
import { listarMovimientos } from "@/lib/data/logistica";
import { listarOtMaquinas } from "@/lib/data/ot";
import { getUsuarioActual } from "@/lib/session";
import { retirarStockAction, ajustarStockAction } from "@/app/actions/stock";
import { MovimientosTabla } from "@/components/MovimientosTabla";

export const dynamic = "force-dynamic";

/**
 * Ficha de stock de una pieza (devolución del socio: "cuando entrás a un ítem
 * del stock te manda a la tabla de maestros como para editar, eso está mal.
 * Deberías simplemente poner que te agarraste x cantidad y registrar quién
 * sacó del stock"). Maestros sigue siendo para editar la pieza; esto es sólo
 * cuánto hay, para quién está y quién lo saca.
 */
export default async function StockPiezaPage({
  params,
  searchParams,
}: {
  params: Promise<{ piezaId: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { piezaId } = await params;
  const { error, ok } = await searchParams;
  const pieza = await getPieza(decodeURIComponent(piezaId));
  if (!pieza) notFound();

  const [usuario, conjunto, almacen, reservas, enProceso, pedidos, movimientos, ordenes] = await Promise.all([
    getUsuarioActual(),
    getConjunto(pieza.conjuntoId),
    getStockDisponible(pieza.id),
    getReservasDePieza(pieza.id),
    getWipEnCursoDePieza(pieza.id),
    getPedidosPendientes(pieza.id),
    listarMovimientos(undefined, 20, pieza.id),
    listarOtMaquinas(),
  ]);
  const comprometido = Math.min(almacen, reservas.reduce((s, r) => s + r.cantidad, 0));
  const libre = almacen - comprometido;
  const enFabricacion = enProceso.reduce((s, e) => s + e.cantidad, 0);
  const pedido = pedidos.reduce((s, p) => s + p.cantidad, 0);
  const otsAbiertas = ordenes.filter((o) => o.estadoCalculado !== "terminada");

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/stock" className="text-sm text-accent hover:underline">
          ← Stock
        </Link>
        <h1 className="text-xl font-semibold mt-1">{pieza.nombre}</h1>
        <p className="text-sm text-foreground-muted">
          <span className="font-mono">{pieza.codigo}</span> · {conjunto?.nombre}
          {pieza.tipo === "comprada" ? " · pieza de compra" : ""}
        </p>
      </div>

      {error && <div className="badge-estado badge-alerta text-sm px-3 py-2 block">{error}</div>}
      {ok === "retiro" && <div className="badge-estado badge-terminada text-sm px-3 py-2 block">Retiro registrado.</div>}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Dato label="En almacén" value={almacen} />
        <Dato label="Libre" value={libre} destacado />
        <Dato label="Comprometido" value={comprometido} />
        <Dato label="En fabricación (futuro)" value={enFabricacion} />
        <Dato label="Pedido, por llegar" value={pedido} />
      </div>

      <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">Retirar del almacén</h2>
        <form action={retirarStockAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="piezaId" value={pieza.id} />
          <label className="text-xs text-foreground-muted">
            Cantidad
            <input name="cantidad" type="number" min={1} max={almacen} required className="input w-20 text-sm block mt-0.5" />
          </label>
          <label className="text-xs text-foreground-muted">
            Para qué OT
            <select name="otMaquinaId" defaultValue={reservas[0]?.otMaquinaId ?? ""} className="input text-sm block mt-0.5 w-44">
              <option value="">Sin OT (sólo de lo libre)</option>
              {otsAbiertas.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.codigo}
                  {reservas.some((r) => r.otMaquinaId === o.id) ? " · tiene reserva" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-foreground-muted flex-1 min-w-40">
            Motivo / nota
            <input name="observacion" placeholder="ej. armado del cabezal" className="input text-sm block mt-0.5 w-full" />
          </label>
          <button type="submit" disabled={almacen === 0} className="bg-accent text-accent-foreground text-sm font-medium px-3 py-2 rounded-md hover:opacity-90 disabled:opacity-40">
            Registrar retiro
          </button>
        </form>
        <p className="text-xs text-foreground-muted">Queda registrado quién lo sacó ({usuario.nombre}) y cuándo.</p>
      </div>

      {reservas.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Comprometido para</h2>
          <ul className="text-sm space-y-1">
            {reservas.map((r) => (
              <li key={r.id} className="flex justify-between bg-surface border border-border rounded-md px-3 py-2">
                <Link href={`/ot/${r.otMaquinaId}`} className="font-mono text-accent hover:underline">
                  {r.otMaquinaCodigo}
                </Link>
                <span className="tabular-nums">{r.cantidad} u.</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(enProceso.length > 0 || pedidos.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-4">
          {enProceso.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2">En fabricación</h2>
              <div className="flex flex-wrap gap-1">
                {enProceso.map((e) => (
                  <span key={e.procesoNombre} className="badge-estado badge-en_curso">
                    {e.cantidad} en {e.procesoNombre}
                  </span>
                ))}
              </div>
            </div>
          )}
          {pedidos.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2">Pedido al proveedor</h2>
              <ul className="text-sm space-y-1">
                {pedidos.map((p) => (
                  <li key={p.id} className="text-foreground-muted">
                    {p.cantidad} u. a {p.proveedorNombre ?? "proveedor sin cargar"} · {new Date(p.fechaPedido).toLocaleDateString("es-AR")} ·{" "}
                    {p.otMaquinaCodigo}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">Últimos movimientos</h2>
        <MovimientosTabla movimientos={movimientos} mostrarPieza={false} />
      </div>

      {usuario.rol === "taller" && (
        <details className="text-sm">
          <summary className="cursor-pointer text-foreground-muted hover:text-foreground">Corregir el conteo del almacén</summary>
          <form action={ajustarStockAction} className="flex flex-wrap items-center gap-2 mt-2">
            <input type="hidden" name="piezaId" value={pieza.id} />
            <input name="cantidadNueva" type="number" min={0} defaultValue={almacen} className="input w-20 text-sm" />
            <input name="observacion" placeholder="Motivo (ej. inventario)" className="input text-sm w-56" />
            <button type="submit" className="text-sm text-accent hover:underline">
              Guardar conteo
            </button>
          </form>
        </details>
      )}

      <p className="text-xs text-foreground-muted">
        Para editar los datos de la pieza (plano, material, hoja de ruta):{" "}
        <Link href={`/maestros/pieza/${pieza.id}`} className="text-accent hover:underline">
          Maestros →
        </Link>
      </p>
    </div>
  );
}

function Dato({ label, value, destacado }: { label: string; value: number; destacado?: boolean }) {
  return (
    <div className={`bg-surface border rounded-lg px-3 py-2 ${destacado ? "border-accent" : "border-border"}`}>
      <div className="text-xs text-foreground-muted">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
