/** Duración legible; menos de un minuto se muestra en segundos (una subtarea de retrabajo corta no es "0 min"). */
export function formatearDuracion(seg: number | null, vacio = "—"): string {
  if (seg === null) return vacio;
  if (seg < 60) return `${seg} s`;
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

const SIMBOLO: Record<string, string> = { ARS: "$", USD: "US$", EUR: "€" };

/** Importe con su moneda, en formato argentino: "US$ 1.250,00", "$ 1.891.250,00". */
export function formatearImporte(valor: number | null | undefined, moneda: string, vacio = "—"): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return vacio;
  return `${SIMBOLO[moneda] ?? moneda} ${valor.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatearNumero(valor: number, decimales = 2): string {
  return valor.toLocaleString("es-AR", { maximumFractionDigits: decimales });
}

/** "2026-10-15" → "15/10/2026" sin pasar por la zona horaria. */
export function formatearFecha(fechaISO: string | null | undefined, vacio = "—"): string {
  if (!fechaISO) return vacio;
  const [a, m, d] = fechaISO.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
