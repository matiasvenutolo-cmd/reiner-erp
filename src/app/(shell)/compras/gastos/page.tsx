import Link from "next/link";
import { listarSolicitudes, calcularGastosFuturos, type GastoFuturo } from "@/lib/data/gestion-compras";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso, Vacio } from "@/components/ui/Aviso";
import { OrigenCompra, ImporteDoble, LinkCompra, PestanasCompras } from "@/components/compras/Partes";
import { formatearFecha, formatearImporte } from "@/lib/formato";
import { fechaISO, hoyISO } from "@/lib/fecha";

export const dynamic = "force-dynamic";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (clave: string) => {
  const [a, m] = clave.split("-");
  return `${MESES[Number(m) - 1]} ${a}`;
};

/** Suma por moneda original + el total en pesos (con el tipo de cambio guardado en cada cotización). */
function totales(gastos: GastoFuturo[]) {
  const porMoneda = new Map<string, number>();
  let enPesos = 0;
  let sinConversion = 0;
  for (const g of gastos) {
    const m = g.solicitud.elegida!.moneda;
    porMoneda.set(m, (porMoneda.get(m) ?? 0) + g.saldo);
    if (g.saldoEnPesos === null) sinConversion++;
    else enPesos += g.saldoEnPesos;
  }
  return { porMoneda: [...porMoneda], enPesos, sinConversion };
}

/**
 * Gastos futuros: lo que la empresa ya decidió comprar y todavía no pagó.
 * Sólo cuenta la cotización elegida de cada compra (las alternativas no se
 * suman) y lo pagado ya no es futuro: es gasto efectuado (definición del
 * cliente: un gasto se efectúa cuando se paga).
 */
