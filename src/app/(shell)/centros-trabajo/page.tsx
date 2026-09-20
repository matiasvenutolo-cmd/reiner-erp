import { getColaPorCentroTrabajo } from "@/lib/data/produccion";
import { moverPrioridadAction } from "@/app/actions/produccion";
import type { ItemCola } from "@/lib/data/produccion";

// Datos en vivo (stock/OT cambian todo el tiempo) — nunca prerenderizar en build.
export const dynamic = "force-dynamic";

export default async function CentrosTrabajoPage() {
  const colas = await getColaPorCentroTrabajo();
  const conTrabajo = colas.filter((c) => c.disponibleAhora.length > 0 || c.aFuturo.length > 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">Centros de trabajo</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Por cada centro: qué está disponible para arrancar ahora y qué va a llegar más adelante,
          una vez que termine el paso anterior (pedido de Horacio en la devolución del 2026-09-19,
          ver docs/05-backlog-release-2.md §3). Las flechas reordenan la cola de &quot;disponible
          ahora&quot;.
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
                <ul className="space-y-1.5">
                  {disponibleAhora.map((item, i) => (
                    <li key={item.otPieza.id} className="flex items-center gap-2 bg-surface-muted rounded-md px-2.5 py-2">
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <form action={moverPrioridadAction}>
                          <input type="hidden" name="otPiezaId" value={item.otPieza.id} />
                          <input type="hidden" name="centroTrabajoId" value={centro.id} />
                          <input type="hidden" name="direccion" value="subir" />
                          <button
                            type="submit"
                            disabled={i === 0}
                            className="block leading-none text-xs text-foreground-muted hover:text-accent disabled:opacity-25 disabled:hover:text-foreground-muted"
                            aria-label="Subir prioridad"
                          >
                            ▲
                          </button>
                        </form>
                        <form action={moverPrioridadAction}>
                          <input type="hidden" name="otPiezaId" value={item.otPieza.id} />
                          <input type="hidden" name="centroTrabajoId" value={centro.id} />
                          <input type="hidden" name="direccion" value="bajar" />
                          <button
                            type="submit"
                            disabled={i === disponibleAhora.length - 1}
                            className="block leading-none text-xs text-foreground-muted hover:text-accent disabled:opacity-25 disabled:hover:text-foreground-muted"
                            aria-label="Bajar prioridad"
                          >
                            ▼
                          </button>
                        </form>
                      </div>
                      <ItemColaTexto item={item} />
                    </li>
                  ))}
                </ul>
              )}

              {aFuturo.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-foreground-muted hover:text-foreground">
                    {aFuturo.length} más adelante, sin llegar todavía
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {aFuturo.map((item) => (
                      <li key={item.otPieza.id} className="px-2.5 py-1.5 opacity-60">
                        <ItemColaTexto item={item} />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemColaTexto({ item }: { item: ItemCola }) {
  return (
    <div className="min-w-0">
      <div className="font-medium text-sm truncate">{item.piezaNombre}</div>
      <div className="text-xs text-foreground-muted truncate">
        {item.otMaquinaCodigo} · {item.conjuntoNombre} · op. {item.operacionSecuencia}/{item.totalOperaciones}
      </div>
    </div>
  );
}
