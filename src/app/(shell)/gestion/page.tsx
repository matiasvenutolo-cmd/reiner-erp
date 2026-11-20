import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EsqueletoBloques } from "@/components/ui/EsqueletoBloques";
import { Aviso, Vacio } from "@/components/ui/Aviso";
import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";
import { getDesviosAbiertos } from "@/lib/data/desvios";
import { decidirDesvioAction } from "@/app/actions/gestion";
import { ListaGestion } from "@/components/gestion/ListaGestion";
import { ParaEnviar } from "@/components/gestion/ParaEnviar";
import { FiltrosGestion } from "@/components/gestion/FiltrosGestion";
import { getGestion, type OrdenEnCurso, type FilaGestion } from "@/lib/data/gestion";
import { CargaTrabajo } from "@/components/gestion/CargaTrabajo";
import { fechaCorta } from "@/lib/formato";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { avisoPlanta, usuario, otPieza, pieza } from "@/lib/db/schema";
import { resolverAvisoAction } from "@/app/actions/operario";

export const dynamic = "force-dynamic";

type Params = { centro?: string; operario?: string; orden?: string; sin?: string; ok?: string; error?: string };

/**
 * Gestión (reorganización 30/10 §3): quién hace qué y en qué orden. Reemplaza la asignación del Plan de la
 * semana. No asigna fechas por día, no obliga a confirmar una semana y no esconde tareas por fecha ni por
 * materia prima.
 */
export default async function GestionPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  return (
    <div className="space-y-4">
      <PageHeader titulo="Gestión" descripcion="Mandá piezas a producción, ordená la cola de cada centro arrastrando las tareas y elegí quién hace cada una. Ese orden es el que siguen el calendario y la tablet." />
      {sp.ok && <Aviso tipo="ok">{sp.ok}</Aviso>}
      {sp.error && <Aviso tipo="error">{sp.error}</Aviso>}
      <Suspense fallback={<EsqueletoBloques bloques={5} />}>
        <Contenido sp={sp} />
      </Suspense>
    </div>
  );
}

const TIPO_AVISO: Record<string, string> = { sin_tareas: "Se quedó sin tareas", falta_plano: "Falta un plano (para ingeniería)", volvio_tercerizado: "Volvió del tercerizado", otro: "Aviso" };

/** Avisos de la planta (tanda 2, 05/11): lo que el operario manda desde la tablet le llega acá al jefe de planta. */
async function AvisosPlanta() {
  const avisos = await db
    .select({ id: avisoPlanta.id, tipo: avisoPlanta.tipo, texto: avisoPlanta.texto, cuando: avisoPlanta.createdAt, quien: usuario.nombre, pieza: pieza.nombre })
    .from(avisoPlanta)
    .innerJoin(usuario, eq(usuario.id, avisoPlanta.usuarioId))
    .leftJoin(otPieza, eq(otPieza.id, avisoPlanta.otPiezaId))
    .leftJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .where(and(isNull(avisoPlanta.resueltoAt)))
    .orderBy(desc(avisoPlanta.createdAt));
  const desvios = await getDesviosAbiertos();
  if (!avisos.length && !desvios.length) return null;
  const hora = (d: Date) => d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });
  return (
    <section className="rounded-lg border border-naranja-borde bg-naranja-tenue px-4 py-3 space-y-2">
      <h2 className="font-semibold text-naranja-fg">Avisos · {avisos.length + desvios.length}</h2>
      <ul className="space-y-1.5">
        {/* Prueba 19/11: una pieza que salió mal espera la decisión: reprocesarla o mandarla a scrap y rehacerla. */}
        {desvios.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-semibold">{d.quien}</span>
            <span className="badge-estado bg-rojo-bg text-rojo-fg">Salió mal</span>
            <span className="flex-1 min-w-48">
              {d.pieza.charAt(0).toUpperCase() + d.pieza.slice(1)} ({d.codigo}): {d.texto.replace(/^Salió mal /, "salió mal ")}.
            </span>
            <span className="text-xs text-foreground-muted">{hora(d.cuando)}</span>
            <form action={decidirDesvioAction}>
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="decision" value="reprocesar" />
              <button className="btn btn-sm">Reprocesar</button>
            </form>
            <form action={decidirDesvioAction}>
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="decision" value="scrap" />
              <ConfirmarBoton mensaje={`¿Mandar ${d.codigo} a scrap y rehacerla desde el paso 1? Se crea una pieza nueva en la misma orden y, si hace falta, pide material a Compras.`} className="btn-secundario btn-sm">
                Scrap y rehacer
              </ConfirmarBoton>
            </form>
          </li>
        ))}
        {avisos.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-semibold">{a.quien}</span>
            <span className="badge-estado bg-naranja-bg text-naranja-fg">{TIPO_AVISO[a.tipo] ?? "Aviso"}</span>
            <span className="flex-1 min-w-48">{a.texto}</span>
            <span className="text-xs text-foreground-muted">{hora(a.cuando)}</span>
            <form action={resolverAvisoAction}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="volver" value="/gestion" />
              <button className="btn-secundario btn-sm">Listo, resuelto</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Órdenes en curso, con su fecha estimada de finalización (prueba 1: en lugar de "¿Llegamos?"). */
function OrdenesEnCurso({ ordenes, hoy }: { ordenes: OrdenEnCurso[]; hoy: string }) {
  if (!ordenes.length) return null;
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ordenes.map((o) => (
        <div key={o.id}>
        <Link href={`/proyectos/${o.id}`} className="tarjeta block px-4 py-3 hover:border-accent transition-colors">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold truncate">{o.nombre}</div>
              <div className="text-xs text-foreground-muted">
                {o.codigo} · {o.tareas} tarea{o.tareas === 1 ? "" : "s"} en el taller{o.porEnviar ? ` · ${o.porEnviar} por enviar` : ""}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] text-foreground-muted">Fin estimado</div>
              <div className="font-semibold">{fechaCorta(o.finEstimado, hoy)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-foreground-muted">
            <div className="h-1.5 flex-1 rounded-full bg-surface-muted overflow-hidden">
              <div className="h-full bg-accent" style={{ width: `${o.avancePct}%` }} />
            </div>
            {o.avancePct}%
          </div>
        </Link>
        <Link href={`/proyectos/${o.id}/informe`} className="block text-xs text-accent hover:underline mt-1 px-1">
          Informe para imprimir →
        </Link>
        </div>
      ))}
    </section>
  );
}

