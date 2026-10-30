import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EsqueletoBloques } from "@/components/ui/EsqueletoBloques";
import { Vacio } from "@/components/ui/Aviso";
import { ListaGestion } from "@/components/gestion/ListaGestion";
import { FiltrosGestion } from "@/components/gestion/FiltrosGestion";
import { getGestion, type CargaOperario } from "@/lib/data/gestion";

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
      <PageHeader titulo="Gestión" descripcion="Asigná cada tarea eligiendo el operario en su fila. El orden de la cola de cada uno es el que ve en su tablet." />
      <Suspense fallback={<EsqueletoBloques bloques={5} />}>
        <Contenido sp={sp} />
      </Suspense>
    </div>
  );
}

function Barra({ ocupadas, disponibles, label }: { ocupadas: number; disponibles: number; label: string }) {
  const pct = disponibles > 0 ? Math.min(100, (ocupadas / disponibles) * 100) : 100;
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
    <aside className="tarjeta p-4 space-y-3 h-fit">
      <div>
        <h2 className="font-semibold">Carga por persona</h2>
        <p className="text-xs text-foreground-muted">Sólo para ver quién tiene espacio. Tocá un nombre para ver su cola.</p>
      </div>
      <ul className="space-y-3">
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

async function Contenido({ sp }: { sp: Params }) {
  const { filas, operarios, centros, carga } = await getGestion();
  const ordenes = [...new Map(filas.map((f) => [f.ordenId, { id: f.ordenId, nombre: f.orden }])).values()];
  let lista = filas;
  if (sp.centro) lista = lista.filter((f) => f.centroId === sp.centro);
  if (sp.orden) lista = lista.filter((f) => f.ordenId === sp.orden);
  if (sp.sin === "1") lista = lista.filter((f) => f.tipo === "interno" && !f.operarioId);
  // Con un operario elegido se ve su cola, en el orden en que la va a hacer.
  if (sp.operario) lista = lista.filter((f) => f.operarioId === sp.operario).sort((a, b) => (a.lugar ?? 1e9) - (b.lugar ?? 1e9));
  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_20rem] gap-4 items-start">
      <div className="space-y-3 min-w-0">
        <FiltrosGestion centros={centros} operarios={operarios} ordenes={ordenes} />
        {lista.length === 0 ? (
          <Vacio>{filas.length === 0 ? "No hay tareas pendientes: cuando se confirme una orden, sus tareas aparecen acá." : "No hay tareas con estos filtros."}</Vacio>
        ) : (
          <ListaGestion filas={lista} operarios={operarios} centros={centros} operarioFiltro={sp.operario ?? null} />
        )}
      </div>
      <PanelCarga carga={carga} actual={sp.operario} />
    </div>
  );
}
