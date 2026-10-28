import Link from "next/link";
import { eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pieza, proveedor, pedidoCompra, otPieza, proceso, proveedorServicio } from "@/lib/db/schema";
import { getPlan } from "@/lib/planning/datos";
import { lunesDe } from "@/lib/planning/calendario";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pestanas } from "@/components/ui/Pestanas";
import { Aviso, Vacio } from "@/components/ui/Aviso";
import { AvisoFlotante } from "@/components/ui/AvisoFlotante";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { Icono } from "@/components/ui/Icono";
import { fechaCorta } from "@/components/v2/Plan";
import { FormAtenuar } from "@/components/v2/FormAtenuar";
import { marcarPedidoGrupoAction, recibirPedidoAction, agregarServicioAction, deshacerPedidosAction, confirmarProveedorHabitualAction } from "@/app/actions/v2";
import { capitalizar, fechaRelativa, numero, plural } from "@/lib/formato";
import type { Compra } from "@/lib/planning/motor";

export const dynamic = "force-dynamic";

const corridos = (f: string, n: number) => {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

type Linea = { clave: string; titulo: string; detalle: string; cantidad: string; valor: string; pedirAntes: string; llegada: string; piezas: number };

/**
 * Pedir esta semana (mejoras de usabilidad §2.5): primero una tarjeta por
 * proveedor con "Marcar todo pedido"; el detalle, al desplegar. El mismo
 * material se suma en una línea. Lo que ya venía tarde al crearse el proyecto
 * dice "Pedir ya" (naranja), no "Vencida" (§1.4).
 */
export default async function PedirPage({ searchParams }: { searchParams: Promise<{ vista?: string; ok?: string; error?: string; deshacer?: string }> }) {
  const { vista = "pedir", ok, error, deshacer } = await searchParams;
  const plan = await getPlan();
  const r = plan.resultado;
  const hoy = plan.entrada.hoy;
  const viernes = corridos(lunesDe(hoy), 4);
  const dosSemanas = corridos(viernes, 14);

  const codigos = [...new Set(r.compras.map((c) => c.piezaCodigo))];
  const [piezas, proveedores, abiertos, procesos, servicios] = await Promise.all([
    codigos.length
      ? db.select({ id: pieza.id, material: pieza.material, proveedorId: pieza.proveedorHabitualId, materialCantidad: pieza.materialCantidad, materialUnidad: pieza.materialUnidad }).from(pieza).where(inArray(pieza.id, codigos))
      : [],
    db.select().from(proveedor).orderBy(proveedor.razonSocial),
    db
      .select({ p: pedidoCompra, piezaNombre: pieza.nombre, piezaCodigo: pieza.codigo, otPiezaCodigo: otPieza.codigo, proveedor: proveedor.razonSocial, telefono: proveedor.telefono, email: proveedor.email })
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
  // Por llegar: primero lo atrasado (prometida vencida o que no llega a tiempo), después por fecha prometida.
  const atrasoDe = (p: (typeof abiertos)[number]["p"]) => {
    const c = compraDe.get(p.otPiezaId);
    return (p.fechaPrometida && p.fechaPrometida < hoy) || (c && p.fechaPrometida && p.fechaPrometida > c.llegadaNecesaria) ? 0 : 1;
  };
  abiertos.sort((a, b) => atrasoDe(a.p) - atrasoDe(b.p) || (a.p.fechaPrometida ?? "9999").localeCompare(b.p.fechaPrometida ?? "9999"));

  const sinPedir = r.compras.filter((c) => !c.pedido).sort((a, b) => a.pedirAntes.localeCompare(b.pedirAntes));
  const grupos: { id: string; titulo: string; ayuda: string; tono: "naranja" | "rojo" | "azul" | "gris"; items: Compra[] }[] = [
    { id: "ya", titulo: "Pedir ya", ayuda: "Cuando se cargó la orden ya había pasado el día para pedirlas: cuanto antes, mejor.", tono: "naranja", items: sinPedir.filter((c) => c.pedirYa) },
    { id: "vencidas", titulo: "Vencidas", ayuda: "Tenían fecha y no se pidieron a tiempo: cada día de demora atrasa la máquina.", tono: "rojo", items: sinPedir.filter((c) => !c.pedirYa && c.pedirAntes < hoy) },
    { id: "semana", titulo: "Esta semana", ayuda: `Hay que pedirlas antes del ${fechaCorta(viernes, hoy)}.`, tono: "azul", items: sinPedir.filter((c) => !c.pedirYa && c.pedirAntes >= hoy && c.pedirAntes <= viernes) },
    { id: "proximas", titulo: "Próximas 2 semanas", ayuda: "Para ir cotizando.", tono: "gris", items: sinPedir.filter((c) => !c.pedirYa && c.pedirAntes > viernes && c.pedirAntes <= dosSemanas) },
  ];
  const masAdelante = sinPedir.filter((c) => !c.pedirYa && c.pedirAntes > dosSemanas).length;
  const faltanDatos = sinPedir.filter((c) => c.pedirAntes <= dosSemanas && (!proveedorDe(c) || c.plazoSupuesto)).length;

  // El mismo material se suma en una línea (§2.5): "SAE 1045 Ø40 · 3,2 m (para 4 piezas)".
  const lineasDe = (lista: Compra[]): Linea[] => {
    const porClave = new Map<string, Compra[]>();
    for (const c of lista) {
      const pz = infoPieza.get(c.piezaCodigo);
      const k = c.esMaterial && pz?.material ? `mat:${pz.material.trim().toLowerCase()}` : `pz:${c.otPiezaId}`;
      porClave.set(k, [...(porClave.get(k) ?? []), c]);
    }
    return [...porClave.entries()].map(([k, cs]) => {
      const pz = infoPieza.get(cs[0].piezaCodigo);
      const pedirAntes = cs.map((c) => c.pedirAntes).sort()[0];
      const llegada = cs.map((c) => c.llegadaNecesaria).sort()[0];
      const valor = cs.map((c) => `${c.otPiezaId}|${c.cantidad}`).join(",");
      if (k.startsWith("mat:") && pz?.material) {
        const total = cs.reduce((s, c) => s + (infoPieza.get(c.piezaCodigo)?.materialCantidad ?? 0) * c.cantidad, 0);
        const unidad = pz.materialUnidad ?? "";
        const piezasTot = cs.reduce((s, c) => s + c.cantidad, 0);
        return {
          clave: k,
          titulo: pz.material,
          detalle: `para ${cs.map((c) => capitalizar(c.piezaNombre)).slice(0, 3).join(", ")}${cs.length > 3 ? ` y ${cs.length - 3} más` : ""} · ${[...new Set(cs.map((c) => c.proyectoCodigo))].join(", ")}`,
          cantidad: total ? `${numero(total, 2)} ${unidad} (para ${plural(piezasTot, "pieza")})` : `para ${plural(piezasTot, "pieza")}`,
          valor,
          pedirAntes,
          llegada,
          piezas: piezasTot,
        };
      }
      const c = cs[0];
      return {
        clave: k,
        titulo: c.esMaterial ? `Material para ${capitalizar(c.piezaNombre)}` : capitalizar(c.piezaNombre),
        detalle: `${c.piezaCodigo} · ${c.proyectoCodigo}`,
        cantidad: `${numero(c.cantidad)} u.`,
        valor,
        pedirAntes,
        llegada,
        piezas: c.cantidad,
      };
    });
  };

  const items = [
    { href: "/pedir", label: "Para pedir", contador: grupos[0].items.length + grupos[1].items.length + grupos[2].items.length },
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
      {ok &&
        (deshacer ? (
          <AvisoFlotante
            deshacer={
              <form action={deshacerPedidosAction}>
                <input type="hidden" name="ids" value={deshacer} />
                <button className="font-semibold underline">
                  <Icono nombre="deshacer" className="w-4 h-4 inline -mt-0.5" /> Deshacer
                </button>
              </form>
            }
          >
            {ok}
          </AvisoFlotante>
        ) : (
          <Aviso tipo="ok">{ok}</Aviso>
        ))}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {vista === "pedir" && (
        <>
          <p className="text-sm flex flex-wrap gap-x-2 gap-y-1">
            {grupos.map((g) => (
              <a key={g.id} href={`#${g.id}`} className={`hover:underline ${g.tono === "rojo" && g.items.length ? "text-rojo-fg font-semibold" : g.tono === "naranja" && g.items.length ? "text-naranja-fg font-semibold" : ""}`}>
                {g.items.length} {g.titulo.toLowerCase()}
              </a>
            ))}
            {masAdelante > 0 && <span className="text-foreground-muted">· {masAdelante} más adelante</span>}
          </p>
          {faltanDatos > 0 && (
            <p className="text-sm text-foreground-muted">
              {plural(faltanDatos, "artículo")} sin proveedor o con plazo supuesto.{" "}
              <Link href="/admin/configuracion#compras" className="text-accent hover:underline">
                Completar datos para poder calcular →
              </Link>
            </p>
          )}
          {grupos.map((g) =>
            g.items.length === 0 ? null : (
              <section key={g.id} id={g.id} className="space-y-3 scroll-mt-24">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h2 className="text-lg font-semibold">{g.titulo}</h2>
                  <Etiqueta tono={g.tono} sinIcono>
                    {plural(g.items.length, "artículo")}
                  </Etiqueta>
                  <span className="text-sm text-foreground-muted">{g.ayuda}</span>
                </div>
                {[...Map.groupBy(g.items, grupoDe).entries()]
                  .sort(([a], [b]) => (a ? (nombreProv.get(a) ?? "") : "~").localeCompare(b ? (nombreProv.get(b) ?? "") : "~"))
                  .map(([provId, lista]) => {
                    const lineas = lineasDe(lista);
                    const supuesto = lista.some((c) => c.plazoSupuesto);
                    const sinHabitual = lista.filter((c) => !proveedorDe(c));
                    const llegaAntes = lista.map((c) => c.llegadaNecesaria).sort()[0];
                    return (
                      <div key={provId || "sin"} className="tarjeta overflow-hidden">
                        <FormAtenuar action={marcarPedidoGrupoAction}>
                          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <div className="font-semibold">{provId ? nombreProv.get(provId) : "Sin proveedor asignado"}</div>
                              <div className="text-sm text-foreground-muted">
                                {plural(lista.length, "artículo")} · tiene que llegar antes del {fechaCorta(llegaAntes, hoy)}
                                {supuesto && <span className="ml-1">· plazo supuesto de {lista.find((c) => c.plazoSupuesto)?.plazoDias} días</span>}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-end gap-2">
                              {!provId ? (
                                <label className="text-xs text-foreground-muted">
                                  Proveedor
                                  <select name="proveedorId" className="input mt-0.5 w-44">
                                    <option value="">—</option>
                                    {proveedores.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.razonSocial}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : (
                                <input type="hidden" name="proveedorId" value={provId} />
                              )}
                              <label className="text-xs text-foreground-muted">
                                Fecha que promete
                                <input type="date" name="fechaPrometida" className="input mt-0.5 w-40" />
                              </label>
                              <button className="btn">Marcar todo pedido</button>
                            </div>
                          </div>
                          <details className="border-t border-border">
                            <summary className="px-4 py-2 text-sm text-accent cursor-pointer list-none hover:underline">Ver el detalle línea por línea ({lineas.length})</summary>
                            <ul className="divide-y divide-border">
                              {lineas.map((l) => (
                                <li key={l.clave} className="linea flex flex-wrap items-start gap-3 px-4 py-2.5 text-sm">
                                  <input type="checkbox" name="linea" value={l.valor} defaultChecked className="mt-1" aria-label={`Pedir ${l.titulo}`} />
                                  <div className="flex-1 min-w-48">
                                    <div className="font-medium">{l.titulo}</div>
                                    <div className="text-xs text-foreground-muted">{l.detalle}</div>
                                  </div>
                                  <div className="tabular-nums">{l.cantidad}</div>
                                  <div className="text-xs text-right min-w-28">
                                    <div className="text-foreground-muted">pedir antes del</div>
                                    <div className={`font-semibold ${g.id === "vencidas" ? "text-rojo-fg" : ""}`}>{fechaCorta(l.pedirAntes, hoy)}</div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </details>
                        </FormAtenuar>
                        {provId && sinHabitual.length > 0 && (
                          <form action={confirmarProveedorHabitualAction} className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t border-border bg-accent-soft text-sm text-accent-hover">
                            <Icono nombre="idea" className="w-4 h-4" />
                            <span className="flex-1">Se sugiere {nombreProv.get(provId)} porque es el único proveedor de ese tipo.</span>
                            <input type="hidden" name="proveedorId" value={provId} />
                            <input type="hidden" name="piezas" value={[...new Set(sinHabitual.map((c) => c.piezaCodigo))].join(",")} />
                            <button className="btn-secundario btn-sm">Confirmar {nombreProv.get(provId)} como proveedor habitual</button>
                          </form>
                        )}
                      </div>
                    );
                  })}
              </section>
            ),
          )}
          {grupos.every((g) => g.items.length === 0) && <Vacio>No hay nada para pedir en las próximas dos semanas.</Vacio>}
        </>
      )}

      {vista === "llegar" &&
        (abiertos.length === 0 ? (
          <Vacio neutro>No hay pedidos esperando llegada.</Vacio>
        ) : (
          <ul className="space-y-2">
            {abiertos.map(({ p, piezaNombre, piezaCodigo, otPiezaCodigo, proveedor: prov, telefono, email }) => {
              const c = compraDe.get(p.otPiezaId);
              const noAlcanza = !!(c && p.fechaPrometida && p.fechaPrometida > c.llegadaNecesaria);
              const atrasado = !!(p.fechaPrometida && p.fechaPrometida < hoy);
              return (
                <li key={p.id} className={`tarjeta franja ${noAlcanza || atrasado ? "border-l-rojo" : "border-l-gris"} px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2`}>
                  <div className="flex-1 min-w-48">
                    <div className="font-semibold">
                      {capitalizar(piezaNombre)} × {numero(p.cantidad)}
                    </div>
                    <div className="text-xs text-foreground-muted font-mono">
                      {piezaCodigo} · {otPiezaCodigo}
                    </div>
                  </div>
                  <div className="text-sm min-w-32">
                    <div className="text-xs text-foreground-muted">Proveedor</div>
                    {prov ?? "—"}
                    {(telefono || email) && (noAlcanza || atrasado) && <div className="text-xs">{[telefono, email].filter(Boolean).join(" · ")}</div>}
                  </div>
                  <div className="text-sm min-w-28">
                    <div className="text-xs text-foreground-muted">Prometida</div>
                    {p.fechaPrometida ? fechaRelativa(p.fechaPrometida, hoy) : <span className="text-foreground-muted">sin fecha</span>}
                    {atrasado && <div className="text-xs text-rojo-fg font-semibold">no llegó</div>}
                  </div>
                  <div className="text-sm min-w-32">
                    <div className="text-xs text-foreground-muted">La necesitamos</div>
                    {c ? fechaCorta(c.llegadaNecesaria, hoy) : "—"}
                    {noAlcanza && <div className="text-xs text-rojo-fg font-semibold">llega tarde: atrasa {c?.proyectoCodigo}</div>}
                  </div>
                  <form action={recibirPedidoAction} className="flex gap-2">
                    <input type="hidden" name="pedidoId" value={p.id} />
                    <button name="controlResultado" value="ok" className="btn btn-sm">
                      Recibir · control OK
                    </button>
                    <button name="controlResultado" value="no_ok" className="btn-secundario btn-sm">
                      No OK
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
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
                      <td className={`px-3 py-2 ${s.vigenteHasta && s.vigenteHasta < hoy ? "text-rojo-fg" : ""}`}>{s.vigenteHasta ? fechaCorta(s.vigenteHasta) : "—"}</td>
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
        Las solicitudes, cotizaciones y pagos siguen en{" "}
        <Link href="/compras" className="text-accent hover:underline">
          Compras
        </Link>
        .
      </p>
    </div>
  );
}
