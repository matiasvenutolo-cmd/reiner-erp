import Link from "next/link";
import { notFound } from "next/navigation";
import { getSolicitud, MONEDAS, type SolicitudDetalle } from "@/lib/data/gestion-compras";
import { getProveedores } from "@/lib/data/logistica";
import {
  actualizarSolicitudAction,
  anularSolicitudAction,
  agregarCotizacionAction,
  completarTipoCambioAction,
  eliminarCotizacionAction,
  elegirCotizacionAction,
  confirmarCompraAction,
  registrarRecepcionAction,
  registrarPagoAction,
  eliminarPagoAction,
} from "@/app/actions/gestion-compras";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";
import { EstadoCompra, OrigenCompra, ImporteDoble, CantidadCompra } from "@/components/compras/Partes";
import { formatearFecha, formatearImporte, formatearNumero } from "@/lib/formato";
import { fechaISO, hoyISO } from "@/lib/fecha";

export const dynamic = "force-dynamic";

/** Qué hay que hacer ahora con esta compra — el paso siguiente, en palabras. */
function siguientePaso(s: SolicitudDetalle): string | null {
  switch (s.estado) {
    case "sin_cotizar":
      return "Cargá las cotizaciones que vayas pidiendo a los proveedores (abajo, \"Agregar cotización\").";
    case "cotizando":
      return "Compará las cotizaciones y elegí con cuál se compra. Elegir no confirma la compra: la deja prevista en Gastos futuros.";
    case "a_confirmar":
      return "Cuando hagas el pedido al proveedor, registralo en \"Confirmar compra\".";
    case "en_camino":
      return "Cuando llegue, registrá la entrega con su control OK / NO OK.";
    case "recibida":
      return (s.saldo ?? 0) > 0 ? "Llegó OK. Falta registrar el pago: recién ahí el gasto queda efectuado." : null;
    default:
      return null;
  }
}

