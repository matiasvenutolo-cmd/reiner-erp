import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otMaquina, otConjunto, otPieza, pieza, conjunto, configuracion, cliente, proyectoEvento, usuario } from "@/lib/db/schema";
import { getPlan } from "@/lib/planning/datos";
import { habilesEntre } from "@/lib/planning/calendario";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";
import { Holgura, EstadoTareaChip, fechaCorta, Estimado } from "@/components/v2/Plan";
import { activarProyectoAction, cambiarEntregaAction, pausarProyectoAction, liberarAction } from "@/app/actions/v2";
import type { Tarea } from "@/lib/planning/motor";

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

const ORDEN_ESTADO = ["terminadas", "enCurso", "listas", "trabadas", "futuras"] as const;
const LABEL_ESTADO: Record<(typeof ORDEN_ESTADO)[number], string> = { terminadas: "Terminadas", enCurso: "En curso", listas: "Listas o liberadas", trabadas: "Trabadas", futuras: "Futuras" };

function estadoDePieza(ts: Tarea[]): (typeof ORDEN_ESTADO)[number] {
  if (ts.every((t) => t.estado === "terminada")) return "terminadas";
  if (ts.some((t) => t.estado === "trabada")) return "trabadas";
  if (ts.some((t) => t.estado === "en_curso" || t.estado === "pausada")) return "enCurso";
  if (ts.some((t) => t.estado === "lista" || t.estado === "liberada")) return "listas";
  return "futuras";
}

