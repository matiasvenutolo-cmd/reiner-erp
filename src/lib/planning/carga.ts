/**
 * Carga de un centro en una semana. El plan propuesto nunca pasa la capacidad
 * (lo que no entra se corre a la semana siguiente), así que la sobrecarga se
 * mide con la demanda: las horas de las tareas que deberían empezar esa
 * semana (inicio más tardío dentro de la semana, o antes si ya están
 * atrasadas) contra las horas disponibles.
 */
import type { ResultadoMotor } from "./motor";

export function cargaSemana(r: ResultadoMotor, centroId: string, dias: string[], primeraSemana: boolean) {
  const lunes = dias[0], viernes = dias.at(-1)!;
  const planificadas = dias.reduce((s, d) => s + (r.carga.get(centroId)?.get(d) ?? 0), 0);
  const disponible = dias.reduce((s, d) => s + (r.capacidad.get(centroId)?.get(d) ?? 0), 0);
  const demanda = r.tareas
    .filter((t) => t.tipo === "interno" && t.centroId === centroId && t.estado !== "terminada" && t.inicioMasTardio <= viernes && (primeraSemana || t.inicioMasTardio >= lunes))
    .reduce((s, t) => s + t.horas, 0);
  return { planificadas, disponible, demanda, pct: disponible ? Math.round((demanda / disponible) * 100) : 0 };
}
