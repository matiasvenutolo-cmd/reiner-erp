import Link from "next/link";
import { getAsignacionesRango } from "@/lib/data/planificacion";
import { getOtPieza } from "@/lib/data/ot";
import { getUsuario } from "@/lib/data/usuarios";
import { ImprimirButton } from "@/components/ImprimirButton";
import { HojaOtPieza } from "@/components/ot/HojaOtPieza";

export const dynamic = "force-dynamic";

/**
 * Hojas del día de un operario (pedido de revisión del 2026-10-02: "que el
 * operario pueda recibir/imprimir su hoja correspondiente"): primero la
 * lista de lo que tiene asignado ese día, después la OT de pieza de cada
 * trabajo, una por página al imprimir.
 */
export default async function HojasDelDiaPage({ searchParams }: { searchParams: Promise<{ operario?: string; fecha?: string }> }) {
  const { operario = "", fecha = "" } = await searchParams;
  const [usuario, asignaciones] = await Promise.all([getUsuario(operario), fecha ? getAsignacionesRango(fecha, fecha) : Promise.resolve([])]);
  const delOperario = asignaciones.filter((a) => a.operarioId === operario);
  const otPiezaIds = [...new Set(delOperario.map((a) => a.otPiezaId))];
  const otPiezas = (await Promise.all(otPiezaIds.map((id) => getOtPieza(id)))).filter((p) => p !== null);
  const fechaLegible = fecha ? new Date(`${fecha}T12:00:00`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }) : "";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/planificacion?desde=${fecha}&vista=operario`} className="text-sm text-accent hover:underline">
          ← Planificación
        </Link>
        {otPiezas.length > 0 && <ImprimirButton />}
      </div>

      <div className="bg-surface border border-border rounded-lg p-6 print:border-0 print:p-0 break-after-page">
        <h1 className="text-lg font-semibold">
          Trabajo de {usuario?.nombre ?? "—"} · {fechaLegible}
        </h1>
        {delOperario.length === 0 ? (
          <p className="text-sm text-foreground-muted mt-2">No tiene trabajo asignado ese día.</p>
        ) : (
          <table className="w-full text-sm mt-3 border-collapse">
            <thead className="text-xs uppercase text-foreground-muted">
              <tr>
                <th className="text-left py-1.5 border-b border-border">OT pieza</th>
                <th className="text-left py-1.5 border-b border-border">Pieza</th>
                <th className="text-left py-1.5 border-b border-border">Operación</th>
                <th className="text-left py-1.5 border-b border-border">Centro</th>
              </tr>
            </thead>
            <tbody>
              {delOperario.map((a) => (
                <tr key={a.id}>
                  <td className="py-1.5 border-b border-border font-mono text-xs">{a.otPiezaCodigo}</td>
                  <td className="py-1.5 border-b border-border">{a.piezaNombre}</td>
                  <td className="py-1.5 border-b border-border">{a.operacionNombre ?? "—"}</td>
                  <td className="py-1.5 border-b border-border">{a.centroNombre ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {otPiezas.map((p) => (
        <div key={p.id} className="break-after-page">
          <HojaOtPieza otPieza={p} />
        </div>
      ))}
    </div>
  );
}
