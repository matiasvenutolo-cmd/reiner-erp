import { Aviso } from "@/components/ui/Aviso";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import {
  getPieza,
  getConjunto,
  getRoutingPieza,
  getProcesos,
  modeloDeCodigo,
  getNotasPieza,
  getAdjuntosPieza,
} from "@/lib/data/maestros";
import { getStockDisponible, getWipEnCursoDePieza } from "@/lib/data/stock";
import {
  actualizarMaterialAction,
  actualizarRevisionAction,
  actualizarNumeroPlanoAction,
  actualizarStockMinimoAction,
  agregarOperacionAction,
  eliminarOperacionAction,
  moverOperacionAction,
  crearNotaPiezaAction,
  subirAdjuntoPiezaAction,
  eliminarAdjuntoPiezaAction,
} from "@/app/actions/maestros";
import { DescripcionOperacionInput } from "@/components/DescripcionOperacionInput";
import { TipoPiezaSelect } from "@/components/TipoPiezaSelect";
import { ProcesoOperacionSelect } from "@/components/ProcesoOperacionSelect";
import { CentroOperacionSelect } from "@/components/CentroOperacionSelect";
import { getCentrosTrabajo } from "@/lib/data/produccion";
import { urlDeAdjunto } from "@/lib/blob";
import { getUsuarioActual } from "@/lib/session";
import { puedeEditarMaestros } from "@/lib/permisos";
import { FichaPlanificacion } from "@/components/v2/FichaPlanificacion";

const TIPO_ADJUNTO_LABEL: Record<string, string> = {
  plano: "Plano",
  foto: "Foto",
};

const TIPO_NOTA_LABEL: Record<string, string> = {
  ingenieria: "Ingeniería",
  produccion: "Producción",
};

