import Link from "next/link";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pieza, proveedor, pedidoCompra, otPieza, proceso, proveedorServicio } from "@/lib/db/schema";
import { getPlan } from "@/lib/planning/datos";
import { lunesDe } from "@/lib/planning/calendario";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pestanas } from "@/components/ui/Pestanas";
import { Aviso, Vacio } from "@/components/ui/Aviso";
import { fechaCorta } from "@/components/v2/Plan";
import { marcarPedidoGrupoAction, recibirPedidoAction, agregarServicioAction } from "@/app/actions/v2";
import type { Compra } from "@/lib/planning/motor";

export const dynamic = "force-dynamic";

const corridos = (f: string, n: number) => {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Pedir esta semana (compras): el motor calcula, para cada material y cada
 * artículo comprado, el último día para pedirlo sin atrasar la máquina. Acá
 * se ve agrupado por urgencia y por proveedor, y se marca como pedido con la
 * fecha que promete el proveedor. "Por llegar" muestra lo pedido y avisa si
 * la fecha prometida no alcanza.
 */
export default async function PedirPage({ searchParams }: { searchParams: Promise<{ vista?: string; ok?: string; error?: string }> }) {
  const { vista = "pedir", ok, error } = await searchParams;
  const plan = await getPlan();
  const r = plan.resultado;
  const hoy = plan.entrada.hoy;
  const viernes = corridos(lunesDe(hoy), 4);
  const dosSemanas = corridos(viernes, 14);

  const codigos = [...new Set(r.compras.map((c) => c.piezaCodigo))];
  const [piezas, proveedores, abiertos, procesos, servicios] = await Promise.all([
    codigos.length ? db.select({ id: pieza.id, material: pieza.material, proveedorId: pieza.proveedorHabitualId }).from(pieza).where(inArray(pieza.id, codigos)) : [],
    db.select().from(proveedor).orderBy(proveedor.razonSocial),
    db
      .select({ p: pedidoCompra, piezaNombre: pieza.nombre, piezaCodigo: pieza.codigo, otPiezaCodigo: otPieza.codigo, proveedor: proveedor.razonSocial })
      .from(pedidoCompra)
      .innerJoin(otPieza, eq(otPieza.id, pedidoCompra.otPiezaId))
      .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
      .leftJoin(proveedor, eq(proveedor.id, pedidoCompra.proveedorId))
      .where(isNull(pedidoCompra.recibidoAt))
      .orderBy(pedidoCompra.fechaPedido),
    db.select().from(proceso).where(eq(proceso.tipo, "tercerizado")).orderBy(proceso.nombre),
    db
      .select({ s: proveedorServicio, proveedor: proveedor.razonSocial, proceso: proceso.nombre })
      .from(proveedorServicio)
      .innerJoin(proveedor, eq(proveedor.id, proveedorServicio.proveedorId))
      .innerJoin(proceso, eq(proceso.id, proveedorServicio.procesoId))
      .orderBy(proceso.nombre),
  ]);
  const infoPieza = new Map(piezas.map((p) => [p.id, p]));
  const nombreProv = new Map(proveedores.map((p) => [p.id, p.razonSocial]));
  const compraDe = new Map(r.compras.map((c) => [c.otPiezaId, c]));
  // Sin proveedor habitual cargado, se sugiere el único proveedor activo de ese tipo (si hay uno solo).
  const unicoDe = (tipo: string) => {
    const xs = proveedores.filter((p) => p.tipoProveedor === tipo && p.estadoProveedor === "activo");
    return xs.length === 1 ? xs[0].id : "";
  };
  const sugeridoMaterial = unicoDe("materia_prima"), sugeridoComercial = unicoDe("comercial");
  const proveedorDe = (c: Compra) => infoPieza.get(c.piezaCodigo)?.proveedorId ?? "";
  const grupoDe = (c: Compra) => proveedorDe(c) || (c.esMaterial ? sugeridoMaterial : sugeridoComercial);

  const sinPedir = r.compras.filter((c) => !c.pedido).sort((a, b) => a.pedirAntes.localeCompare(b.pedirAntes));
  const grupos: { id: string; titulo: string; ayuda: string; tono: string; items: Compra[] }[] = [
    { id: "vencidas", titulo: "Vencidas", ayuda: "Ya se pasó el día para pedirlas: cada día de demora atrasa la máquina.", tono: "text-[#991b1b]", items: sinPedir.filter((c) => c.pedirAntes < hoy) },
    { id: "semana", titulo: "Esta semana", ayuda: `Hay que pedirlas antes del ${fechaCorta(viernes)}.`, tono: "text-[#9a3412]", items: sinPedir.filter((c) => c.pedirAntes >= hoy && c.pedirAntes <= viernes) },
    { id: "proximas", titulo: "Próximas 2 semanas", ayuda: "Para ir cotizando.", tono: "text-foreground", items: sinPedir.filter((c) => c.pedirAntes > viernes && c.pedirAntes <= dosSemanas) },
  ];
  const masAdelante = sinPedir.filter((c) => c.pedirAntes > dosSemanas).length;
  const completar = sinPedir.filter((c) => c.pedirAntes <= dosSemanas && (!proveedorDe(c) || c.plazoSupuesto));

  const items = [
    { href: "/pedir", label: "Para pedir", contador: grupos[0].items.length + grupos[1].items.length },
    { href: "/pedir?vista=llegar", label: "Por llegar", contador: abiertos.length },
    { href: "/pedir?vista=servicios", label: "Servicios de tercerizados" },
  ];
  const actual = vista === "llegar" ? "/pedir?vista=llegar" : vista === "servicios" ? "/pedir?vista=servicios" : "/pedir";

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Pedir esta semana"
        descripcion="Lo que hay que comprar para que las máquinas lleguen a fecha. El sistema calcula el último día para pedir cada cosa según la fecha de entrega y el plazo del proveedor."
      >
        <Pestanas items={items} actual={actual} />
      </PageHeader>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {vista === "pedir" && (
        <>
          <p className="text-sm">
            <strong className="text-[#991b1b]">{grupos[0].items.length} vencidas</strong> · <strong>{grupos[1].items.length} para esta semana</strong> · {grupos[2].items.length} en las próximas 2 semanas
            {masAdelante > 0 && <span className="text-foreground-muted"> · {masAdelante} más adelante</span>}
          </p>
          {completar.length > 0 && (
            <Aviso tipo="atencion">
              {completar.length} artículo{completar.length === 1 ? "" : "s"} sin proveedor o con plazo supuesto: la fecha para pedir puede no ser exacta. Cargá el proveedor habitual y su plazo en la ficha de la pieza o del proveedor.
            </Aviso>
          )}
          {grupos.map((g) =>
            g.items.length === 0 ? null : (
              <section key={g.id} className="space-y-3">
                <div>
                  <h2 className={`text-lg font-semibold ${g.tono}`}>
                    {g.titulo} ({g.items.length})
                  </h2>
                  <p className="text-sm text-foreground-muted">{g.ayuda}</p>
                </div>
                {[...Map.groupBy(g.items, grupoDe).entries()]
                  .sort(([a], [b]) => (a ? nombreProv.get(a) ?? "" : "~").localeCompare(b ? nombreProv.get(b) ?? "" : "~"))
                  .map(([provId, lista]) => (
                    <form key={provId} action={marcarPedidoGrupoAction} className="tarjeta overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-surface-muted/60 border-b border-border">
                        <div>
                          <div className="font-semibold">
                            {provId ? nombreProv.get(provId) : "Sin proveedor asignado"}
                            {provId && lista.some((c) => !proveedorDe(c)) && <span className="badge-estado bg-[#efe9fb] text-[#5b3aa8] ml-2 font-normal">sugerido: falta cargar el proveedor habitual</span>}
                          </div>
                          <div className="text-xs text-foreground-muted">
                            {lista.length} artículo{lista.length === 1 ? "" : "s"} · tiene que llegar antes del {fechaCorta(lista.reduce((m, c) => (c.llegadaNecesaria < m ? c.llegadaNecesaria : m), lista[0].llegadaNecesaria))}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          {!provId && (
                            <label className="text-xs">
                              Proveedor
                              <select name="proveedorId" className="input input-sm block mt-0.5">
                                <option value="">—</option>
                                {proveedores.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.razonSocial}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {provId && <input type="hidden" name="proveedorId" value={provId} />}
                          <label className="text-xs">
                            Fecha que promete
                            <input type="date" name="fechaPrometida" className="input input-sm block mt-0.5" />
                          </label>
                          <button className="btn btn-sm">Marcar como pedido</button>
                        </div>
                      </div>
                      <table className="w-full text-sm">
                        <tbody>
                          {lista.map((c) => (
                            <tr key={c.clave} className="border-t border-border first:border-t-0">
                              <td className="pl-4 py-2 w-8">
                                <input type="checkbox" name="linea" value={`${c.otPiezaId}|${c.cantidad}`} defaultChecked aria-label={`Pedir ${c.piezaNombre}`} />
                              </td>
                              <td className="px-2 py-2">
                                <div className="font-medium">
                                  {c.esMaterial ? `Material para ${c.piezaNombre}` : c.piezaNombre}
                                </div>
                                <div className="text-xs text-foreground-muted">
                                  <span className="font-mono">{c.piezaCodigo}</span>
                                  {c.esMaterial && infoPieza.get(c.piezaCodigo)?.material ? ` · ${infoPieza.get(c.piezaCodigo)?.material}` : ""} · {c.proyectoCodigo}
                                </div>
                              </td>
                              <td className="px-2 py-2 tabular-nums whitespace-nowrap">{c.cantidad} u.</td>
                              <td className="px-2 py-2 whitespace-nowrap">
                                <div className="text-xs text-foreground-muted">Pedir antes del</div>
                                <div className={`font-semibold ${c.pedirAntes < hoy ? "text-[#991b1b]" : ""}`}>{fechaCorta(c.pedirAntes)}</div>
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-xs text-foreground-muted">
                                plazo {c.plazoDias} días{c.plazoSupuesto ? " (supuesto)" : ""}
                                <br />
                                llegada {fechaCorta(c.llegadaNecesaria)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </form>
                  ))}
              </section>
            ),
          )}
          {grupos.every((g) => g.items.length === 0) && <Vacio>No hay nada para pedir en las próximas dos semanas.</Vacio>}
        </>
      )}

      {vista === "llegar" &&
        (abiertos.length === 0 ? (
          <Vacio>No hay pedidos esperando llegada.</Vacio>
        ) : (
          <div className="tarjeta overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-foreground-muted">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 font-medium">Artículo</th>
                  <th className="text-left px-3 py-2 font-medium">Proveedor</th>
                  <th className="text-left px-3 py-2 font-medium">Prometida</th>
                  <th className="text-left px-3 py-2 font-medium">La necesitamos</th>
                  <th className="px-4 py-2 font-medium text-right">Llegó</th>
                </tr>
              </thead>
              <tbody>
                {abiertos.map(({ p, piezaNombre, piezaCodigo, otPiezaCodigo, proveedor: prov }) => {
                  const c = compraDe.get(p.otPiezaId);
                  const noAlcanza = !!(c && p.fechaPrometida && p.fechaPrometida > c.llegadaNecesaria);
                  const atrasado = !!(p.fechaPrometida && p.fechaPrometida < hoy);
                  return (
                    <tr key={p.id} className={`border-t border-border first:border-t-0 ${noAlcanza ? "bg-[#fef2f2]" : ""}`}>
                      <td className="px-4 py-2">
                        <div className="font-medium">
                          {piezaNombre} × {p.cantidad}
                        </div>
                        <div className="text-xs text-foreground-muted font-mono">
                          {piezaCodigo} · {otPiezaCodigo}
                        </div>
                      </td>
                      <td className="px-3 py-2">{prov ?? <span className="text-foreground-muted">—</span>}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {p.fechaPrometida ? fechaCorta(p.fechaPrometida) : <span className="text-foreground-muted">sin fecha</span>}
                        {atrasado && <div className="text-xs text-[#991b1b] font-semibold">vencida</div>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {c ? fechaCorta(c.llegadaNecesaria) : "—"}
                        {noAlcanza && <div className="text-xs text-[#991b1b] font-semibold">llega tarde: atrasa la máquina</div>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <form action={recibirPedidoAction} className="inline-flex gap-1">
                          <input type="hidden" name="pedidoId" value={p.id} />
                          <button name="controlResultado" value="ok" className="btn btn-sm">
                            Llegó OK
                          </button>
                          <button name="controlResultado" value="no_ok" className="btn-secundario btn-sm">
                            No OK
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

      {vista === "servicios" && (
        <div className="grid lg:grid-cols-[1fr_20rem] gap-4 items-start [&>*]:min-w-0">
          <div className="tarjeta overflow-x-auto">
            {servicios.length === 0 ? (
              <p className="p-4 text-sm text-foreground-muted">Todavía no hay precios ni plazos de servicios cargados.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-foreground-muted">
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2 font-medium">Servicio</th>
                    <th className="text-left px-3 py-2 font-medium">Proveedor</th>
                    <th className="text-left px-3 py-2 font-medium">Precio</th>
                    <th className="text-left px-3 py-2 font-medium">Plazo</th>
                    <th className="text-left px-3 py-2 font-medium">Lote mín.</th>
                    <th className="text-left px-3 py-2 font-medium">Vigente hasta</th>
                  </tr>
                </thead>
                <tbody>
                  {servicios.map(({ s, proveedor: prov, proceso: proc }) => (
                    <tr key={s.id} className="border-t border-border first:border-t-0">
                      <td className="px-4 py-2 font-medium">
                        {proc}
                        {s.habitual && <span className="badge-estado bg-accent-soft text-accent ml-2">habitual</span>}
                      </td>
                      <td className="px-3 py-2">{prov}</td>
                      <td className="px-3 py-2 tabular-nums">{s.precio != null ? `${s.moneda} ${s.precio.toLocaleString("es-AR")} / ${s.unidadPrecio}` : "—"}</td>
                      <td className="px-3 py-2">{s.plazoDias != null ? `${s.plazoDias} días` : "—"}</td>
                      <td className="px-3 py-2">{s.loteMinimo ?? "—"}</td>
                      <td className={`px-3 py-2 ${s.vigenteHasta && s.vigenteHasta < hoy ? "text-[#991b1b]" : ""}`}>{s.vigenteHasta ? fechaCorta(s.vigenteHasta) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <form action={agregarServicioAction} className="tarjeta p-4 space-y-2 text-sm">
            <h2 className="font-semibold">Cargar un precio de servicio</h2>
            <input type="hidden" name="volver" value="/pedir?vista=servicios" />
            <label className="block">
              Servicio
              <select name="procesoId" required className="input block w-full mt-0.5">
                {procesos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Proveedor
              <select name="proveedorId" required className="input block w-full mt-0.5">
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.razonSocial}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                Precio
                <input name="precio" type="number" step="0.01" className="input block w-full mt-0.5" />
              </label>
              <label>
                Por
                <select name="unidadPrecio" className="input block w-full mt-0.5">
                  <option value="pieza">pieza</option>
                  <option value="kg">kg</option>
                  <option value="lote">lote</option>
                </select>
              </label>
              <label>
                Plazo (días)
                <input name="plazoDias" type="number" className="input block w-full mt-0.5" />
              </label>
              <label>
                Lote mínimo
                <input name="loteMinimo" type="number" className="input block w-full mt-0.5" />
              </label>
            </div>
            <label className="block">
              Vigente hasta
              <input name="vigenteHasta" type="date" className="input block w-full mt-0.5" />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="habitual" /> Es el proveedor habitual de este servicio
            </label>
            <button className="btn w-full">Guardar</button>
          </form>
        </div>
      )}
      <p className="text-xs text-foreground-muted">
        Las solicitudes, cotizaciones y pagos siguen en <Link href="/compras" className="text-accent hover:underline">Compras</Link>.
      </p>
    </div>
  );
}
