/** Fecha de hoy (YYYY-MM-DD) en hora de Argentina — `toISOString()` da la fecha UTC,
 * que entre las 21 y las 24 hs ya es el día siguiente (y Vercel corre en UTC). */
export function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}