export default async function PiezaPage({
  params,
  searchParams,
}: {
  params: Promise<{ piezaId: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { piezaId } = await params;
  const { error, ok } = await searchParams;
  const pieza = await getPieza(piezaId);
  if (!pieza) notFound();
  // Taller ve la ficha (llega desde Stock y OT) pero no la modifica — ver src/lib/permisos.ts.
  const editable = puedeEditarMaestros((await getUsuarioActual()).rol);

  const [conjunto, routing, stock, wip, notas, adjuntos, procesos, centros] = await Promise.all([
    getConjunto(pieza.conjuntoId),
    getRoutingPieza(pieza.id),
    getStockDisponible(pieza.id),
    getWipEnCursoDePieza(pieza.id),
    getNotasPieza(pieza.id),
    getAdjuntosPieza(pieza.id),
    getProcesos(),
    getCentrosTrabajo(),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        migas={[{ href: "/maestros", label: "Piezas y hojas de ruta" }, { label: pieza.codigo }]}
        titulo={pieza.nombre}
        descripcion={`${pieza.codigo} · ${conjunto?.nombre ?? pieza.conjuntoId}`}
      />
      {!editable && <Aviso tipo="info">Sólo lectura: los datos de la pieza y su hoja de ruta los modifica ingeniería.</Aviso>}

      {error && <Aviso tipo="error">{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Modelo" value={modeloDeCodigo(pieza.codigo)} />
        <Metric label="Stock disponible" value={String(stock)} />
        <Metric label="En proceso" value={String(wip.reduce((a, w) => a + w.cantidad, 0)) || "0"} />
        <Metric label="Conjunto" value={conjunto?.nombre ?? pieza.conjuntoId} />
      </div>

      {editable ? (
        <div className="tarjeta p-3 flex flex-wrap items-end gap-3">
          <form action={actualizarMaterialAction} className="flex items-end gap-2">
            <input type="hidden" name="piezaId" value={pieza.id} />
            <label className="block">
              <span className="block text-xs font-medium text-foreground-muted mb-1">Material</span>
              <input name="material" defaultValue={pieza.material ?? ""} placeholder="ej. Acero SAE 1045" className="input" />
            </label>
            <button type="submit" className="text-sm text-accent hover:underline px-1 py-2">
              Guardar
            </button>
          </form>
          <form action={actualizarRevisionAction} className="flex items-end gap-2">
            <input type="hidden" name="piezaId" value={pieza.id} />
            <label className="block">
              <span className="block text-xs font-medium text-foreground-muted mb-1">Revisión</span>
              <input name="revision" defaultValue={pieza.revision ?? ""} placeholder="ej. Rev. 3" className="input w-28" />
            </label>
            <button type="submit" className="text-sm text-accent hover:underline px-1 py-2">
              Guardar
            </button>
          </form>
          <form action={actualizarNumeroPlanoAction} className="flex items-end gap-2">
            <input type="hidden" name="piezaId" value={pieza.id} />
            <label className="block">
              <span className="block text-xs font-medium text-foreground-muted mb-1">Nº de plano</span>
              <input name="numeroPlano" defaultValue={pieza.numeroPlano ?? ""} placeholder="ej. PL-0234" className="input w-32" />
            </label>
            <button type="submit" className="text-sm text-accent hover:underline px-1 py-2">
              Guardar
            </button>
          </form>
          <label className="block">
            <span className="block text-xs font-medium text-foreground-muted mb-1">Tipo</span>
            <TipoPiezaSelect piezaId={pieza.id} tipoActual={pieza.tipo} />
          </label>
          <form action={actualizarStockMinimoAction} className="flex items-end gap-2">
            <input type="hidden" name="piezaId" value={pieza.id} />
            <label className="block">
              <span className="block text-xs font-medium text-foreground-muted mb-1">Stock mínimo</span>
              <input name="stockMinimo" type="number" min={0} defaultValue={pieza.stockMinimo} className="input w-20" />
            </label>
            <button type="submit" className="text-sm text-accent hover:underline px-1 py-2">
              Guardar
            </button>
          </form>
        </div>
      ) : (
        <div className="tarjeta p-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Dato label="Material" value={pieza.material} />
          <Dato label="Revisión" value={pieza.revision} />
          <Dato label="Nº de plano" value={pieza.numeroPlano} />
          <Dato label="Tipo" value={pieza.tipo === "comprada" ? "Sólo compra" : "Fabricada"} />
          <Dato label="Stock mínimo" value={String(pieza.stockMinimo)} />
        </div>
      )}

      <FichaPlanificacion piezaId={pieza.id} editable={editable} />

      {wip.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">En proceso, por etapa</h2>
          <div className="flex flex-wrap gap-2">
            {wip.map((w) => (
              <span key={w.procesoNombre} className="badge-estado bg-surface-muted text-foreground">
                {w.procesoNombre}: {w.cantidad}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">Hoja de ruta</h2>
        {routing.length === 0 && (
          <div className="badge-estado badge-alerta mb-3">Sin operaciones definidas{editable ? " — agregá la primera abajo." : "."}</div>
        )}
        {routing.length > 0 && (
          <div className="bg-surface border border-border rounded-lg overflow-hidden mb-3">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium w-12">#</th>
                  <th className="text-left px-4 py-2 font-medium">Proceso</th>
                  <th className="text-left px-4 py-2 font-medium">Centro de trabajo</th>
                  <th className="text-left px-4 py-2 font-medium">Detalle</th>
                  <th className="text-left px-4 py-2 font-medium">Dispositivo</th>
                  <th className="text-right px-4 py-2 font-medium">OPS</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {routing.map((op, idx) => (
                  <tr key={op.id} className="border-t border-border">
                    <td className="px-4 py-2.5 text-foreground-muted">{op.secuencia}</td>
                    <td className="px-4 py-2.5 min-w-[10rem]">
                      {editable ? (
                        <ProcesoOperacionSelect
                          operacionId={op.id}
                          piezaId={pieza.id}
                          procesoIdActual={op.proceso.id}
                          procesos={procesos.map((p) => ({ id: p.id, nombre: p.nombre }))}
                        />
                      ) : (
                        op.proceso.nombre
                      )}
                      {op.proceso.tipo === "tercerizado" && (
                        <span className="ml-1 text-xs text-foreground-muted">(tercerizado)</span>
                      )}
                      {op.proceso.tipo === "compras" && <span className="ml-1 text-xs text-foreground-muted">(compra)</span>}
                    </td>
                    <td className="px-4 py-2.5 min-w-[11rem]">
                      {op.proceso.tipo === "interno" && !editable ? (
                        centros.find((c) => c.id === (op.centroTrabajoId ?? op.proceso.centroTrabajoId))?.nombre ?? (
                          <span className="text-foreground-muted">Sin centro asignado</span>
                        )
                      ) : op.proceso.tipo === "interno" ? (
                        <CentroOperacionSelect
                          operacionId={op.id}
                          piezaId={pieza.id}
                          centroElegido={op.centroTrabajoId}
                          centroPorDefecto={centros.find((c) => c.id === op.proceso.centroTrabajoId) ?? null}
                          centros={centros.map((c) => ({ id: c.id, nombre: c.nombre }))}
                        />
                      ) : (
                        <span className="text-xs text-foreground-muted">{op.proceso.tipo === "tercerizado" ? "Tercerizado" : "Compra"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 min-w-[12rem]">
                      {editable ? (
                        <DescripcionOperacionInput
                          operacionId={op.id}
                          piezaId={pieza.id}
                          procesoNombre={op.proceso.nombre}
                          descripcionInicial={op.descripcion}
                        />
                      ) : (
                        <span className="text-foreground-muted">{op.descripcion?.trim() || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-muted">{op.dispositivoNombre ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">
                      {op.ops ?? <span title="Falta cargar este dato">falta cargar</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {editable && (
                        <div className="flex items-center justify-end gap-1">
                          <form action={moverOperacionAction}>
                            <input type="hidden" name="operacionId" value={op.id} />
                            <input type="hidden" name="piezaId" value={pieza.id} />
                            <input type="hidden" name="direccion" value="arriba" />
                            <button
                              type="submit"
                              disabled={idx === 0}
                              className="text-foreground-muted hover:text-foreground disabled:opacity-30 px-1"
                              title="Subir"
                            >
                              ↑
                            </button>
                          </form>
                          <form action={moverOperacionAction}>
                            <input type="hidden" name="operacionId" value={op.id} />
                            <input type="hidden" name="piezaId" value={pieza.id} />
                            <input type="hidden" name="direccion" value="abajo" />
                            <button
                              type="submit"
                              disabled={idx === routing.length - 1}
                              className="text-foreground-muted hover:text-foreground disabled:opacity-30 px-1"
                              title="Bajar"
                            >
                              ↓
                            </button>
                          </form>
                          <form action={eliminarOperacionAction}>
                            <input type="hidden" name="operacionId" value={op.id} />
                            <input type="hidden" name="piezaId" value={pieza.id} />
                            <button type="submit" className="text-xs text-rojo-fg hover:underline px-1" title="Eliminar">
                              Eliminar
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editable && (
          <form action={agregarOperacionAction} className="flex items-end gap-2">
            <input type="hidden" name="piezaId" value={pieza.id} />
            <label className="block">
              <span className="block text-xs font-medium text-foreground-muted mb-1">Agregar operación</span>
              <select name="procesoId" required defaultValue="" className="input text-sm">
                <option value="" disabled>
                  Elegir proceso…
                </option>
                {procesos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="text-sm text-accent hover:underline px-1 py-2">
              Agregar al final
            </button>
          </form>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Adjuntos de ingeniería — planos y fotos</h2>
        <div className="tarjeta p-4 space-y-4">
          {editable && (
            <form action={subirAdjuntoPiezaAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="piezaId" value={pieza.id} />
              <select name="tipo" required defaultValue="plano" className="input text-sm w-28">
                <option value="plano">Plano</option>
                <option value="foto">Foto</option>
              </select>
              <input
                type="file"
                name="archivo"
                required
                accept=".pdf,.png,.jpg,.jpeg,.webp,.dwg,.dxf"
                className="text-sm flex-1 min-w-[12rem]"
              />
              <button
                type="submit"
                className="bg-accent text-accent-foreground font-medium text-sm px-3 py-1.5 rounded-md hover:opacity-90"
              >
                Subir
              </button>
            </form>
          )}

          {adjuntos.length === 0 ? (
            <p className="text-sm text-foreground-muted">Todavía no hay planos ni fotos cargadas.</p>
          ) : (
            <ul className="space-y-2">
              {adjuntos.map((a) => (
                <li key={a.id} className="flex items-center gap-3 border-t border-border pt-2 first:border-t-0 first:pt-0">
                  {a.tipo === "foto" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- adjunto en Vercel Blob, no un asset local optimizable
                    <img src={urlDeAdjunto(a.pathname)} alt={a.nombreArchivo} className="w-10 h-10 rounded object-cover shrink-0" />
                  ) : (
                    <span className="badge-estado bg-surface-muted text-foreground-muted shrink-0">{TIPO_ADJUNTO_LABEL[a.tipo]}</span>
                  )}
                  <a
                    href={urlDeAdjunto(a.pathname)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent hover:underline truncate flex-1"
                  >
                    {a.nombreArchivo}
                  </a>
                  <span className="text-xs text-foreground-muted shrink-0">
                    {a.autorNombre} · {new Date(a.createdAt).toLocaleDateString("es-AR")}
                  </span>
                  {editable && (
                    <form action={eliminarAdjuntoPiezaAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="piezaId" value={pieza.id} />
                      <button type="submit" className="text-xs text-rojo-fg hover:underline shrink-0">
                        Eliminar
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">
          Bitácora — versiones, cambios de diseño y observaciones de producción
        </h2>
        <div className="tarjeta p-4 space-y-4">
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
                <select name="tipo" defaultValue={editable ? "ingenieria" : "produccion"} className="input">
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

function Dato({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs font-medium text-foreground-muted mb-1">{label}</div>
      <div className="text-sm">{value?.trim() || "—"}</div>
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