export default async function ProyectoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const { ok, error } = await searchParams;
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
      migas={[{ href: "/proyectos", label: "Proyectos y órdenes" }, { label: m.codigo }]}
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          {m.codigo}
          <span className="badge-estado bg-surface-muted text-foreground">{tipo}</span>
          {m.esDemo && <span className="badge-estado bg-[#efe9fb] text-[#5b3aa8]">demo</span>}
          {m.prioridad === "alta" && <span className="badge-estado badge-alerta">Prioridad alta</span>}
        </span>
      }
      descripcion={[fila.cliente, fila.config, m.tipo === "suelta" ? m.numeroSerie : `Serie ${m.numeroSerie}`].filter(Boolean).join(" · ")}
      acciones={
        <Link href={`/ot/${m.id}`} className="btn-secundario">
          Detalle de la orden
        </Link>
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
                          <input type="checkbox" name="quitarOtPiezaId" value={x.id} className="accent-[#dc2626]" />
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

  // ── Activo: el proyecto, conjunto por conjunto ────────────────────────
  const tareas = plan.resultado.tareas.filter((t) => t.proyectoId === id);
  const tanda = plan.resultado.tandas.find((t) => t.proyectoId === id);
  const nombres = new Map(tareas.map((t) => [t.otPiezaId, `${t.piezaNombre} × ${t.cantidad}`]));
  const inicioEje = [hoy, ...p.conjuntos.map((c) => c.fabricacionDesde ?? hoy)].sort()[0];
  const finEje = [p.finEstimado, p.entrega].sort().at(-1)!;
  const total = Math.max(1, habilesEntre(inicioEje, finEje, cal));
  const x = (f: string) => `${Math.min(100, Math.max(0, (habilesEntre(inicioEje, f, cal) / total) * 100))}%`;
  const ancho = (a: string, b: string) => `${Math.max(0.8, (habilesEntre(a, b, cal) / total) * 100)}%`;
  const comprasP = plan.resultado.compras.filter((c) => c.proyectoId === id && !c.pedido);

  return (
    <div className="space-y-6">
      {header}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Dato titulo="Entrega comprometida" valor={fechaCorta(p.entrega)} />
        <Dato titulo="Fin estimado" valor={fechaCorta(p.finEstimado)} />
        <Dato
          titulo="Diferencia"
          valor={p.diferenciaDias > 0 ? `${p.diferenciaDias} día${p.diferenciaDias === 1 ? "" : "s"} tarde` : p.diferenciaDias === 0 ? "justo a tiempo" : `${-p.diferenciaDias} día${p.diferenciaDias === -1 ? "" : "s"} antes`}
          color={p.diferenciaDias > 0 ? "text-[#991b1b]" : p.diferenciaDias >= -3 ? "text-[#9a3412]" : "text-[#00755d]"}
        />
        <Dato titulo="Avance en horas" valor={`${p.avancePct}%`} nota={`${Math.round(p.horasHechas)} de ${Math.round(p.horasTotales)} h`} />
        <Dato titulo="Estado" valor={m.estadoProyecto === "en_montaje" ? "En montaje" : "Activo"} nota={`${p.piezasCubiertasConStock} piezas cubiertas con stock`} />
      </div>

      <div className="flex flex-wrap gap-2 items-start">
        {tanda && tanda.otPiezaIds.length > 0 && (
          <form action={liberarAction}>
            <input type="hidden" name="volver" value={`/proyectos/${id}`} />
            {tanda.otPiezaIds.map((pid) => (
              <input key={pid} type="hidden" name="otPiezaId" value={pid} />
            ))}
            <ConfirmarBoton mensaje={`¿Liberar ${tanda.otPiezaIds.length} piezas? Entran al plan de la semana.`}>Liberar tanda sugerida ({tanda.otPiezaIds.length})</ConfirmarBoton>
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
            <span className="flex items-center gap-1"><span className="w-0.5 h-3 bg-[#111]" /> debería empezar el montaje</span>
          </div>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 w-px bg-[#dc2626]/60" style={{ left: `calc(12rem + (100% - 12rem) * ${parseFloat(x(p.entrega)) / 100})` }} title={`Entrega ${fechaCorta(p.entrega)}`} />
          <div className="absolute inset-y-0 w-px bg-accent/50" style={{ left: `calc(12rem + (100% - 12rem) * ${parseFloat(x(hoy)) / 100})` }} title="Hoy" />
          <div className="flex text-[11px] text-foreground-muted mb-1">
            <div className="w-48 shrink-0" />
            <div className="flex-1 flex justify-between">
              <span>{fechaCorta(inicioEje)}</span>
              <span className="text-[#991b1b]">entrega {fechaCorta(p.entrega)}</span>
              <span>{fechaCorta(finEje)}</span>
            </div>
          </div>
          {p.conjuntos.map((c) => {
            const ts = tareas.filter((t) => t.conjuntoId === c.id);
            const porPieza = new Map<string, Tarea[]>();
            for (const t of ts) porPieza.set(t.otPiezaId, [...(porPieza.get(t.otPiezaId) ?? []), t]);
            const grupos = new Map<string, string[]>();
            for (const [pid, tp] of porPieza) grupos.set(estadoDePieza(tp), [...(grupos.get(estadoDePieza(tp)) ?? []), pid]);
            return (
              <details key={c.id} className="group border-t border-border">
                <summary className="flex items-center cursor-pointer py-1.5 list-none">
                  <div className="w-48 shrink-0 pr-2 text-sm">
                    <span className="text-foreground-muted group-open:rotate-90 inline-block transition-transform mr-1">›</span>
                    <span className="font-medium">{c.codigo}</span> {c.nombre}
                    <div className="text-[11px] text-foreground-muted pl-3">
                      {c.piezas.total} piezas · {c.piezas.terminadas} hechas
                      {c.atrasoDias > 0 && <span className="text-[#991b1b] font-semibold"> · +{c.atrasoDias} días ({c.motivoAtraso})</span>}
                    </div>
                  </div>
                  <div className="flex-1 relative h-6">
                    {c.fabricacionDesde && c.piezas.total > 0 && (
                      <div className="absolute top-1.5 h-3 rounded bg-accent/25" style={{ left: x(c.fabricacionDesde), width: ancho(c.fabricacionDesde, c.piezasListas) }} />
                    )}
                    <div
                      className={`absolute top-1 h-4 rounded ${c.atrasoDias > 0 ? "bg-[#dc2626]" : "bg-accent"}`}
                      style={{ left: x(c.montajeInicioEstimado), width: ancho(c.montajeInicioEstimado, c.montajeFinEstimado) }}
                      title={`Montaje ${fechaCorta(c.montajeInicioEstimado)} → ${fechaCorta(c.montajeFinEstimado)}`}
                    />
                    <div className="absolute top-0 h-6 w-0.5 bg-[#111]" style={{ left: x(c.montajeInicioLimite) }} title={`Debería empezar el montaje el ${fechaCorta(c.montajeInicioLimite)}`} />
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
                        {grupos.get(e)!.map((pid) => {
                          const tp = porPieza.get(pid)!;
                          const actual = tp.find((t) => t.estado !== "terminada");
                          return (
                            <li key={pid} className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-medium">{nombres.get(pid)}</span>
                              {actual && (
                                <>
                                  <span className="text-foreground-muted">
                                    paso {actual.posicion}/{actual.totalPasos}: {actual.paso}
                                    {actual.fechaPlan ? ` · plan ${fechaCorta(actual.fechaPlan)}` : ""}
                                  </span>
                                  <EstadoTareaChip estado={actual.estado} />
                                  <Holgura nivel={actual.nivel} dias={actual.holgura} corto />
                                  {actual.motivoTraba && <span className="text-[#991b1b]">{actual.motivoTraba}</span>}
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  ))}
                </div>
              </details>
            );
          })}
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
              Pedir esta semana →
            </Link>
          </div>
          <ul className="text-sm mt-2 divide-y divide-border max-h-72 overflow-y-auto">
            {comprasP
              .sort((a, b) => a.pedirAntes.localeCompare(b.pedirAntes))
              .slice(0, 12)
              .map((c) => (
                <li key={c.clave} className="py-1.5 flex flex-wrap justify-between gap-2">
                  <span>
                    {c.esMaterial ? "Material para " : ""}
                    {c.piezaNombre} × {c.cantidad}
                  </span>
                  <span className={`text-xs ${c.pedirAntes < hoy ? "text-[#991b1b] font-semibold" : "text-foreground-muted"}`}>pedir antes del {fechaCorta(c.pedirAntes)}</span>
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

function Dato({ titulo, valor, nota, color }: { titulo: string; valor: string; nota?: string; color?: string }) {
  return (
    <div className="tarjeta px-4 py-3">
      <div className="text-xs text-foreground-muted">{titulo}</div>
      <div className={`text-lg font-semibold ${color ?? ""}`}>{valor}</div>
      {nota && <div className="text-xs text-foreground-muted">{nota}</div>}
    </div>
  );
}
