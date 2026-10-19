import { Icono } from "@/components/ui/Icono";
import { Codigo } from "@/components/ui/Codigo";
import { capitalizar, fechaRelativa, horas, numero } from "@/lib/formato";
import type { Tarea } from "@/lib/planning/motor";
import type { DetalleTarea } from "@/lib/data/operario";
import { Cronometro, FormPlanta, Motivos, Terminar } from "./Planta";

/**
 * Vista de operario (mejoras de usabilidad §3): una sola tarea grande y un
 * solo botón principal por estado. Por empezar → Empezar setup; En setup →
 * Terminé el setup; Fabricando → Terminar; Parada → Seguir.
 */

const MOTIVOS_NO_PUEDO = [
  { valor: "falta_material", label: "Falta material" },
  { valor: "falta_pieza_anterior", label: "Falta la pieza del paso anterior" },
  { valor: "falta_plano", label: "Falta plano o está mal" },
  { valor: "maquina", label: "Máquina o herramienta" },
  { valor: "otro", label: "Otro" },
];

export const MOTIVOS_PARADA = [
  { valor: "falta-material", label: "Falta material" },
  { valor: "maquina", label: "Máquina" },
  { valor: "herramienta", label: "Herramienta" },
  { valor: "calidad", label: "Calidad" },
  { valor: "me-llamaron", label: "Me llamaron" },
  { valor: "otra", label: "Otro" },
];

const estimadoTexto = (d: DetalleTarea, cantidad: number) =>
  `Estimado: ${horas(d.estimadoHoras)} (setup ${numero(d.setupMin)} min + ${numero(cantidad)} × ${numero(d.minPorUnidad, 1)} min)`;

/** Urgencia, sólo si la hay: franja roja o naranja arriba. Si está en plazo, nada. */
function Urgencia({ tarea, hoy }: { tarea: Tarea; hoy: string }) {
  if (tarea.nivel !== "atrasada" && tarea.nivel !== "urgente" && tarea.nivel !== "arranca_tarde") return null;
  const quien = tarea.posicion === tarea.totalPasos ? "montaje" : "el paso siguiente";
  const roja = tarea.nivel === "atrasada";
  return (
    <div className={`-mx-5 -mt-5 mb-4 rounded-t-xl px-5 py-2.5 font-semibold ${roja ? "bg-rojo text-white" : "bg-naranja text-white"}`}>
      {roja ? "Atrasada" : "Urgente"}: la necesita {quien} {fechaRelativa(tarea.fechaLimite, hoy)}
    </div>
  );
}

