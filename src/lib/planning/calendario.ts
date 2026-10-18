/**
 * Calendario de planta: días hábiles (lunes a viernes por defecto), feriados
 * y días de cierre. Todas las fechas del motor son "YYYY-MM-DD" y se cuentan
 * en días hábiles. Funciones puras, sin base de datos.
 */
export type Calendario = { feriados: Set<string>; diasSemana: number[] /* 1 = lunes … 7 = domingo */ };

export const CALENDARIO_BASE: Calendario = { feriados: new Set(), diasSemana: [1, 2, 3, 4, 5] };

const aFecha = (f: string) => new Date(`${f}T12:00:00Z`);
const aTexto = (d: Date) => d.toISOString().slice(0, 10);

function diaSemana(f: string): number {
  const d = aFecha(f).getUTCDay();
  return d === 0 ? 7 : d;
}

export function esHabil(f: string, cal: Calendario): boolean {
  return cal.diasSemana.includes(diaSemana(f)) && !cal.feriados.has(f);
}

function sumarCorridos(f: string, n: number): string {
  const d = aFecha(f);
  d.setUTCDate(d.getUTCDate() + n);
  return aTexto(d);
}

/** El mismo día si es hábil; si no, el próximo hábil (o el anterior, con atras). */
export function ajustarAHabil(f: string, cal: Calendario, atras = false): string {
  let x = f;
  for (let i = 0; i < 400 && !esHabil(x, cal); i++) x = sumarCorridos(x, atras ? -1 : 1);
  return x;
}

/** Suma (o resta) n días hábiles. Con n = 0 devuelve la misma fecha llevada a hábil. */
export function sumarHabiles(f: string, n: number, cal: Calendario): string {
  let x = ajustarAHabil(f, cal, n < 0);
  const paso = n < 0 ? -1 : 1;
  for (let k = 0; k < Math.abs(n); ) {
    x = sumarCorridos(x, paso);
    if (esHabil(x, cal)) k++;
  }
  return x;
}

/** Días hábiles de a hasta b (b − a): positivo si b es posterior. */
export function habilesEntre(a: string, b: string, cal: Calendario): number {
  if (a === b) return 0;
  const [desde, hasta, signo] = a < b ? [a, b, 1] : [b, a, -1];
  let n = 0;
  for (let x = sumarCorridos(desde, 1); x <= hasta; x = sumarCorridos(x, 1)) if (esHabil(x, cal)) n++;
  return n * signo;
}

/** Días hábiles desde `desde` (incluido) en adelante. */
export function proximosHabiles(desde: string, n: number, cal: Calendario): string[] {
  const out: string[] = [];
  let x = ajustarAHabil(desde, cal);
  while (out.length < n) {
    out.push(x);
    x = sumarHabiles(x, 1, cal);
  }
  return out;
}

/** Lunes de la semana de una fecha. */
export function lunesDe(f: string): string {
  return sumarCorridos(f, 1 - diaSemana(f));
}

/** Feriados nacionales de Argentina 2026–2027 (inamovibles y trasladables ya fijados). */
export const FERIADOS_AR: { fecha: string; nombre: string }[] = [
  { fecha: "2026-01-01", nombre: "Año nuevo" },
  { fecha: "2026-02-16", nombre: "Carnaval" },
  { fecha: "2026-02-17", nombre: "Carnaval" },
  { fecha: "2026-03-24", nombre: "Día de la Memoria" },
  { fecha: "2026-04-02", nombre: "Malvinas" },
  { fecha: "2026-04-03", nombre: "Viernes Santo" },
  { fecha: "2026-05-01", nombre: "Día del Trabajador" },
  { fecha: "2026-05-25", nombre: "Revolución de Mayo" },
  { fecha: "2026-06-15", nombre: "Paso a la Inmortalidad de Güemes" },
  { fecha: "2026-06-20", nombre: "Día de la Bandera" },
  { fecha: "2026-07-09", nombre: "Día de la Independencia" },
  { fecha: "2026-08-17", nombre: "Paso a la Inmortalidad de San Martín" },
  { fecha: "2026-10-12", nombre: "Diversidad Cultural" },
  { fecha: "2026-11-23", nombre: "Soberanía Nacional" },
  { fecha: "2026-12-08", nombre: "Inmaculada Concepción" },
  { fecha: "2026-12-25", nombre: "Navidad" },
  { fecha: "2027-01-01", nombre: "Año nuevo" },
  { fecha: "2027-02-08", nombre: "Carnaval" },
  { fecha: "2027-02-09", nombre: "Carnaval" },
  { fecha: "2027-03-24", nombre: "Día de la Memoria" },
  { fecha: "2027-03-26", nombre: "Viernes Santo" },
  { fecha: "2027-04-02", nombre: "Malvinas" },
  { fecha: "2027-05-01", nombre: "Día del Trabajador" },
  { fecha: "2027-05-25", nombre: "Revolución de Mayo" },
  { fecha: "2027-06-20", nombre: "Día de la Bandera" },
  { fecha: "2027-07-09", nombre: "Día de la Independencia" },
  { fecha: "2027-12-08", nombre: "Inmaculada Concepción" },
  { fecha: "2027-12-25", nombre: "Navidad" },
];
