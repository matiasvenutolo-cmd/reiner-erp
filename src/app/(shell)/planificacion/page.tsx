import Link from "next/link";
import { hoyISO } from "@/lib/fecha";
import { getAsignacionesRango } from "@/lib/data/planificacion";
import { getUsuariosPorRol } from "@/lib/data/usuarios";
import { getColaPorCentroTrabajo } from "@/lib/data/produccion";
import { asignarTrabajoAction, eliminarAsignacionAction } from "@/app/actions/planificacion";

// Datos en vivo (asignaciones/producción cambian todo el tiempo) — nunca prerenderizar en build.
export const dynamic = "force-dynamic";

const DIA_LABEL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function lunesDe(fecha: Date): Date {
  const d = new Date(fecha);
  const dia = d.getDay(); // 0=domingo
  const offset = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function aISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatoCorto(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export default async function PlanificacionPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string }>;
}) {
  const { desde } = await searchParams;
  const hoy = hoyISO();
  const lunes = lunesDe(new Date(`${desde ?? hoy}T00:00:00`));
  const dias = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(d.getDate() + i);
    return aISO(d);
  });
  const semanaAnterior = new Date(lunes);
  semanaAnterior.setDate(semanaAnterior.getDate() - 7);
  const semanaSiguiente = new Date(lunes);
  semanaSiguiente.setDate(semanaSiguiente.getDate() + 7);

  const [operarios, asignaciones, colas] = await Promise.all([
    getUsuariosPorRol("operario"),
    getAsignacionesRango(dias[0], dias[dias.length - 1]),
    getColaPorCentroTrabajo(),
  ]);

  const disponibles = colas.flatMap((c) => c.disponibleAhora.map((item) => ({ ...item, centroNombre: c.centro.nombre })));
  const asignadas = new Set(asignaciones.map((a) => a.otPiezaId));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Planificación semanal</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Asignar un trabajo puntual a un operario para un día — pensado para planificar toda la
          semana con anticipación.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Link href={`/planificacion?desde=${aISO(semanaAnterior)}`} className="text-sm text-accent hover:underline">
          ← Semana anterior
        </Link>
        <span className="text-sm text-foreground-muted">
          {formatoCorto(dias[0])} – {formatoCorto(dias[dias.length - 1])}
        </span>
        <Link href={`/planificacion?desde=${aISO(semanaSiguiente)}`} className="text-sm text-accent hover:underline">
          Semana siguiente →
        </Link>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-28">Operario</th>
              {dias.map((dia, i) => (
                <th key={dia} className="text-left px-3 py-2 font-medium">
                  {DIA_LABEL[i]}
                  <div className="font-normal normal-case text-foreground-muted/70">{formatoCorto(dia)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {operarios.map((op) => (
              <tr key={op.id} className="border-t border-border align-top">
                <td className="px-3 py-2.5 font-medium">{op.nombre}</td>
                {dias.map((dia) => (
                  <td key={dia} className="px-3 py-2.5">
                    <div className="space-y-1">
                      {asignaciones
                        .filter((a) => a.operarioId === op.id && a.fecha === dia)
                        .map((a) => (
                          <div key={a.id} className="flex items-center gap-1 bg-accent-soft text-accent rounded px-1.5 py-1 text-xs">
                            <span className="truncate flex-1" title={`${a.otPiezaCodigo} — ${a.piezaNombre}`}>
                              {a.piezaNombre}
                            </span>
                            <form action={eliminarAsignacionAction}>
                              <input type="hidden" name="id" value={a.id} />
                              <button type="submit" className="hover:opacity-70" aria-label="Quitar asignación">
                                ×
                              </button>
                            </form>
                          </div>
                        ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            {operarios.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-foreground-muted">
                  No hay operarios cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Trabajo disponible para asignar</h2>
        {disponibles.length === 0 ? (
          <p className="text-sm text-foreground-muted">No hay piezas disponibles para arrancar en ningún centro.</p>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Pieza</th>
                  <th className="text-left px-4 py-2 font-medium">Centro</th>
                  <th className="text-left px-4 py-2 font-medium">Asignar</th>
                </tr>
              </thead>
              <tbody>
                {disponibles.map((item) => (
                  <tr key={item.otPieza.id} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-foreground-muted mr-1">{item.otMaquinaCodigo}</span>
                      {item.piezaNombre}
                      {asignadas.has(item.otPieza.id) && (
                        <span className="badge-estado bg-accent-soft text-accent ml-2">ya asignada esta semana</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-muted">{item.centroNombre}</td>
                    <td className="px-4 py-2.5">
                      <form action={asignarTrabajoAction} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="otPiezaId" value={item.otPieza.id} />
                        <select name="operarioId" required className="input text-xs py-1" defaultValue="">
                          <option value="" disabled>
                            Operario…
                          </option>
                          {operarios.map((op) => (
                            <option key={op.id} value={op.id}>
                              {op.nombre}
                            </option>
                          ))}
                        </select>
                        <input type="date" name="fecha" required defaultValue={dias.includes(hoy) ? hoy : dias[0]} min={dias[0]} max={dias[dias.length - 1]} className="input text-xs py-1" />
                        <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap">
                          Asignar
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
