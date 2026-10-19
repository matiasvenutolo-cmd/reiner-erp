import { Icono } from "./Icono";

/**
 * Etiqueta de estado única (§4.1): fondo suave, texto oscuro del mismo tono y
 * un ícono, para que se entienda sin color (daltonismo, pantalla al sol).
 * El tono tiene significado fijo: rojo atrasado, naranja urgente, verde en
 * plazo, gris futuro, amarillo estimado, violeta demo, azul información.
 */
export type Tono = "rojo" | "naranja" | "verde" | "gris" | "estimado" | "demo" | "azul";

export const TONO: Record<Tono, { chip: string; franja: string; punto: string; icono: string }> = {
  rojo: { chip: "bg-rojo-bg text-rojo-fg", franja: "border-l-rojo", punto: "bg-rojo", icono: "error" },
  naranja: { chip: "bg-naranja-bg text-naranja-fg", franja: "border-l-naranja", punto: "bg-naranja", icono: "alerta" },
  verde: { chip: "bg-verde-bg text-verde-fg", franja: "border-l-verde", punto: "bg-verde", icono: "okCirculo" },
  gris: { chip: "bg-gris-bg text-gris-fg", franja: "border-l-gris", punto: "bg-gris", icono: "reloj" },
  estimado: { chip: "bg-estimado-bg text-estimado-fg", franja: "border-l-estimado-borde", punto: "bg-estimado-borde", icono: "info" },
  demo: { chip: "bg-demo-bg text-demo-fg", franja: "border-l-demo-fg", punto: "bg-demo-fg", icono: "demo" },
  azul: { chip: "bg-accent-soft text-accent-hover", franja: "border-l-accent", punto: "bg-accent", icono: "info" },
};

export function Etiqueta({ tono, children, icono, title, sinIcono }: { tono: Tono; children: React.ReactNode; icono?: string; title?: string; sinIcono?: boolean }) {
  return (
    <span className={`badge-estado ${TONO[tono].chip}`} title={title}>
      {!sinIcono && <Icono nombre={icono ?? TONO[tono].icono} className="w-3.5 h-3.5" />}
      {children}
    </span>
  );
}

/** Punto de color chico, para listas donde la etiqueta completa sería ruido. */
export function Punto({ tono, title }: { tono: Tono; title?: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${TONO[tono].punto}`} title={title} aria-label={title} />;
}

/** Estados de stock con el mismo color en todo el sistema (§2.6). */
export const ESTADO_STOCK = {
  libre: { tono: "verde" as Tono, label: "libre" },
  asignada: { tono: "azul" as Tono, label: "asignada" },
  cuarentena: { tono: "naranja" as Tono, label: "en cuarentena" },
};
