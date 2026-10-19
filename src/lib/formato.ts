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

// ── v2 · mejoras de usabilidad §4.5: un solo formato en todas las pantallas ──

/** Número en formato argentino: coma decimal, punto de miles. */
export function numero(valor: number, decimales = 0): string {
  return valor.toLocaleString("es-AR", { maximumFractionDigits: decimales, minimumFractionDigits: 0 });
}

/** Horas legibles: menos de 1 h en minutos ("6 min"), si no con coma decimal ("1,5 h"). */
export function horas(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "0 h";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  return `${numero(Math.round(h * 10) / 10, 1)} h`;
}

/** "1 pieza" / "3 piezas". Si el plural no es regular, se pasa. */
export function plural(n: number, singular: string, pluralForma?: string): string {
  return `${numero(n)} ${n === 1 ? singular : (pluralForma ?? `${singular}s`)}`;
}

/** Primera letra en mayúscula al mostrar ("buje de contención" → "Buje de contención"), sin tocar el maestro. */
export function capitalizar(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toLocaleUpperCase("es-AR") + s.slice(1);
}

/** Sin mayúsculas ni acentos, para que los buscadores encuentren igual "Buje", "buje" o "BUJÉ". */
export function normalizarBusqueda(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const enUTC = (f: string) => new Date(`${f.slice(0, 10)}T12:00:00Z`);

/** "2026-10-20" → "mar 20/10"; de otro año, "jue 31/12/26". */
export function fechaCorta(f: string | null | undefined, hoy?: string): string {
  if (!f) return "—";
  const d = enUTC(f);
  const anioRef = (hoy ?? new Date().toISOString()).slice(0, 4);
  return `${DIAS_SEMANA[d.getUTCDay()]} ${f.slice(8, 10)}/${f.slice(5, 7)}${f.slice(0, 4) !== anioRef ? `/${f.slice(2, 4)}` : ""}`;
}

/** Fecha relativa cuando ayuda: "hoy", "mañana", "en 3 días", "hace 2 días"; a más de una semana, la fecha corta. */
export function fechaRelativa(f: string | null | undefined, hoy: string): string {
  if (!f) return "—";
  const dias = Math.round((enUTC(f).getTime() - enUTC(hoy).getTime()) / 86400000);
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias === -1) return "ayer";
  if (dias > 1 && dias < 7) return `en ${dias} días`;
  if (dias < -1 && dias > -7) return `hace ${-dias} días`;
  return fechaCorta(f, hoy);
}

/** Días hábiles explícitos, una sola forma en todo el sistema: "16 días hábiles". */
export function diasHabiles(n: number): string {
  return plural(Math.abs(n), "día hábil", "días hábiles");
}