/** La tarjeta completa de la tarea, en orden de importancia (§3.2). */
export function TarjetaPlanta({ tarea, detalle, hoy, cantidad, campos, children }: { tarea: Tarea; detalle: DetalleTarea; hoy: string; cantidad: number; campos: Record<string, string>; children?: React.ReactNode }) {
  return (
    <div className="tarjeta p-5 space-y-4 border-2">
      <Urgencia tarea={tarea} hoy={hoy} />
      <div>
        <div className="text-[28px] font-bold leading-tight">{capitalizar(tarea.piezaNombre)}</div>
        <Codigo valor={tarea.piezaCodigo} className="text-[15px]" />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
        <div>
          <div className="text-xl font-semibold">
            {tarea.paso} <span className="text-foreground-muted font-normal">— paso {tarea.posicion} de {tarea.totalPasos}</span>
          </div>
          {tarea.lote && <div className="text-[15px] font-semibold text-accent">Lote {tarea.lote.n} de {tarea.lote.de}</div>}
          {detalle.detalle && <div className="text-foreground-muted">{detalle.detalle}</div>}
        </div>
        <div className="text-right">
          <div className="text-[15px] text-foreground-muted">Cantidad</div>
          <div className="text-[40px] font-bold tabular-nums leading-none">{numero(cantidad)}</div>
        </div>
      </div>
      {(detalle.dispositivo || detalle.material) && (
        <div className="text-[15px]">
          {[detalle.dispositivo && `Dispositivo: ${detalle.dispositivo}`, detalle.material && `Material: ${detalle.material}`].filter(Boolean).join(" · ")}
        </div>
      )}
      <div className="text-[15px] text-foreground-muted">{estimadoTexto(detalle, cantidad)}</div>
      {(detalle.vieneDe || detalle.despues) && (
        <div className="text-[15px] space-y-0.5">
          {detalle.vieneDe && (
            <div>
              Viene de: <strong>{detalle.vieneDe.paso}</strong>
              {detalle.vieneDe.fin ? ` (terminada ${fechaRelativa(detalle.vieneDe.fin, hoy)})` : ""}
            </div>
          )}
          {detalle.despues && (
            <div>
              Después: <strong>{detalle.despues}</strong>
            </div>
          )}
        </div>
      )}
      {detalle.planos.length > 0 ? (
        <div className="grid gap-3">
          {detalle.planos.map((p) => (
            <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="btn-secundario w-full min-h-14 text-base">
              <Icono nombre="plano" className="w-5 h-5" /> Ver plano
            </a>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-muted px-4 py-3">
          <span className="text-foreground-muted">Sin plano</span>
          <FormPlanta accion="avisar" campos={{ ...campos, tipo: "falta_plano", otPiezaId: tarea.otPiezaId, texto: `Falta el plano de ${tarea.piezaNombre} (${tarea.piezaCodigo})` }}>
            <button className="btn-texto">Avisar a ingeniería</button>
          </FormPlanta>
        </div>
      )}
      {detalle.notas.length > 0 && (
        <div className="rounded-xl bg-naranja-tenue border border-naranja-borde p-3 text-[15px]">
          <div className="font-semibold text-naranja-fg mb-1">Observaciones</div>
          {detalle.notas.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

/** Estado "Por empezar": Empezar setup (principal), sin setup, o "No puedo hacer esta". */
export function BotonesPorEmpezar({ tarea, campos }: { tarea: Tarea; campos: Record<string, string> }) {
  const base = { ...campos, otPiezaId: tarea.otPiezaId, operacionId: tarea.operacionId };
  return (
    <div className="space-y-3 pt-1">
      <FormPlanta accion="empezar" campos={{ ...base, tipo: "setup" }}>
        <button className="btn w-full text-lg">
          <Icono nombre="empezar" className="w-6 h-6" /> Empezar setup
        </button>
      </FormPlanta>
      <FormPlanta accion="empezar" campos={{ ...base, tipo: "ejecucion" }}>
        <button className="btn-secundario w-full">Sin setup, empezar a fabricar</button>
      </FormPlanta>
      <Motivos
        accion="noPuedo"
        campos={base}
        nombre="motivo"
        motivos={MOTIVOS_NO_PUEDO}
        titulo="¿Por qué no podés hacerla?"
        conTexto="Contalo en pocas palabras (opcional)"
        boton={
          <>
            <Icono nombre="bloqueo" className="w-5 h-5" /> No puedo hacer esta
          </>
        }
      />
    </div>
  );
}

/** Estados con el registro abierto: En setup, Fabricando o Parada. */
export function BotonesEnCurso({
  registro, parada, tarea, detalle, disponibles, campos,
}: {
  registro: { id: string; tipo: "setup" | "ejecucion"; inicio: Date; otPiezaId: string; operacionId: string };
  parada: { inicio: Date; motivo: string } | null;
  tarea: Pick<Tarea, "otPiezaId" | "operacionId">;
  detalle: DetalleTarea;
  disponibles: number;
  campos: Record<string, string>;
}) {
  const base = { ...campos, registroId: registro.id, otPiezaId: tarea.otPiezaId, operacionId: tarea.operacionId };
  if (parada)
    return (
      <div className="space-y-4">
        <div className="rounded-xl border-2 border-naranja bg-naranja-tenue p-4 text-center space-y-1">
          <div className="text-naranja-fg font-semibold">Parada · {parada.motivo}</div>
          <Cronometro desde={parada.inicio.toISOString()} tono="naranja" />
        </div>
        <FormPlanta accion="seguir" campos={base}>
          <button className="btn w-full text-lg">
            <Icono nombre="empezar" className="w-6 h-6" /> Seguir
          </button>
        </FormPlanta>
      </div>
    );
  const paradaBoton = (
    <Motivos
      accion="parar"
      campos={base}
      nombre="tipoParadaId"
      motivos={MOTIVOS_PARADA}
      titulo="¿Por qué parás?"
      boton={
        <>
          <Icono nombre="pausa" className="w-5 h-5" /> Parada
        </>
      }
    />
  );
  if (registro.tipo === "setup")
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-surface-muted p-4 text-center">
          <div className="font-semibold mb-1">En setup</div>
          <Cronometro desde={registro.inicio.toISOString()} estimadoMin={detalle.setupMin} />
        </div>
        <FormPlanta accion="terminarSetup" campos={base}>
          <button className="btn w-full text-lg">
            <Icono nombre="ok" className="w-6 h-6" /> Terminé el setup
          </button>
        </FormPlanta>
        {paradaBoton}
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface-muted p-4 text-center">
        <div className="font-semibold mb-1">Fabricando</div>
        <Cronometro desde={registro.inicio.toISOString()} estimadoMin={detalle.minPorUnidad * disponibles} />
      </div>
      <Terminar campos={base} disponibles={disponibles} />
      {paradaBoton}
    </div>
  );
}
