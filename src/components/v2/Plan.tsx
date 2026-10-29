import Link from "next/link";
import type { Nivel, EstadoTarea, Causa } from "@/lib/planning/motor";
import { fechaCorta as fc, diasHabiles } from "@/lib/formato";
import { TONO, Etiqueta, type Tono } from "@/components/ui/Etiqueta";

/**
 * Margen de cada tarea (en el código, "holgura"). Colores con significado fijo
 * (§4.1): rojo atrasada, naranja urgente o "arranca tarde", verde en plazo,
 * gris futura. En la interfaz se dice "margen", nunca "holgura" (§4.6).
 */
const TONO_NIVEL: Record<Nivel, Tono> = { atrasada: "rojo", arranca_tarde: "naranja", urgente: "naranja", en_plazo: "verde", futura: "gris" };
const LABEL_NIVEL: Record<Nivel, string> = { atrasada: "Atrasada", arranca_tarde: "Arranca tarde", urgente: "Urgente", en_plazo: "En plazo", futura: "Con margen" };

export const NIVEL: Record<Nivel, { label: string; chip: string; borde: string; punto: string; tono: Tono }> = Object.fromEntries(
  (Object.keys(TONO_NIVEL) as Nivel[]).map((n) => [n, { label: LABEL_NIVEL[n], chip: TONO[TONO_NIVEL[n]].chip, borde: TONO[TONO_NIVEL[n]].franja, punto: TONO[TONO_NIVEL[n]].punto, tono: TONO_NIVEL[n] }]),
) as Record<Nivel, { label: string; chip: string; borde: string; punto: string; tono: Tono }>;

/** Texto del margen: "3 días de margen", "vence hoy", "2 días atrasada". */
export function textoMargen(dias: number): string {
  return dias < 0 ? `${-dias} día${dias === -1 ? "" : "s"} atrasada` : dias === 0 ? "vence hoy" : `${dias} día${dias === 1 ? "" : "s"} de margen`;
}

/**
 * Etiqueta de margen. Lo que está en plazo es silencioso (§ principios): con
 * `soloExcepcion`, si hay más de 3 días de margen no se muestra nada.
 */
export function Holgura({ nivel, dias, corto, soloExcepcion }: { nivel: Nivel; dias: number; corto?: boolean; soloExcepcion?: boolean }) {
  if (soloExcepcion && (nivel === "en_plazo" || nivel === "futura")) return null;
  const n = NIVEL[nivel];
  const texto = nivel === "arranca_tarde" ? "arranca tarde" : textoMargen(dias);
  return (
    <Etiqueta tono={n.tono} title={`${n.label}: ${texto}`}>
      {corto ? texto : `${n.label} · ${texto}`}
    </Etiqueta>
  );
}

const ESTADO: Record<EstadoTarea, [string, Tono, string]> = {
  futura: ["Todavía no entró al plan", "gris", "reloj"],
  liberada: ["Esperando el paso anterior", "gris", "reloj"],
  lista: ["Lista", "verde", "okCirculo"],
  en_curso: ["En curso", "naranja", "empezar"],
  pausada: ["Parada", "naranja", "pausa"],
  terminada: ["Terminada", "verde", "ok"],
  trabada: ["Trabada", "rojo", "bloqueo"],
};

/** Estado de una tarea. "Lista" es el estado normal: con `soloExcepcion` no se muestra. */
export function EstadoTareaChip({ estado, soloExcepcion }: { estado: EstadoTarea; soloExcepcion?: boolean }) {
  if (soloExcepcion && estado === "lista") return null;
  const [l, tono, icono] = ESTADO[estado];
  return (
    <Etiqueta tono={tono} icono={icono}>
      {l}
    </Etiqueta>
  );
}

/** Formato de fecha único: vive en src/lib/formato.ts (se re-exporta para no tocar los imports existentes). */
export { fechaCorta } from "@/lib/formato";

/** Aviso discreto mientras haya tiempos estimados (amarillo suave = dato estimado). */
export function Estimado({ pct }: { pct: number }) {
  if (pct <= 0) return null;
  return (
    <span title="Los tiempos que todavía no cargó REINER salen de la tabla de estimados; se ajustan desde Admin.">
      <Etiqueta tono="estimado">Plan con {pct}% de tiempos estimados</Etiqueta>
    </span>
  );
}

/** Color fijo por proyecto (paleta aparte de los estados): el mismo proyecto, el mismo color en todas las pantallas. */
const PALETA = ["bg-proy-1", "bg-proy-2", "bg-proy-3", "bg-proy-4"];
const BORDE_PALETA = ["border-proy-1", "border-proy-2", "border-proy-3", "border-proy-4"];
export function colorProyecto(orden: number, tipo?: string): { fondo: string; borde: string } {
  if (tipo === "stock") return { fondo: "bg-proy-stock", borde: "border-proy-stock" };
  return { fondo: PALETA[orden % PALETA.length], borde: BORDE_PALETA[orden % PALETA.length] };
}

