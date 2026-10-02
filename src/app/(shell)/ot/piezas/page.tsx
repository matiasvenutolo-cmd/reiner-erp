import Link from "next/link";
import { listarOtPiezas } from "@/lib/data/ot";
import { EstadoBadge } from "@/components/EstadoBadge";

export const dynamic = "force-dynamic";

/**
 * Todas las OT de pieza juntas, sean de una máquina, de un conjunto o de una
 * pieza suelta — para no tener que abrir cada máquina y cada conjunto para
 * encontrar una pieza. Filtros por orden, estado y producción.
 */
export default async function OtPiezasPage({
  searchParams,
}: {
  searchParams: Promise<{ ot?: string; estado?: string; produccion?: string; q?: string }>;
}) {
  const { ot, estado = "abiertas", produccion, q } = await searchParams;
  const todas = await listarOtPiezas();
  const ordenes = [...new Map(todas.map((p) => [p.otMaquinaId, p.otMaquinaCodigo])).entries()];
  const texto = (q ?? "").trim().toLowerCase();

  const filtradas = todas.filter((p) => {
    if (ot && p.otMaquinaId !== ot) return false;
    if (estado === "abiertas" && p.estado === "terminada") return false;
    if (estado !== "abiertas" && estado !== "todas" && p.estado !== estado) return false;
    if (produccion === "ingenieria" && p.enviada) return false;
    if (produccion === "enviada" && !p.enviada) return false;
    if (texto && !`${p.piezaCodigo} ${p.piezaNombre} ${p.codigo}`.toLowerCase().includes(texto)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ot" className="text-sm text-accent hover:underline">
          ← Órdenes de trabajo
        </Link>
        <h1 className="text-xl font-semibold mt-1">Todas las OT de pieza</h1>
        <p className="text-sm text-foreground-muted mt-1">
          {filtradas.length} de {todas.length} — de máquinas, de conjuntos y piezas sueltas.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <input type="search" name="q" defaultValue={q ?? ""} placeholder="Código o nombre de pieza…" className="input w-56" />
        <select name="ot" defaultValue={ot ?? ""} className="input w-auto">
          <option value="">Todas las órdenes</option>
          {ordenes.map(([id, codigo]) => (
            <option key={id} value={id}>
              {codigo}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={estado} className="input w-auto">
          <option value="abiertas">Sin terminar</option>
          <option value="pendiente">Pendientes</option>
          <option value="en_curso">En curso</option>
          <option value="terminada">Terminadas</option>
          <option value="todas">Todas</option>
        </select>
        <select name="produccion" defaultValue={produccion ?? ""} className="input w-auto">
          <option value="">En ingeniería y en producción</option>
          <option value="ingenieria">Sólo en ingeniería (sin enviar)</option>
          <option value="enviada">Sólo enviadas a producción</option>
        </select>
        <button type="submit" className="text-sm text-accent hover:underline">
          Filtrar
        </button>
      </form>

      {filtradas.length === 0 ? (
        <p className="text-sm text-foreground-muted">No hay piezas con esos filtros.</p>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">OT pieza</th>
                <th className="text-left px-4 py-2 font-medium">Pieza</th>
                <th className="text-left px-4 py-2 font-medium">Conjunto</th>
                <th className="text-right px-4 py-2 font-medium">A fabricar</th>
                <th className="text-left px-4 py-2 font-medium">Paso actual</th>
                <th className="text-left px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((p) => (
                <tr key={p.otPiezaId} className="border-t border-border hover:bg-surface-muted/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/ot/${p.otMaquinaId}/pieza/${p.otPiezaId}`} className="font-mono text-xs text-accent hover:underline">
                      {p.codigo}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {p.piezaNombre}
                    <div className="font-mono text-xs text-foreground-muted">{p.piezaCodigo}</div>
                  </td>
                  <td className="px-4 py-2.5 text-foreground-muted">{p.conjuntoNombre}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.cantidadAFabricar}</td>
                  <td className="px-4 py-2.5 text-foreground-muted">{p.estado === "terminada" ? "—" : (p.operacionActual ?? "sin hoja de ruta")}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <EstadoBadge estado={p.estado} />
                      {!p.enviada && <span className="badge-estado badge-pendiente">En ingeniería</span>}
                    </div>
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
