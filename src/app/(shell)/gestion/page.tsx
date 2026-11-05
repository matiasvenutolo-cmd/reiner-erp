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
