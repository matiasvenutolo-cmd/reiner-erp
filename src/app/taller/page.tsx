import Link from "next/link";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/session";
import { getOperacionAbierta } from "@/lib/data/ejecucion";
import { store } from "@/lib/data/store";
import { getPieza, getConjunto, getRoutingPieza } from "@/lib/data/maestros";
import { estadoDePieza } from "@/lib/data/ot";

export default async function TallerPage() {
  const usuario = await getUsuarioActual();
  const abierta = await getOperacionAbierta(usuario.id);
  if (abierta) redirect(`/taller/${abierta.otPiezaId}`);

  const candidatas = await Promise.all(
    store.otPieza.map(async (otPieza) => {
      const { estado, sinRouting } = await estadoDePieza(otPieza);
      if (estado === "terminada") return null;
      const pieza = await getPieza(otPieza.piezaId);
      const conjunto = pieza ? await getConjunto(pieza.conjuntoId) : null;
      const routing = await getRoutingPieza(otPieza.piezaId);
      return { otPieza, pieza, conjunto, estado, sinRouting, pasos: routing.length };
    }),
  );
  const pendientes = candidatas.filter((c): c is NonNullable<typeof c> => c !== null);

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
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-foreground-muted">{otPieza.codigo}</span>
                <span className={`badge-estado ${estado === "en_curso" ? "badge-en_curso" : "badge-pendiente"}`}>
                  {estado === "en_curso" ? "En curso" : `${pasos} operaciones`}
                </span>
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
