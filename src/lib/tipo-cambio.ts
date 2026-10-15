/**
 * Tipo de cambio oficial para las cotizaciones de Compras (Fase 3.2).
 *
 * Fuente: API pública del BCRA, Estadísticas Cambiarias v1.0
 * (`/Cotizaciones/{moneda}`), la cotización que el Banco Central publica para
 * cada día hábil. Pendiente de confirmar con REINER si es la que quieren usar
 * (por ejemplo, frente al billete vendedor del Banco Nación): está en un solo
 * lugar a propósito, para cambiarla sin tocar el resto.
 *
 * El valor no se inventa ni se fija en código: si la API no responde, la
 * cotización se guarda sin conversión y lo dice. El valor usado se guarda en
 * la cotización (valor, fecha y fuente), así su importe convertido no cambia
 * cuando se publica la cotización del día siguiente.
 */

export type MonedaExtranjera = "USD" | "EUR";
export type TipoCambio = { moneda: MonedaExtranjera; valor: number; fecha: string; fuente: string };

export const FUENTE_TIPO_CAMBIO = "BCRA · cotización oficial";

function restarDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Cotización oficial publicada para esa fecha o, si fue feriado o fin de semana, la del último día hábil anterior. */
export async function getTipoCambioOficial(moneda: MonedaExtranjera, fechaISO: string): Promise<TipoCambio | null> {
  const url = `https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/${moneda}?fechadesde=${restarDias(fechaISO, 10)}&fechahasta=${fechaISO}`;
  try {
    const r = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const json = (await r.json()) as { results?: { fecha: string; detalle: { codigoMoneda: string; tipoCotizacion: number }[] }[] };
    const dias = (json.results ?? [])
      .map((d) => ({ fecha: d.fecha, valor: d.detalle.find((x) => x.codigoMoneda === moneda)?.tipoCotizacion ?? 0 }))
      .filter((d) => d.valor > 0 && d.fecha <= fechaISO)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (!dias.length) return null;
    return { moneda, valor: dias[0].valor, fecha: dias[0].fecha, fuente: FUENTE_TIPO_CAMBIO };
  } catch {
    return null;
  }
}
