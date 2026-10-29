import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otMaquina, otConjunto, otPieza, pieza, conjunto, configuracion, cliente, proyectoEvento, usuario, pedidoCompra, proveedor } from "@/lib/db/schema";
import { getPlan } from "@/lib/planning/datos";
import { habilesEntre } from "@/lib/planning/calendario";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";
import { Holgura, fechaCorta, Estimado, CausaRaiz, textoCausa, margenEntrega } from "@/components/v2/Plan";
import { EstadoPiezaChip } from "@/components/v2/EstadoPieza";
import { estadoDePieza, type EstadoDePieza, type EstadoVisible } from "@/lib/estado-pieza";
import { getEsperaMaterialDeOrden } from "@/lib/data/gestion-compras";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { capitalizar, diasHabiles, numero, plural } from "@/lib/formato";
import { activarProyectoAction, cambiarEntregaAction, pausarProyectoAction, liberarAction } from "@/app/actions/v2";
import type { Causa } from "@/lib/planning/motor";

export const dynamic = "force-dynamic";

const TIPO = { maquina: "Máquina", repuesto: "Repuesto", stock: "Stock" } as const;

/** "4 meses" / "8 semanas" / "30 días" → fecha de emisión + ese plazo, como sugerencia (no se aplica sola). */
function sugerirEntrega(emision: Date | null, plazo: string | null): string {
  const d = new Date(emision ?? new Date());
  const m = /(\d+)\s*(mes|semana|d[ií]a)/i.exec(plazo ?? "");
  if (m) {
    const k = Number(m[1]);
    if (m[2].toLowerCase().startsWith("mes")) d.setMonth(d.getMonth() + k);
    else if (m[2].toLowerCase().startsWith("semana")) d.setDate(d.getDate() + 7 * k);
    else d.setDate(d.getDate() + k);
  } else d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

// Un estado por pieza, de cinco (simplificación §4.2): lo que frena primero.
const ORDEN_ESTADO: EstadoVisible[] = ["trabada", "falta_material", "en_curso", "lista", "terminada"];
const LABEL_ESTADO: Record<EstadoVisible, string> = { trabada: "Trabadas", falta_material: "Falta material", en_curso: "En curso", lista: "Listas", terminada: "Terminadas" };

type PiezaOrden = { id: string; otConjuntoId: string; nombre: string; cant: number; e: EstadoDePieza };

/** Una pieza con su estado y su paso actual. El margen se muestra sólo si es urgente o está atrasada. */
function FilaPieza({ x, hoy }: { x: PiezaOrden; hoy: string }) {
  const a = x.e.actual;
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium">
        {capitalizar(x.nombre)} × {numero(x.cant)}
      </span>
      <EstadoPiezaChip estado={x.e.estado} />
      {x.e.motivo && <span className={x.e.estado === "trabada" ? "text-rojo-fg" : "text-foreground-muted"}>{x.e.motivo}</span>}
      {a && x.e.estado !== "terminada" && (
        <span className="text-foreground-muted">
          paso {a.posicion}/{a.totalPasos}: {a.paso}
          {a.fechaPlan ? ` · plan ${fechaCorta(a.fechaPlan, hoy)}` : ""}
        </span>
      )}
      {a && (a.nivel === "atrasada" || a.nivel === "urgente") && <Holgura nivel={a.nivel} dias={a.holgura} corto />}
    </li>
  );
}

