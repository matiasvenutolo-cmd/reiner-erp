"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Icono } from "@/components/ui/Icono";
import {
  empezarAction, terminarSetupAction, pararAction, seguirAction, terminarAction, deshacerTerminarAction, noPuedoAction, avisarAction, adelantarAction,
} from "@/app/actions/operario";

/**
 * Piezas de la vista de planta (mejoras de usabilidad §3): botones de 56 px,
 * motivos en botones grandes (sin teclado), cronómetro y cola sin conexión.
 */

const ACCIONES = {
  empezar: empezarAction,
  terminarSetup: terminarSetupAction,
  parar: pararAction,
  seguir: seguirAction,
  terminar: terminarAction,
  deshacer: deshacerTerminarAction,
  noPuedo: noPuedoAction,
  avisar: avisarAction,
  adelantar: adelantarAction,
} as const;
export type AccionPlanta = keyof typeof ACCIONES;

// ── Sin conexión momentánea (§3.8): los toques se guardan y se envían al volver el wifi ──

const COLA = "planta-cola-sin-conexion";
type Pendiente = { accion: AccionPlanta; campos: Record<string, string> };
const leerCola = (): Pendiente[] => {
  try {
    return JSON.parse(localStorage.getItem(COLA) ?? "[]");
  } catch {
    return [];
  }
};
const guardarCola = (c: Pendiente[]) => {
  try {
    localStorage.setItem(COLA, JSON.stringify(c));
    window.dispatchEvent(new Event("planta-cola"));
  } catch {}
};
const suscribirConexion = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  window.addEventListener("planta-cola", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
    window.removeEventListener("planta-cola", cb);
  };
};

/** Franja de conexión + reenvío de lo que se tocó sin wifi. Va una sola vez en la pantalla del operario. */
export function ConexionPlanta() {
  const enLinea = useSyncExternalStore(suscribirConexion, () => navigator.onLine, () => true);
  const pendientes = useSyncExternalStore(suscribirConexion, () => leerCola().length, () => 0);
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (!enLinea || !pendientes) return;
    const cola = leerCola();
    guardarCola([]);
    startTransition(async () => {
      for (const p of cola) {
        const fd = new FormData();
        for (const [k, v] of Object.entries(p.campos)) fd.set(k, v);
        try {
          await ACCIONES[p.accion](fd);
        } catch {
          /* la acción redirige: es lo esperado */
        }
      }
    });
  }, [enLinea, pendientes]);
  if (enLinea && !pendientes) return null;
  return (
    <div role="status" className="rounded-xl border-2 border-naranja bg-naranja-tenue px-4 py-3 text-naranja-fg font-semibold">
      {enLinea ? "Enviando lo que quedó guardado…" : `Sin conexión: se guarda y se envía después${pendientes ? ` (${pendientes} pendiente${pendientes === 1 ? "" : "s"})` : ""}.`}
    </div>
  );
}

/**
 * Formulario de planta: con conexión se envía normal; sin conexión guarda el
 * toque con su hora real y lo manda cuando vuelve el wifi.
 */
