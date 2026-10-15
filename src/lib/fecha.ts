/** Fecha de hoy (YYYY-MM-DD) en hora de Argentina — `toISOString()` da la fecha UTC,
 * que entre las 21 y las 24 hs ya es el día siguiente (y Vercel corre en UTC). */
export function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}

/** Fecha de un timestamp en hora de Argentina (YYYY-MM-DD). */
export function fechaISO(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d);
}

/** Suma días a una fecha YYYY-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Días entre dos fechas YYYY-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}
