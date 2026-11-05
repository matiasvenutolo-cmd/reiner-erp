import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EsqueletoBloques } from "@/components/ui/EsqueletoBloques";
import { Vacio } from "@/components/ui/Aviso";
import { ListaGestion } from "@/components/gestion/ListaGestion";
import { ParaEnviar } from "@/components/gestion/ParaEnviar";
import { FiltrosGestion } from "@/components/gestion/FiltrosGestion";
import { getGestion, type OrdenEnCurso } from "@/lib/data/gestion";
import { CargaTrabajo } from "@/components/gestion/CargaTrabajo";
import { fechaCorta } from "@/lib/formato";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { avisoPlanta, usuario, otPieza, pieza } from "@/lib/db/schema";
import { resolverAvisoAction } from "@/app/actions/operario";

export const dynamic = "force-dynamic";

type Params = { centro?: string; operario?: string; orden?: string; sin?: string };

/**
 * Gestión (reorganización 30/10 §3): quién hace qué y en qué orden. Reemplaza la asignación del Plan de la
 * semana. No asigna fechas por día, no obliga a confirmar una semana y no esconde tareas por fecha ni por
 * materia prima.
 */
export default async function GestionPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  return (
    <div className="space-y-4">
      <PageHeader titulo="Gestión" descripcion="Mandá piezas a producción y asigná cada tarea eligiendo el operario en su fila. El orden de la cola de cada uno es el que ve en su tablet." />
      <Suspense fallback={<EsqueletoBloques bloques={5} />}>
        <Contenido sp={sp} />
      </Suspense>
    </div>
  );
}

const TIPO_AVISO: Record<string, string> = { sin_tareas: "Se quedó sin tareas", falta_plano: "Falta un plano (para ingeniería)", otro: "Aviso" };

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
  if (!avisos.length) return null;
  const hora = (d: Date) => d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });
  return (
    <section className="rounded-lg border border-naranja-borde bg-naranja-tenue px-4 py-3 space-y-2">
      <h2 className="font-semibold text-naranja-fg">Avisos de la planta · {avisos.length}</h2>
      <ul className="space-y-1.5">
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
        <Link key={o.id} href={`/proyectos/${o.id}`} className="tarjeta px-4 py-3 hover:border-accent transition-colors">
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
  // Con un operario elegido se ve su cola, en el orden en que la va a hacer (con las que esperan, para ordenarlas).
  if (sp.operario) lista = lista.filter((f) => f.operarioId === sp.operario).sort((a, b) => (a.lugar ?? 1e9) - (b.lugar ?? 1e9));
  // Prueba 1 (05/11): primero lo que se puede hacer ya; lo que espera el paso anterior va aparte, plegado.
  const ahora = sp.operario ? lista : lista.filter((f) => f.estado !== "espera");
  const despues = sp.operario ? [] : lista.filter((f) => f.estado === "espera");
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
          <section className="space-y-2">
            <h2 className="font-semibold">
              {sp.operario ? "Su cola" : "Para asignar ahora"} <span className="text-foreground-muted font-normal">· {ahora.length}</span>
            </h2>
            {ahora.length ? (
              <ListaGestion filas={ahora} operarios={operarios} centros={centros} operarioFiltro={sp.operario ?? null} hoy={hoy} />
            ) : (
              <Vacio neutro>Nada se puede empezar ya: todas las tareas esperan el paso anterior.</Vacio>
            )}
          </section>
          {despues.length > 0 && (
            <details className="space-y-2">
              <summary className="cursor-pointer font-semibold">
                Después: esperan el paso anterior <span className="text-foreground-muted font-normal">· {despues.length}</span>
                <span className="block text-xs font-normal text-foreground-muted">Se pueden asignar por adelantado; en la tablet aparecen cuando termina el paso anterior.</span>
              </summary>
              <div className="mt-2">
                <ListaGestion filas={despues} operarios={operarios} centros={centros} operarioFiltro={null} hoy={hoy} />
              </div>
            </details>
          )}
        </>
      )}
      <CargaTrabajo carga={cargaDia} resumen={carga} operarios={operarios} centros={centros} hoy={hoy} />
    </div>
  );
}
