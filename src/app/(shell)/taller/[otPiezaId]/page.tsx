import Link from "next/link";
import { notFound } from "next/navigation";
import { getUsuarioActual } from "@/lib/session";
import { getOtPieza, getEstadoYOperacionActual } from "@/lib/data/ot";
import { getPieza, getConjunto, nombreOperacion } from "@/lib/data/maestros";
import {
  getOperacionesAbiertas,
  getParadaAbierta,
  getTiposParada,
  esUltimaOperacion,
  getHabilitacionOperario,
  getCantidadesOperacion,
} from "@/lib/data/ejecucion";
import { getCentrosTrabajo, pasoHabilitadoParaOperario } from "@/lib/data/produccion";
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

export default async function TallerOperarPage({
  params,
  searchParams,
}: {
  params: Promise<{ otPiezaId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { otPiezaId } = await params;
  const { error } = await searchParams;
  const otPieza = await getOtPieza(otPiezaId);
  if (!otPieza) notFound();

  const usuario = await getUsuarioActual();
  const [pieza, { estado, sinRouting, operacionActual, routing }, abiertas, tiposParada, habilitacion, centros] = await Promise.all([
    getPieza(otPieza.piezaId),
    getEstadoYOperacionActual(otPieza),
    getOperacionesAbiertas(usuario.id),
    getTiposParada(),
    getHabilitacionOperario(usuario.id),
    getCentrosTrabajo(),
  ]);
  const conjunto = pieza ? await getConjunto(pieza.conjuntoId) : null;
  const enCurso = abiertas.find((a) => !a.pausada) ?? null;

  // ¿Tiene una operación EN CURSO en otra pieza? Bloquea todo acá (una pausada no:
  // puede dejarla en pausa y cambiar de actividad).
  if (enCurso && enCurso.otPiezaId !== otPieza.id) {
    return (
      <div className="max-w-md mx-auto space-y-4">
        <Link href="/taller" className="text-sm text-accent hover:underline">
          ← Mi trabajo
        </Link>
        <div className="badge-estado badge-alerta block text-center py-4 text-sm">
          Tenés una operación en curso en otra pieza. Pausala o finalizala antes de empezar acá.
        </div>
        <Link
          href={`/taller/${enCurso.otPiezaId}`}
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
  const registroAbiertoAqui = abiertas.find((a) => a.otPiezaId === otPieza.id) ?? null;
  const paradaAbierta = registroAbiertoAqui ? await getParadaAbierta(registroAbiertoAqui.id) : null;
  const operacionDelRegistroAbierto = registroAbiertoAqui
    ? routing.find((op) => op.id === registroAbiertoAqui.operacionId)
    : null;
  const esUltima = registroAbiertoAqui ? await esUltimaOperacion(otPieza.id, registroAbiertoAqui.operacionId) : false;
  const operacionDeLaCantidad = operacionDelRegistroAbierto ?? operacionActual;
  const cantidades = operacionDeLaCantidad
    ? await getCantidadesOperacion(otPieza.id, operacionDeLaCantidad.id, registroAbiertoAqui?.id)
    : null;
  const centroDe = (op: NonNullable<typeof operacionActual>) => op.centroTrabajoId ?? op.proceso.centroTrabajoId;
  const habilitada =
    operacionActual !== null &&
    pasoHabilitadoParaOperario(
      { id: operacionActual.id, tipo: operacionActual.proceso.tipo, centroTrabajoId: centroDe(operacionActual) },
      otPieza.id,
      habilitacion.centroIds,
      habilitacion.asignadasHoy,
    );

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

      {error && <div className="badge-estado badge-alerta block text-center py-3 text-sm">{error}</div>}

      {!otPieza.enviadaProduccionAt && !registroAbiertoAqui ? (
        <div className="badge-estado badge-pendiente block text-center py-4 text-sm">
          Esta pieza todavía no fue enviada a producción.
        </div>
      ) : sinRouting ? (
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
              {routing.findIndex((op) => op.id === operacionDelRegistroAbierto.id) + 1}
            </div>
            <div className="text-lg font-semibold">{nombreOperacion(operacionDelRegistroAbierto)}</div>
            <div className="text-sm text-foreground-muted">
              {paradaAbierta ? "En pausa" : "En curso"} · iniciado hace {minutosDesde(registroAbiertoAqui.inicio)} min
            </div>
            {cantidades && <CantidadAProcesar cantidades={cantidades} />}
          </div>

          {paradaAbierta ? (
            <div className="space-y-2">
              <form action={reanudarOperacionAction}>
                <input type="hidden" name="registroOperacionId" value={registroAbiertoAqui.id} />
                <input type="hidden" name="otPiezaId" value={otPieza.id} />
                <button type="submit" className="btn-lg w-full bg-accent text-accent-foreground">
                  ▶ Reanudar
                </button>
              </form>
              {/* Cambio de actividad (observación del cliente en Fase 3): la operación queda en
                  pausa, con su motivo, y se retoma desde Mi trabajo. */}
              <Link href="/taller" className="btn-lg w-full block text-center bg-surface-muted text-foreground">
                Cambiar de tarea — queda en pausa
              </Link>
            </div>
          ) : (
            <>
              <form action={pausarOperacionAction} className="flex gap-2">
                <input type="hidden" name="registroOperacionId" value={registroAbiertoAqui.id} />
                <input type="hidden" name="otPiezaId" value={otPieza.id} />
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
                {registroAbiertoAqui.tipo === "ejecucion" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-foreground-muted">
                      Piezas OK
                      <input
                        type="number"
                        name="piezasOk"
                        min={0}
                        max={cantidades?.disponibles}
                        defaultValue={cantidades?.disponibles ?? 0}
                        className="input mt-0.5"
                      />
                    </label>
                    <label className="text-xs text-foreground-muted">
                      Rechazadas
                      <input
                        type="number"
                        name="piezasRechazadas"
                        min={0}
                        max={cantidades?.disponibles}
                        defaultValue={0}
                        className="input mt-0.5"
                      />
                    </label>
                  </div>
                )}
                {esUltima && registroAbiertoAqui.tipo === "ejecucion" && (
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
                <label className="text-xs text-foreground-muted block">
                  Observaciones (opcional)
                  <textarea name="observacion" rows={2} className="input mt-0.5 resize-none" placeholder="Algo a anotar sobre esta operación…" />
                </label>
                <button type="submit" className="btn-lg w-full bg-brand-teal text-white">
                  ✔ {registroAbiertoAqui.tipo === "setup" ? "Terminar setup" : `Finalizar ${esUltima ? "pieza" : "operación"}`}
                </button>
              </form>
            </>
          )}
        </div>
      ) : operacionActual && operacionActual.proceso.tipo !== "interno" ? (
        <div className="bg-surface border border-border rounded-xl p-5 space-y-1">
          <div className="text-xs text-foreground-muted uppercase tracking-wide">Operación {posActual + 1}</div>
          <div className="text-lg font-semibold">{nombreOperacion(operacionActual)}</div>
          <p className="text-sm text-foreground-muted">
            {operacionActual.proceso.tipo === "compras"
              ? "Esperando la compra del material — no hay nada para hacer en taller todavía."
              : "Es un proceso tercerizado: sale con remito y su vuelta se registra en Tercerizados."}
          </p>
        </div>
      ) : operacionActual && !habilitada ? (
        <div className="bg-surface border border-border rounded-xl p-5 space-y-2">
          <div className="text-xs text-foreground-muted uppercase tracking-wide">Siguiente · operación {posActual + 1}</div>
          <div className="text-lg font-semibold">{nombreOperacion(operacionActual)}</div>
          <p className="text-sm text-foreground-muted">
            Se hace en {centros.find((c) => c.id === centroDe(operacionActual))?.nombre ?? "un centro sin asignar"}: no es uno de tus
            centros de trabajo y no la tenés asignada para hoy.
          </p>
          <Link href="/taller" className="btn-lg w-full block text-center bg-accent text-accent-foreground">
            ← Volver a Mi trabajo
          </Link>
        </div>
      ) : operacionActual ? (
        <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
          <div>
            <div className="text-xs text-foreground-muted uppercase tracking-wide">
              Siguiente · operación {posActual + 1}
            </div>
            <div className="text-lg font-semibold">{nombreOperacion(operacionActual)}</div>
            {operacionActual.dispositivoNombre && (
              <div className="text-sm text-foreground-muted">Dispositivo: {operacionActual.dispositivoNombre}</div>
            )}
            {cantidades && <CantidadAProcesar cantidades={cantidades} />}
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
                {i + 1}. {nombreOperacion(op)}
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

/** Cuántas piezas procesa el operario en esta operación — observación del cliente en Fase 3. */
function CantidadAProcesar({ cantidades }: { cantidades: { entra: number; disponibles: number } }) {
  return (
    <div className="mt-2 rounded-lg bg-surface-muted px-3 py-2 text-sm">
      <span className="font-semibold">
        {cantidades.disponibles} pieza{cantidades.disponibles === 1 ? "" : "s"} a procesar
      </span>
      {cantidades.disponibles !== cantidades.entra && (
        <span className="text-foreground-muted"> · llegaron {cantidades.entra}, el resto ya se declaró</span>
      )}
    </div>
  );
}
