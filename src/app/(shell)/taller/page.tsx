import Link from "next/link";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/session";
import { getOperacionAbierta } from "@/lib/data/ejecucion";
import { getCentrosDeUsuario, getCandidatasTaller } from "@/lib/data/produccion";
import { getAsignacionesDeHoy } from "@/lib/data/planificacion";

export const dynamic = "force-dynamic";

export default async function TallerPage() {
  const usuario = await getUsuarioActual();
  const abierta = await getOperacionAbierta(usuario.id);
  if (abierta) redirect(`/taller/${abierta.otPiezaId}`);

  const [candidatas, asignadasHoy, centrosDelUsuario] = await Promise.all([
    getCandidatasTaller(),
    getAsignacionesDeHoy(usuario.id),
    getCentrosDeUsuario(usuario.id),
  ]);
  const otPiezaIdsAsignadosHoy = new Set(asignadasHoy.map((a) => a.otPiezaId));
  const centroIdsDelUsuario = new Set(centrosDelUsuario.map((c) => c.id));

  // Filtro por centro de trabajo (Release 2, pedido de Horacio): sin centros
  // asignados el operario ve todo; con uno o más (de varios a varios desde la
  // 2ª ronda de Fase 2), sólo lo que está en alguno de sus centros ahora
  // mismo. Lo que espera una compra o está afuera en un tercerizado no es
  // trabajo de taller y no se lista. Excepción: si Planificación le asignó
  // esta pieza para HOY, se ve igual — la asignación explícita manda.
  const pendientes = candidatas
    .filter((c) => {
      if (otPiezaIdsAsignadosHoy.has(c.otPieza.id)) return true;
      if (c.tipoPasoActual !== "interno") return false;
      if (centroIdsDelUsuario.size === 0) return true;
      return c.centroActualId !== null && centroIdsDelUsuario.has(c.centroActualId);
    })
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
          {pendientes.map(({ otPieza, piezaNombre, conjuntoNombre, estado, pasos }) => (
            <Link
              key={otPieza.id}
              href={`/taller/${otPieza.id}`}
              className="block bg-surface border border-border rounded-xl p-4 hover:border-accent active:scale-[0.99] transition"
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
              <div className="font-semibold mt-1">{piezaNombre}</div>
              <div className="text-sm text-foreground-muted">
                {conjuntoNombre} · a fabricar: {otPieza.cantidadAFabricar}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
