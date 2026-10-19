import Link from "next/link";
import { getProveedores } from "@/lib/data/logistica";
import { getResumenEntregasProveedores } from "@/lib/data/gestion-compras";
import { crearProveedorAction } from "@/app/actions/proveedores";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso, Vacio } from "@/components/ui/Aviso";
import { ProveedorCampos } from "@/components/ProveedorCampos";

export const dynamic = "force-dynamic";

/**
 * Proveedores: un único registro, el mismo que se elige al cotizar una compra,
 * al registrar la vuelta de un tercerizado o un ingreso con control. Fase 3.2:
 * más datos (CUIT, contacto, condición de pago, dirección, horario,
 * observaciones) y la ficha de cada uno con su desempeño en entregas.
 */
export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string }> }) {
  const { q, error } = await searchParams;
  const [todos, entregas] = await Promise.all([getProveedores(), getResumenEntregasProveedores()]);
  const query = (q ?? "").trim().toLowerCase();
  const proveedores = query
    ? todos.filter((p) => [p.razonSocial, p.rubro, p.cuit, p.contacto].some((v) => v?.toLowerCase().includes(query)))
    : todos;

  return (
    <div>
      <PageHeader
        titulo="Proveedores"
        descripcion="Los datos de cada proveedor y cómo vienen sus entregas. Son los mismos que se eligen al cotizar una compra o al registrar la vuelta de un tercerizado."
      />
      {error && <Aviso tipo="error">{error}</Aviso>}

      <div className="flex flex-wrap items-start gap-3 mb-4">
        <form className="flex-1 min-w-[16rem]">
          <input type="search" name="q" defaultValue={q ?? ""} placeholder="Buscar por razón social, rubro, CUIT o contacto…" className="input" />
        </form>
        <details className="tarjeta w-full sm:w-auto sm:min-w-[28rem] open:p-4 [&:not([open])]:px-4 [&:not([open])]:py-2">
          <summary className="cursor-pointer text-sm font-semibold text-accent">+ Nuevo proveedor</summary>
          <form action={crearProveedorAction} className="mt-3 space-y-3">
            <ProveedorCampos />
            <button type="submit" className="btn">
              Guardar proveedor
            </button>
          </form>
        </details>
      </div>

      {proveedores.length === 0 ? (
        <Vacio>{query ? `Ningún proveedor coincide con "${q}".` : "Todavía no hay proveedores cargados."}</Vacio>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-foreground-muted">
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 font-medium">Proveedor</th>
                <th className="text-left px-3 py-2 font-medium">Contacto</th>
                <th className="text-left px-3 py-2 font-medium">Condición de pago</th>
                <th className="text-left px-3 py-2 font-medium">Entregas</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((p) => {
                const e = entregas.get(p.id);
                return (
                  <tr key={p.id} className="border-t border-border first:border-t-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/proveedores/${p.id}`} className="font-medium hover:text-accent hover:underline">
                        {p.razonSocial}
                      </Link>
                      <div className="text-xs text-foreground-muted">{[p.rubro, p.cuit].filter(Boolean).join(" · ") || "—"}</div>
                    </td>
                    <td className="px-3 py-2.5 text-foreground-muted">{p.contacto ?? "—"}</td>
                    <td className="px-3 py-2.5 text-foreground-muted">{p.condicionPago ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                      {e ? (
                        <>
                          <span className="text-verde-fg font-semibold">{e.ok} OK</span> ·{" "}
                          <span className={e.noOk ? "text-rojo-fg font-semibold" : "text-foreground-muted"}>{e.noOk} NO OK</span>
                        </>
                      ) : (
                        <span className="text-foreground-muted">sin entregas registradas</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/proveedores/${p.id}`} className="btn-secundario btn-sm">
                        Ver ficha →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
