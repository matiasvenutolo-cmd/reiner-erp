import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasIndicadores } from "@/components/ui/PestanasSecciones";
import { formatearDuracion, horas } from "@/lib/formato";
import { getResumenIndicadores, getParadasPorTipo, getTiempoPorOperario, getTiempoPorProceso, getEsperasSetup } from "@/lib/data/indicadores";

/** Coma decimal y, debajo de 1 h, en minutos (§4.5). */
function fmtHoras(h: number): string {
  return horas(h);
}

export default async function IndicadoresPage() {
  const [resumen, paradasPorTipo, tiempoPorOperario, tiempoPorProceso, esperas] = await Promise.all([
    getResumenIndicadores(),
    getParadasPorTipo(),
    getTiempoPorOperario(),
    getTiempoPorProceso(),
    getEsperasSetup(),
  ]);
  const cerradas = esperas.filter((e) => e.inicioFabricacion);
  const promedio = cerradas.length ? Math.round(cerradas.reduce((n, e) => n + e.esperaSeg, 0) / cerradas.length) : null;
  const fecha = (d: Date) => d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Indicadores"
        descripcion="Tiempos, paradas y rechazos de fabricación. Se arman solos con lo que el taller carga en cada operación."
      >
        <PestanasIndicadores actual="/indicadores/resumen" />
      </PageHeader>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Horas de fabricación" value={fmtHoras(resumen.horasEjecucion)} />
        <Metric label="Horas de setup" value={fmtHoras(resumen.horasSetup)} />
        <Metric label="Piezas OK" value={String(resumen.piezasOk)} />
        <Metric label="Piezas rechazadas" value={String(resumen.piezasRechazadas)} alerta={resumen.piezasRechazadas > 0} />
        <Metric label="Piezas NO OK (cierre)" value={String(resumen.piezasNoOk)} alerta={resumen.piezasNoOk > 0} />
        <Metric label="Piezas defectuosas" value={String(resumen.piezasDefectuosas)} alerta={resumen.piezasDefectuosas > 0} />
        <Metric label="Piezas retrabajadas" value={String(resumen.piezasRetrabajadas)} alerta={resumen.piezasRetrabajadas > 0} />
        <Metric label="Paradas" value={`${resumen.paradasCantidad} · ${fmtHoras(resumen.paradasHoras)}`} />
        <Metric label="Espera setup → fabricación (promedio)" value={promedio === null ? "—" : `${formatearDuracion(promedio)} · ${cerradas.length} vez${cerradas.length === 1 ? "" : "es"}`} />
      </div>

      {/* Prueba 1 (05/11): el tiempo muerto entre terminar el setup e iniciar la fabricación. */}
      <div>
        <h2 className="text-sm font-semibold mb-2">Espera entre setup y fabricación</h2>
        {esperas.length === 0 ? (
          <p className="text-sm text-foreground-muted">Todavía no hay setups terminados. Se mide desde &ldquo;Terminé el setup&rdquo; hasta &ldquo;Iniciar fabricación&rdquo; en la tablet.</p>
        ) : (
          <div className="tarjeta overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Pieza y paso</th>
                  <th className="text-left px-4 py-2 font-medium">Operario</th>
                  <th className="text-left px-4 py-2 font-medium">Terminó el setup</th>
                  <th className="text-left px-4 py-2 font-medium">Empezó a fabricar</th>
                  <th className="text-right px-4 py-2 font-medium">Espera</th>
                </tr>
              </thead>
              <tbody>
                {esperas.slice(0, 20).map((e) => (
                  <tr key={`${e.otPiezaId}-${e.finSetup.toISOString()}`} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[13px]">{e.pieza}</span> · {e.paso}
                    </td>
                    <td className="px-4 py-2.5">{e.operario}</td>
                    <td className="px-4 py-2.5 tabular-nums">{fecha(e.finSetup)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{e.inicioFabricacion ? fecha(e.inicioFabricacion) : <span className="text-naranja-fg">Todavía no</span>}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatearDuracion(e.esperaSeg)}{e.inicioFabricacion ? "" : " y sigue"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold mb-2">Paradas por tipo</h2>
          {paradasPorTipo.length === 0 ? (
            <p className="text-sm text-foreground-muted">Todavía no hay paradas cerradas registradas.</p>
          ) : (
            <div className="tarjeta overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-foreground-muted text-xs">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Tipo</th>
                    <th className="text-right px-4 py-2 font-medium">Cantidad</th>
                    <th className="text-right px-4 py-2 font-medium">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {paradasPorTipo.map((p) => (
                    <tr key={p.tipoParadaId} className="border-t border-border">
                      <td className="px-4 py-2.5">{p.nombre}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{p.cantidad}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtHoras(p.horas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-2">Tiempo por operario</h2>
          {tiempoPorOperario.length === 0 ? (
            <p className="text-sm text-foreground-muted">Todavía no hay tiempos cerrados registrados.</p>
          ) : (
            <div className="tarjeta overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-foreground-muted text-xs">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Operario</th>
                    <th className="text-right px-4 py-2 font-medium">Setup</th>
                    <th className="text-right px-4 py-2 font-medium">Fabricación</th>
                  </tr>
                </thead>
                <tbody>
                  {tiempoPorOperario.map((o) => (
                    <tr key={o.usuarioId} className="border-t border-border">
                      <td className="px-4 py-2.5">{o.nombre}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtHoras(o.horasSetup)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtHoras(o.horasEjecucion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Tiempo por proceso</h2>
        {tiempoPorProceso.length === 0 ? (
          <p className="text-sm text-foreground-muted">Todavía no hay tiempos cerrados registrados.</p>
        ) : (
          <div className="tarjeta overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Proceso</th>
                  <th className="text-right px-4 py-2 font-medium">Setup</th>
                  <th className="text-right px-4 py-2 font-medium">Fabricación</th>
                  <th className="text-right px-4 py-2 font-medium">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {tiempoPorProceso.map((p) => (
                  <tr key={p.procesoId} className="border-t border-border">
                    <td className="px-4 py-2.5">{p.nombre}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtHoras(p.horasSetup)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtHoras(p.horasEjecucion)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground-muted">{p.observaciones}</td>
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

function Metric({ label, value, alerta }: { label: string; value: string; alerta?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2">
      <div className="text-xs text-foreground-muted">{label}</div>
      <div className="font-semibold" style={alerta ? { color: "var(--estado-alerta-fg)" } : undefined}>
        {value}
      </div>
    </div>
  );
}
