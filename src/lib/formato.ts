/** Duración legible; menos de un minuto se muestra en segundos (una subtarea de retrabajo corta no es "0 min"). */
export function formatearDuracion(seg: number | null, vacio = "—"): string {
  if (seg === null) return vacio;
  if (seg < 60) return `${seg} s`;
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}
