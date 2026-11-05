import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articuloStock } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasStock } from "@/components/ui/PestanasSecciones";
import { Aviso, Vacio } from "@/components/ui/Aviso";
import { Codigo } from "@/components/ui/Codigo";
import { getPiezasFinalizadas } from "@/lib/data/stock";
import { retirarArticuloAction } from "@/app/actions/v2";
import { capitalizar, numero } from "@/lib/formato";

export const dynamic = "force-dynamic";

const num = (n: number) => (Math.round(n * 100) / 100).toLocaleString("es-AR");

type Fila = {
  clave: string;
  nombre: string;
  codigo: string | null;
  tipo: "Pieza comercial" | "Consumible";
  cantidad: string;
  libre: number;
  reservada: number;
  minimo: number | null;
  href: string | null;
  articuloId: string | null;
  unidad: string;
};

/**
 * Insumos (tanda 2, 05/11): una sola lista con lo que se compra hecho. Las piezas comerciales de las órdenes
 * (resortes, wipers, tornillos…: entran al llegar la compra, reservadas para su orden) y los consumibles de taller
 * (insertos, mechas, lubricantes…: no se reservan, se registra el retiro).
 */
export default async function InsumosPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const [comerciales, consumibles] = await Promise.all([
    getPiezasFinalizadas({ tipo: "comprada" }),
    db.select().from(articuloStock).where(eq(articuloStock.tipo, "consumible")).orderBy(asc(articuloStock.nombre)),
  ]);
  const filas: Fila[] = [
    ...comerciales.map((p) => ({
      clave: `p:${p.piezaId}`,
      nombre: capitalizar(p.piezaNombre),
      codigo: p.piezaCodigo,
      tipo: "Pieza comercial" as const,
      cantidad: `${numero(p.disponible)} u.`,
      libre: p.disponible - p.comprometido,
      reservada: p.comprometido,
      minimo: null,
      href: `/stock/pieza/${p.piezaId}`,
      articuloId: null,
      unidad: "u.",
    })),
    ...consumibles.map((a) => ({
      clave: `a:${a.id}`,
      nombre: a.nombre,
      codigo: null,
      tipo: "Consumible" as const,
      cantidad: `${num(a.cantidad)} ${a.unidad}`,
      libre: a.cantidad,
      reservada: 0,
      minimo: a.minimo,
      href: null,
      articuloId: a.id,
      unidad: a.unidad,
    })),
  ].sort((x, y) => x.nombre.localeCompare(y.nombre));

  return (
    <div className="space-y-5">
      <PageHeader titulo="Stock" descripcion="Insumos: piezas comerciales que se compran hechas y consumibles de taller, en una sola lista.">
        <PestanasStock actual="/stock/insumos" />
      </PageHeader>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {filas.length === 0 ? (
        <Vacio neutro>Todavía no hay insumos en stock. Las piezas comerciales entran solas cuando Compras recibe la compra.</Vacio>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-foreground-muted">
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 font-medium">Insumo</th>
                <th className="text-left px-3 py-2 font-medium">Tipo</th>
                <th className="text-right px-3 py-2 font-medium">Cantidad</th>
                <th className="text-right px-3 py-2 font-medium">Libre</th>
                <th className="text-right px-3 py-2 font-medium">Reservada</th>
                <th className="text-right px-3 py-2 font-medium">Mínimo</th>
                <th className="px-4 py-2 font-medium text-right">Retirar</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const debajo = f.minimo != null && f.libre < f.minimo;
                return (
                  <tr key={f.clave} className={`border-t border-border ${debajo ? "bg-rojo-tenue" : ""}`}>
                    <td className="px-4 py-2">
                      {f.href ? (
                        <Link href={f.href} className="font-medium hover:text-accent hover:underline">
                          {f.nombre}
                        </Link>
                      ) : (
                        <span className="font-medium">{f.nombre}</span>
                      )}
                      {f.codigo && (
                        <div>
                          <Codigo valor={f.codigo} />
                        </div>
                      )}
                      {debajo && <div className="text-xs text-rojo-fg font-semibold">debajo del mínimo</div>}
                    </td>
                    <td className="px-3 py-2 text-foreground-muted whitespace-nowrap">{f.tipo}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{f.cantidad}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="badge-estado bg-verde-bg text-verde-fg tabular-nums">{num(f.libre)}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{f.reservada > 0 ? <span className="badge-estado bg-accent-soft text-accent tabular-nums">{num(f.reservada)}</span> : <span className="text-foreground-muted">—</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground-muted">{f.minimo != null ? num(f.minimo) : "—"}</td>
                    <td className="px-4 py-2 text-right">
                      {f.articuloId ? (
                        <form action={retirarArticuloAction} className="inline-flex items-center gap-1">
                          <input type="hidden" name="id" value={f.articuloId} />
                          <input type="hidden" name="vista" value="insumos" />
                          <input name="cantidad" type="number" min="0" step="any" className="input text-xs py-0.5 w-16" aria-label={`Cantidad de ${f.nombre}`} />
                          <button className="btn-secundario btn-sm">Retirar</button>
                        </form>
                      ) : (
                        <span className="text-xs text-foreground-muted">sale al usarse en la orden</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