// ── Causa raíz (mejoras de usabilidad §1.5): una frase con su acción ──


/** Qué pasa, en una frase, y el botón que lo resuelve. */
export function textoCausa(c: Causa, hoy: string): { texto: string; accion: string; href: string; hacer: string } {
  switch (c.tipo) {
    case "compra":
    case "comercial": {
      const que = c.tipo === "compra" ? `el material de ${c.conjunto}` : `${c.pieza} (${c.conjunto})`;
      if (c.pedido) return { texto: `${que} llega ${c.llegada ? `el ${fc(c.llegada, hoy)}` : "sin fecha prometida"}`, accion: "Ver lo que está por llegar", href: "/pedir?vista=llegar", hacer: `Apurar ${que}` };
      return {
        // Nunca una fecha pasada (simplificación §3): si nació tarde es "pedirlo ya", no "se tenía que pedir antes del…".
        texto: c.pedirYa
          ? `${que} hay que pedirlo ya: el plazo del proveedor no alcanza para la fecha comprometida`
          : c.pedirAntes < hoy
            ? `${que} se tenía que pedir antes del ${fc(c.pedirAntes, hoy)}`
            : `${que} hay que pedirlo antes del ${fc(c.pedirAntes, hoy)} y el plazo no alcanza`,
        accion: "Ir a pedir",
        href: "/pedir",
        hacer: `Pedir ${que}`,
      };
    }
    case "tercerizado":
      return { texto: `el ${c.paso.toLowerCase()} de ${c.pieza} vuelve el ${fc(c.vuelta, hoy)}`, accion: "Ver tercerizados", href: "/tercerizados", hacer: `Reclamar el ${c.paso.toLowerCase()} de ${c.pieza}` };
    case "capacidad":
      return { texto: `${c.centro} no tiene lugar para ${c.pieza} (${c.conjunto}) hasta el ${fc(c.desde, hoy)}`, accion: "Ver el plan", href: `/planificacion?centro=${encodeURIComponent(c.centroId)}`, hacer: `Hacer lugar en ${c.centro}` };
    case "sin_liberar":
      return { texto: `las piezas de ${c.conjunto} todavía no entraron al plan`, accion: "Pasar al plan", href: "/liberacion", hacer: `Pasar al plan las piezas de ${c.conjunto}` };
  }
}

/** "OTMD01 llega 16 días hábiles tarde porque el material de Mando Principal se tenía que pedir antes del vie 25/09. → Ir a pedir" */
export function CausaRaiz({ codigo, causas, hoy, chico }: { codigo: string; causas: { causa: Causa; dias: number }[]; hoy: string; chico?: boolean }) {
  if (!causas.length) return null;
  return (
    <ul className={`space-y-2 ${chico ? "text-sm" : ""}`}>
      {causas.map(({ causa, dias }, i) => {
        const c = textoCausa(causa, hoy);
        return (
          <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex-1 min-w-0">
              {i === 0 ? (
                <>
                  <strong>{codigo}</strong> llega {diasHabiles(dias)} tarde porque {c.texto}.
                </>
              ) : (
                <>Además, {c.texto} (atrasa {diasHabiles(dias)}).</>
              )}
            </span>
            <Link href={c.href} className={i === 0 ? "btn btn-sm" : "btn-texto btn-sm"}>
              {c.accion} →
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Margen contra la entrega (simplificación §3): llegar antes nunca es rojo.
 * Más de 3 días antes → verde · de 0 a 3 → naranja "Llega justo" · después → rojo.
 * `dias` = días hábiles entre la entrega y el fin estimado (positivo = tarde).
 */
export function margenEntrega(dias: number): { texto: string; corto: string; tono: Tono; franja: string } {
  if (dias > 0) return { texto: `Va ${dias} día${dias === 1 ? "" : "s"} tarde`, corto: `${dias} día${dias === 1 ? "" : "s"} tarde`, tono: "rojo", franja: "border-l-rojo" };
  if (dias >= -3) return { texto: "Llega justo", corto: "llega justo", tono: "naranja", franja: "border-l-naranja" };
  return { texto: `Llega con ${-dias} días de margen`, corto: `${-dias} días de margen`, tono: "verde", franja: "border-l-verde" };
}

export function MargenEntrega({ dias }: { dias: number }) {
  const m = margenEntrega(dias);
  return <Etiqueta tono={m.tono}>{m.texto}</Etiqueta>;
}
