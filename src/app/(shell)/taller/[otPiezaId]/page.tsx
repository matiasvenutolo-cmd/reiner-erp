import Link from "next/link";
import { notFound } from "next/navigation";
import { getUsuarioActual } from "@/lib/session";
import { getOtPieza, getEstadoYOperacionActual } from "@/lib/data/ot";
import { getPieza, getConjunto } from "@/lib/data/maestros";
import { getOperacionAbierta, getParadaAbierta, getTiposParada, esUltimaOperacion } from "@/lib/data/ejecucion";
import { EstadoBadge } from "@/components/EstadoBadge";
import {
  iniciarOperacionAction,
  pausarOperacionAction,
  reanudarOperacionAction,
  finalizarOperacionAction,
} from "@/app/actions/ejecucion";

function minutosDesde(fecha: Date): number {
  return Math.max(0, Math.round((Date.now() - fecha.getTime()) / 60000));
}

export default async function TallerOperarPage({ params }: { params: Promise<{ otPiezaId: string }> }) {
  const { otPiezaId } = await params;
  const otPieza = await getOtPieza(otPiezaId);
  if (!otPieza) notFound();

  const usuario = await getUsuarioActual();
  const [pieza, { estado, sinRouting, operacionActual, routing }, abierta, tiposParada] = await Promise.all([
    getPieza(otPieza.piezaId),
    getEstadoYOperacionActual(otPieza),
    getOperacionAbierta(usuario.id),
    getTiposParada(),
  ]);
  const conjunto = pieza ? await getConjunto(pieza.conjuntoId) : null;

  // ¿Tiene una operación abierta EN OTRA pieza? Bloquea todo acá.
  if (abierta && abierta.otPiezaId !== otPieza.id) {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <Link href="/taller" className="text-sm text-accent hover:underline">
          ← Mi trabajo
        </Link>
        <div className="badge-estado badge-alerta block text-center py-4 text-sm">
          Tenés una operación abierta en otra pieza. Cerrala antes de empezar acá.
        </div>
        <Link
          href={`/taller/${abierta.otPiezaId}`}
          className="block text-center bg-accent text-accent-foreground font-medium py-3 rounded-xl"
        >
          Ir a esa operación →
        </Link>
      </div>
    );
  }

  // Todo lo que va antes de la operación actual en la hoja de ruta ya está
  // completado — las operaciones se hacen en orden, sin saltos.
  const posActual = operacionActual ? routing.findIndex((op) => op.id === operacionActual.id) : routing.length;
  const registroAbiertoAqui = abierta && abierta.otPiezaId === otPieza.id ? abierta : null;
  const paradaAbierta = registroAbiertoAqui ? await getParadaAbierta(registroAbiertoAqui.id) : null;
  const operacionDelRegistroAbierto = registroAbiertoAqui
    ? routing.find((op) => op.id === registroAbiertoAqui.operacionId)
    : null;
  const esUltima = registroAbiertoAqui ? await esUltimaOperacion(otPieza.id, registroAbiertoAqui.operacionId) : false;

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div>
        <Link href="/taller" className="text-sm text-accent hover:underline">
          ← Mi trabajo
        </Link>
        <h1 className="text-lg font-semibold mt-1">{pieza?.nombre}</h1>
        <p className="text-sm text-foreground-muted font-mono">
          {otPieza.codigo} · {conjunto?.nombre}
        </p>
      </div>

      {sinRouting ? (
        <div className="badge-estado badge-alerta block text-center py-4">Sin hoja de ruta cargada</div>
      ) : estado === "terminada" ? (
        <div className="bg-surface border border-border rounded-xl p-5 text-center space-y-2">
          <EstadoBadge estado="terminada" />
          <div className="text-sm text-foreground-muted">
            {otPieza.piezasOk} OK · {otPieza.piezasNoOk} no OK · {otPieza.piezasDefectuosas} defectuosas
          </div>
        </div>
      ) : registroAbiertoAqui && operacionDelRegistroAbierto ? (
        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div>
            <div className="text-xs text-foreground-muted uppercase tracking-wide">
              {registroAbiertoAqui.tipo === "setup" ? "Setup" : "Fabricación"} · operación{" "}
              {operacionDelRegistroAbierto.secuencia}
            </div>
            <div className="text-lg font-semibold">{operacionDelRegistroAbierto.proceso.nombre}</div>
            <div className="text-sm text-foreground-muted">
              {paradaAbierta ? "En pausa" : "En curso"} · iniciado hace {minutosDesde(registroAbiertoAqui.inicio)} min
            </div>
          </div>

          {paradaAbierta ? (
            <form action={reanudarOperacionAction}>
              <input type="hidden" name="registroOperacionId" value={registroAbiertoAqui.id} />
              <button type="submit" className="btn-lg w-full bg-accent text-accent-foreground">
                ▶ Reanudar
              </button>
            </form>
          ) : (
            <>
              <form action={pausarOperacionAction} className="flex gap-2">
                <input type="hidden" name="registroOperacionId" value={registroAbiertoAqui.id} />
                <select name="tipoParadaId" required className="input flex-1">
                  {tiposParada.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-lg bg-surface-muted text-foreground px-4">
                  ⏸
                </button>
              </form>

              <form action={finalizarOperacionAction} className="space-y-2 border-t border-border pt-4">
                <input type="hidden" name="registroOperacionId" value={registroAbiertoAqui.id} />
                <input type="hidden" name="otPiezaId" value={otPieza.id} />
                <input type="hidden" name="operacionId" value={operacionDelRegistroAbierto.id} />
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-foreground-muted">
                    Piezas OK
                    <input type="number" name="piezasOk" min={0} defaultValue={0} className="input mt-0.5" />
                  </label>
                  <label className="text-xs text-foreground-muted">
                    Rechazadas
                    <input type="number" name="piezasRechazadas" min={0} defaultValue={0} className="input mt-0.5" />
                  </label>
                </div>
                {esUltima && (
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-xs text-foreground-muted">
                      No OK
                      <input type="number" name="piezasNoOk" min={0} defaultValue={0} className="input mt-0.5" />
                    </label>
                    <label className="text-xs text-foreground-muted">
                      Defectuosas
                      <input type="number" name="piezasDefectuosas" min={0} defaultValue={0} className="input mt-0.5" />
                    </label>
                    <label className="text-xs text-foreground-muted">
                      Retrabajadas
                      <input type="number" name="piezasRetrabajadas" min={0} defaultValue={0} className="input mt-0.5" />
                    </label>
                  </div>
                )}
                <button type="submit" className="btn-lg w-full bg-brand-teal text-white">
                  ✔ Finalizar {esUltima ? "pieza" : "operación"}
                </button>
              </form>
            </>
          )}
        </div>
      ) : operacionActual ? (
        <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
          <div>
            <div className="text-xs text-foreground-muted uppercase tracking-wide">
              Siguiente · operación {operacionActual.secuencia}
            </div>
            <div className="text-lg font-semibold">{operacionActual.proceso.nombre}</div>
            {operacionActual.dispositivoNombre && (
              <div className="text-sm text-foreground-muted">Dispositivo: {operacionActual.dispositivoNombre}</div>
            )}
          </div>
          <form action={iniciarOperacionAction}>
            <input type="hidden" name="otPiezaId" value={otPieza.id} />
            <input type="hidden" name="operacionId" value={operacionActual.id} />
            <input type="hidden" name="tipo" value="setup" />
            <button type="submit" className="btn-lg w-full bg-surface-muted text-foreground mb-2">
              ▶ Iniciar setup
            </button>
          </form>
          <form action={iniciarOperacionAction}>
            <input type="hidden" name="otPiezaId" value={otPieza.id} />
            <input type="hidden" name="operacionId" value={operacionActual.id} />
            <input type="hidden" name="tipo" value="ejecucion" />
            <button type="submit" className="btn-lg w-full bg-accent text-accent-foreground">
              ▶ Iniciar fabricación
            </button>
          </form>
        </div>
      ) : null}

      <details className="text-sm text-foreground-muted">
        <summary className="cursor-pointer hover:text-foreground">Ver hoja de ruta completa</summary>
        <ol className="mt-2 space-y-1">
          {routing.map((op, i) => (
            <li key={op.id} className="flex items-center justify-between px-2 py-1">
              <span>
                {op.secuencia}. {op.proceso.nombre}
              </span>
              {i < posActual ? (
                <span className="text-estado-terminada-fg">✓</span>
              ) : (
                <span>—</span>
              )}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