export default async function ProyectoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; temprana?: string; entrega?: string; prioridad?: string; causas?: string; quitar?: string }>;
}) {
  const { id } = await params;
  const { ok, error, temprana, entrega: entregaPedida, prioridad: prioridadPedida, causas: causasTexto, quitar } = await searchParams;
  const [[fila], plan, eventos] = await Promise.all([
    db
      .select({ m: otMaquina, config: configuracion.nombre, cliente: cliente.razonSocial })
      .from(otMaquina)
      .leftJoin(configuracion, eq(configuracion.id, otMaquina.configuracionId))
      .leftJoin(cliente, eq(cliente.id, otMaquina.clienteId))
      .where(eq(otMaquina.id, id)),
    getPlan(),
    db.select({ e: proyectoEvento, nombre: usuario.nombre }).from(proyectoEvento).leftJoin(usuario, eq(usuario.id, proyectoEvento.usuarioId)).where(eq(proyectoEvento.otMaquinaId, id)).orderBy(desc(proyectoEvento.fecha)),
  ]);
  if (!fila) notFound();
  const m = fila.m;
  const p = plan.resultado.proyectos.find((x) => x.id === id);
  const cal = plan.entrada.calendario;
  const hoy = plan.entrada.hoy;
  const tipo = TIPO[m.destino as keyof typeof TIPO] ?? m.destino;

  const header = (
    <PageHeader
      migas={[{ href: "/proyectos", label: "Órdenes" }, { label: m.codigo }]}
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          {m.codigo}
          <span className="badge-estado bg-surface-muted text-foreground">{tipo}</span>
          {m.esDemo && <span className="badge-estado bg-demo-bg text-demo-fg">demo</span>}
          {m.prioridad === "alta" && <span className="badge-estado badge-alerta">Prioridad alta</span>}
        </span>
      }
      descripcion={[fila.cliente, fila.config, m.tipo === "suelta" ? m.numeroSerie : `Serie ${m.numeroSerie}`].filter(Boolean).join(" · ")}
      acciones={
        <>
          <Link href={`/ot/${m.id}/que-hace-falta`} className="btn">
            Ver qué hace falta
          </Link>
          <Link href={`/ot/${m.id}`} className="btn-secundario">
            Detalle de la orden
          </Link>
        </>
      }
    />
  );

  // ── Borrador: activar ──────────────────────────────────────────────────
  if (!p) {
    const piezas = await db
      .select({ id: otPieza.id, codigo: pieza.codigo, nombre: pieza.nombre, cant: otPieza.cantidadAFabricar, conjunto: conjunto.nombre, conjuntoCodigo: conjunto.codigo })
      .from(otPieza)
      .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
      .innerJoin(conjunto, eq(conjunto.id, otConjunto.conjuntoId))
      .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
      .where(eq(otConjunto.otMaquinaId, id));
    const aFabricar = piezas.filter((x) => x.cant > 0);
    const porConjunto = new Map<string, typeof aFabricar>();
    for (const x of aFabricar) porConjunto.set(`${x.conjuntoCodigo} ${x.conjunto}`, [...(porConjunto.get(`${x.conjuntoCodigo} ${x.conjunto}`) ?? []), x]);
    return (
      <div className="space-y-6 max-w-4xl">
        {header}
        {error && <Aviso tipo="error">{error}</Aviso>}
        {temprana && entregaPedida && (
          // Plan factible (§1.4): antes de activar con una fecha que no llega, se pregunta.
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="La fecha no llega">
            <Link href={`/proyectos/${id}`} className="absolute inset-0 bg-black/30" aria-label="Cerrar" />
            <div className="relative tarjeta max-w-lg w-full p-6 space-y-4">
              <h2 className="text-lg font-bold">Con los plazos actuales, la entrega más temprana es el {fechaCorta(temprana, hoy)}.</h2>
              <p>¿Mantenés el {fechaCorta(entregaPedida, hoy)} o la cambiás?</p>
              {(() => {
                let lista: Causa[] = [];
                try {
                  lista = JSON.parse(causasTexto ?? "[]");
                } catch {}
                return lista.length ? (
                  <div>
                    <div className="text-sm font-semibold mb-1">Por qué no llega:</div>
                    <ul className="text-sm list-disc pl-5 space-y-1">
                      {lista.map((c, i) => (
                        <li key={i}>{capitalizar(textoCausa(c, hoy).texto)}.</li>
                      ))}
                    </ul>
                  </div>
                ) : null;
              })()}
              <div className="flex flex-wrap gap-2 justify-end">
                {[entregaPedida, temprana].map((f, i) => (
                  <form key={f} action={activarProyectoAction}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="fechaEntrega" value={f} />
                    <input type="hidden" name="prioridad" value={prioridadPedida ?? "normal"} />
                    <input type="hidden" name="quitar" value={quitar ?? ""} />
                    <input type="hidden" name="confirmado" value="1" />
                    <button className={i === 0 ? "btn-secundario" : "btn"}>{i === 0 ? `Mantener el ${fechaCorta(f, hoy)}` : `Cambiar al ${fechaCorta(f, hoy)}`}</button>
                  </form>
                ))}
              </div>
            </div>
          </div>
        )}
        {m.estadoProyecto === "pausado" ? (
          <form action={pausarProyectoAction} className="tarjeta p-5 space-y-3">
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="pausar" value="0" />
            <Aviso tipo="atencion">Este proyecto está pausado: sus tareas no entran en el plan.</Aviso>
            <button className="btn">Reactivar el proyecto</button>
          </form>
        ) : (
          <form action={activarProyectoAction} className="tarjeta p-5 space-y-4">
            <input type="hidden" name="id" value={m.id} />
            <div>
              <h2 className="text-lg font-semibold">Activar el proyecto</h2>
              <p className="text-sm text-foreground-muted">
                Al activarlo el sistema arma todas las tareas y compras con fecha, a partir de la entrega. Hasta entonces es un borrador.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="etiqueta">Fecha de entrega comprometida *</span>
                <input type="date" name="fechaEntrega" required defaultValue={m.fechaEntrega ?? sugerirEntrega(m.fechaEmision, m.plazoEntrega)} className="input" />
                {m.plazoEntrega && <span className="text-xs text-foreground-muted">Sugerida: emisión + &ldquo;{m.plazoEntrega}&rdquo;. Confirmala.</span>}
              </label>
              <label className="block">
                <span className="etiqueta">Prioridad</span>
                <select name="prioridad" defaultValue={m.prioridad} className="input">
                  <option value="normal">Normal</option>
                  <option value="alta">Alta (desempata cuando compite por un centro)</option>
                </select>
              </label>
              <div>
                <span className="etiqueta">Cubiertas con stock</span>
                <p className="text-sm">
                  {piezas.length - aFabricar.length} de {piezas.length} piezas ya están en el almacén y no generan tareas.
                </p>
              </div>
            </div>
            {aFabricar.length > 0 && (
              <details className="border border-border rounded-lg p-3">
                <summary className="cursor-pointer text-sm font-semibold">Elegir variantes: destildá las piezas que este pedido no lleva ({aFabricar.length} a fabricar)</summary>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mt-3 max-h-96 overflow-y-auto">
                  {[...porConjunto].map(([c, ps]) => (
                    <div key={c}>
                      <div className="text-xs font-semibold text-foreground-muted mb-1">{c}</div>
                      {ps.map((x) => (
                        <label key={x.id} className="flex items-center gap-2 text-sm py-0.5">
                          <input type="checkbox" name="quitarOtPiezaId" value={x.id} className="accent-rojo" />
                          <span>
                            {x.nombre} × {x.cant} <span className="text-xs text-foreground-muted">{x.codigo}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-foreground-muted mt-2">Tildado = no lo lleva este pedido (por ejemplo, otra variante del Cabezal).</p>
              </details>
            )}
            <ConfirmarBoton mensaje="¿Activar el proyecto? Se generan sus tareas y compras con fecha.">Activar el proyecto</ConfirmarBoton>
          </form>
        )}
      </div>
    );
  }

  // ── Activo ─────────────────────────────────────────────────────────────
  const tareas = plan.resultado.tareas.filter((t) => t.proyectoId === id);
  const tanda = plan.resultado.tandas.find((t) => t.proyectoId === id);
  const [filasPiezas, esperaMaterial, llegadas] = await Promise.all([
    db
      .select({ id: otPieza.id, otConjuntoId: otPieza.otConjuntoId, nombre: pieza.nombre, cant: otPieza.cantidadAFabricar })
      .from(otPieza)
      .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
      .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
      .where(eq(otConjunto.otMaquinaId, id)),
    getEsperaMaterialDeOrden(id),
    db
      .select({ id: pedidoCompra.id, otPiezaId: pedidoCompra.otPiezaId, recibidoAt: pedidoCompra.recibidoAt, cantidad: pedidoCompra.cantidad, proveedor: proveedor.razonSocial })
      .from(pedidoCompra)
      .innerJoin(otPieza, eq(otPieza.id, pedidoCompra.otPiezaId))
      .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
      .leftJoin(proveedor, eq(proveedor.id, pedidoCompra.proveedorId))
      .where(and(eq(otConjunto.otMaquinaId, id), isNotNull(pedidoCompra.recibidoAt))),
  ]);
  const compraDePieza = new Map(plan.resultado.compras.filter((c) => c.proyectoId === id).map((c) => [c.otPiezaId, c]));
  const piezasOrden: PiezaOrden[] = filasPiezas
    .filter((x) => x.cant > 0)
    .map((x) => ({ ...x, e: estadoDePieza(tareas.filter((t) => t.otPiezaId === x.id), compraDePieza.get(x.id), esperaMaterial.get(x.id)) }));
  const cuenta = (ps: PiezaOrden[]) => Object.fromEntries(ORDEN_ESTADO.map((e) => [e, ps.filter((x) => x.e.estado === e).length])) as Record<EstadoVisible, number>;

  // ── Pieza o conjunto suelto: pantalla simple (simplificación §4.1) ─────
  if (m.tipo === "suelta") {
    const margen = margenEntrega(p.diferenciaDias);
    const comprasOrden = plan.resultado.compras.filter((c) => c.proyectoId === id);
    const nombreDe = new Map(filasPiezas.map((x) => [x.id, x.nombre]));
    return (
      <div className="space-y-6 max-w-4xl">
        {header}
        {ok && <Aviso tipo="ok">{ok}</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <section className="tarjeta p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Grande titulo="Para" valor={fila.cliente ?? (m.destino === "stock" ? "Stock" : "—")} />
            <Grande titulo="Entrega comprometida" valor={fechaCorta(p.entrega, hoy)} />
            <Grande titulo="Margen" valor={margen.texto} color={{ rojo: "text-rojo-fg", naranja: "text-naranja-fg", verde: "text-verde-fg" }[margen.tono as "rojo" | "naranja" | "verde"]} />
          </div>
          {p.causas.length > 0 && (
            <div className="mt-4">
              <CausaRaiz codigo={p.codigo} causas={p.causas} hoy={hoy} />
            </div>
          )}
        </section>

        <section className="tarjeta p-4">
          <h2 className="font-semibold mb-2">{piezasOrden.length === 1 ? "La pieza" : `Las piezas (${piezasOrden.length})`}</h2>
          {piezasOrden.length === 0 ? (
            <p className="text-sm text-foreground-muted">Todo sale del stock: no hay nada para fabricar ni comprar.</p>
          ) : (
            <ul className="space-y-2">
              {[...piezasOrden]
                .sort((a, b) => ORDEN_ESTADO.indexOf(a.e.estado) - ORDEN_ESTADO.indexOf(b.e.estado))
                .map((x) => (
                  <FilaPieza key={x.id} x={x} hoy={hoy} />
                ))}
            </ul>
          )}
          {tanda && tanda.otPiezaIds.length > 0 && (
            <form action={liberarAction} className="mt-3">
              <input type="hidden" name="volver" value={`/proyectos/${id}`} />
              {tanda.otPiezaIds.map((pid) => (
                <input key={pid} type="hidden" name="otPiezaId" value={pid} />
              ))}
              <ConfirmarBoton mensaje={`¿Pasar ${plural(tanda.otPiezaIds.length, "pieza")} al plan de la semana?`} className="btn btn-sm">
                Pasar {plural(tanda.otPiezaIds.length, "pieza")} al plan
              </ConfirmarBoton>
            </form>
          )}
        </section>

        <section className="tarjeta p-4">
          <h2 className="font-semibold mb-2">Compras de la orden</h2>
          {comprasOrden.length + llegadas.length === 0 ? (
            <p className="text-sm text-foreground-muted">Esta orden no necesita compras.</p>
          ) : (
            <ul className="text-sm divide-y divide-border">
              {comprasOrden.map((c) => (
                <li key={c.clave} className="py-1.5 flex flex-wrap justify-between gap-2">
                  <span>
                    {c.esMaterial ? "Material para " : ""}
                    {c.piezaNombre} × {c.cantidad}
                  </span>
                  {c.pedido ? (
                    <Etiqueta tono="azul">Pedida{c.llegadaPrevista ? ` · llega el ${fechaCorta(c.llegadaPrevista, hoy)}` : ""}</Etiqueta>
                  ) : c.pedirYa ? (
                    <Etiqueta tono="naranja">Pedir ya</Etiqueta>
                  ) : c.pedirAntes < hoy ? (
                    <Etiqueta tono="rojo">Vencida · era el {fechaCorta(c.pedirAntes, hoy)}</Etiqueta>
                  ) : (
                    <span className="text-xs text-foreground-muted">Falta pedir · antes del {fechaCorta(c.pedirAntes, hoy)}</span>
                  )}
                </li>
              ))}
              {llegadas.map((l) => (
                <li key={l.id} className="py-1.5 flex flex-wrap justify-between gap-2">
                  <span>
                    {capitalizar(nombreDe.get(l.otPiezaId) ?? "")} × {l.cantidad}
                    {l.proveedor ? <span className="text-foreground-muted"> · {l.proveedor}</span> : null}
                  </span>
                  <Etiqueta tono="verde">Llegó el {fechaCorta(l.recibidoAt!.toISOString().slice(0, 10), hoy)}</Etiqueta>
                </li>
              ))}
            </ul>
          )}
          <Link href="/pedir" className="text-sm text-accent hover:underline inline-block mt-2">
            Pedir esta semana →
          </Link>
        </section>

        <div className="flex flex-wrap gap-2 items-start">
          <details className="tarjeta px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold">Cambiar fecha de entrega</summary>
            <form action={cambiarEntregaAction} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={id} />
              <label className="block">
                <span className="etiqueta">Nueva fecha</span>
                <input type="date" name="fechaEntrega" required defaultValue={p.entrega} className="input" />
              </label>
              <label className="block">
                <span className="etiqueta">Motivo *</span>
                <input name="motivo" required placeholder="ej. el cliente adelantó la entrega" className="input w-72" />
              </label>
              <button className="btn btn-sm">Cambiar y recalcular</button>
            </form>
          </details>
          <details className="tarjeta px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold">Pausar</summary>
            <form action={pausarProyectoAction} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="pausar" value="1" />
              <input name="motivo" required placeholder="Motivo" className="input w-64" />
              <ConfirmarBoton mensaje="¿Pausar la orden? Sus tareas salen del plan hasta reactivarla." className="btn-peligro btn-sm">
                Pausar
              </ConfirmarBoton>
            </form>
          </details>
          <details className="tarjeta px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold">Bitácora ({eventos.length})</summary>
            <ul className="text-sm mt-2 space-y-1.5">
              {eventos.map(({ e, nombre }) => (
                <li key={e.id}>
                  <span className="text-xs text-foreground-muted">
                    {e.fecha.toLocaleDateString("es-AR")} · {nombre ?? e.usuarioId}
                  </span>
                  <div>{e.texto}</div>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    );
  }

  // ── Máquina completa: conjunto por conjunto ────────────────────────────
  const inicioEje = [hoy, ...p.conjuntos.map((c) => c.fabricacionDesde ?? hoy)].sort()[0];
  const finEje = [p.finEstimado, p.entrega].sort().at(-1)!;
  const total = Math.max(1, habilesEntre(inicioEje, finEje, cal));
  const x = (f: string) => `${Math.min(100, Math.max(0, (habilesEntre(inicioEje, f, cal) / total) * 100))}%`;
  const ancho = (a: string, b: string) => `${Math.max(0.8, (habilesEntre(a, b, cal) / total) * 100)}%`;
  const comprasP = plan.resultado.compras.filter((c) => c.proyectoId === id && !c.pedido);
  // Conjuntos con problemas arriba y desplegados; los que están en plazo, colapsados (§2.3).
  const conPiezas = p.conjuntos.filter((c) => c.piezas.total > 0);
  const sinPiezas = p.conjuntos.filter((c) => c.piezas.total === 0);
  const piezasDe = (otConjuntoId: string) => piezasOrden.filter((x) => x.otConjuntoId === otConjuntoId);
  const conAtraso = conPiezas.filter((c) => c.atrasoDias > 0 || piezasDe(c.id).some((x) => x.e.estado === "trabada"));
  const enPlazo = conPiezas.filter((c) => !conAtraso.includes(c));
  const filaConjunto = (c: (typeof p.conjuntos)[number], abierto: boolean) => {
            const delConjunto = piezasDe(c.id);
            const grupos = new Map<EstadoVisible, PiezaOrden[]>();
            for (const x of delConjunto) grupos.set(x.e.estado, [...(grupos.get(x.e.estado) ?? []), x]);
            return (
              <details key={c.id} className="group border-t border-border" open={abierto && !c.esperaA}>
                <summary className="flex items-center cursor-pointer py-1.5 list-none">
                  <div className="w-48 shrink-0 pr-2 text-sm">
                    <span className="text-foreground-muted group-open:rotate-90 inline-block transition-transform mr-1">›</span>
                    <span className="font-medium">{c.codigo}</span> {c.nombre}
                    <BarraEstados piezas={cuenta(delConjunto)} total={delConjunto.length} />
                    <div className="text-[11px] pl-3">
                      {c.esperaA ? (
                        <span className="text-gris">Espera a {c.esperaA.codigo} {c.esperaA.nombre}</span>
                      ) : c.atrasoDias > 0 ? (
                        <span className="text-rojo-fg font-semibold">
                          +{diasHabiles(c.atrasoDias)}
                          {c.causa ? `: ${textoCausa(c.causa, hoy).texto}` : ""}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex-1 relative h-6">
                    {c.fabricacionDesde && c.piezas.total > 0 && (
                      <div className="absolute top-1.5 h-3 rounded bg-accent/25" style={{ left: x(c.fabricacionDesde), width: ancho(c.fabricacionDesde, c.piezasListas) }} />
                    )}
                    <div
                      className={`absolute top-1 h-4 rounded ${c.atrasoDias > 0 ? "bg-rojo" : "bg-accent"}`}
                      style={{ left: x(c.montajeInicioEstimado), width: ancho(c.montajeInicioEstimado, c.montajeFinEstimado) }}
                      title={`Montaje ${fechaCorta(c.montajeInicioEstimado)} → ${fechaCorta(c.montajeFinEstimado)}`}
                    />
                    <div className="absolute top-0 h-6 w-0.5 bg-foreground" style={{ left: x(c.montajeInicioLimite) }} title={`Debería empezar el montaje el ${fechaCorta(c.montajeInicioLimite)}`} />
                  </div>
                </summary>
                <div className="pl-48 pb-3 space-y-2">
                  <div className="text-xs text-foreground-muted">
                    Montaje: debería empezar el {fechaCorta(c.montajeInicioLimite)} · estimado {fechaCorta(c.montajeInicioEstimado)} → {fechaCorta(c.montajeFinEstimado)} · piezas listas el {fechaCorta(c.piezasListas)}
                  </div>
                  {ORDEN_ESTADO.filter((e) => grupos.get(e)?.length).map((e) => (
                    <details key={e} className="text-sm">
                      <summary className="cursor-pointer">
                        {LABEL_ESTADO[e]} ({grupos.get(e)!.length})
                      </summary>
                      <ul className="mt-1 ml-4 space-y-1">
                        {grupos.get(e)!.map((x) => (
                          <FilaPieza key={x.id} x={x} hoy={hoy} />
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              </details>
            );
            };

  return (
    <div className="space-y-6">
      {header}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      <section className="tarjeta p-5 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Grande titulo="Entrega comprometida" valor={fechaCorta(p.entrega, hoy)} />
          <Grande titulo="Fin estimado" valor={fechaCorta(p.finEstimado, hoy)} />
          <Grande
            titulo="Margen"
            valor={margenEntrega(p.diferenciaDias).texto}
            color={{ rojo: "text-rojo-fg", naranja: "text-naranja-fg", verde: "text-verde-fg" }[margenEntrega(p.diferenciaDias).tono as "rojo" | "naranja" | "verde"]}
          />
        </div>
        {p.causas.length > 0 ? <CausaRaiz codigo={p.codigo} causas={p.causas} hoy={hoy} /> : <p className="text-sm text-verde-fg">Llega a tiempo con el plan actual.</p>}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-foreground-muted border-t border-border pt-3">
          <span>
            Avance: <strong className="text-foreground">{p.avancePct}%</strong> en horas ({numero(Math.round(p.horasHechas))} de {numero(Math.round(p.horasTotales))} h)
          </span>
          <span>Estado: {m.estadoProyecto === "en_montaje" ? "En montaje" : "Activo"}</span>
          {p.piezasCubiertasConStock > 0 && <span>{plural(p.piezasCubiertasConStock, "pieza")} cubierta{p.piezasCubiertasConStock === 1 ? "" : "s"} con stock</span>}
        </div>
      </section>

      <div className="flex flex-wrap gap-2 items-start">
        {tanda && tanda.otPiezaIds.length > 0 && (
          <form action={liberarAction}>
            <input type="hidden" name="volver" value={`/proyectos/${id}`} />
            {tanda.otPiezaIds.map((pid) => (
              <input key={pid} type="hidden" name="otPiezaId" value={pid} />
            ))}
            <ConfirmarBoton mensaje={`¿Pasar ${plural(tanda.otPiezaIds.length, "pieza")} al plan de la semana?`}>Pasar {plural(tanda.otPiezaIds.length, "pieza")} al plan</ConfirmarBoton>
          </form>
        )}
        <details className="tarjeta px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold">Cambiar fecha de entrega</summary>
          <form action={cambiarEntregaAction} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={id} />
            <label className="block">
              <span className="etiqueta">Nueva fecha</span>
              <input type="date" name="fechaEntrega" required defaultValue={p.entrega} className="input" />
            </label>
            <label className="block">
              <span className="etiqueta">Motivo *</span>
              <input name="motivo" required placeholder="ej. el cliente adelantó la entrega" className="input w-72" />
            </label>
            <button className="btn btn-sm">Cambiar y recalcular</button>
          </form>
        </details>
        <details className="tarjeta px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold">Pausar</summary>
          <form action={pausarProyectoAction} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="pausar" value="1" />
            <input name="motivo" required placeholder="Motivo" className="input w-64" />
            <ConfirmarBoton mensaje="¿Pausar el proyecto? Sus tareas salen del plan hasta reactivarlo." className="btn-peligro btn-sm">
              Pausar
            </ConfirmarBoton>
          </form>
        </details>
        <span className="ml-auto self-center">
          <Estimado pct={p.pctEstimado} />
        </span>
      </div>

      {/* Gantt por conjunto */}
      <section className="tarjeta p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="font-semibold">Conjunto por conjunto</h2>
          <div className="flex gap-3 text-xs text-foreground-muted">
            <span className="flex items-center gap-1"><span className="w-4 h-2 rounded bg-accent/25" /> fabricación de sus piezas</span>
            <span className="flex items-center gap-1"><span className="w-4 h-2 rounded bg-accent" /> montaje estimado</span>
            <span className="flex items-center gap-1"><span className="w-0.5 h-3 bg-foreground" /> debería empezar el montaje</span>
          </div>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 w-px bg-rojo/60" style={{ left: `calc(12rem + (100% - 12rem) * ${parseFloat(x(p.entrega)) / 100})` }} title={`Entrega ${fechaCorta(p.entrega)}`} />
          <div className="absolute inset-y-0 w-px bg-accent/50" style={{ left: `calc(12rem + (100% - 12rem) * ${parseFloat(x(hoy)) / 100})` }} title="Hoy" />
          <div className="flex text-[11px] text-foreground-muted mb-1">
            <div className="w-48 shrink-0" />
            <div className="flex-1 flex justify-between">
              <span>{fechaCorta(inicioEje)}</span>
              <span className="text-rojo-fg">entrega {fechaCorta(p.entrega)}</span>
              <span>{fechaCorta(finEje)}</span>
            </div>
          </div>
          {conAtraso.length > 0 && <div className="text-xs font-semibold text-rojo-fg pt-1">Con atraso ({conAtraso.length})</div>}
          {conAtraso.map((c) => filaConjunto(c, true))}
          {enPlazo.length > 0 && (
            <details className="border-t border-border">
              <summary className="cursor-pointer py-2 text-sm text-foreground-muted list-none">
                <span className="mr-1">›</span>
                {plural(enPlazo.length, "conjunto")} en plazo
              </summary>
              {enPlazo.map((c) => filaConjunto(c, false))}
            </details>
          )}
          {sinPiezas.length > 0 && (
            <p className="border-t border-border py-2 text-xs text-gris">
              Sin piezas cargadas: {sinPiezas.map((c) => `${c.codigo} ${c.nombre}`).join(" · ")}
            </p>
          )}
          <div className="flex items-center border-t border-border py-1.5">
            <div className="w-48 shrink-0 text-sm font-medium">Montaje final y pruebas</div>
            <div className="flex-1 text-xs text-foreground-muted">
              debería empezar el {fechaCorta(p.montajeFinalLimite)} · termina {fechaCorta(p.finEstimado)}
            </div>
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4 [&>*]:min-w-0">
        <section className="tarjeta p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Compras sin pedir ({comprasP.length})</h2>
            <Link href="/pedir" className="text-sm text-accent hover:underline">
              {comprasP.length > 3 ? `Ver las ${comprasP.length} en Pedir esta semana →` : "Pedir esta semana →"}
            </Link>
          </div>
          <ul className="text-sm mt-2 divide-y divide-border max-h-72 overflow-y-auto">
            {comprasP
              .sort((a, b) => a.pedirAntes.localeCompare(b.pedirAntes))
              .slice(0, 3)
              .map((c) => (
                <li key={c.clave} className="py-1.5 flex flex-wrap justify-between gap-2">
                  <span>
                    {c.esMaterial ? "Material para " : ""}
                    {c.piezaNombre} × {c.cantidad}
                  </span>
                  {c.pedirYa ? <Etiqueta tono="naranja">Pedir ya</Etiqueta> : <span className={`text-xs ${c.pedirAntes < hoy ? "text-rojo-fg font-semibold" : "text-foreground-muted"}`}>pedir antes del {fechaCorta(c.pedirAntes, hoy)}</span>}
                </li>
              ))}
          </ul>
        </section>
        <section className="tarjeta p-4">
          <h2 className="font-semibold">Bitácora del proyecto</h2>
          {eventos.length === 0 ? (
            <p className="text-sm text-foreground-muted mt-2">Sin cambios registrados.</p>
          ) : (
            <ul className="text-sm mt-2 space-y-1.5">
              {eventos.map(({ e, nombre }) => (
                <li key={e.id}>
                  <span className="text-xs text-foreground-muted">
                    {e.fecha.toLocaleDateString("es-AR")} · {nombre ?? e.usuarioId}
                  </span>
                  <div>{e.texto}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Grande({ titulo, valor, color }: { titulo: string; valor: string; color?: string }) {
  return (
    <div>
      <div className="text-sm text-foreground-muted">{titulo}</div>
      <div className={`text-2xl sm:text-[32px] font-bold leading-tight ${color ?? ""}`}>{valor}</div>
    </div>
  );
}

/** Barra de piezas del conjunto por estado, con los cinco estados de pieza. */
function BarraEstados({ piezas, total }: { piezas: Record<EstadoVisible, number>; total: number }) {
  const tramos: [EstadoVisible, string][] = [
    ["terminada", "bg-verde"],
    ["en_curso", "bg-accent-hover"],
    ["lista", "bg-accent/50"],
    ["falta_material", "bg-naranja"],
    ["trabada", "bg-rojo"],
  ];
  if (!total) return null;
  const titulo = tramos.filter(([k]) => piezas[k]).map(([k]) => `${piezas[k]} ${LABEL_ESTADO[k].toLowerCase()}`).join(" · ");
  return (
    <div className="pl-3 mt-0.5 flex items-center gap-1.5" title={titulo}>
      <div className="flex h-1.5 w-24 rounded-full overflow-hidden bg-surface-muted">
        {tramos.map(([k, c]) => (piezas[k] ? <div key={k} className={c} style={{ width: `${(piezas[k] / total) * 100}%` }} /> : null))}
      </div>
      <span className="text-[11px] text-foreground-muted">
        {piezas.terminada}/{total}
      </span>
    </div>
  );
}
