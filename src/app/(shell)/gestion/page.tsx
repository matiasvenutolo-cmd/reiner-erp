import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EsqueletoBloques } from "@/components/ui/EsqueletoBloques";
import { Vacio } from "@/components/ui/Aviso";
import { ListaGestion } from "@/components/gestion/ListaGestion";
import { ParaEnviar } from "@/components/gestion/ParaEnviar";
import { FiltrosGestion } from "@/components/gestion/FiltrosGestion";
import { getGestion, type CargaOperario, type OrdenEnCurso } from "@/lib/data/gestion";
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

function Barra({ ocupadas, disponibles, label }: { ocupadas: number; disponibles: number; label: string }) {
  // Sin horas disponibles (fin de semana, feriado o ausencia): la barra queda vacía, salvo que tenga algo asignado.
  const pct = disponibles > 0 ? Math.min(100, (ocupadas / disponibles) * 100) : ocupadas > 0 ? 100 : 0;
  return (
    <div className="flex items-center gap-2 text-[11px] text-foreground-muted">
      <span className="w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-surface-muted overflow-hidden" title={`${Math.round(ocupadas)} de ${Math.round(disponibles)} h`}>
        <div className={`h-full ${pct >= 100 ? "bg-naranja" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PanelCarga({ carga, actual }: { carga: CargaOperario[]; actual?: string }) {
  return (
    <aside className="tarjeta p-4 space-y-3">
      <div>
        <h2 className="font-semibold">Carga por persona</h2>
        <p className="text-xs text-foreground-muted">Sólo para ver quién tiene espacio. Tocá un nombre para ver su cola.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {carga.map((c) => (
          <li key={c.id}>
            <Link href={actual === c.id ? "/gestion" : `/gestion?operario=${c.id}`} className={`block rounded-md px-2 py-1.5 -mx-2 hover:bg-surface-muted ${actual === c.id ? "bg-accent-soft" : ""}`}>
              <div className="text-sm">
                <span className="font-semibold">{c.nombre}</span>
                <span className="text-foreground-muted"> · {Math.round(c.horasPendientes)} h · {c.texto}</span>
              </div>
              <div className="mt-1 space-y-1">
                <Barra label="Esta semana" ocupadas={c.esta.ocupadas} disponibles={c.esta.disponibles} />
                <Barra label="La próxima" ocupadas={c.proxima.ocupadas} disponibles={c.proxima.disponibles} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
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
  const { filas, paraEnviar, ordenes: enCurso, operarios, centros, carga, hoy } = await getGestion();
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
      <PanelCarga carga={carga} actual={sp.operario} />
    </div>
  );
}
