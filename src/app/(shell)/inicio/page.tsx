import Link from "next/link";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getUsuarioActual } from "@/lib/session";
import { getPlan, MOTIVO_BLOQUEO } from "@/lib/planning/datos";
import { lunesDe, proximosHabiles, sumarHabiles } from "@/lib/planning/calendario";
import { getPiezasStockBajo } from "@/lib/data/stock";
import { getParadasActivas } from "@/lib/data/ejecucion";
import { contarConfiguracionPendiente } from "@/lib/data/contadores";
import { HORAS_OPERARIO_DIA } from "@/lib/data/operario";
import { db } from "@/lib/db/client";
import { proveedor, tareaBloqueo, avisoPlanta, usuario, piezaAdjunto, semanaConfirmada, pieza, otPieza } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { Vacio } from "@/components/ui/Aviso";
import { Etiqueta, Punto } from "@/components/ui/Etiqueta";
import { Icono } from "@/components/ui/Icono";
import { NIVEL, Estimado, textoCausa } from "@/components/v2/Plan";
import { destrabarAction, resolverAvisoAction } from "@/app/actions/operario";
import { capitalizar, diasHabiles, fechaCorta, horas, numero, plural } from "@/lib/formato";
import type { Tarea } from "@/lib/planning/motor";
import { cargaSemana } from "@/lib/planning/carga";

export const dynamic = "force-dynamic";

/** Minutos desde una fecha (para las paradas en curso). */
function minutosDesde(f: Date | string): number {
  return Math.round((Date.now() - new Date(f).getTime()) / 60000);
}

const NOMBRE_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

type Decision = { texto: React.ReactNode; boton: string; href: string; dias: number; tipo: "entrega" | "capacidad" | "datos"; urgente?: boolean };

/**
 * Hoy, con foco (mejoras de usabilidad §1.2): arriba "Lo primero hoy" — la
 * decisión de mayor impacto con su botón —, tres indicadores, lo de hoy
 * resumido por centro (se despliega), lo trabado y como mucho 3 decisiones.
 * Las tareas de carga de datos no van acá: van a Configuración pendiente (§1.3).
 */