export default async function CompraPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const [s, proveedores] = await Promise.all([getSolicitud(id), getProveedores()]);
  if (!s) notFound();

  const hoy = hoyISO();
  const abierta = s.estado !== "anulada";
  const editableQue = abierta && !s.confirmadaAt;
  const paso = siguientePaso(s);
  const minPesos = Math.min(...s.cotizaciones.map((c) => c.importe.enPesos ?? Infinity));

  return (
    <div className="space-y-6">
      <PageHeader
        migas={[{ href: "/compras", label: "Compras" }, { label: `Compra Nº ${s.numero}` }]}
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            Compra Nº {s.numero}
            <EstadoCompra estado={s.estado} />
            <OrigenCompra s={s} />
          </span>
        }
        descripcion={s.descripcion}
      />

      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {paso && !ok && <Aviso tipo="info">{paso}</Aviso>}

      <div className="grid lg:grid-cols-2 gap-4 [&>*]:min-w-0">
        {/* Qué se compra */}
        <section className="tarjeta p-4 space-y-3">
          <h2 className="font-semibold">Qué se compra</h2>
          {s.ot && (
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm bg-surface-muted rounded-lg p-3">
              <dt className="text-foreground-muted">Orden de trabajo</dt>
              <dd className="font-mono text-xs pt-0.5">{s.ot.otPiezaCodigo}</dd>
              <dt className="text-foreground-muted">Máquina / pedido</dt>
              <dd>
                {s.ot.otMaquinaCodigo} · {s.ot.referencia}
              </dd>
              <dt className="text-foreground-muted">Pieza</dt>
              <dd>
                {s.ot.piezaNombre} <span className="text-xs text-foreground-muted">({s.ot.piezaCodigo})</span>
              </dd>
              <dt className="text-foreground-muted">Tipo</dt>
              <dd>{s.ot.piezaTipo === "comprada" ? "Se compra hecha" : `Se fabrica: falta el material${s.ot.material ? ` (${s.ot.material})` : ""}`}</dd>
            </dl>
          )}
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-foreground-muted">Cantidad</dt>
            <dd className="font-medium">
              <CantidadCompra s={s} />
            </dd>
            {s.observacion && (
              <>
                <dt className="text-foreground-muted">Observaciones</dt>
                <dd>{s.observacion}</dd>
              </>
            )}
          </dl>
          {editableQue && (
            <details className="border-t border-border pt-2">
              <summary className="cursor-pointer text-sm text-accent">Editar descripción, cantidad u observaciones</summary>
              <div className="mt-3">
      <form action={actualizarSolicitudAction} className="space-y-3" key={`${s.descripcion}|${s.cantidad}|${s.unidad}|${s.observacion}`}>
                    <input type="hidden" name="id" value={s.id} />
                    <label className="block">
                      <span className="etiqueta">Descripción</span>
                      <input name="descripcion" defaultValue={s.descripcion} required className="input" />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="etiqueta">Cantidad</span>
                        <input name="cantidad" type="number" step="any" min="0" defaultValue={s.cantidad} required className="input" />
                      </label>
                      <label className="block">
                        <span className="etiqueta">Unidad</span>
                        <input name="unidad" defaultValue={s.unidad ?? ""} className="input" />
                      </label>
                    </div>
                    <label className="block">
                      <span className="etiqueta">Observaciones</span>
                      <textarea name="observacion" rows={2} defaultValue={s.observacion ?? ""} className="input resize-none" />
                    </label>
                    <button type="submit" className="btn-secundario btn-sm">
                      Guardar
                    </button>
                  </form>
              </div>
            </details>
          )}
        </section>

        {/* Fechas — cada una es un concepto distinto */}
        <section className="tarjeta p-4 space-y-3">
          <h2 className="font-semibold">Fechas</h2>
          <form action={actualizarSolicitudAction} className="space-y-3" key={`${s.fechaNecesidad}|${s.fechaCompraPrevista}|${s.fechaPagoPrevista}`}>
            <input type="hidden" name="id" value={s.id} />
            <Fecha nombre="fechaNecesidad" titulo="Se necesita el material" valor={s.fechaNecesidad} habilitado={abierta}>
              {s.origen === "orden_trabajo" &&
                (s.primeraPlanificada
                  ? `Referencia: Producción planificó la primera operación de esta pieza para el ${formatearFecha(s.primeraPlanificada)}.`
                  : "La indica Producción; esta pieza todavía no tiene operaciones planificadas.")}
            </Fecha>
            <Fecha nombre="fechaCompraPrevista" titulo="Compra prevista" valor={s.fechaCompraPrevista} habilitado={abierta && !s.confirmadaAt}>
              Cuándo se piensa hacer el pedido.
            </Fecha>
            <Fecha nombre="fechaPagoPrevista" titulo="Pago previsto" valor={s.fechaPagoPrevista} habilitado={abierta && (s.saldo ?? 1) > 0}>
              Ordena la compra en Gastos futuros.
            </Fecha>
            {abierta && (
              <button type="submit" className="btn-secundario btn-sm">
                Guardar fechas
              </button>
            )}
          </form>
          <dl className="grid grid-cols-2 gap-2 text-sm border-t border-border pt-3">
            <Dato titulo="Confirmada al proveedor" valor={s.confirmadaAt ? formatearFecha(fechaISO(s.confirmadaAt)) : "—"} />
            <Dato
              titulo="Entrega prevista"
              valor={formatearFecha(s.entregaPrevista)}
              nota={s.entregaPrevista ? "confirmación + plazo cotizado" : s.confirmadaAt ? "la cotización no tiene plazo" : undefined}
              alerta={!!(s.entregaPrevista && !s.fechaRecepcion && s.entregaPrevista < hoy)}
            />
            <Dato titulo="Recibida OK" valor={formatearFecha(s.fechaRecepcion)} />
            <Dato titulo="Pagada" valor={s.elegida && (s.saldo ?? 1) <= 0 ? formatearFecha(s.pagos.at(-1)?.fecha) : s.pagado > 0 ? "en parte" : "—"} />
          </dl>
        </section>
      </div>

      {/* Cotizaciones, una al lado de la otra */}
      <section className="tarjeta p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <h2 className="font-semibold">Cotizaciones ({s.cotizaciones.length})</h2>
          <p className="text-xs text-foreground-muted">
            Importes convertidos con el tipo de cambio oficial del BCRA del día de cada cotización, guardado con la cotización.
          </p>
        </div>
        {s.cotizaciones.length === 0 ? (
          <p className="text-sm text-foreground-muted py-3">Todavía no hay cotizaciones.</p>
        ) : (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm">
              <thead className="text-xs text-foreground-muted">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 font-medium">Proveedor</th>
                  <th className="text-right px-3 py-2 font-medium">Cantidad</th>
                  <th className="text-right px-3 py-2 font-medium">Precio unitario</th>
                  <th className="text-left px-3 py-2 font-medium">Total</th>
                  <th className="text-left px-3 py-2 font-medium">Entrega</th>
                  <th className="text-left px-3 py-2 font-medium">Condición de pago</th>
                  <th className="text-left px-3 py-2 font-medium">Posible confirmación</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {s.cotizaciones.map((c) => {
                  const esElegida = c.id === s.cotizacionElegidaId;
                  return (
                    <tr key={c.id} className={`border-t border-border align-top ${esElegida ? "bg-[var(--estado-terminada-bg)]" : ""}`}>
                      <td className="px-4 py-2.5">
                        <Link href={`/proveedores/${c.proveedorId}`} className="font-medium hover:text-accent hover:underline">
                          {c.proveedorNombre}
                        </Link>
                        <div className="text-xs text-foreground-muted">Cotizó el {formatearFecha(c.fecha)}</div>
                        {c.observaciones && <div className="text-xs text-foreground-muted mt-0.5 max-w-[14rem]">{c.observaciones}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatearNumero(c.cantidad, 3)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatearImporte(c.precioUnitario, c.moneda)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <ImporteDoble importe={c.importe} tc={{ valor: c.tipoCambio, fecha: c.tipoCambioFecha }} />
                        {!c.tipoCambio && abierta && (
                          <form action={completarTipoCambioAction}>
                            <input type="hidden" name="solicitudId" value={s.id} />
                            <input type="hidden" name="cotizacionId" value={c.id} />
                            <button type="submit" className="text-xs text-accent hover:underline">
                              Completar tipo de cambio
                            </button>
                          </form>
                        )}
                        {s.cotizaciones.length > 1 && c.importe.enPesos === minPesos && <div className="text-[11px] text-foreground-muted">la más baja</div>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{c.tiempoEntregaDias != null ? `${c.tiempoEntregaDias} días` : "—"}</td>
                      <td className="px-3 py-2.5">{c.condicionPago ?? "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatearFecha(c.fechaConfirmacionPosible)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {esElegida ? (
                          <div className="space-y-1">
                            <span className="badge-estado badge-terminada">✓ Elegida</span>
                            {!s.confirmadaAt && s.pagado === 0 && abierta && (
                              <form action={elegirCotizacionAction}>
                                <input type="hidden" name="solicitudId" value={s.id} />
                                <input type="hidden" name="cotizacionId" value="" />
                                <button type="submit" className="block ml-auto text-xs text-foreground-muted hover:underline">
                                  Deshacer
                                </button>
                              </form>
                            )}
                          </div>
                        ) : (
                          !s.confirmadaAt &&
                          s.pagado === 0 &&
                          abierta && (
                            <form action={elegirCotizacionAction}>
                              <input type="hidden" name="solicitudId" value={s.id} />
                              <input type="hidden" name="cotizacionId" value={c.id} />
                              <button type="submit" className="btn btn-sm">
                                Elegir esta
                              </button>
                            </form>
                          )
                        )}
                        {!(esElegida && s.confirmadaAt) && abierta && (
                          <form action={eliminarCotizacionAction} className="mt-1">
                            <input type="hidden" name="solicitudId" value={s.id} />
                            <input type="hidden" name="cotizacionId" value={c.id} />
                            <ConfirmarBoton mensaje={`¿Quitar la cotización de ${c.proveedorNombre}?`} className="text-xs text-[var(--estado-alerta-fg)] hover:underline">
                              Quitar
                            </ConfirmarBoton>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {editableQue && (
          <details className="mt-3 border-t border-border pt-3" open={s.cotizaciones.length === 0}>
            <summary className="cursor-pointer text-sm font-semibold text-accent">+ Agregar cotización</summary>
            {proveedores.length === 0 ? (
              <p className="text-sm mt-2">
                Primero cargá el proveedor en{" "}
                <Link href="/proveedores" className="text-accent underline">
                  Proveedores
                </Link>
                .
              </p>
            ) : (
              <form action={agregarCotizacionAction} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                <input type="hidden" name="solicitudId" value={s.id} />
                <label className="block sm:col-span-2">
                  <span className="etiqueta">Proveedor *</span>
                  <select name="proveedorId" required defaultValue="" className="input">
                    <option value="" disabled>
                      Elegí el proveedor…
                    </option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.razonSocial}
                        {p.condicionPago ? ` — pago: ${p.condicionPago}` : ""}
                      </option>
                    ))}
                  </select>
                  <Link href="/proveedores" className="text-xs text-accent hover:underline">
                    ¿No está? Cargarlo en Proveedores
                  </Link>
                </label>
                <label className="block">
                  <span className="etiqueta">Cantidad cotizada *</span>
                  <input name="cantidad" type="number" step="any" min="0" required defaultValue={s.cantidad} className="input" />
                </label>
                <label className="block">
                  <span className="etiqueta">Fecha de la cotización</span>
                  <input name="fecha" type="date" defaultValue={hoy} max={hoy} className="input" />
                </label>
                <label className="block">
                  <span className="etiqueta">Precio unitario *</span>
                  <input name="precioUnitario" type="number" step="any" min="0" required className="input" />
                </label>
                <label className="block">
                  <span className="etiqueta">Moneda *</span>
                  <select name="moneda" defaultValue="ARS" className="input">
                    {MONEDAS.map((m) => (
                      <option key={m} value={m}>
                        {m === "ARS" ? "Pesos (ARS)" : m === "USD" ? "Dólares (USD)" : "Euros (EUR)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="etiqueta">Tiempo de entrega (días)</span>
                  <input name="tiempoEntregaDias" type="number" min="0" step="1" className="input" />
                </label>
                <label className="block">
                  <span className="etiqueta">Posible fecha de confirmación</span>
                  <input name="fechaConfirmacionPosible" type="date" className="input" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="etiqueta">Condición de pago</span>
                  <input name="condicionPago" placeholder="ej. 30 días, contado, 50% anticipo" className="input" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="etiqueta">Observaciones</span>
                  <input name="observaciones" className="input" />
                </label>
                <div className="sm:col-span-2 lg:col-span-4">
                  <button type="submit" className="btn">
                    Agregar cotización
                  </button>
                  <span className="text-xs text-foreground-muted ml-3">La conversión a la otra moneda se hace sola con el tipo de cambio oficial.</span>
                </div>
              </form>
            )}
          </details>
        )}
      </section>

      <div className="grid lg:grid-cols-3 gap-4 [&>*]:min-w-0">
        {/* Confirmar */}
        <section className="tarjeta p-4 space-y-2">
          <h2 className="font-semibold">1 · Confirmar compra</h2>
          {s.confirmadaAt ? (
            <p className="text-sm">
              Confirmada el {formatearFecha(fechaISO(s.confirmadaAt))} a <strong>{s.elegida?.proveedorNombre}</strong>.
              {s.origen === "orden_trabajo" && <span className="block text-xs text-foreground-muted mt-1">Producción la ve como pedida en Stock → Compras.</span>}
            </p>
          ) : !s.elegida ? (
            <p className="text-sm text-foreground-muted">Primero elegí una cotización.</p>
          ) : abierta ? (
            <form action={confirmarCompraAction} className="space-y-2">
              <input type="hidden" name="solicitudId" value={s.id} />
              <p className="text-sm">
                Pedido a <strong>{s.elegida.proveedorNombre}</strong> por {formatearImporte(s.elegida.importe.total, s.elegida.moneda)}.
              </p>
              <label className="block">
                <span className="etiqueta">Fecha del pedido</span>
                <input name="fecha" type="date" defaultValue={hoy} max={hoy} className="input w-44" />
              </label>
              <ConfirmarBoton mensaje={`¿Confirmar la compra a ${s.elegida.proveedorNombre}? Después no se puede cambiar la cotización.`}>
                Confirmar compra
              </ConfirmarBoton>
            </form>
          ) : null}
        </section>

        {/* Entregas */}
        <section className="tarjeta p-4 space-y-2">
          <h2 className="font-semibold">2 · Entrega</h2>
          {s.entregas.length > 0 && (
            <ul className="text-sm space-y-1">
              {s.entregas.map((e, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={`badge-estado ${e.resultado === "ok" ? "badge-terminada" : "badge-alerta"}`}>{e.resultado === "ok" ? "OK" : "NO OK"}</span>
                  {formatearFecha(e.fecha)}
                  {e.observacion && <span className="text-xs text-foreground-muted truncate">{e.observacion}</span>}
                </li>
              ))}
            </ul>
          )}
          {!s.confirmadaAt ? (
            <p className="text-sm text-foreground-muted">Se registra cuando la compra esté confirmada.</p>
          ) : s.fechaRecepcion ? (
            <p className="text-sm">Recibida OK el {formatearFecha(s.fechaRecepcion)}.</p>
          ) : (
            abierta && (
              <form action={registrarRecepcionAction} className="space-y-2">
                <input type="hidden" name="solicitudId" value={s.id} />
                <div className="flex gap-3 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="resultado" value="ok" required /> Llegó OK
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="resultado" value="no_ok" /> NO OK
                  </label>
                </div>
                {s.origen === "general" ? (
                  <label className="block">
                    <span className="etiqueta">Fecha de entrega</span>
                    <input name="fecha" type="date" defaultValue={hoy} max={hoy} className="input w-44" />
                  </label>
                ) : (
                  <p className="text-xs text-foreground-muted">
                    Se registra con fecha de hoy y es la misma llegada de Stock → Compras: si es OK, el material pasa a producción.
                  </p>
                )}
                <input name="observacion" placeholder="Observaciones (opcional)" className="input" />
                <button type="submit" className="btn">
                  Registrar entrega
                </button>
              </form>
            )
          )}
        </section>

        {/* Pagos */}
        <section className="tarjeta p-4 space-y-2">
          <h2 className="font-semibold">3 · Pago</h2>
          {!s.elegida ? (
            <p className="text-sm text-foreground-muted">Se registra cuando haya una cotización elegida.</p>
          ) : (
            <>
              <dl className="grid grid-cols-3 gap-1 text-sm [&>*]:min-w-0">
                <Dato titulo="Total" valor={formatearImporte(s.elegida.importe.total, s.elegida.moneda)} />
                <Dato titulo="Pagado" valor={formatearImporte(s.pagado, s.elegida.moneda)} />
                <Dato titulo="Saldo" valor={formatearImporte(s.saldo, s.elegida.moneda)} />
              </dl>
              {s.pagos.length > 0 && (
                <ul className="text-sm space-y-1 border-t border-border pt-2">
                  {s.pagos.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span>
                        {formatearFecha(p.fecha)} · {formatearImporte(p.importe, p.moneda)}
                        {p.observacion && <span className="text-xs text-foreground-muted"> — {p.observacion}</span>}
                      </span>
                      <form action={eliminarPagoAction}>
                        <input type="hidden" name="solicitudId" value={s.id} />
                        <input type="hidden" name="pagoId" value={p.id} />
                        <ConfirmarBoton mensaje="¿Eliminar este pago? Vuelve a contar como gasto futuro." className="text-xs text-[var(--estado-alerta-fg)] hover:underline">
                          Eliminar
                        </ConfirmarBoton>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              {(s.saldo ?? 0) > 0 && abierta && (
                <form action={registrarPagoAction} className="space-y-2 border-t border-border pt-2">
                  <input type="hidden" name="solicitudId" value={s.id} />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="etiqueta">Fecha de pago</span>
                      <input name="fecha" type="date" defaultValue={hoy} max={hoy} className="input" />
                    </label>
                    <label className="block">
                      <span className="etiqueta">Importe ({s.elegida.moneda})</span>
                      <input name="importe" type="number" step="0.01" min="0" max={s.saldo ?? undefined} defaultValue={s.saldo ?? undefined} required className="input" />
                    </label>
                  </div>
                  <input name="observacion" placeholder="Observaciones (opcional)" className="input" />
                  <button type="submit" className="btn">
                    Registrar pago
                  </button>
                  <p className="text-xs text-foreground-muted">Recién al registrar el pago el gasto pasa a efectuado.</p>
                </form>
              )}
            </>
          )}
        </section>
      </div>

      {editableQue && (
        <form action={anularSolicitudAction} className="text-right">
          <input type="hidden" name="id" value={s.id} />
          <ConfirmarBoton mensaje={`¿Anular la compra Nº ${s.numero}? Deja de aparecer en la bandeja y en los gastos.`} className="btn-peligro btn-sm">
            Anular compra
          </ConfirmarBoton>
        </form>
      )}
    </div>
  );
}

function Fecha({ nombre, titulo, valor, habilitado, children }: { nombre: string; titulo: string; valor: string | null; habilitado: boolean; children?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="etiqueta">{titulo}</span>
      {habilitado ? (
        <input name={nombre} type="date" defaultValue={valor ?? ""} className="input w-44" />
      ) : (
        <span className="text-sm">{formatearFecha(valor)}</span>
      )}
      {children && <span className="block text-xs text-foreground-muted mt-0.5">{children}</span>}
    </label>
  );
}

function Dato({ titulo, valor, nota, alerta }: { titulo: string; valor: string; nota?: string; alerta?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-foreground-muted">{titulo}</dt>
      <dd className={`font-medium ${alerta ? "text-[var(--estado-alerta-fg)]" : ""}`}>
        {valor}
        {alerta && " · atrasada"}
      </dd>
      {nota && <dd className="text-[11px] text-foreground-muted">{nota}</dd>}
    </div>
  );
}
