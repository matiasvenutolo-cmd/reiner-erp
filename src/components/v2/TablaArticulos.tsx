import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { articuloStock, proveedor } from "@/lib/db/schema";
import { retirarArticuloAction } from "@/app/actions/v2";

const num = (n: number) => (Math.round(n * 100) / 100).toLocaleString("es-AR");

/** Materia prima y consumibles de taller: artículos que no son piezas del maestro. */
export async function TablaArticulos({ tipo }: { tipo: "materia_prima" | "consumible" }) {
  const filas = await db
    .select({ a: articuloStock, proveedor: proveedor.razonSocial })
    .from(articuloStock)
    .leftJoin(proveedor, eq(proveedor.id, articuloStock.proveedorId))
    .where(and(eq(articuloStock.tipo, tipo)))
    .orderBy(asc(articuloStock.nombre));
  const bajo = filas.filter((f) => f.a.cantidad < f.a.minimo).length;
  const esMP = tipo === "materia_prima";
  const vista = esMP ? "materia-prima" : "consumibles";
  return (
    <div className="space-y-3">
      <p className="text-sm">
        <strong>{filas.length} artículos</strong>
        {bajo > 0 && <span className="text-[#991b1b] font-semibold"> · {bajo} debajo del mínimo</span>}
        {!esMP && <span className="text-foreground-muted"> · los consumibles no se asignan a proyectos: sólo se registra el retiro.</span>}
      </p>
      <div className="tarjeta overflow-x-auto">
        {filas.length === 0 ? (
          <p className="p-4 text-sm text-foreground-muted">Todavía no hay artículos cargados en esta vista.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-foreground-muted">
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 font-medium">{esMP ? "Material" : "Artículo"}</th>
                {esMP && <th className="text-left px-3 py-2 font-medium">Medida</th>}
                <th className="text-right px-3 py-2 font-medium">Cantidad</th>
                {esMP && <th className="text-right px-3 py-2 font-medium">Libre</th>}
                {esMP && <th className="text-right px-3 py-2 font-medium">Asignada</th>}
                <th className="text-right px-3 py-2 font-medium">Mínimo</th>
                <th className="text-left px-3 py-2 font-medium">{esMP ? "Ubicación · proveedor" : "Centro donde se usa"}</th>
                <th className="px-4 py-2 font-medium text-right">Retirar</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ a, proveedor: prov }) => {
                const debajo = a.cantidad < a.minimo;
                return (
                  <tr key={a.id} className={`border-t border-border ${debajo ? "bg-[#fef2f2]" : ""}`}>
                    <td className="px-4 py-2 font-medium">
                      {a.nombre}
                      {a.esDemo && <span className="badge-estado bg-[#efe9fb] text-[#5b3aa8] ml-2">demo</span>}
                      {debajo && <div className="text-xs text-[#991b1b] font-semibold">debajo del mínimo</div>}
                    </td>
                    {esMP && <td className="px-3 py-2 text-foreground-muted">{a.medida ?? "—"}</td>}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {num(a.cantidad)} {a.unidad}
                    </td>
                    {esMP && (
                      <td className="px-3 py-2 text-right">
                        <span className="badge-estado bg-[#d9f0ea] text-[#00755d] tabular-nums">{num(a.cantidad - a.asignada)}</span>
                      </td>
                    )}
                    {esMP && (
                      <td className="px-3 py-2 text-right">{a.asignada > 0 ? <span className="badge-estado bg-accent-soft text-accent tabular-nums">{num(a.asignada)}</span> : <span className="text-foreground-muted">—</span>}</td>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums text-foreground-muted">{num(a.minimo)}</td>
                    <td className="px-3 py-2 text-foreground-muted">{esMP ? [a.ubicacion, prov].filter(Boolean).join(" · ") || "—" : a.centroUso ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={retirarArticuloAction} className="inline-flex items-center gap-1">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="vista" value={vista} />
                        <input name="cantidad" type="number" min="0" step="any" className="input text-xs py-0.5 w-16" aria-label={`Cantidad de ${a.nombre}`} />
                        <button className="btn-secundario btn-sm">Retirar</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
