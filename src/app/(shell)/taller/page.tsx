import Link from "next/link";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/session";
import { getOperacionAbierta } from "@/lib/data/ejecucion";
import { getPieza, getConjunto } from "@/lib/data/maestros";
import { getCentrosDeUsuario } from "@/lib/data/produccion";
import { getEstadoYOperacionActual, listarTodasLasOtPieza } from "@/lib/data/ot";
import { getAsignacionesDeHoy } from "@/lib/data/planificacion";

export default async function TallerPage() {
  const usuario = await getUsuarioActual();
  const abierta = await getOperacionAbierta(usuario.id);
  if (abierta) redirect(`/taller/${abierta.otPiezaId}`);

  const [todasLasOtPieza, asignadasHoy, centrosDelUsuario] = await Promise.all([
    listarTodasLasOtPieza(),
    getAsignacionesDeHoy(usuario.id),
    getCentrosDeUsuario(usuario.id),
  ]);
  const otPiezaIdsAsignadosHoy = new Set(asignadasHoy.map((a) => a.otPiezaId));
  const centroIdsDelUsuario = new Set(centrosDelUsuario.map((c) => c.id));
  const candidatas = await Promise.all(
    todasLasOtPieza.map(async (otPieza) => {
      const { estado, sinRouting, operacionActual, routing } = await getEstadoYOperacionActual(otPieza);
      if (estado === "terminada") return null;
      // Filtro por centro de trabajo (Release 2, pedido de Horacio en
      // taller, docs/05-backlog-release-2.md §5): sin centros asignados el
      // operario ve todo, como antes. Con uno o más centros asignados
      // (de varios a varios desde la 2ª ronda de Fase 2 — un operario puede
      // ocupar dos puestos), sólo lo que está en alguno de sus centros
      // ahora mismo — no lo que va a llegar más adelante (eso se ve en
      // /centros-trabajo, pensado para producción, no para el operario).
      //
      // Excepción: si Planificación le asignó esta pieza puntual para HOY,
      // se ve igual aunque esté en otro centro — el filtro de centro es la
      // regla por defecto, no algo que deba tapar una asignación explícita
      // de hoy (antes la tapaba, era la pregunta abierta del backlog §17).
      const asignadaHoy = otPiezaIdsAsignadosHoy.has(otPieza.id);
      const centroActual = operacionActual?.proceso.centroTrabajoId ?? null;
      if (!asignadaHoy && centroIdsDelUsuario.size > 0 && (!centroActual || !centroIdsDelUsuario.has(centroActual))) {
        return null;
      }
      const pieza = await getPieza(otPieza.piezaId);
      const conjunto = pieza ? await getConjunto(pieza.conjuntoId) : null;
      return { otPieza, pieza, conjunto, estado, sinRouting, pasos: routing.length };
    }),
  );
  const pendientes = candidatas
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => Number(otPiezaIdsAsignadosHoy.has(b.otPieza.id)) - Number(otPiezaIdsAsignadosHoy.has(a.otPieza.id)));

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Hola, {usuario.nombre}</h1>
        <p className="text-sm text-foreground-muted mt-1">Elegí en qué pieza vas a trabajar.</p>
      </div>

      {pendientes.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-6 text-center text-foreground-muted text-sm">
          No hay piezas pendientes de fabricar en este momento.
        </div>
      ) : (
        <div className="space-y-2">
          {pendientes.map(({ otPieza, pieza, conjunto, estado, sinRouting, pasos }) => (
            <Link
              key={otPieza.id}
              href={sinRouting ? "#" : `/taller/${otPieza.id}`}
              aria-disabled={sinRouting}
              className={`block bg-surface border rounded-xl p-4 ${
                sinRouting ? "opacity-50 pointer-events-none border-border" : "border-border hover:border-accent active:scale-[0.99]"
              } transition`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-foreground-muted">{otPieza.codigo}</span>
                <div className="flex items-center gap-1.5">
                  {otPiezaIdsAsignadosHoy.has(otPieza.id) && <span className="badge-estado badge-terminada">Asignado hoy</span>}
                  <span className={`badge-estado ${estado === "en_curso" ? "badge-en_curso" : "badge-pendiente"}`}>
                    {estado === "en_curso" ? "En curso" : `${pasos} operaciones`}
                  </span>
                </div>
              </div>
              <div className="font-semibold mt-1">{pieza?.nombre}</div>
              <div className="text-sm text-foreground-muted">
                {conjunto?.nombre} · a fabricar: {otPieza.cantidadAFabricar}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
