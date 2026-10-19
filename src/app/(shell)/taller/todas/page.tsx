import Link from "next/link";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/session";
import { getOperacionesAbiertas, getHabilitacionOperario } from "@/lib/data/ejecucion";
import { getCandidatasTaller, pasoHabilitadoParaOperario } from "@/lib/data/produccion";

export const dynamic = "force-dynamic";

export default async function TallerPage() {
  const usuario = await getUsuarioActual();
  const abiertas = await getOperacionesAbiertas(usuario.id);
  const enCurso = abiertas.find((a) => !a.pausada);
  if (enCurso) redirect(`/taller/${enCurso.otPiezaId}`);
  const pausadas = abiertas.filter((a) => a.pausada);
  const otPiezaIdsPausadas = new Set(pausadas.map((p) => p.otPiezaId));

  const [candidatas, { centroIds, asignadasHoy }] = await Promise.all([getCandidatasTaller(), getHabilitacionOperario(usuario.id)]);
  const asignadaHoy = (c: (typeof candidatas)[number]) =>
    asignadasHoy.some((a) => a.otPiezaId === c.otPieza.id && (a.operacionId === null || a.operacionId === c.pasoActual.id));

  // Misma regla que la ficha y el inicio en el servidor (pasoHabilitadoParaOperario):
  // lo asignado para hoy, o un paso interno de alguno de sus centros. Lo que espera
  // una compra o está afuera en un tercerizado no es trabajo de taller.
  const pendientes = candidatas
    .filter((c) => !otPiezaIdsPausadas.has(c.otPieza.id))
    .filter((c) => pasoHabilitadoParaOperario(c.pasoActual, c.otPieza.id, centroIds, asignadasHoy))
    .sort((a, b) => Number(asignadaHoy(b)) - Number(asignadaHoy(a)));

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <Link href="/taller" className="text-sm text-accent hover:underline">
          ← Mi próxima tarea
        </Link>
        <h1 className="text-xl font-semibold mt-1">Piezas de mis centros</h1>
        <p className="text-sm text-foreground-muted mt-1">Todo lo que se puede hacer en tus centros, aunque no esté en tu plan de hoy.</p>
      </div>

      {pausadas.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">En pausa ({pausadas.length})</h2>
          {pausadas.map((p) => (
            <Link
              key={p.id}
              href={`/taller/${p.otPiezaId}`}
              className="block bg-surface border border-naranja-borde rounded-xl p-4 hover:border-accent active:scale-[0.99] transition"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-foreground-muted">{p.otPiezaCodigo}</span>
                <span className="badge-estado badge-pendiente">En pausa · {p.tipo === "setup" ? "setup" : "fabricación"}</span>
              </div>
              <div className="font-semibold mt-1">{p.piezaNombre}</div>
              <div className="text-sm text-foreground-muted">Tocá para retomarla</div>
            </Link>
          ))}
        </div>
      )}

      {pendientes.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-6 text-center text-foreground-muted text-sm">
          No hay piezas pendientes de fabricar en este momento.
        </div>
      ) : (
        <div className="space-y-2">
          {pausadas.length > 0 && <h2 className="text-sm font-semibold pt-2">Para empezar</h2>}
          {pendientes.map((c) => (
            <Link
              key={c.otPieza.id}
              href={`/taller/${c.otPieza.id}`}
              className="block bg-surface border border-border rounded-xl p-4 hover:border-accent active:scale-[0.99] transition"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-foreground-muted">{c.otPieza.codigo}</span>
                <div className="flex items-center gap-1.5">
                  {asignadaHoy(c) && <span className="badge-estado badge-terminada">Asignado hoy</span>}
                  <span className={`badge-estado ${c.estado === "en_curso" ? "badge-en_curso" : "badge-pendiente"}`}>
                    {c.estado === "en_curso" ? "En curso" : `${c.pasos} operaciones`}
                  </span>
                </div>
              </div>
              <div className="font-semibold mt-1">{c.piezaNombre}</div>
              <div className="text-sm text-foreground-muted">
                {c.pasoActual.nombre} · {c.cantidadActual} pieza{c.cantidadActual === 1 ? "" : "s"} a procesar
              </div>
              <div className="text-xs text-foreground-muted">{c.conjuntoNombre}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
