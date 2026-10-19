import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { asignacionTrabajo, operacion, dispositivo, piezaAdjunto, piezaNota } from "@/lib/db/schema";
import { getUsuarioActual } from "@/lib/session";
import { getOperacionesAbiertas } from "@/lib/data/ejecucion";
import { getPlan, getCalendario } from "@/lib/planning/datos";
import { ajustarAHabil, lunesDe } from "@/lib/planning/calendario";
import { urlDeAdjunto } from "@/lib/blob";
import { iniciarOperacionAction } from "@/app/actions/ejecucion";
import { hoyISO } from "@/lib/fecha";
import { Aviso } from "@/components/ui/Aviso";

export const dynamic = "force-dynamic";

/**
 * Mi próxima tarea (operario, en tablet o celular): arriba, ocupando la
 * pantalla, la tarea que le toca ahora — pieza, cantidad, operación,
 * dispositivo, plano y observaciones —, con el botón para empezar. Debajo, lo
 * que sigue en su día. Sale del plan que confirmó el jefe de planta.
 */
export default async function MiProximaTareaPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const usuario = await getUsuarioActual();
  const abiertas = await getOperacionesAbiertas(usuario.id);
  const enCurso = abiertas.find((a) => !a.pausada);
  if (enCurso) redirect(`/taller/${enCurso.otPiezaId}`);
  const pausadas = abiertas.filter((a) => a.pausada);

  // Fin de semana o feriado: muestra lo del próximo día hábil.
  const hoy = ajustarAHabil(hoyISO(), await getCalendario());
  const [plan, asignadas] = await Promise.all([
    getPlan(),
    // Lo confirmado para él esta semana hasta hoy: lo que no terminó ayer sigue en su cola.
    db
      .select()
      .from(asignacionTrabajo)
      .where(and(eq(asignacionTrabajo.operarioId, usuario.id), gte(asignacionTrabajo.fecha, lunesDe(hoy)), lte(asignacionTrabajo.fecha, hoy))),
  ]);
  const porClave = new Map(plan.resultado.tareas.map((t) => [t.clave, t]));
  const cola = [...new Set(asignadas.map((a) => `${a.otPiezaId}::${a.operacionId}`))]
    .map((clave) => porClave.get(clave))
    .filter((t): t is NonNullable<typeof t> => !!t && t.estado !== "terminada" && !pausadas.some((p) => p.otPiezaId === t.otPiezaId))
    .sort((a, b) => Number(b.estado === "lista") - Number(a.estado === "lista") || a.holgura - b.holgura);
  const proxima = cola[0];

  let extra: { dispositivo: string | null; planos: { nombre: string; url: string }[]; notas: string[] } = { dispositivo: null, planos: [], notas: [] };
  if (proxima) {
    const [[op], adj, notas] = await Promise.all([
      db.select({ d: dispositivo.nombre }).from(operacion).leftJoin(dispositivo, eq(dispositivo.id, operacion.dispositivoId)).where(eq(operacion.id, proxima.operacionId)),
      db.select().from(piezaAdjunto).where(and(eq(piezaAdjunto.piezaId, proxima.piezaCodigo), inArray(piezaAdjunto.tipo, ["plano"]))),
      db.select().from(piezaNota).where(eq(piezaNota.piezaId, proxima.piezaCodigo)).orderBy(desc(piezaNota.createdAt)).limit(2),
    ]);
    extra = { dispositivo: op?.d ?? null, planos: adj.map((a) => ({ nombre: a.nombreArchivo, url: urlDeAdjunto(a.pathname) })), notas: notas.map((n) => n.texto) };
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Hola, {usuario.nombre}</h1>
        <p className="text-foreground-muted">{proxima ? `Tenés ${cola.length} tarea${cola.length === 1 ? "" : "s"} para hoy.` : "Tu próxima tarea"}</p>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}

      {pausadas.map((p) => (
        <Link key={p.id} href={`/taller/${p.otPiezaId}`} className="block tarjeta border-naranja-borde bg-naranja-tenue p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-naranja-fg">En pausa</div>
          <div className="text-lg font-semibold">{p.piezaNombre}</div>
          <div className="text-sm text-foreground-muted">Tocá para retomarla</div>
        </Link>
      ))}

      {!proxima ? (
        <div className="tarjeta p-6 text-center space-y-3">
          <div className="text-lg font-semibold">Sin tareas asignadas.</div>
          <p className="text-foreground-muted">Avisale al jefe de planta.</p>
          <Link href="/taller/todas" className="btn-secundario">
            Ver las piezas de mis centros
          </Link>
        </div>
      ) : (
        <>
          <div className="tarjeta p-5 space-y-4 border-2 border-accent">
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Ahora te toca</div>
            <div>
              <div className="text-3xl font-bold leading-tight">{proxima.piezaNombre}</div>
              <div className="text-foreground-muted font-mono">{proxima.piezaCodigo} · {proxima.proyectoCodigo}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface-muted p-3">
                <div className="text-xs text-foreground-muted">Operación</div>
                <div className="text-xl font-semibold">{proxima.paso}</div>
                <div className="text-xs text-foreground-muted">paso {proxima.posicion} de {proxima.totalPasos}</div>
              </div>
              <div className="rounded-lg bg-surface-muted p-3">
                <div className="text-xs text-foreground-muted">Cantidad</div>
                <div className="text-3xl font-bold tabular-nums">{proxima.cantidad}</div>
              </div>
            </div>
            {extra.dispositivo && <div className="text-sm">Dispositivo: <strong>{extra.dispositivo}</strong></div>}
            {extra.planos.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {extra.planos.map((p) => (
                  <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="btn-secundario">
                    Abrir plano · {p.nombre}
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-sm text-foreground-muted">Sin plano cargado.</div>
            )}
            {extra.notas.length > 0 && (
              <div className="rounded-lg bg-naranja-tenue border border-naranja-borde p-3 text-sm">
                <div className="text-xs font-semibold text-naranja-fg mb-1">Observaciones</div>
                {extra.notas.map((n, i) => (
                  <p key={i}>{n}</p>
                ))}
              </div>
            )}
            {proxima.estado === "lista" ? (
              <div className="space-y-2">
                <form action={iniciarOperacionAction}>
                  <input type="hidden" name="otPiezaId" value={proxima.otPiezaId} />
                  <input type="hidden" name="operacionId" value={proxima.operacionId} />
                  <input type="hidden" name="tipo" value="ejecucion" />
                  <button className="btn-lg w-full bg-accent text-accent-foreground text-xl">▶ Empezar fabricación</button>
                </form>
                <form action={iniciarOperacionAction}>
                  <input type="hidden" name="otPiezaId" value={proxima.otPiezaId} />
                  <input type="hidden" name="operacionId" value={proxima.operacionId} />
                  <input type="hidden" name="tipo" value="setup" />
                  <button className="btn-lg w-full bg-surface-muted text-foreground">Empezar setup</button>
                </form>
              </div>
            ) : (
              <Aviso tipo="atencion">Todavía no se puede empezar: espera {proxima.motivoTraba?.toLowerCase() ?? "que termine el paso anterior"}.</Aviso>
            )}
          </div>

          {cola.length > 1 && (
            <div>
              <h2 className="text-sm font-semibold mb-2">Después</h2>
              <ul className="space-y-2">
                {cola.slice(1, 6).map((t) => (
                  <li key={t.clave} className="tarjeta px-4 py-3">
                    <div className="font-semibold">
                      {t.piezaNombre} × {t.cantidad}
                    </div>
                    <div className="text-sm text-foreground-muted">
                      {t.paso} · {t.proyectoCodigo}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link href="/taller/todas" className="block text-center text-sm text-accent hover:underline">
            Ver todas las piezas de mis centros
          </Link>
        </>
      )}
    </div>
  );
}
