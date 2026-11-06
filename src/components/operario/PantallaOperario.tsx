import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tipoParada } from "@/lib/db/schema";
import { getOperacionesAbiertas, getParadaAbierta, getCantidadesOperacion } from "@/lib/data/ejecucion";
import { getColaOperario, getDetalleTarea, getTareaDePieza, getNombreDeRegistro, getSetupPendienteDe, getProximasDe, HORAS_OPERARIO_DIA, type EstadoProxima } from "@/lib/data/operario";
import { Icono } from "@/components/ui/Icono";
import { capitalizar, fechaCorta, horas, numero, plural } from "@/lib/formato";
import { TarjetaPlanta, BotonesPorEmpezar, BotonesEnCurso } from "./Flujo";
import { ConexionPlanta, FormPlanta, Listo, Motivos } from "./Planta";
import type { Tarea } from "@/lib/planning/motor";

const ESTADO_PROXIMA: Record<EstadoProxima, { label: string; chip: string; borde: string }> = {
  en_curso: { label: "En curso", chip: "bg-accent text-accent-foreground", borde: "border-l-accent" },
  lista: { label: "Lista para iniciar", chip: "bg-verde-bg text-verde-fg", borde: "border-l-verde" },
  atrasada: { label: "Inicio atrasado", chip: "bg-rojo-bg text-rojo-fg", borde: "border-l-rojo" },
  material: { label: "Esperando material", chip: "bg-naranja-bg text-naranja-fg", borde: "border-l-naranja" },
  espera: { label: "Espera el paso anterior", chip: "bg-gris-bg text-gris-fg", borde: "border-l-border" },
  por_enviar: { label: "Todavía no se mandó a producción", chip: "bg-gris-bg text-gris-fg", borde: "border-l-border" },
  trabada: { label: "Trabada", chip: "bg-rojo-bg text-rojo-fg", borde: "border-l-rojo" },
};

const MOTIVOS_ADELANTAR = [
  { valor: "La máquina ya está preparada para esta", label: "La máquina ya está preparada" },
  { valor: "Me lo pidió el jefe de planta", label: "Me lo pidió el jefe" },
  { valor: "Otro motivo", label: "Otro" },
];

/**
 * La pantalla del operario (mejoras de usabilidad §3): arriba el avance del
 * día, después la tarea que le toca (o la que está haciendo) con un solo
 * botón principal, y abajo la cola. Diseño de planta: una columna, texto de
 * 18 px, botones de 56 px, sin tablas ni scroll horizontal (§3.8).
 */
