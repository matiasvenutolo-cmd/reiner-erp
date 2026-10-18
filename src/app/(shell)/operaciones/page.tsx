import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { getCentrosConUso, getTiposOperacion } from "@/lib/data/operaciones";
import { crearCentroAction, renombrarCentroAction, eliminarCentroAction } from "@/app/actions/operaciones";
import { DestinoOperacionSelect } from "@/components/DestinoOperacionSelect";
import { getUsuarioActual } from "@/lib/session";
import { puedeEditarMaestros } from "@/lib/permisos";
import { Pestanas } from "@/components/ui/Pestanas";
import { TiemposPorProceso, Capacidad } from "./Vistas";

export const dynamic = "force-dynamic";

/**
 * Administración → Operaciones y centros. Separa lo que una pieza tiene que
 * hacer (tipos de operación) de dónde se hace (centros de trabajo), con el
 * destino por defecto editable — sin tocar código si cambian una operación
 * de máquina o compran una nueva. Cada pieza puede además usar otro centro
 * para un paso puntual desde su hoja de ruta en Maestros.
 */
export default async function OperacionesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; vista?: string }> }) {
  const { error, ok, vista } = await searchParams;
  const [centros, tipos, usuario] = await Promise.all([getCentrosConUso(), getTiposOperacion(), getUsuarioActual()]);
  // Taller lo consulta pero no lo modifica — ver src/lib/permisos.ts.
  const editable = puedeEditarMaestros(usuario.rol);
  const sinAsignar = tipos.filter((t) => t.tipo === "interno" && !t.centroTrabajoId && t.operacionesEnHojasDeRuta > 0);

  return (
    <div className="max-w-5xl space-y-8">
      <PageHeader
        titulo="Operaciones y centros"
        descripcion="Las operaciones son lo que cada pieza tiene que hacer; los centros, dónde se hace. Acá se define dónde se hace cada operación, cuánto tarda por defecto y cuántas horas produce cada centro."
      >
        <Pestanas
          actual={vista === "tiempos" ? "/operaciones?vista=tiempos" : vista === "capacidad" ? "/operaciones?vista=capacidad" : "/operaciones"}
          items={[
            { href: "/operaciones", label: "Centros y operaciones" },
            { href: "/operaciones?vista=tiempos", label: "Tiempos por proceso" },
            { href: "/operaciones?vista=capacidad", label: "Capacidad" },
          ]}
        />
      </PageHeader>
      {!editable && <Aviso tipo="info">Sólo lectura: esta configuración la modifica ingeniería.</Aviso>}

      {error && <Aviso tipo="error">{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {vista === "tiempos" ? <TiemposPorProceso editable={editable} /> : vista === "capacidad" ? <Capacidad editable={editable} /> : <>

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
                      {editable ? (
                        <form action={renombrarCentroAction} className="flex items-center gap-1.5">
                          <input type="hidden" name="id" value={c.id} />
                          <input name="nombre" defaultValue={c.nombre} className="input text-sm py-1 w-48" />
                          <button type="submit" className="text-xs text-accent hover:underline">
                            Guardar
                          </button>
                        </form>
                      ) : (
                        c.nombre
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.tiposPorDefecto}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.operacionesDePiezas}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.operarios}</td>
                    <td className="px-4 py-2 text-right">
                      {editable && (
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
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {editable && (
            <form action={crearCentroAction} className="flex items-center gap-2 px-4 py-2.5 border-t border-border bg-surface-muted/50">
              <span className="text-xs text-foreground-muted">Nuevo centro (ej. una máquina nueva)</span>
              <input name="nombre" required placeholder="Nombre" className="input text-sm py-1 w-48" />
              <button type="submit" className="text-xs text-accent hover:underline">
                Agregar
              </button>
            </form>
          )}
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
                    ) : !editable ? (
                      t.tipo === "tercerizado" ? (
                        "Tercerizado"
                      ) : (
                        (centros.find((c) => c.id === t.centroTrabajoId)?.nombre ?? <span className="text-amber-800">Sin centro asignado</span>)
                      )
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
      </>}
    </div>
  );
}
