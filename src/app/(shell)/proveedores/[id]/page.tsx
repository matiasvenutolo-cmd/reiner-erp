import { notFound } from "next/navigation";
import { getProveedor } from "@/lib/data/logistica";
import { getDesempenoProveedor } from "@/lib/data/gestion-compras";
import { actualizarProveedorAction } from "@/app/actions/proveedores";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { ProveedorCampos } from "@/components/ProveedorCampos";
import { formatearFecha } from "@/lib/formato";
import { guardarProveedorPlanAction } from "@/app/actions/v2";

export const dynamic = "force-dynamic";

const TIPO_ENTREGA = { compra: "Compra", tercerizado: "Tercerizado", ingreso: "Ingreso" } as const;

/**
 * Ficha del proveedor: sus datos y su desempeño, en los dos aspectos que
 * definió el cliente — calidad de las entregas (OK / NO OK) y cumplimiento de
 * los plazos (acordado contra real). Cada número sale de entregas registradas
 * que se listan abajo; no se arma un puntaje general (no está definido cómo
 * ponderar) y sin datos se dice que no hay datos.
 */
export default async function ProveedorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; guardado?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, guardado, ok: okPlan } = await searchParams;
  const [p, desempeno] = await Promise.all([getProveedor(id), getDesempenoProveedor(id)]);
  if (!p) notFound();
  const { entregas, plazos } = desempeno;
  const ok = entregas.filter((e) => e.resultado === "ok").length;
  const noOk = entregas.length - ok;
  const aTiempo = plazos.filter((x) => x.diferenciaDias <= 0).length;
  const promedio = plazos.length ? plazos.reduce((t, x) => t + x.diferenciaDias, 0) / plazos.length : 0;

  return (
    <div className="space-y-6">
      <PageHeader migas={[{ href: "/proveedores", label: "Proveedores" }, { label: p.razonSocial }]} titulo={p.razonSocial} descripcion={p.rubro ?? undefined} />
      {guardado && <Aviso tipo="ok">Datos guardados.</Aviso>}
      {okPlan && <Aviso tipo="ok">{okPlan}</Aviso>}
      {p.estadoProveedor === "bloqueado" && <Aviso tipo="error">Proveedor bloqueado{p.motivoBloqueo ? `: ${p.motivoBloqueo}` : ""}. No se le compra.</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-4 items-start [&>*]:min-w-0">
        <div className="space-y-4">
        <section className="tarjeta p-4">
          <h2 className="font-semibold mb-3">Datos</h2>
          {/* key: React 19 resetea el form tras guardar; así se rearma con lo guardado. */}
          <form action={actualizarProveedorAction} key={p.updatedAt.toISOString()} className="space-y-3">
            <input type="hidden" name="id" value={p.id} />
            <ProveedorCampos p={p} />
            <button type="submit" className="btn">
              Guardar cambios
            </button>
          </form>
        </section>

        <section className="tarjeta p-4">
          <h2 className="font-semibold">Para planificar</h2>
          <p className="text-xs text-foreground-muted mb-3">El plazo es el que usa el plan para calcular &ldquo;pedir antes del…&rdquo; y la vuelta de los tercerizados, cuando no hay una cotización con plazo propio.</p>
          <form action={guardarProveedorPlanAction} className="grid sm:grid-cols-2 gap-3 text-sm">
            <input type="hidden" name="id" value={p.id} />
            <label>
              Tipo
              <select name="tipoProveedor" defaultValue={p.tipoProveedor ?? ""} className="input block w-full mt-0.5">
                <option value="">—</option>
                <option value="materia_prima">Materia prima</option>
                <option value="comercial">Artículos comerciales</option>
                <option value="servicio">Servicios (tercerizados)</option>
              </select>
            </label>
            <label>
              Plazo estándar (días hábiles)
              <input name="plazoDias" type="number" min="0" defaultValue={p.plazoDias ?? ""} className="input block w-full mt-0.5" />
            </label>
            <label className="sm:col-span-2">
              Procesos que hace (si es de servicios)
              <input name="procesos" defaultValue={p.procesos ?? ""} placeholder="ej. Cromado, Pavonado" className="input block w-full mt-0.5" />
            </label>
            <label>
              Teléfono
              <input name="telefono" defaultValue={p.telefono ?? ""} className="input block w-full mt-0.5" />
            </label>
            <label>
              Email
              <input name="email" type="email" defaultValue={p.email ?? ""} className="input block w-full mt-0.5" />
            </label>
            <label>
              Moneda habitual
              <select name="monedaHabitual" defaultValue={p.monedaHabitual} className="input block w-full mt-0.5">
                <option value="ARS">Pesos</option>
                <option value="USD">Dólares</option>
              </select>
            </label>
            <label>
              Estado
              <select name="estadoProveedor" defaultValue={p.estadoProveedor} className="input block w-full mt-0.5">
                <option value="activo">Activo</option>
                <option value="evaluacion">En evaluación</option>
                <option value="bloqueado">Bloqueado</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              Motivo de bloqueo (obligatorio si está bloqueado)
              <input name="motivoBloqueo" defaultValue={p.motivoBloqueo ?? ""} className="input block w-full mt-0.5" />
            </label>
            <button className="btn sm:col-span-2">Guardar datos de planificación</button>
          </form>
        </section>
        </div>

        <div className="space-y-4">
          <section className="tarjeta p-4">
            <h2 className="font-semibold">Calidad de las entregas</h2>
            <p className="text-xs text-foreground-muted mb-3">Cada entrega con su control al recibirla: compras, vueltas de tercerizados e ingresos.</p>
            {entregas.length === 0 ? (
              <p className="text-sm text-foreground-muted">Todavía no hay entregas registradas con control para este proveedor.</p>
            ) : (
              <>
                <div className="flex gap-6 mb-3">
                  <div>
                    <div className="text-2xl font-semibold text-[var(--estado-terminada-fg)] tabular-nums">{ok}</div>
                    <div className="text-xs text-foreground-muted">entregas OK</div>
                  </div>
                  <div>
                    <div className={`text-2xl font-semibold tabular-nums ${noOk ? "text-[var(--estado-alerta-fg)]" : ""}`}>{noOk}</div>
                    <div className="text-xs text-foreground-muted">entregas NO OK</div>
                  </div>
                </div>
                <ul className="text-sm divide-y divide-border max-h-64 overflow-y-auto">
                  {entregas.map((e, i) => (
                    <li key={i} className="flex items-center gap-2 py-1.5">
                      <span className={`badge-estado ${e.resultado === "ok" ? "badge-terminada" : "badge-alerta"}`}>{e.resultado === "ok" ? "OK" : "NO OK"}</span>
                      <span className="text-xs text-foreground-muted whitespace-nowrap">{formatearFecha(e.fecha)}</span>
                      <span className="truncate">{e.detalle}</span>
                      <span className="ml-auto text-xs text-foreground-muted">{TIPO_ENTREGA[e.tipo]}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="tarjeta p-4">
            <h2 className="font-semibold">Cumplimiento de plazos</h2>
            <p className="text-xs text-foreground-muted mb-3">
              Plazo de entrega de la cotización elegida contra los días reales entre la confirmación y la entrega OK.
            </p>
            {plazos.length === 0 ? (
              <p className="text-sm text-foreground-muted">
                Todavía no hay compras recibidas con plazo de entrega cotizado. Se mide en cuanto una compra confirmada con plazo llega OK.
              </p>
            ) : (
              <>
                <div className="flex gap-6 mb-3">
                  <div>
                    <div className="text-2xl font-semibold tabular-nums">
                      {aTiempo} de {plazos.length}
                    </div>
                    <div className="text-xs text-foreground-muted">llegaron en el plazo acordado</div>
                  </div>
                  <div>
                    <div className={`text-2xl font-semibold tabular-nums ${promedio > 0 ? "text-[var(--estado-alerta-fg)]" : ""}`}>
                      {promedio > 0 ? "+" : ""}
                      {promedio.toLocaleString("es-AR", { maximumFractionDigits: 1 })} días
                    </div>
                    <div className="text-xs text-foreground-muted">diferencia promedio (+ es atraso)</div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-foreground-muted">
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 font-medium">Compra</th>
                      <th className="text-left py-1.5 font-medium">Acordado</th>
                      <th className="text-left py-1.5 font-medium">Recibida</th>
                      <th className="text-right py-1.5 font-medium">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plazos.map((x) => (
                      <tr key={x.solicitudNumero} className="border-t border-border first:border-t-0">
                        <td className="py-1.5 max-w-[12rem] truncate">
                          Nº {x.solicitudNumero} — {x.descripcion}
                        </td>
                        <td className="py-1.5 text-xs whitespace-nowrap">
                          {x.acordadaDias} días · {formatearFecha(x.entregaAcordada)}
                        </td>
                        <td className="py-1.5 text-xs whitespace-nowrap">{formatearFecha(x.recibida)}</td>
                        <td className={`py-1.5 text-right tabular-nums ${x.diferenciaDias > 0 ? "text-[var(--estado-alerta-fg)] font-semibold" : ""}`}>
                          {x.diferenciaDias > 0 ? `+${x.diferenciaDias} días` : x.diferenciaDias === 0 ? "a tiempo" : `${-x.diferenciaDias} días antes`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
