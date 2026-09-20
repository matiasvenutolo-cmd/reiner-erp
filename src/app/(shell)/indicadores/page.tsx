import { getResumenIndicadores, getParadasPorTipo, getTiempoPorOperario, getTiempoPorProceso } from "@/lib/data/indicadores";

function fmtHoras(h: number): string {
  return h.toFixed(1) + " h";
}

export default async function IndicadoresPage() {
  const [resumen, paradasPorTipo, tiempoPorOperario, tiempoPorProceso] = await Promise.all([
    getResumenIndicadores(),
    getParadasPorTipo(),
    getTiempoPorOperario(),
    getTiempoPorProceso(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Indicadores de fabricación</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Tiempos, paradas y errores disparados desde el taller (pedido de Horacio en la devolución
          del 2026-09-19, ver docs/05-backlog-release-2.md §7). Se arma solo con lo que ya se carga
          en /taller — no agrega ningún dato nuevo a registrar.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Horas de fabricación" value={fmtHoras(resumen.horasEjecucion)} />
        <Metric label="Horas de setup" value={fmtHoras(resumen.horasSetup)} />
        <Metric label="Piezas OK" value={String(resumen.piezasOk)} />
        <Metric label="Piezas rechazadas" value={String(resumen.piezasRechazadas)} alerta={resumen.piezasRechazadas > 0} />
        <Metric label="Piezas NO OK (cierre)" value={String(resumen.piezasNoOk)} alerta={resumen.piezasNoOk > 0} />
        <Metric label="Piezas defectuosas" value={String(resumen.piezasDefectuosas)} alerta={resumen.piezasDefectuosas > 0} />
        <Metric label="Piezas retrabajadas" value={String(resumen.piezasRetrabajadas)} alerta={resumen.piezasRetrabajadas > 0} />
        <Metric label="Paradas" value={`${resumen.paradasCantidad} · ${fmtHoras(resumen.paradasHoras)}`} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold mb-2">Paradas por tipo</h2>
          {paradasPorTipo.length === 0 ? (
            <p className="text-sm text-foreground-muted">Todavía no hay paradas cerradas registradas.</p>
          ) : (
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
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
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
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
          <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
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