export function FormPlanta({ accion, campos, children, className }: { accion: AccionPlanta; campos: Record<string, string>; children: React.ReactNode; className?: string }) {
  return (
    <form
      action={ACCIONES[accion]}
      className={className}
      onSubmit={(e) => {
        if (navigator.onLine) return;
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        const todos: Record<string, string> = {};
        fd.forEach((v, k) => (todos[k] = String(v)));
        todos.cuando = new Date().toISOString();
        guardarCola([...leerCola(), { accion, campos: todos }]);
      }}
    >
      {Object.entries(campos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
    </form>
  );
}

// ── Cronómetro ──

const fmt = (seg: number) => {
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
};
const suscribirReloj = (cb: () => void) => {
  const id = setInterval(cb, 1000);
  return () => clearInterval(id);
};

/** Cronómetro que sigue corriendo aunque se recargue la tablet (cuenta desde la hora guardada). */
export function Cronometro({ desde, tono = "neutro", estimadoMin }: { desde: string; tono?: "neutro" | "naranja"; estimadoMin?: number }) {
  const ahora = useSyncExternalStore(suscribirReloj, () => Math.floor(Date.now() / 1000), () => 0);
  const seg = ahora ? Math.max(0, ahora - Math.floor(new Date(desde).getTime() / 1000)) : 0;
  const conEstimado = estimadoMin != null && estimadoMin > 0;
  const pasado = conEstimado && seg > estimadoMin * 60;
  return (
    <div className="text-center">
      <div className={`text-[40px] font-bold tabular-nums leading-none ${tono === "naranja" ? "text-naranja-fg" : pasado ? "text-naranja-fg" : "text-foreground"}`}>{ahora ? fmt(seg) : "—"}</div>
      {conEstimado && <div className="text-[15px] text-foreground-muted mt-1">Estimado: {estimadoMin < 60 ? `${Math.round(estimadoMin)} min` : `${(Math.round(estimadoMin / 6) / 10).toString().replace(".", ",")} h`}</div>}
    </div>
  );
}

// ── Motivos en botones grandes ──

type Motivo = { valor: string; label: string };

/** Botón secundario que abre los motivos en botones grandes; cada motivo envía el formulario. */
export function Motivos({
  accion, campos, nombre, motivos, boton, titulo, conTexto, principal,
}: { accion: AccionPlanta; campos: Record<string, string>; nombre: string; motivos: Motivo[]; boton: React.ReactNode; titulo: string; conTexto?: string; principal?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className={`${principal ? "btn" : "btn-secundario"} w-full`}>
        {boton}
      </button>
    );
  return (
    <FormPlanta accion={accion} campos={campos} className="rounded-xl border-2 border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{titulo}</div>
        <button type="button" onClick={() => setAbierto(false)} className="btn-texto" aria-label="Cancelar">
          <Icono nombre="cerrar" className="w-5 h-5" /> Cancelar
        </button>
      </div>
      {conTexto && <input name="texto" placeholder={conTexto} className="input text-lg" />}
      <div className="grid grid-cols-2 gap-3">
        {motivos.map((m) => (
          <button key={m.valor} name={nombre} value={m.valor} className="btn-secundario min-h-14 whitespace-normal text-base">
            {m.label}
          </button>
        ))}
      </div>
    </FormPlanta>
  );
}

// ── Terminar: cantidades con + y − (sin teclado) ──

function Contador({ label, valor, set, max }: { label: string; valor: number; set: (n: number) => void; max: number }) {
  return (
    <div className="rounded-xl border-2 border-border p-3">
      <div className="text-[15px] font-semibold text-foreground-muted">{label}</div>
      <div className="flex items-center justify-between gap-3 mt-1">
        <button type="button" onClick={() => set(Math.max(0, valor - 1))} className="btn-secundario w-16 min-h-14" aria-label={`Menos ${label}`}>
          <Icono nombre="menos" className="w-6 h-6" />
        </button>
        <span className="text-[40px] font-bold tabular-nums">{valor}</span>
        <button type="button" onClick={() => set(Math.min(max, valor + 1))} className="btn-secundario w-16 min-h-14" aria-label={`Más ${label}`}>
          <Icono nombre="mas" className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

const MOTIVOS_RECHAZO: Motivo[] = [
  { valor: "medida", label: "Medida" },
  { valor: "terminacion", label: "Terminación" },
  { valor: "material", label: "Material" },
  { valor: "otro", label: "Otro" },
];

/** Botón "Terminar" → cantidad OK (precargada con lo pedido) y rechazadas → motivo si hay rechazos → Confirmar. */
export function Terminar({ campos, disponibles }: { campos: Record<string, string>; disponibles: number }) {
  const [abierto, setAbierto] = useState(false);
  const [ok, setOk] = useState(disponibles);
  const [rech, setRech] = useState(0);
  const [motivo, setMotivo] = useState("");
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn w-full text-lg">
        <Icono nombre="ok" className="w-6 h-6" /> Terminar
      </button>
    );
  const pasa = ok + rech > disponibles;
  return (
    <FormPlanta accion="terminar" campos={campos} className="space-y-3">
      <Contador label="Piezas OK" valor={ok} set={(n) => setOk(Math.min(n, disponibles - rech))} max={disponibles} />
      <Contador
        label="Rechazadas"
        valor={rech}
        set={(n) => {
          const r = Math.min(n, disponibles);
          setRech(r);
          setOk((o) => Math.min(o, disponibles - r));
        }}
        max={disponibles}
      />
      <input type="hidden" name="piezasOk" value={ok} />
      <input type="hidden" name="piezasRechazadas" value={rech} />
      <input type="hidden" name="motivoRechazo" value={motivo} />
      {rech > 0 && (
        <div>
          <div className="font-semibold mb-2">¿Por qué se rechazaron?</div>
          <div className="grid grid-cols-2 gap-3">
            {MOTIVOS_RECHAZO.map((m) => (
              <button key={m.valor} type="button" onClick={() => setMotivo(m.valor)} className={`min-h-14 rounded-xl border-2 font-semibold ${motivo === m.valor ? "border-accent bg-accent-soft text-accent-hover" : "border-border bg-surface"}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {pasa && <p className="text-rojo-fg font-semibold">Llegaron {disponibles}: OK + rechazadas no puede pasar de {disponibles}.</p>}
      <button disabled={pasa || (rech > 0 && !motivo)} className="btn w-full text-lg">
        Confirmar
      </button>
      <button type="button" onClick={() => setAbierto(false)} className="btn-texto w-full">
        Volver
      </button>
    </FormPlanta>
  );
}

/** "Listo. Ahora te toca: …" con "Deshacer" visible 10 segundos (§3.4). */
export function Listo({ registroId, terminada, campos }: { registroId: string; terminada: string | null; campos: Record<string, string> }) {
  const [restan, setRestan] = useState(10);
  useEffect(() => {
    const id = setInterval(() => setRestan((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);
  if (restan <= 0) return null;
  return (
    <div role="status" className="flex items-center justify-between gap-3 rounded-xl bg-verde-bg border-2 border-verde-borde px-4 py-3 text-verde-fg">
      <span className="font-semibold">
        <Icono nombre="okCirculo" className="w-5 h-5 inline -mt-1 mr-1" />
        Listo{terminada ? `: ${terminada}` : ""}.
      </span>
      <FormPlanta accion="deshacer" campos={{ ...campos, registroId }}>
        <button className="btn-secundario">
          <Icono nombre="deshacer" className="w-5 h-5" /> Deshacer ({restan})
        </button>
      </FormPlanta>
    </div>
  );
}
