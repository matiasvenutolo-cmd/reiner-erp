import { getColaPorCentroTrabajo } from "@/lib/data/produccion";
import { ColaDisponibleAhora } from "@/components/ColaDisponibleAhora";
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
          una vez que termine el paso anterior. Arrastrá una pieza de &quot;disponible ahora&quot;
          para cambiar qué se hace primero.
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
                <ColaDisponibleAhora centroId={centro.id} items={disponibleAhora} />
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
