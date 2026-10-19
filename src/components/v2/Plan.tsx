import type { Nivel, EstadoTarea } from "@/lib/planning/motor";
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
  futura: ["Sin liberar", "gris", "reloj"],
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