export async function PantallaOperario({
  usuarioId, nombre, como, volver, otPiezaId, listo, error, ok,
}: { usuarioId: string; nombre: string; como?: string; volver: string; otPiezaId?: string; listo?: string; error?: string; ok?: string }) {
  const campos: Record<string, string> = { volver, ...(como ? { como } : {}) };
  const [cola, abiertas, nombreListo] = await Promise.all([getColaOperario(usuarioId), getOperacionesAbiertas(usuarioId), listo ? getNombreDeRegistro(listo) : null]);
  const hoy = cola.hoy;

  // Lo que está haciendo (en curso, o parada) tiene prioridad sobre todo.
  const abierta = otPiezaId ? abiertas.find((a) => a.otPiezaId === otPiezaId) : (abiertas.find((a) => !a.pausada) ?? abiertas[0]);
  let actual: Tarea | null = null;
  let contenido: React.ReactNode = null;
  if (abierta) {
    actual = await getTareaDePieza(abierta.otPiezaId, abierta.operacionId);
    const [detalle, parada, cantidades] = await Promise.all([
      actual ? getDetalleTarea(actual) : null,
      getParadaAbierta(abierta.id),
      getCantidadesOperacion(abierta.otPiezaId, abierta.operacionId, abierta.id),
    ]);
    const motivoParada = parada ? ((await db.select({ n: tipoParada.nombre }).from(tipoParada).where(eq(tipoParada.id, parada.tipoParadaId)))[0]?.n ?? "") : "";
    // Con lotes, lo que se hace (y se precarga al terminar) es el lote, no todo el paso.
    const cantidadAhora = actual?.lote ? Math.min(cantidades.disponibles, actual.cantidad) : cantidades.disponibles;
    if (actual && detalle)
      contenido = (
        <TarjetaPlanta tarea={actual} detalle={detalle} hoy={hoy} cantidad={cantidadAhora} campos={campos}>
          <BotonesEnCurso
            registro={{ id: abierta.id, tipo: abierta.tipo, inicio: abierta.inicio, otPiezaId: abierta.otPiezaId, operacionId: abierta.operacionId }}
            parada={parada ? { inicio: parada.inicio, motivo: motivoParada } : null}
            tarea={actual}
            detalle={detalle}
            disponibles={cantidadAhora}
            campos={campos}
          />
        </TarjetaPlanta>
      );
  } else {
    // Con el setup hecho y sin empezar a fabricar, sigue esa (prueba 1, 05/11): es la que tiene la máquina preparada.
    const conSetup = otPiezaId ? null : await getSetupPendienteDe(usuarioId);
    actual = otPiezaId ? await getTareaDePieza(otPiezaId) : conSetup ? await getTareaDePieza(conSetup.otPiezaId, conSetup.operacionId) : (cola.tareas.find((t) => t.estado === "lista") ?? null);
    if (actual && (actual.estado === "lista" || otPiezaId)) {
      const [detalle, cantidades] = await Promise.all([getDetalleTarea(actual), getCantidadesOperacion(actual.otPiezaId, actual.operacionId)]);
      contenido = (
        <TarjetaPlanta tarea={actual} detalle={detalle} hoy={hoy} cantidad={actual.lote ? Math.min(cantidades.disponibles || actual.cantidad, actual.cantidad) : cantidades.disponibles || actual.cantidad} campos={campos}>
          {actual.tipo === "interno" ? (
            <BotonesPorEmpezar tarea={actual} campos={campos} setupTerminado={detalle.setupTerminado} />
          ) : (
            <p className="rounded-xl bg-surface-muted p-4">{actual.tipo === "compras" ? "Esperando el material: todavía no hay nada para hacer en taller." : "Es un proceso tercerizado: sale con remito desde Tercerizados."}</p>
          )}
        </TarjetaPlanta>
      );
    } else actual = null;
  }

  // Tanda 2 (05/11): toda la cola que le armó el jefe, también lo que todavía no puede empezar, con estado y fecha.
  const proximas = (await getProximasDe(usuarioId)).filter((p) => p.tarea.clave !== actual?.clave).slice(0, 10);
  const detallesDespues = await Promise.all(proximas.map((p) => getDetalleTarea(p.tarea)));
  const total = cola.hechas + cola.tareas.length;
  const pausadasOtras = abiertas.filter((a) => a.pausada && a.id !== abierta?.id);

  return (
    <div className="planta max-w-xl mx-auto space-y-4">
      <ConexionPlanta />
      <div>
        <h1 className="text-2xl font-bold">Hola, {nombre}</h1>
        <div className="mt-2 text-[15px] text-foreground-muted">
          {numero(cola.hechas)} de {plural(total, "tarea")} {total === 1 ? "hecha" : "hechas"} · {horas(cola.horasHechas)} de {horas(Math.max(HORAS_OPERARIO_DIA, cola.horasTotales))}
        </div>
        <div className="h-2.5 rounded-full bg-surface-muted mt-1 overflow-hidden">
          <div className="h-full bg-verde rounded-full" style={{ width: `${total ? Math.round((cola.hechas / total) * 100) : 0}%` }} />
        </div>
      </div>

      {/* Sin cola armada en Gestión la tablet muestra lo que propone el plan; sin ninguna tarea, el aviso no aplica. */}
      {!cola.confirmada && total > 0 && (
        <div className="rounded-xl bg-estimado-bg border border-estimado-borde px-4 py-3 text-estimado-fg text-[15px] font-medium">Plan propuesto, todavía no confirmado por el jefe de planta.</div>
      )}
      {listo && <Listo registroId={listo} terminada={nombreListo ? capitalizar(nombreListo) : null} campos={campos} />}
      {error && <div role="alert" className="rounded-xl bg-rojo-bg border border-rojo-borde px-4 py-3 text-rojo-fg font-medium">{error}</div>}
      {ok && <div role="status" className="rounded-xl bg-verde-bg border border-verde-borde px-4 py-3 text-verde-fg font-medium">{ok}</div>}

      {contenido ? (
        <>
          {listo && actual && <div className="text-lg font-semibold">Ahora te toca:</div>}
          {contenido}
        </>
      ) : (
        <div className="tarjeta p-6 text-center space-y-4">
          <div className="text-xl font-semibold">No tenés más tareas listas.</div>
          <p className="text-foreground-muted">Avisale al jefe de planta.</p>
          <FormPlanta accion="avisar" campos={{ ...campos, tipo: "sin_tareas", texto: `${nombre} no tiene más tareas listas` }}>
            <button className="btn w-full">Avisar al jefe de planta</button>
          </FormPlanta>
        </div>
      )}

      {pausadasOtras.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">También paradas</h2>
          {pausadasOtras.map((p) => (
            <Link key={p.id} href={`/taller/${p.otPiezaId}`} className="tarjeta flex items-center justify-between px-4 py-3 min-h-14 border-l-4 border-l-naranja">
              <span className="font-semibold">{capitalizar(p.piezaNombre)}</span>
              <span className="text-accent font-semibold">Retomar →</span>
            </Link>
          ))}
        </div>
      )}

      {proximas.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Mis próximas tareas</h2>
          <ul className="space-y-3">
            {proximas.map((p, i) => {
              const t = p.tarea;
              const d = detallesDespues[i];
              const e = ESTADO_PROXIMA[p.estado];
              return (
                <li key={t.clave}>
                  <details className={`tarjeta group border-l-4 ${e.borde}`}>
                    <summary className="flex items-center gap-3 px-4 py-3 min-h-14 cursor-pointer list-none">
                      <span className="flex-1 min-w-0">
                        <span className="font-semibold block">
                          {capitalizar(t.piezaNombre)} × {numero(t.cantidad)}
                        </span>
                        <span className="text-[15px] text-foreground-muted">
                          {t.paso} · paso {t.posicion} de {t.totalPasos} · {horas(d.estimadoHoras)}
                        </span>
                        <span className="flex flex-wrap items-center gap-2 mt-1">
                          <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${e.chip}`}>
                            {p.estado === "trabada" && p.motivo ? `Trabada: ${p.motivo.toLowerCase()}` : e.label}
                          </span>
                          <span className="text-[14px]">
                            {p.estado === "atrasada" && p.listaDesde
                              ? `Se podía empezar desde el ${fechaCorta(p.listaDesde, hoy)}`
                              : p.arranca
                                ? `Arranca aprox. el ${fechaCorta(p.arranca, hoy)}`
                                : "Arranca más adelante"}
                          </span>
                        </span>
                      </span>
                      <Icono nombre="abajo" className="w-5 h-5 text-foreground-muted group-open:rotate-180 transition-transform" />
                    </summary>
                    <div className="px-4 pb-4 space-y-3 text-[15px]">
                      {d.detalle && <div>{d.detalle}</div>}
                      {(d.dispositivo || d.material) && <div>{[d.dispositivo && `Dispositivo: ${d.dispositivo}`, d.material && `Material: ${d.material}`].filter(Boolean).join(" · ")}</div>}
                      {d.vieneDe && <div>Viene de: {d.vieneDe.paso}</div>}
                      {d.despues && <div>Después: {d.despues}</div>}
                      {(p.estado === "lista" || p.estado === "atrasada") && (
                        <Motivos
                          accion="adelantar"
                          campos={{ ...campos, otPiezaId: t.otPiezaId, operacionId: t.operacionId }}
                          nombre="motivo"
                          motivos={MOTIVOS_ADELANTAR}
                          titulo="¿Por qué la hacés antes?"
                          boton={
                            <>
                              <Icono nombre="subir" className="w-5 h-5" /> Hacer esta antes
                            </>
                          }
                        />
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!como && (
        <Link href="/taller/todas" className="block text-center text-[15px] text-accent hover:underline py-2">
          Ver todas las piezas de mis centros
        </Link>
      )}
    </div>
  );
}
