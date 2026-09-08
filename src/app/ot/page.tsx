import Link from "next/link";
import { listarOtMaquinas } from "@/lib/data/ot";
import { EstadoBadge } from "@/components/EstadoBadge";

export default async function OtPage() {
  const ordenes = await listarOtMaquinas();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Órdenes de trabajo</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Máquina → conjunto → pieza, con explosión automática y cruce contra stock (RF-02 a RF-04).
          </p>
        </div>
        <Link
          href="/ot/nueva"
          className="bg-accent text-accent-foreground text-sm font-medium px-4 py-2 rounded-md hover:opacity-90"
        >
          + Generar OT de máquina
        </Link>
      </div>

      {ordenes.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center text-foreground-muted text-sm">
          Todavía no se generó ninguna OT de máquina.{" "}
          <Link href="/ot/nueva" className="text-accent hover:underline">
            Generar la primera →
          </Link>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">OT</th>
                <th className="text-left px-4 py-2 font-medium">Configuración</th>
                <th className="text-left px-4 py-2 font-medium">Cliente</th>
                <th className="text-left px-4 py-2 font-medium">Plazo</th>
                <th className="text-right px-4 py-2 font-medium">Piezas a fabricar</th>
                <th className="text-left px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map((ot) => (
                <tr key={ot.id} className="border-t border-border hover:bg-surface-muted/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/ot/${ot.id}`} className="font-mono text-xs text-accent hover:underline font-semibold">
                      {ot.codigo}
                    </Link>
                    <div className="text-xs text-foreground-muted">Serie {ot.numeroSerie}</div>
                  </td>
                  <td className="px-4 py-2.5">{ot.configuracion?.nombre ?? "—"}</td>
                  <td className="px-4 py-2.5">{ot.clienteNombre ?? "—"}</td>
                  <td className="px-4 py-2.5 text-foreground-muted">{ot.plazoEntrega ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {ot.piezasTerminadas} / {ot.totalPiezasAFabricar}
                  </td>
                  <td className="px-4 py-2.5">
                    <EstadoBadge estado={ot.estadoCalculado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
