import { getCentrosConUso, getTiposOperacion } from "@/lib/data/operaciones";
import { crearCentroAction, renombrarCentroAction, eliminarCentroAction } from "@/app/actions/operaciones";
import { DestinoOperacionSelect } from "@/components/DestinoOperacionSelect";

export const dynamic = "force-dynamic";

/**
 * Administración → Operaciones y centros. Separa lo que una pieza tiene que
 * hacer (tipos de operación) de dónde se hace (centros de trabajo), con el
 * destino por defecto editable — sin tocar código si cambian una operación
 * de máquina o compran una nueva. Cada pieza puede además usar otro centro
 * para un paso puntual desde su hoja de ruta en Maestros.
 */
export default async function OperacionesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [centros, tipos] = await Promise.all([getCentrosConUso(), getTiposOperacion()]);
  const sinAsignar = tipos.filter((t) => t.tipo === "interno" && !t.centroTrabajoId && t.operacionesEnHojasDeRuta > 0);

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Operaciones y centros de trabajo</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Las operaciones son lo que cada pieza tiene que hacer; los centros de trabajo, dónde se hace. Acá se define dónde se hace
          cada operación por defecto. Para una pieza puntual se puede elegir otro centro desde su hoja de ruta en Maestros.
        </p>
      </div>

      {error && <div className="badge-estado badge-alerta text-sm px-3 py-2 block">{error}</div>}

      <section>
        <h2 className="text-base font-semibold mb-2">Centros de trabajo</h2>
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Centro</th>
                <th className="text-right px-4 py-2 font-medium">Operaciones por defecto</th>
                <th className="text-right px-4 py-2 font-medium">Pasos de piezas puntuales</th>
                <th className="text-right px-4 py-2 font-medium">Operarios</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {centros.map((c) => {
                const enUso = c.tiposPorDefecto + c.operacionesDePiezas + c.operarios > 0;
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <form action={renombrarCentroAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="id" value={c.id} />
                        <input name="nombre" defaultValue={c.nombre} className="input text-sm py-1 w-48" />
                        <button type="submit" className="text-xs text-accent hover:underline">
                          Guardar
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.tiposPorDefecto}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.operacionesDePiezas}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.operarios}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={eliminarCentroAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          disabled={enUso}
                          title={enUso ? "Se usa: primero reasigná sus operaciones y operarios" : undefined}
                          className="text-xs text-red-700 hover:underline disabled:text-foreground-muted disabled:no-underline"
                        >
                          Eliminar
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <form action={crearCentroAction} className="flex items-center gap-2 px-4 py-2.5 border-t border-border bg-surface-muted/50">
            <span className="text-xs text-foreground-muted">Nuevo centro (ej. una máquina nueva)</span>
            <input name="nombre" required placeholder="Nombre" className="input text-sm py-1 w-48" />
            <button type="submit" className="text-xs text-accent hover:underline">
              Agregar
            </button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-1">Operaciones: dónde se hacen por defecto</h2>
        <p className="text-xs text-foreground-muted mb-2">
          Sin centro asignado, la operación no entra en ninguna cola ni se puede planificar: aparece como &ldquo;Asignar centro de
          trabajo&rdquo;. Si es tercerizada, va a Tercerizados para juntarla y mandarla con remito.
          {sinAsignar.length > 0 && ` Hoy hay ${sinAsignar.length} con piezas cargadas y sin asignar.`}
        </p>
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Operación</th>
                <th className="text-right px-4 py-2 font-medium">En hojas de ruta</th>
                <th className="text-left px-4 py-2 font-medium">Se hace en</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    {t.nombre}
                    {t.conCentroPropio > 0 && (
                      <div className="text-xs text-foreground-muted">
                        {t.conCentroPropio} pieza{t.conCentroPropio === 1 ? "" : "s"} con otro centro elegido
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-foreground-muted">{t.operacionesEnHojasDeRuta}</td>
                  <td className="px-4 py-2">
                    {t.tipo === "compras" ? (
                      <span className="text-xs text-foreground-muted">Compra — se resuelve con stock</span>
                    ) : (
                      <DestinoOperacionSelect
                        procesoId={t.id}
                        valor={t.tipo === "tercerizado" ? "tercerizado" : (t.centroTrabajoId ?? "")}
                        centros={centros.map((c) => ({ id: c.id, nombre: c.nombre }))}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