export default async function HoyPage() {
  const [usuarioActual, plan, stockBajo, paradas, configPendiente] = await Promise.all([getUsuarioActual(), getPlan(), getPiezasStockBajo(), getParadasActivas(), contarConfiguracionPendiente()]);
  const { resultado: r, entrada, centros, operarios } = plan;
  const cal = entrada.calendario;
  const hoy = proximosHabiles(entrada.hoy, 1, cal)[0];
  const esHoy = hoy === entrada.hoy;
  const lunes = lunesDe(hoy);
  const nombreCentro = (id: string | null) => centros.find((c) => c.id === id)?.nombre ?? "Sin centro";

  // 1 · Qué se hace hoy
  const deHoy = r.tareas.filter((t) => t.tipo === "interno" && !["terminada", "futura"].includes(t.estado) && t.horasPorDia[hoy]);
  const porCentro = new Map<string, Tarea[]>();
  for (const t of deHoy) porCentro.set(t.centroId ?? "", [...(porCentro.get(t.centroId ?? "") ?? []), t]);
  const codigos = [...new Set(deHoy.map((t) => t.piezaCodigo))];

  // 2 · Qué está trabado (incluye lo que marcó el operario y las paradas largas)
  const trabadas = r.tareas.filter((t) => t.estado === "trabada");
  const porMotivo = new Map<string, Tarea[]>();
  for (const t of trabadas) porMotivo.set(t.motivoTraba ?? "Otro", [...(porMotivo.get(t.motivoTraba ?? "Otro") ?? []), t]);
  const [provs, bloqueos, avisos, conPlano, [semana]] = await Promise.all([
    db.select({ id: proveedor.id, razonSocial: proveedor.razonSocial, telefono: proveedor.telefono, email: proveedor.email, contacto: proveedor.contacto }).from(proveedor),
    db
      .select({ id: tareaBloqueo.id, otPiezaId: tareaBloqueo.otPiezaId, operacionId: tareaBloqueo.operacionId, motivo: tareaBloqueo.motivo, texto: tareaBloqueo.texto, quien: usuario.nombre, pieza: pieza.nombre })
      .from(tareaBloqueo)
      .innerJoin(usuario, eq(usuario.id, tareaBloqueo.usuarioId))
      .innerJoin(otPieza, eq(otPieza.id, tareaBloqueo.otPiezaId))
      .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
      .where(isNull(tareaBloqueo.resueltoAt)),
    db.select({ id: avisoPlanta.id, tipo: avisoPlanta.tipo, texto: avisoPlanta.texto, quien: usuario.nombre }).from(avisoPlanta).innerJoin(usuario, eq(usuario.id, avisoPlanta.usuarioId)).where(and(isNull(avisoPlanta.resueltoAt), eq(avisoPlanta.tipo, "sin_tareas"))),
    codigos.length ? db.selectDistinct({ id: piezaAdjunto.piezaId }).from(piezaAdjunto).where(and(inArray(piezaAdjunto.piezaId, codigos), eq(piezaAdjunto.tipo, "plano"))) : [],
    db.select().from(semanaConfirmada).where(eq(semanaConfirmada.lunes, lunes)),
  ]);
  const tienePlano = new Set(conPlano.map((x) => x.id));
  const motivosOperario = new Set(Object.values(MOTIVO_BLOQUEO));
  const paradasLargas = paradas.filter((p) => minutosDesde(p.inicio) > 30);

  // 3 · Qué hay que decidir — primero lo que afecta una entrega, después capacidad, al final datos.
  const viernes = sumarHabiles(lunes, 4, cal);
  const decisiones: Decision[] = [];
  const enRiesgo = r.proyectos.filter((p) => p.diferenciaDias > 0).sort((a, b) => b.diferenciaDias - a.diferenciaDias);
  for (const p of enRiesgo) {
    const c = p.causas[0] ? textoCausa(p.causas[0].causa, hoy) : null;
    decisiones.push({
      texto: (
        <>
          <strong>{p.codigo}</strong> termina {diasHabiles(p.diferenciaDias)} después de la entrega{c ? `: ${c.texto}` : ""}.
        </>
      ),
      boton: c?.accion ?? "Ver proyecto",
      href: c?.href ?? `/proyectos/${p.id}`,
      dias: p.diferenciaDias,
      tipo: "entrega",
      urgente: true,
    });
  }
  const tarde = r.compras.filter((c) => c.pedido && c.llegadaPrevista && c.llegadaPrevista > c.llegadaNecesaria);
  if (tarde.length)
    decisiones.push({ texto: `${plural(tarde.length, "pedido")} llega${tarde.length === 1 ? "" : "n"} después de cuando se necesita${tarde.length === 1 ? "" : "n"} (${[...new Set(tarde.map((c) => c.proyectoCodigo))].join(", ")}).`, boton: "Ver lo que está por llegar", href: "/pedir?vista=llegar", dias: 5, tipo: "entrega", urgente: true });
  const comprasSemana = r.compras.filter((c) => !c.pedido && c.pedirAntes <= viernes);
  if (comprasSemana.length) decisiones.push({ texto: `${plural(comprasSemana.length, "compra")} hay que pedir${comprasSemana.length === 1 ? "la" : "las"} esta semana.`, boton: "Ir a pedir", href: "/pedir", dias: 3, tipo: "entrega" });
  for (const t of r.tandas.filter((x) => x.otPiezaIds.length)) {
    const p = r.proyectos.find((x) => x.id === t.proyectoId);
    decisiones.push({ texto: `${plural(t.otPiezaIds.length, "pieza")} de ${p?.codigo} entran en el horizonte.`, boton: `Liberar ${t.otPiezaIds.length}`, href: `/liberacion#${t.proyectoId}`, dias: 2, tipo: "entrega" });
  }
  for (const [desde, cuando] of [[lunes, "esta semana"], [sumarHabiles(viernes, 1, cal), "la semana que viene"]] as const) {
    for (const c of centros) {
      const { pct } = cargaSemana(r, c.id, proximosHabiles(desde, 5, cal), cuando === "esta semana");
      if (pct > 100) decisiones.push({ texto: `${c.nombre} está al ${numero(pct)}% de su capacidad ${cuando}.`, boton: "Ver el plan", href: `/planificacion${cuando === "esta semana" ? "" : `?semana=${desde}`}`, dias: 1, tipo: "capacidad", urgente: pct > 130 });
    }
  }
  // Carga por operario (§1.7): ningún operario con más horas que su día.
  for (const [opId, porDia] of r.cargaOperario) {
    for (const [dia, h] of porDia) {
      if (dia >= lunes && dia <= viernes && h > HORAS_OPERARIO_DIA + 0.05) {
        const centrosDelDia = [...new Set(r.tareas.filter((t) => t.operarioId === opId && t.horasPorDia[dia]).map((t) => nombreCentro(t.centroId)))];
        decisiones.push({ texto: `${operarios.get(opId) ?? "Un operario"} tiene ${horas(h)} asignadas el ${fechaCorta(dia)}: repartir entre ${centrosDelDia.join(" y ")}.`, boton: "Ver el plan", href: `/planificacion?vista=operario&semana=${lunes}`, dias: 1, tipo: "capacidad" });
      }
    }
  }
  for (const s of stockBajo.slice(0, 3))
    decisiones.push({
      texto: `${capitalizar(s.piezaNombre)} quedó debajo del mínimo (${s.disponible} de ${s.minimo}).`,
      boton: "Generar OT para stock",
      href: `/ot/nueva?tipo=suelta&destino=stock&pieza=${encodeURIComponent(s.piezaId)}&cantidad=${Math.max(1, s.minimo - s.disponible)}`,
      dias: 0,
      tipo: "datos",
    });
  const orden = { entrega: 0, capacidad: 1, datos: 2 };
  decisiones.sort((a, b) => orden[a.tipo] - orden[b.tipo] || b.dias - a.dias);

  // El jefe de planta: recordatorio el lunes si la semana no está confirmada (§1.8).
  const recordarConfirmar = !semana && new Date(`${hoy}T12:00:00Z`).getUTCDay() === 1;

  // Lo primero hoy: la decisión de mayor impacto, con su acción.
  const principal = enRiesgo[0];
  const causaPrincipal = principal?.causas[0] ? textoCausa(principal.causas[0].causa, hoy) : null;
  const segunda = principal?.causas[1] ? textoCausa(principal.causas[1].causa, hoy) : null;
  const lo1 =
    principal && causaPrincipal
      ? {
          texto: `${causaPrincipal.hacer}${segunda && segunda.href === causaPrincipal.href ? ` y ${segunda.hacer.replace(/^Pedir (el material de )?/, "")}` : ""}: ${principal.codigo} va ${diasHabiles(principal.diferenciaDias)} tarde.`,
          boton: causaPrincipal.accion,
          href: causaPrincipal.href,
        }
      : recordarConfirmar
        ? { texto: "La semana todavía no está confirmada: los operarios ven el plan propuesto.", boton: "Confirmar la semana", href: "/planificacion" }
        : decisiones[0]
          ? { texto: decisiones[0].texto, boton: decisiones[0].boton, href: decisiones[0].href }
          : null;
  const resto = decisiones.filter((d) => !(principal && d.tipo === "entrega" && d.href === lo1?.href && d.dias === principal.diferenciaDias));
  const pctEst = Math.max(0, ...r.proyectos.map((p) => p.pctEstimado));
  const fechaTitulo = `${NOMBRE_DIA[new Date(`${hoy}T12:00:00Z`).getUTCDay()]} ${hoy.slice(8, 10)}/${hoy.slice(5, 7)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo={esHoy ? `Hoy, ${fechaTitulo.toLowerCase()}` : fechaTitulo}
        descripcion={esHoy ? "Lo primero, lo que se hace hoy, lo trabado y lo que hay que decidir." : undefined}
        acciones={
          <>
            <Link href="/planificacion" className="btn">
              Plan de la semana
            </Link>
            <Link href="/ot/nueva" className="btn-secundario">
              + Generar orden
            </Link>
          </>
        }
      >
        {!esHoy && <p className="text-sm text-foreground-muted">Hoy no es día hábil: esto es lo del {fechaCorta(hoy)}.</p>}
        <div className="mt-2">
          <Estimado pct={pctEst} />
        </div>
      </PageHeader>

      {lo1 && (
        <section className="tarjeta franja border-l-accent p-5 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-64">
            <div className="text-xs font-semibold text-accent">Lo primero hoy</div>
            <div className="text-lg font-semibold mt-1">{lo1.texto}</div>
          </div>
          <Link href={lo1.href} className="btn">
            {lo1.boton} →
          </Link>
        </section>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tareas de hoy", n: deHoy.length, href: "#hoy", tono: "" },
          { label: "Trabadas", n: trabadas.length + paradasLargas.length, href: "#trabado", tono: trabadas.length ? "text-rojo-fg" : "" },
          { label: "Proyectos en riesgo", n: enRiesgo.length, href: "/llegamos", tono: enRiesgo.length ? "text-rojo-fg" : "" },
        ].map((x) => (
          <Link key={x.label} href={x.href} className="tarjeta p-4 hover:border-accent">
            <div className={`text-[32px] font-bold tabular-nums leading-none ${x.tono}`}>{x.n}</div>
            <div className="text-sm text-foreground-muted mt-1">{x.label}</div>
          </Link>
        ))}
      </div>

      <section id="hoy" className="space-y-2 scroll-mt-24">
        <h2 className="text-lg font-semibold">Qué se hace hoy</h2>
        {porCentro.size === 0 ? (
          <Vacio neutro>Nada planificado para hoy.</Vacio>
        ) : (
          <div className="tarjeta divide-y divide-border">
            {[...porCentro]
              .sort((a, b) => b[1].length - a[1].length)
              .map(([centroId, ts]) => {
                const hs = ts.reduce((s, t) => s + (t.horasPorDia[hoy] ?? 0), 0);
                const ops = [...new Set(ts.map((t) => (t.operarioId ? operarios.get(t.operarioId) : null)))];
                const urgentes = ts.filter((t) => t.nivel === "atrasada" || t.nivel === "urgente" || t.nivel === "arranca_tarde").length;
                const sinOperario = ts.filter((t) => !t.operarioId).length;
                return (
                  <details key={centroId} className="group">
                    <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 cursor-pointer list-none hover:bg-surface-muted/50">
                      <Icono nombre="derecha" className="w-4 h-4 text-foreground-muted group-open:rotate-90 transition-transform" />
                      <span className="font-semibold">{nombreCentro(centroId)}</span>
                      <span className="text-sm text-foreground-muted">
                        {plural(ts.length, "tarea")} · {horas(hs)} · {ops.filter(Boolean).join(", ") || "sin operario"}
                      </span>
                      {urgentes > 0 && <Etiqueta tono="naranja">{plural(urgentes, "urgente")}</Etiqueta>}
                      {sinOperario > 0 && <Etiqueta tono="rojo" icono="usuarios">{sinOperario} sin operario</Etiqueta>}
                    </summary>
                    <ul className="divide-y divide-border border-t border-border">
                      {ts
                        .sort((a, b) => a.holgura - b.holgura)
                        .map((t) => (
                          <li key={t.clave} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                            <Punto tono={NIVEL[t.nivel].tono} title={NIVEL[t.nivel].label} />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">
                                {capitalizar(t.piezaNombre)} × {numero(t.cantidad)}
                                {t.lote && <span className="text-foreground-muted font-normal"> · lote {t.lote.n} de {t.lote.de}</span>}
                              </div>
                              <div className="text-xs text-foreground-muted">
                                {t.paso} · {t.proyectoCodigo} · {horas(t.horasPorDia[hoy] ?? 0)} ·{" "}
                                {t.operarioId ? operarios.get(t.operarioId) : <span className="text-rojo-fg font-semibold">sin operario: asignalo</span>}
                              </div>
                            </div>
                            {(t.estado === "trabada" || t.estado === "en_curso") && <Etiqueta tono={t.estado === "trabada" ? "rojo" : "naranja"}>{t.estado === "trabada" ? "Trabada" : "En curso"}</Etiqueta>}
                            <details className="relative">
                              <summary className="list-none cursor-pointer p-1.5 rounded-md hover:bg-surface-muted" aria-label="Más acciones">
                                <Icono nombre="menu" className="w-4 h-4" />
                              </summary>
                              <div className="absolute right-0 z-30 mt-1 w-44 tarjeta py-1 text-sm">
                                <Link href={`/planificacion?ver=${encodeURIComponent(t.clave)}`} className="block px-3 py-2 hover:bg-surface-muted">
                                  Mover en el plan
                                </Link>
                                {tienePlano.has(t.piezaCodigo) ? (
                                  <Link href={`/maestros/pieza/${t.piezaCodigo}#adjuntos`} className="block px-3 py-2 hover:bg-surface-muted">
                                    Ver plano
                                  </Link>
                                ) : (
                                  <span className="block px-3 py-2 text-foreground-muted">Sin plano</span>
                                )}
                              </div>
                            </details>
                          </li>
                        ))}
                    </ul>
                  </details>
                );
              })}
          </div>
        )}
      </section>

      <section id="trabado" className="space-y-2 scroll-mt-24">
        <h2 className="text-lg font-semibold">Qué está trabado</h2>
        {trabadas.length === 0 && paradasLargas.length === 0 && avisos.length === 0 ? (
          <Vacio>Nada trabado.</Vacio>
        ) : (
          <div className="space-y-3">
            {avisos.map((a) => (
              <div key={a.id} className="tarjeta franja border-l-naranja px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>
                  <strong>{a.quien}</strong>: {a.texto}.
                </span>
                <form action={resolverAvisoAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn-secundario btn-sm">Ya le asigné tareas</button>
                </form>
              </div>
            ))}
            {paradasLargas.map((p) => (
              <div key={p.id} className="tarjeta franja border-l-naranja px-4 py-3 text-sm">
                <strong>{p.usuarioNombre}</strong> lleva {numero(minutosDesde(p.inicio))} min parado en {capitalizar(p.piezaNombre)} · {p.tipoParadaNombre}.
              </div>
            ))}
            {[...porMotivo].map(([motivo, ts]) => {
              const delOperario = motivosOperario.has(motivo);
              return (
                <div key={motivo} className="tarjeta franja border-l-rojo p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Etiqueta tono="rojo">{motivo}</Etiqueta>
                      <span className="text-sm">{plural(ts.length, "tarea")}</span>
                    </div>
                    {motivo === "Falta material" && (
                      <Link href="/pedir" className="btn btn-sm">
                        Ir a pedir
                      </Link>
                    )}
                    {motivo === "Falta plano" && (
                      <Link href="/admin/configuracion#planos" className="btn btn-sm">
                        Avisar a ingeniería
                      </Link>
                    )}
                    {motivo === "Tercerizado demorado" && (
                      <Link href="/tercerizados#esperando" className="btn btn-sm">
                        Reclamar al proveedor
                      </Link>
                    )}
                  </div>
                  <ul className="mt-2 text-sm space-y-1.5">
                    {ts.slice(0, 5).map((t) => {
                      const b = bloqueos.find((x) => x.otPiezaId === t.otPiezaId && x.operacionId === t.operacionId);
                      return (
                        <li key={t.clave} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-foreground-muted">
                            {capitalizar(t.piezaNombre)} — {t.paso} · {t.proyectoCodigo}
                            {b ? ` · lo marcó ${b.quien}${b.texto ? `: "${b.texto}"` : ""}` : ""}
                          </span>
                          {delOperario && b && (
                            <form action={destrabarAction}>
                              <input type="hidden" name="id" value={b.id} />
                              <button className="btn-texto btn-sm">Ya está resuelto</button>
                            </form>
                          )}
                        </li>
                      );
                    })}
                    {ts.length > 5 && <li className="text-foreground-muted">y {ts.length - 5} más</li>}
                  </ul>
                  {motivo === "Tercerizado demorado" && provs.some((p) => p.telefono || p.email) && (
                    <p className="text-xs mt-2">Contactos: {provs.filter((p) => p.telefono || p.email).map((p) => `${p.razonSocial} ${p.telefono ?? ""} ${p.email ?? ""}`).join(" · ")}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Qué hay que decidir</h2>
        {resto.length === 0 ? (
          <Vacio>Nada para decidir.</Vacio>
        ) : (
          <div className="tarjeta divide-y divide-border">
            {resto.slice(0, 3).map((d, i) => (
              <FilaDecision key={i} d={d} />
            ))}
            {resto.length > 3 && (
              <details>
                <summary className="px-4 py-2.5 text-sm text-accent cursor-pointer list-none hover:underline">Ver {resto.length - 3} más</summary>
                <div className="divide-y divide-border border-t border-border">
                  {resto.slice(3).map((d, i) => (
                    <FilaDecision key={i} d={d} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </section>

      {configPendiente > 0 && (
        <p className="text-sm text-foreground-muted">
          Hay {plural(configPendiente, "tema")} de configuración pendiente{configPendiente === 1 ? "" : "s"}.{" "}
          <Link href="/admin/configuracion" className="text-accent hover:underline">
            Ver →
          </Link>
        </p>
      )}
      {usuarioActual.rol === "taller" && recordarConfirmar && !lo1?.boton.startsWith("Confirmar") && (
        <p className="text-sm">
          Recordatorio: la semana todavía no está confirmada.{" "}
          <Link href="/planificacion" className="text-accent hover:underline">
            Confirmarla →
          </Link>
        </p>
      )}
    </div>
  );
}

function FilaDecision({ d }: { d: Decision }) {
  return (
    <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm flex items-center gap-2 min-w-0 flex-1">
        <Punto tono={d.urgente ? "rojo" : d.tipo === "capacidad" ? "naranja" : "azul"} />
        <span>{d.texto}</span>
      </span>
      <Link href={d.href} className="btn-secundario btn-sm">
        {d.boton} →
      </Link>
    </div>
  );
}
