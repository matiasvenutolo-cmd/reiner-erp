import { Aviso } from "@/components/ui/Aviso";
import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasTercerizados } from "@/components/ui/PestanasSecciones";
import Link from "next/link";
import { buscarPiezas } from "@/lib/data/maestros";
import { getStockDisponible } from "@/lib/data/stock";
import { getProveedores, listarMovimientos } from "@/lib/data/logistica";
import { getPiezasAfueraTercerizado } from "@/lib/data/produccion";
import { registrarIngresoAction, registrarVueltaAction } from "@/app/actions/logistica";
import { TipoMovimientoSelect } from "@/components/TipoMovimientoSelect";
import { MovimientosTabla } from "@/components/MovimientosTabla";
import { ArmadoRemito, type SugerenciaProceso } from "@/components/logistica/ArmadoRemito";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { proceso, proveedor, proveedorServicio } from "@/lib/db/schema";
import { Icono } from "@/components/ui/Icono";
import type { MovimientoStock, Proveedor } from "@/lib/db/schema";
import { getUsuarioActual } from "@/lib/session";
import { getPlan } from "@/lib/planning/datos";
import { habilesEntre, sumarHabiles } from "@/lib/planning/calendario";
import { fechaCorta } from "@/components/v2/Plan";

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
  searchParams: Promise<{ q?: string; tipo?: string; error?: string; desde?: string }>;
}) {
  const { q, tipo, error, desde } = await searchParams;
  const query = (q ?? "").trim();
  const tipoFiltro = (tipo ?? "") as MovimientoStock["tipo"] | "";

  const [piezasEncontradas, proveedores, enPasoTercerizado, movimientos, usuario, plan] = await Promise.all([
    query ? buscarPiezas(query) : Promise.resolve([]),
    getProveedores(),
    getPiezasAfueraTercerizado(),
    listarMovimientos(tipoFiltro || undefined),
    getUsuarioActual(),
    getPlan(),
  ]);
  const { resultado: r, entrada } = plan;
  const hoy = entrada.hoy;
  const tareaDe = new Map(r.tareas.map((t) => [t.clave, t]));
  const provPorNombre = new Map(proveedores.map((p) => [p.razonSocial.toLowerCase(), p]));
  const afuera = enPasoTercerizado
    .filter((a) => a.remito)
    .map((a) => {
      const t = tareaDe.get(`${a.otPiezaId}::${a.operacionId}`);
      const vuelta = t?.finPlan ?? null;
      return { ...a, t, vuelta, atraso: vuelta && vuelta <= hoy && t?.estado !== "terminada" ? habilesEntre(vuelta, hoy, entrada.calendario) : 0, prov: a.remito ? provPorNombre.get(a.remito.destino.toLowerCase()) : undefined };
    })
    .sort((x, y) => y.atraso - x.atraso || (x.vuelta ?? "").localeCompare(y.vuelta ?? ""));
  // Para mandar, según el plan: paso anterior terminado, ordenadas por "mandar antes del…".
  const enTresDias = sumarHabiles(hoy, 3, entrada.calendario);
  const terc = r.tareas.filter((t) => t.tipo === "tercerizado" && !afuera.some((a) => a.otPiezaId === t.otPiezaId && a.operacionId === t.operacionId));
  const pronto = terc.filter((t) => t.estado === "liberada" && t.fechaPlan && t.fechaPlan <= enTresDias);
  // El proveedor habitual de cada proceso se propone solo al armar el remito; y cuántas piezas más llegan en 3 días.
  const habituales = await db
    .select({ proceso: proceso.nombre, proveedor: proveedor.razonSocial, plazo: proveedorServicio.plazoDias })
    .from(proveedorServicio)
    .innerJoin(proceso, eq(proceso.id, proveedorServicio.procesoId))
    .innerJoin(proveedor, eq(proveedor.id, proveedorServicio.proveedorId))
    .where(eq(proveedorServicio.habitual, true));
  const paraMandar = enPasoTercerizado.filter((a) => !a.remito);
  const sugerencias: Record<string, SugerenciaProceso> = {};
  for (const a of paraMandar) {
    const h = habituales.find((x) => x.proceso === a.procesoNombre);
    sugerencias[a.procesoNombre] = { proveedor: h?.proveedor ?? null, plazo: h?.plazo ?? null, proximas: pronto.filter((t) => t.paso === a.procesoNombre).length };
  }
  const resultados = await Promise.all(
    piezasEncontradas.map(async (p) => ({ pieza: p, stock: await getStockDisponible(p.id) })),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Tercerizados"
        descripcion="Piezas que salen a un proceso de un proveedor (Cromado, Pavonado, Anodizado…) y vuelven. Se mandan con remito y, al volver, se registra la vuelta con su control."
      >
        <PestanasTercerizados actual="/tercerizados" />
      </PageHeader>

      {error && <Aviso tipo="error">{error}</Aviso>}

      <div id="esperando">
        <h2 className="text-sm font-semibold mb-1">Afuera, esperando que vuelvan ({afuera.length})</h2>
        <p className="text-xs text-foreground-muted mb-2">
          En manos del proveedor. Al registrar la vuelta con control OK, la pieza pasa sola a su siguiente paso.
        </p>
        {afuera.length === 0 ? (
          <p className="text-sm text-foreground-muted">No hay piezas afuera en este momento.</p>
        ) : (
          <div className="tarjeta overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Pieza</th>
                  <th className="text-left px-4 py-2 font-medium">OT</th>
                  <th className="text-left px-4 py-2 font-medium">Proceso</th>
                  <th className="text-left px-4 py-2 font-medium">Salió</th>
                  <th className="text-left px-4 py-2 font-medium">Vuelta prevista</th>
                  <th className="text-left px-4 py-2 font-medium">Registrar vuelta</th>
                </tr>
              </thead>
              <tbody>
                {afuera.map((a) => (
                  <tr key={a.otPiezaId} className={`border-t border-border align-top ${a.atraso > 0 ? "bg-rojo-tenue" : ""}`}>
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
                    <td className="px-4 py-2.5 text-foreground-muted whitespace-nowrap">
                      {a.remito && (
                        <>
                          {new Date(a.remito.fecha).toLocaleDateString("es-AR")} ·{" "}
                          <Link href={`/remitos/${a.remito.id}`} className="text-accent hover:underline">
                            Remito Nº {a.remito.numero}
                          </Link>
                          <div className="text-xs">{a.remito.destino}</div>
                          <div className="text-xs">
                            Enviadas {a.cantidadEnviada}
                            {a.cantidadRecibida > 0 && ` · volvieron ${a.cantidadRecibida}`}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {a.vuelta ? fechaCorta(a.vuelta, hoy) : "—"}
                      {a.vuelta && (() => {
                        const faltan = a.atraso > 0 ? -a.atraso : habilesEntre(hoy, a.vuelta, entrada.calendario);
                        return (
                          <div className={`text-xs font-semibold ${faltan < 0 ? "text-rojo-fg" : faltan <= 1 ? "text-naranja-fg" : "text-verde-fg"}`}>
                            {faltan < 0 ? `${-faltan} día${faltan === -1 ? "" : "s"} de atraso` : faltan === 0 ? "vuelve hoy" : `faltan ${faltan} día${faltan === 1 ? "" : "s"}`}
                          </div>
                        );
                      })()}
                      {a.t?.tarde && <div className="text-xs font-semibold text-rojo-fg">vuelve después de su fecha límite</div>}
                      {a.prov && (a.prov.telefono || a.prov.email) && (
                        <div className="flex gap-2 mt-1">
                          {a.prov.telefono && (
                            <a href={`https://wa.me/${a.prov.telefono.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-accent" aria-label={`WhatsApp a ${a.prov.razonSocial}`} title="WhatsApp">
                              <Icono nombre="whatsapp" className="w-4 h-4" />
                            </a>
                          )}
                          {a.prov.telefono && (
                            <a href={`tel:${a.prov.telefono}`} className="text-accent" aria-label={`Llamar a ${a.prov.razonSocial}`} title="Llamar">
                              <Icono nombre="telefono" className="w-4 h-4" />
                            </a>
                          )}
                          {a.prov.email && (
                            <a href={`mailto:${a.prov.email}`} className="text-accent" aria-label={`Mail a ${a.prov.razonSocial}`} title="Mail">
                              <Icono nombre="mail" className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <form action={registrarVueltaAction} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="otPiezaId" value={a.otPiezaId} />
                        <input type="hidden" name="operacionId" value={a.operacionId} />
                        <input
                          name="cantidad"
                          type="number"
                          min={1}
                          max={a.cantidadEnviada - a.cantidadRecibida}
                          defaultValue={a.cantidadEnviada - a.cantidadRecibida}
                          className="input w-16 text-xs py-1"
                        />
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
        <h2 className="text-lg font-semibold mb-1">Para mandar — armar remito</h2>
        <p className="text-sm text-foreground-muted mb-2">Tildá un grupo con &ldquo;Armar remito con estas&rdquo;: el proveedor habitual se propone solo. Primero se ve la vista previa; al confirmar se guarda y registra el egreso de cada pieza.</p>
        <ArmadoRemito
          usuarioNombre={usuario.nombre}
          sugerencias={sugerencias}
          paraMandar={paraMandar.map((a) => ({
            mandarAntes: tareaDe.get(`${a.otPiezaId}::${a.operacionId}`)?.inicioMasTardio ?? null,
            mandarAntesTexto: tareaDe.get(`${a.otPiezaId}::${a.operacionId}`) ? fechaCorta(tareaDe.get(`${a.otPiezaId}::${a.operacionId}`)!.inicioMasTardio, hoy) : null,
            atrasada: (tareaDe.get(`${a.otPiezaId}::${a.operacionId}`)?.inicioMasTardio ?? "9999") < hoy,
            otPiezaId: a.otPiezaId,
            otPiezaCodigo: a.otPiezaCodigo,
            piezaId: a.piezaId,
            piezaCodigo: a.piezaCodigo,
            piezaNombre: a.piezaNombre,
            procesoNombre: a.procesoNombre,
            cantidad: a.cantidad,
          }))}
        />
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-lg font-semibold">Movimientos</h2>
          <form className="flex items-center gap-2">
            {q && <input type="hidden" name="q" value={q} />}
            <label className="text-xs text-foreground-muted flex items-center gap-1">
              Desde
              <input type="date" name="desde" defaultValue={desde ?? ""} className="input text-xs py-1 w-36" />
            </label>
            <TipoMovimientoSelect valorActual={tipo ?? ""} />
            <button className="btn-secundario btn-sm">Filtrar</button>
          </form>
        </div>
        <MovimientosTabla movimientos={desde ? movimientos.filter((m) => new Date(m.fecha).toISOString().slice(0, 10) >= desde) : movimientos} />
      </div>

      <details open={!!query} className="tarjeta p-4">
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
