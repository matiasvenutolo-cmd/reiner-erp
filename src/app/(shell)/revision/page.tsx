import Link from "next/link";
import { getTareasRevision } from "@/lib/data/revision";
import { resolverTareaRevisionAction } from "@/app/actions/revision";

export default async function RevisionPage() {
  const [pendientes, resueltas] = await Promise.all([getTareasRevision("pendiente"), getTareasRevision("resuelta")]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Revisión de retrabajo</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Se generan solas cuando se cierra una pieza con piezas defectuosas o retrabajadas
          (pedido de Horacio en la devolución del 2026-09-19, ver docs/05-backlog-release-2.md §7)
          — nadie las carga a mano.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Pendientes ({pendientes.length})</h2>
        {pendientes.length === 0 ? (
          <p className="text-sm text-foreground-muted">No hay tareas de revisión pendientes.</p>
        ) : (
          <div className="space-y-3">
            {pendientes.map((t) => (
              <div key={t.id} className="bg-surface border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/ot/${t.otMaquinaId}`} className="font-mono text-xs text-accent hover:underline">
                      {t.otPiezaCodigo}
                    </Link>
                    <div className="font-medium text-sm">{t.piezaNombre}</div>
                    <div className="text-xs text-foreground-muted mt-0.5">
                      {new Date(t.createdAt).toLocaleString("es-AR")}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {t.piezasDefectuosas > 0 && (
                      <span className="badge-estado badge-alerta">{t.piezasDefectuosas} defectuosas</span>
                    )}
                    {t.piezasRetrabajadas > 0 && (
                      <span className="badge-estado badge-en_curso">{t.piezasRetrabajadas} a retrabajar</span>
                    )}
                  </div>
                </div>
                <form action={resolverTareaRevisionAction} className="flex gap-2">
                  <input type="hidden" name="id" value={t.id} />
                  <input
                    name="resolucion"
                    required
                    placeholder="¿Qué se hizo? (ej. se refabricaron 2, se reprocesó 1)"
                    className="input flex-1 text-sm"
                  />
                  <button type="submit" className="bg-accent text-accent-foreground text-sm font-medium px-3 rounded-md hover:opacity-90">
                    Resolver
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      {resueltas.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-foreground-muted hover:text-foreground font-medium">
            {resueltas.length} resuelta{resueltas.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-2 space-y-2">
            {resueltas.map((t) => (
              <div key={t.id} className="bg-surface border border-border rounded-lg p-3 opacity-75">
                <div className="flex items-center gap-2 text-xs text-foreground-muted">
                  <span className="font-mono">{t.otPiezaCodigo}</span>
                  <span>{t.piezaNombre}</span>
                </div>
                <p className="text-sm mt-1">{t.resolucion}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
