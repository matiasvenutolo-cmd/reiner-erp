import Link from "next/link";
import { listarSolicitudes, pagosRealizados, type PagoRealizado } from "@/lib/data/gestion-compras";
import { PageHeader } from "@/components/ui/PageHeader";
import { Vacio } from "@/components/ui/Aviso";
import { PestanasCompras } from "@/components/compras/Partes";
import { formatearFecha, formatearImporte } from "@/lib/formato";

export const dynamic = "force-dynamic";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Gastos efectuados: lo efectivamente pagado, por mes. */
export default async function PagosPage() {
  const pagos = pagosRealizados(await listarSolicitudes());
  const grupos = new Map<string, PagoRealizado[]>();
  for (const p of pagos) grupos.set(p.fecha.slice(0, 7), [...(grupos.get(p.fecha.slice(0, 7)) ?? []), p]);

  return (
    <div>
      <PageHeader
        titulo="Compras"
        descripcion="Pagos realizados: los gastos efectuados. Una compra pasa acá recién cuando se registra su pago."
        acciones={
          <Link href="/compras/nueva" className="btn">
            + Nueva compra general
          </Link>
        }
      >
        <PestanasCompras actual="/compras/pagos" />
      </PageHeader>

      {pagos.length === 0 ? (
        <Vacio>Todavía no hay pagos registrados. Se cargan desde cada compra, en &ldquo;Pago&rdquo;.</Vacio>
      ) : (
        <div className="space-y-6">
          {[...grupos].map(([mes, filas]) => {
            const [a, m] = mes.split("-");
            const porMoneda = new Map<string, number>();
            for (const p of filas) porMoneda.set(p.moneda, (porMoneda.get(p.moneda) ?? 0) + p.importe);
            return (
              <section key={mes}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <h2 className="text-base font-semibold capitalize">
                    {MESES[Number(m) - 1]} {a}
                  </h2>
                  <span className="text-sm tabular-nums">{[...porMoneda].map(([mo, v]) => formatearImporte(v, mo)).join(" + ")}</span>
                </div>
                <div className="tarjeta overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-foreground-muted">
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-2 font-medium">Fecha</th>
                        <th className="text-left px-3 py-2 font-medium">Compra</th>
                        <th className="text-left px-3 py-2 font-medium">Proveedor</th>
                        <th className="text-right px-4 py-2 font-medium">Pagado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((p) => (
                        <tr key={p.id} className="border-t border-border first:border-t-0">
                          <td className="px-4 py-2.5 whitespace-nowrap">{formatearFecha(p.fecha)}</td>
                          <td className="px-3 py-2.5">
                            <Link href={`/compras/${p.solicitudId}`} className="hover:text-accent hover:underline">
                              Nº {p.solicitudNumero} — {p.descripcion}
                            </Link>
                            {p.observacion && <div className="text-xs text-foreground-muted">{p.observacion}</div>}
                          </td>
                          <td className="px-3 py-2.5">{p.proveedorNombre ?? "—"}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                            {formatearImporte(p.importe, p.moneda)}
                            {p.moneda !== "ARS" && <div className="text-xs text-foreground-muted">≈ {formatearImporte(p.enPesos, "ARS", "sin conversión")}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