async function Contenido({ sp }: { sp: Params }) {
  const { filas, paraEnviar, ordenes: enCurso, operarios, centros, carga, cargaDia, hoy } = await getGestion();
  const ordenes = [...new Map(filas.map((f) => [f.ordenId, { id: f.ordenId, nombre: f.orden }])).values()];
  let lista = filas;
  if (sp.centro) lista = lista.filter((f) => f.centroId === sp.centro);
  if (sp.orden) lista = lista.filter((f) => f.ordenId === sp.orden);
  if (sp.sin === "1") lista = lista.filter((f) => f.tipo === "interno" && !f.operarioId);
  if (sp.operario) lista = lista.filter((f) => f.operarioId === sp.operario);
  // Reunión 20/11: una cola por centro, en su orden (también lo que espera el paso anterior, en gris). Se ordena
  // arrastrando cuando se ve la cola entera del centro; con otros filtros es sólo para ver.
  const ordenable = !sp.orden && !sp.sin && !sp.operario;
  const internas = lista.filter((f) => f.tipo === "interno");
  const grupos: { id: string; titulo: string; filas: FilaGestion[]; ordenable: boolean }[] = [
    ...centros.map((c) => ({ id: c.id, titulo: c.nombre, filas: internas.filter((f) => f.centroId === c.id), ordenable })),
    { id: "sin-centro", titulo: "Sin centro", filas: internas.filter((f) => !f.centroId || !centros.some((c) => c.id === f.centroId)), ordenable: false },
    { id: "tercerizados", titulo: "Tercerizados", filas: lista.filter((f) => f.tipo !== "interno"), ordenable: false },
  ].filter((g) => g.filas.length);
  return (
    <div className="space-y-4">
      <AvisosPlanta />
      <OrdenesEnCurso ordenes={enCurso} hoy={hoy} />
      {paraEnviar.length > 0 && <ParaEnviar filas={paraEnviar} />}
      <FiltrosGestion centros={centros} operarios={operarios} ordenes={ordenes} />
      {lista.length === 0 ? (
        <Vacio>{filas.length === 0 ? paraEnviar.length ? "Todavía no hay tareas para asignar: mandá piezas a producción desde arriba." : "No hay tareas pendientes: cuando se confirme una orden, sus piezas aparecen acá para enviar a producción." : "No hay tareas con estos filtros."}</Vacio>
      ) : (
        <>
          {!ordenable && <p className="text-xs text-foreground-muted">Para ordenar una cola, sacá los filtros de orden, operario y sin asignar.</p>}
          {grupos.map((g) => {
            const espera = g.filas.filter((f) => f.estado === "espera").length;
            return (
              <ListaGestion
                key={g.id}
                titulo={
                  <>
                    {g.titulo}{" "}
                    <span className="text-foreground-muted font-normal">
                      · {g.id === "tercerizados" ? g.filas.length : `${g.filas.length - espera} para hacer ya${espera ? ` · ${espera} ${espera === 1 ? "espera" : "esperan"} el paso anterior` : ""}`}
                    </span>
                  </>
                }
                filas={g.filas}
                operarios={operarios}
                centros={centros}
                ordenable={g.ordenable && g.filas.length > 1}
                hoy={hoy}
              />
            );
          })}
        </>
      )}
      <CargaTrabajo carga={cargaDia} resumen={carga} operarios={operarios} centros={centros} hoy={hoy} />
    </div>
  );
}
