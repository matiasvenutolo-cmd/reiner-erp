import Link from "next/link";
import { getUsuarioActual } from "@/lib/session";
import { getPlan, getProyectosSinPlan } from "@/lib/planning/datos";
import { lunesDe, proximosHabiles, sumarHabiles } from "@/lib/planning/calendario";
import { getPiezasStockBajo } from "@/lib/data/stock";
import { db } from "@/lib/db/client";
import { pieza, proveedor } from "@/lib/db/schema";
import { isNotNull, sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Holgura, EstadoTareaChip, fechaCorta, Estimado } from "@/components/v2/Plan";
import type { Tarea } from "@/lib/planning/motor";
import { cargaSemana } from "@/lib/planning/carga";

export const dynamic = "force-dynamic";

/**
 * Hoy (reemplaza Inicio): tres bloques y nada más — qué se hace hoy, qué está
 * trabado y qué hay que decidir. Cada ítem tiene el botón que lo resuelve.
 * Si un bloque está vacío, lo dice en verde en vez de desaparecer.
 */
export default async function HoyPage() {
  const usuario = await getUsuarioActual();
  const [plan, sinPlan, stockBajo, propuestas] = await Promise.all([
    getPlan(),
    getProyectosSinPlan(),
    getPiezasStockBajo(),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(pieza).where(isNotNull(pieza.claseSugerida)),
  ]);
  const { resultado: r, entrada, centros, operarios } = plan;
  const cal = entrada.calendario;
  const hoy = proximosHabiles(entrada.hoy, 1, cal)[0];
  const esHoy = hoy === entrada.hoy;
  const nombreCentro = (id: string | null) => centros.find((c) => c.id === id)?.nombre ?? "Sin centro";

  // 1 · Qué se hace hoy
  const deHoy = r.tareas.filter((t) => t.tipo === "interno" && !["terminada", "futura"].includes(t.estado) && t.horasPorDia[hoy]);
  const porCentro = new Map<string, Tarea[]>();
  for (const t of deHoy) porCentro.set(t.centroId ?? "", [...(porCentro.get(t.centroId ?? "") ?? []), t]);
  const atrasadasHoy = deHoy.filter((t) => t.nivel === "atrasada").length;

  // 2 · Qué está trabado
  const trabadas = r.tareas.filter((t) => t.estado === "trabada");
  const porMotivo = new Map<string, Tarea[]>();
  for (const t of trabadas) porMotivo.set(t.motivoTraba ?? "Otro", [...(porMotivo.get(t.motivoTraba ?? "Otro") ?? []), t]);
  const provs = await db.select({ id: proveedor.id, razonSocial: proveedor.razonSocial, telefono: proveedor.telefono, email: proveedor.email, contacto: proveedor.contacto }).from(proveedor);

  // 3 · Qué hay que decidir
  const viernes = sumarHabiles(lunesDe(hoy), 4, cal);
  const comprasSemana = r.compras.filter((c) => !c.pedido && c.pedirAntes <= viernes);
  const comprasVencidas = comprasSemana.filter((c) => c.pedirAntes < hoy);
  const sobrecargas: { centro: string; pct: number; semana: string }[] = [];
  for (const [desde, semana] of [[lunesDe(hoy), "esta semana"], [sumarHabiles(viernes, 1, cal), "la semana que viene"]] as const) {
    for (const c of centros) {
      const { pct } = cargaSemana(r, c.id, proximosHabiles(desde, 5, cal), semana === "esta semana");
      if (pct > 100) sobrecargas.push({ centro: c.nombre, pct, semana });
    }
  }
  const enRiesgo = r.proyectos.filter((p) => p.diferenciaDias > 0);
  const sinRuta = r.proyectos.reduce((s, p) => s + p.piezasSinRuta, 0);
  const decisiones: { texto: string; boton: string; href: string; urgente?: boolean }[] = [
    ...r.tandas
      .filter((t) => t.otPiezaIds.length)
      .map((t) => ({
        texto: `${t.otPiezaIds.length} piezas de ${r.proyectos.find((p) => p.id === t.proyectoId)?.codigo} entran en el horizonte de liberación`,
        boton: "Liberarlas",
        href: `/liberacion#${t.proyectoId}`,
      })),
    ...(comprasSemana.length
      ? [{ texto: `${comprasSemana.length} compras hay que pedirlas esta semana${comprasVencidas.length ? ` (${comprasVencidas.length} ya vencidas)` : ""}`, boton: "Ir a Pedir esta semana", href: "/pedir", urgente: comprasVencidas.length > 0 }]
      : []),
    ...sobrecargas.map((s) => ({ texto: `${s.centro} está al ${s.pct}% de su capacidad ${s.semana}`, boton: "Ver el plan", href: `/planificacion${s.semana === "esta semana" ? "" : `?semana=${sumarHabiles(viernes, 1, cal)}`}`, urgente: true })),
    ...enRiesgo.map((p) => ({ texto: `${p.codigo} termina ${p.diferenciaDias} día${p.diferenciaDias === 1 ? "" : "s"} hábil${p.diferenciaDias === 1 ? "" : "es"} después de la entrega (${fechaCorta(p.entrega)})`, boton: "Ver proyecto", href: `/proyectos/${p.id}`, urgente: true })),
    ...sinPlan
      .filter((p) => p.estado === "borrador" && !["entregado", "terminado"].includes(p.estado))
      .map((p) => ({ texto: `${p.codigo} no tiene fecha de entrega: no se puede planificar`, boton: "Cargar la fecha", href: `/proyectos/${p.id}` })),
    ...stockBajo.slice(0, 3).map((s) => ({
      texto: `${s.piezaNombre} quedó debajo del mínimo (${s.disponible} de ${s.minimo})`,
      boton: "Generar OT para stock",
      href: `/ot/nueva?tipo=suelta&destino=stock&pieza=${encodeURIComponent(s.piezaId)}&cantidad=${Math.max(1, s.minimo - s.disponible)}`,
    })),
    ...(sinRuta ? [{ texto: `${sinRuta} piezas de proyectos activos no tienen hoja de ruta: se planifican con un tiempo genérico`, boton: "Completar datos", href: "/admin/completitud" }] : []),
    ...(propuestas[0].n ? [{ texto: `${propuestas[0].n} artículos parecen comerciales (motores, reductores, correas…) y figuran como fabricados`, boton: "Revisar la propuesta", href: "/admin/completitud#reclasificar" }] : []),
  ];
  const pctEst = Math.max(0, ...r.proyectos.map((p) => p.pctEstimado));

  return (
    <div className="space-y-8">
      <PageHeader
        titulo={`Hola, ${usuario.nombre}`}
        descripcion={esHoy ? "Lo que hay que hacer hoy, lo que está trabado y lo que hay que decidir." : `Hoy no es día hábil: esto es lo del ${fechaCorta(hoy)}.`}
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
        <div className="mt-2">
          <Estimado pct={pctEst} />
        </div>
      </PageHeader>

      <Bloque
        titulo="Qué se hace hoy"
        resumen={`${deHoy.length} tareas · ${porCentro.size} centros${atrasadasHoy ? ` · ${atrasadasHoy} atrasadas` : ""}`}
        vacio="Nada planificado para hoy."
        vacioVerde={false}
        hay={deHoy.length > 0}
      >
        {[...porCentro].map(([centroId, ts]) => (
          <div key={centroId} className="tarjeta overflow-hidden">
            <div className="px-4 py-2 bg-surface-muted text-sm font-semibold">{nombreCentro(centroId)}</div>
            <ul className="divide-y divide-border">
              {ts.sort((a, b) => a.holgura - b.holgura).map((t) => (
                <li key={t.clave} className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {t.paso} — {t.piezaNombre} × {t.cantidad}
                    </div>
                    <div className="text-xs text-foreground-muted">
                      {t.proyectoCodigo} · {t.piezaCodigo} · {Math.round(t.horasPorDia[hoy] * 10) / 10} h hoy · {t.operarioId ? operarios.get(t.operarioId) : "sin operario"}
                    </div>
                  </div>
                  <EstadoTareaChip estado={t.estado} />
                  <Holgura nivel={t.nivel} dias={t.holgura} corto />
                  <div className="flex gap-2">
                    <Link href={`/planificacion?ver=${encodeURIComponent(t.clave)}`} className="btn-secundario btn-sm">
                      Mover
                    </Link>
                    <Link href={`/maestros/pieza/${t.piezaCodigo}`} className="btn-secundario btn-sm">
                      Ver plano
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Bloque>

      <Bloque titulo="Qué está trabado" resumen={trabadas.length ? `${trabadas.length} tareas no pueden avanzar` : ""} vacio="Nada trabado." vacioVerde hay={trabadas.length > 0}>
        {[...porMotivo].map(([motivo, ts]) => (
          <div key={motivo} className="tarjeta p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="badge-estado badge-alerta">{motivo}</span>
                <span className="text-sm ml-2">{ts.length} tarea{ts.length === 1 ? "" : "s"}</span>
              </div>
              {motivo === "Falta material" && (
                <Link href="/pedir" className="btn btn-sm">
                  Ver compra
                </Link>
              )}
              {motivo === "Falta plano" && (
                <Link href="/liberacion" className="btn btn-sm">
                  Avisar a ingeniería
                </Link>
              )}
              {motivo === "Tercerizado demorado" && (
                <Link href="/tercerizados#esperando" className="btn btn-sm">
                  Reclamar al proveedor
                </Link>
              )}
            </div>
            <ul className="mt-2 text-sm text-foreground-muted space-y-0.5">
              {ts.slice(0, 5).map((t) => (
                <li key={t.clave}>
                  {t.proyectoCodigo} · {t.piezaNombre} — {t.paso}
                </li>
              ))}
              {ts.length > 5 && <li>y {ts.length - 5} más</li>}
            </ul>
            {motivo === "Tercerizado demorado" && provs.some((p) => p.telefono || p.email) && (
              <p className="text-xs mt-2">Contactos: {provs.filter((p) => p.telefono || p.email).map((p) => `${p.razonSocial} ${p.telefono ?? ""} ${p.email ?? ""}`).join(" · ")}</p>
            )}
          </div>
        ))}
      </Bloque>

      <Bloque titulo="Qué hay que decidir" resumen={decisiones.length ? `${decisiones.length} decisiones` : ""} vacio="Nada para decidir." vacioVerde hay={decisiones.length > 0}>
        <ul className="tarjeta divide-y divide-border">
          {decisiones.map((d, i) => (
            <li key={i} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${d.urgente ? "bg-[#dc2626]" : "bg-accent"}`} />
                {d.texto}
              </span>
              <Link href={d.href} className={d.urgente ? "btn btn-sm" : "btn-secundario btn-sm"}>
                {d.boton} →
              </Link>
            </li>
          ))}
        </ul>
      </Bloque>
      <p className="text-xs text-foreground-muted">
        Plan calculado en {plan.ms} ms · {r.tareas.length} tareas de {r.proyectos.length} proyectos activos · hoy {fechaCorta(entrada.hoy)}
      </p>
    </div>
  );
}

function Bloque({ titulo, resumen, vacio, vacioVerde, hay, children }: { titulo: string; resumen: string; vacio: string; vacioVerde: boolean; hay: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {resumen && <span className="text-sm text-foreground-muted">{resumen}</span>}
      </div>
      {!hay ? (
        <p className={`text-sm ${vacioVerde ? "text-[var(--estado-terminada-fg)] font-medium" : "text-foreground-muted"}`}>
          {vacioVerde ? "✓ " : ""}
          {vacio}
        </p>
      ) : (
        children
      )}
    </section>
  );
}