export default async function GastosFuturosPage() {
  const { gastos, enCotizacion } = calcularGastosFuturos(await listarSolicitudes());
  const hoy = hoyISO();

  const grupos = new Map<string, GastoFuturo[]>();
  for (const g of gastos) {
    const clave = g.solicitud.fechaPagoPrevista?.slice(0, 7) ?? "sin-fecha";
    grupos.set(clave, [...(grupos.get(clave) ?? []), g]);
  }
  const claves = [...grupos.keys()].sort((a, b) => (a === "sin-fecha" ? 1 : b === "sin-fecha" ? -1 : a.localeCompare(b)));
  const total = totales(gastos);

  return (
    <div>
      <PageHeader
        titulo="Compras"
        descripcion="Gastos futuros: las compras con cotización elegida que todavía no se pagaron, ordenadas por la fecha de pago prevista."
        acciones={
          <Link href="/compras/nueva" className="btn">
            + Nueva compra general
          </Link>
        }
      >
        <PestanasCompras actual="/compras/gastos" />
      </PageHeader>

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div className="tarjeta px-4 py-3">
          <div className="text-xs text-foreground-muted">Total a pagar, en pesos</div>
          <div className="text-2xl font-semibold tabular-nums">{formatearImporte(total.enPesos, "ARS")}</div>
          <div className="text-[11px] text-foreground-muted">
            Moneda extranjera convertida con el tipo de cambio guardado en cada cotización
            {total.sinConversion > 0 && ` · ${total.sinConversion} sin conversión, no incluidas`}
          </div>
        </div>
        <div className="tarjeta px-4 py-3">
          <div className="text-xs text-foreground-muted">Por moneda original</div>
          {total.porMoneda.length === 0 ? (
            <div className="text-2xl font-semibold">—</div>
          ) : (
            total.porMoneda.map(([m, v]) => (
              <div key={m} className="font-semibold tabular-nums">
                {formatearImporte(v, m)}
              </div>
            ))
          )}
        </div>
        <div className="tarjeta px-4 py-3">
          <div className="text-xs text-foreground-muted">En cotización, todavía no se suman</div>
          <div className="text-2xl font-semibold tabular-nums">{enCotizacion.length}</div>
          <div className="text-[11px] text-foreground-muted">compras sin cotización elegida</div>
        </div>
      </div>

      <Aviso tipo="info">
        Un gasto futuro es una compra prevista: tiene cotización elegida y saldo sin pagar. Una cotización no elegida no cuenta, y al
        registrar el pago pasa a <Link href="/compras/pagos" className="underline">Pagos realizados</Link>.
      </Aviso>

      {gastos.length === 0 ? (
        <Vacio accion={<Link href="/compras" className="btn-secundario btn-sm">Ir a Compras</Link>}>
          No hay compras previstas sin pagar. Aparecen acá cuando se elige la cotización con la que se compra.
        </Vacio>
      ) : (
        <div className="space-y-6">
          {claves.map((clave) => {
            const filas = grupos.get(clave)!;
            const t = totales(filas);
            const vencido = clave !== "sin-fecha" && clave < hoy.slice(0, 7);
            return (
              <section key={clave}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <h2 className={`text-base font-semibold capitalize ${vencido ? "text-[var(--estado-alerta-fg)]" : ""}`}>
                    {clave === "sin-fecha" ? "Sin fecha de pago prevista" : nombreMes(clave)}
                    {vencido && <span className="normal-case text-sm font-normal"> · fecha de pago ya pasada</span>}
                  </h2>
                  <span className="text-sm tabular-nums">
                    {t.porMoneda.map(([m, v]) => formatearImporte(v, m)).join(" + ")}
                    {t.porMoneda.some(([m]) => m !== "ARS") && <span className="text-foreground-muted"> ≈ {formatearImporte(t.enPesos, "ARS")}</span>}
                  </span>
                </div>
                <div className="tarjeta overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-foreground-muted">
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-2 font-medium">Compra</th>
                        <th className="text-left px-3 py-2 font-medium">Proveedor</th>
                        <th className="text-left px-3 py-2 font-medium">Fechas</th>
                        <th className="text-left px-3 py-2 font-medium">Importe</th>
                        <th className="text-right px-4 py-2 font-medium">Falta pagar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map(({ solicitud: s, saldo, saldoEnPesos }) => (
                        <tr key={s.id} className="border-t border-border first:border-t-0 align-top">
                          <td className="px-4 py-2.5 max-w-xs">
                            <LinkCompra s={s} />
                            <div className="mt-1">
                              <OrigenCompra s={s} />
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            {s.elegida!.proveedorNombre}
                            {s.elegida!.condicionPago && <div className="text-xs text-foreground-muted">Pago: {s.elegida!.condicionPago}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-xs whitespace-nowrap space-y-0.5">
                            <div>Pago previsto: {formatearFecha(s.fechaPagoPrevista)}</div>
                            <div className="text-foreground-muted">Se necesita: {formatearFecha(s.fechaNecesidad)}</div>
                            <div className="text-foreground-muted">
                              {s.confirmadaAt ? `Confirmada: ${formatearFecha(fechaISO(s.confirmadaAt))}` : `Compra prevista: ${formatearFecha(s.fechaCompraPrevista)}`}
                            </div>
                            {s.entregaPrevista && <div className="text-foreground-muted">Entrega prevista: {formatearFecha(s.entregaPrevista)}</div>}
                          </td>
                          <td className="px-3 py-2.5">
                            <ImporteDoble importe={s.elegida!.importe} tc={{ valor: s.elegida!.tipoCambio, fecha: s.elegida!.tipoCambioFecha }} />
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                            <div className="font-semibold">{formatearImporte(saldo, s.elegida!.moneda)}</div>
                            {s.elegida!.moneda !== "ARS" && <div className="text-xs text-foreground-muted">≈ {formatearImporte(saldoEnPesos, "ARS", "sin conversión")}</div>}
                            {s.pagado > 0 && <div className="text-xs text-foreground-muted">ya pagado {formatearImporte(s.pagado, s.elegida!.moneda)}</div>}
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

      {enCotizacion.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold">En cotización ({enCotizacion.length})</h2>
          <p className="text-xs text-foreground-muted mb-2">
            Todavía no se eligió con qué cotización se compra: no se suman, porque cada una es una alternativa de la misma compra.
          </p>
          <ul className="tarjeta divide-y divide-border">
            {enCotizacion.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <LinkCompra s={s} />
                <span className="text-xs text-foreground-muted">
                  {s.cotizaciones.length} alternativa{s.cotizaciones.length === 1 ? "" : "s"} ·{" "}
                  {s.cotizaciones.map((c) => formatearImporte(c.importe.total, c.importe.moneda)).join(" / ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
