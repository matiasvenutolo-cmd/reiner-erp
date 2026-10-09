import { getProveedores } from "@/lib/data/logistica";
import { crearProveedorAction, actualizarProveedorAction } from "@/app/actions/proveedores";

export const dynamic = "force-dynamic";

/**
 * Proveedores: alta y edición (observación del cliente en Fase 3). Son los que
 * se eligen al registrar la vuelta de un tercerizado, la llegada de una compra
 * o un ingreso con control de calidad.
 */
export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const proveedores = await getProveedores();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Proveedores</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Los que aparecen al registrar la vuelta de un tercerizado, la llegada de una compra o un ingreso con control de calidad.
        </p>
      </div>

      {error && <div className="badge-estado badge-alerta text-sm px-3 py-2 block">{error}</div>}

      <form action={crearProveedorAction} className="bg-surface border border-border rounded-lg p-4 space-y-2">
        <h2 className="text-sm font-semibold">Nuevo proveedor</h2>
        <div className="grid sm:grid-cols-[2fr_1.5fr_1.5fr_auto] gap-2">
          <input name="razonSocial" required placeholder="Razón social" className="input" />
          <input name="rubro" placeholder="Rubro (ej. Cromado, Materia prima)" className="input" />
          <input name="condicion" placeholder="Condición (opcional)" className="input" />
          <button type="submit" className="bg-accent text-accent-foreground font-medium text-sm px-4 py-2 rounded-md hover:opacity-90">
            Agregar
          </button>
        </div>
      </form>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="hidden sm:grid grid-cols-[2fr_1.5fr_1.5fr_4rem] gap-2 bg-surface-muted text-foreground-muted text-xs uppercase font-medium px-4 py-2">
          <span>Razón social</span>
          <span>Rubro</span>
          <span>Condición</span>
          <span></span>
        </div>
        {proveedores.length === 0 && <p className="px-4 py-3 text-sm text-foreground-muted">Todavía no hay proveedores cargados.</p>}
        {proveedores.map((p) => (
          // key: React 19 resetea el form tras la acción; así se rearma con lo guardado.
          <form
            key={`${p.id}|${p.razonSocial}|${p.rubro}|${p.condicion}`}
            action={actualizarProveedorAction}
            className="grid sm:grid-cols-[2fr_1.5fr_1.5fr_4rem] gap-2 items-center px-4 py-2 border-t border-border"
          >
            <input type="hidden" name="id" value={p.id} />
            <input name="razonSocial" required defaultValue={p.razonSocial} aria-label="Razón social" className="input text-sm py-1" />
            <input name="rubro" defaultValue={p.rubro ?? ""} placeholder="Rubro" aria-label="Rubro" className="input text-sm py-1" />
            <input name="condicion" defaultValue={p.condicion ?? ""} placeholder="Condición" aria-label="Condición" className="input text-sm py-1" />
            <button type="submit" className="text-xs text-accent hover:underline text-left sm:text-center">
              Guardar
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
