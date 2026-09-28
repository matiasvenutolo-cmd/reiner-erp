import Link from "next/link";
import { getColaPorCentroTrabajo, getPiezasCompraPendientes } from "@/lib/data/produccion";
import { getAsignacionesVigentesBatch } from "@/lib/data/planificacion";
import { ColaDisponibleAhora } from "@/components/ColaDisponibleAhora";
import { AsignacionBadge } from "@/components/AsignacionBadge";
import type { ItemCola } from "@/lib/data/produccion";
import type { AsignacionVigente } from "@/lib/data/planificacion";

// Datos en vivo (stock/OT cambian todo el tiempo) — nunca prerenderizar en build.
export const dynamic = "force-dynamic";

export default async function CentrosTrabajoPage() {
  const [colas, compraPendiente] = await Promise.all([getColaPorCentroTrabajo(), getPiezasCompraPendientes()]);
  const conTrabajo = colas.filter((c) => c.disponibleAhora.length > 0 || c.aFuturo.length > 0);

  const todosLosOtPiezaIds = colas.flatMap((c) => [...c.disponibleAhora, ...c.aFuturo].map((it) => it.otPieza.id));
  const asignacionesMap = await getAsignacionesVigentesBatch(todosLosOtPiezaIds);
  const asignaciones = Object.fromEntries(asignacionesMap);

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">Centros de trabajo</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Por cada centro: qué está disponible para arrancar ahora y qué va a llegar más adelante,
          una vez que termine el paso anterior. Arrastrá el ⠿ para cambiar qué se hace primero, y
          clickeá una pieza para ver su detalle completo — qué operación es, y si está asignada.
        </p>
      </div>

      {conTrabajo.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-6 text-center text-foreground-muted text-sm">
          No hay piezas pendientes de fabricar en ningún centro.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {conTrabajo.map(({ centro, disponibleAhora, aFuturo }) => (
            <div key={centro.id} className="bg-surface border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{centro.nombre}</h2>
                <span className="badge-estado bg-surface-muted text-foreground-muted">
                  {disponibleAhora.length} ahora · {aFuturo.length} a futuro
                </span>
              </div>

              {disponibleAhora.length === 0 ? (
                <p className="text-sm text-foreground-muted">Nada disponible para arrancar ahora.</p>
              ) : (
                <ColaDisponibleAhora centroId={centro.id} items={disponibleAhora} asignaciones={asignaciones} />
              )}

              {aFuturo.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-foreground-muted hover:text-foreground">
                    {aFuturo.length} más adelante, sin llegar todavía
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {aFuturo.map((item) => (
                      <li key={item.otPieza.id}>
                        <Link
                          href={`/ot/${item.otMaquinaId}/pieza/${item.otPieza.id}`}
                          className="block px-2.5 py-1.5 rounded opacity-60 hover:opacity-100 hover:bg-surface-muted"
                        >
                          <ItemColaTexto item={item} asignacion={asignaciones[item.otPieza.id]} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-1">Piezas de compra pendientes</h2>
        <p className="text-xs text-foreground-muted mb-2">
          No se fabrican en ningún centro — dependen de una compra todavía no resuelta. Mientras
          falten, frenan el armado del conjunto igual que una pieza trabada en un centro.
        </p>
        {compraPendiente.length === 0 ? (
          <p className="text-sm text-foreground-muted">No hay piezas de compra pendientes en este momento.</p>
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Pieza</th>
                  <th className="text-left px-4 py-2 font-medium">Conjunto</th>
                  <th className="text-left px-4 py-2 font-medium">OT máquina</th>
                  <th className="text-right px-4 py-2 font-medium">Faltan</th>
                </tr>
              </thead>
              <tbody>
                {compraPendiente.map((it) => (
                  <tr key={it.otPiezaId} className="border-t border-border hover:bg-surface-muted/50">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-foreground-muted mr-1">{it.piezaCodigo}</span>
                      {it.piezaNombre}
                    </td>
                    <td className="px-4 py-2.5">{it.conjuntoNombre}</td>
                    <td className="px-4 py-2.5">
                      <Link href={`/ot/${it.otMaquinaId}`} className="text-accent hover:underline">
                        {it.otMaquinaCodigo}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-700">
                      {it.cantidadNecesaria - it.disponible} de {it.cantidadNecesaria}
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

function ItemColaTexto({ item, asignacion }: { item: ItemCola; asignacion?: AsignacionVigente }) {
  return (
    <div className="min-w-0">
      <div className="font-medium text-sm truncate">{item.piezaNombre}</div>
      <div className="text-xs text-foreground-muted truncate">
        {item.otMaquinaCodigo} · {item.conjuntoNombre} · op. {item.operacionSecuencia}/{item.totalOperaciones}
      </div>
      {asignacion && <AsignacionBadge asignacion={asignacion} className="mt-1" />}
    </div>
  );
}
