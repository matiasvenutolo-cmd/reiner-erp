import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pieza as tPieza, operacion, proceso, proveedor } from "@/lib/db/schema";
import { guardarArticuloPiezaAction, usarTiempoMedidoAction } from "@/app/actions/v2";

const CLASES = [
  ["fabricada", "Fabricada", "Se hace en REINER con su hoja de ruta."],
  ["a_medida", "A medida", "La fabrica un proveedor con plano de REINER."],
  ["comercial", "Comercial", "Se compra hecha (motor, reductor, rodamiento…)."],
] as const;

/**
 * Lo que la ficha de la pieza necesita para planificar: tipo de artículo,
 * materia prima, proveedor y plazo si se compra, y el tiempo de cada paso
 * con el promedio medido en planta para adoptarlo con un clic.
 */
export async function FichaPlanificacion({ piezaId, editable }: { piezaId: string; editable: boolean }) {
  const [[p], pasos, proveedores, medidos] = await Promise.all([
    db.select().from(tPieza).where(eq(tPieza.id, piezaId)),
    db
      .select({ o: operacion, nombre: proceso.nombre, tipo: proceso.tipo, ds: proceso.setupMin, dm: proceso.minPorUnidad })
      .from(operacion)
      .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
      .where(eq(operacion.piezaId, piezaId))
      .orderBy(asc(operacion.secuencia)),
    db.select({ id: proveedor.id, nombre: proveedor.razonSocial }).from(proveedor).orderBy(proveedor.razonSocial),
    db.execute<{ operacion_id: string; setup: number | null; min: number | null; n: number }>(sql`
      select r.operacion_id,
        round(avg(r.duracion_seg) filter (where r.tipo = 'setup') / 60.0)::int setup,
        round((sum(r.duracion_seg) filter (where r.tipo = 'ejecucion') / 60.0 / nullif(sum(coalesce(r.piezas_ok,0) + coalesce(r.piezas_rechazadas,0)) filter (where r.tipo = 'ejecucion'), 0))::numeric, 1)::float min,
        count(*) filter (where r.tipo = 'ejecucion')::int n
      from registro_operacion r join operacion o on o.id = r.operacion_id
      where o.pieza_id = ${piezaId} and r.fin is not null
      group by r.operacion_id`),
  ]);
  if (!p) return null;
  const medido = new Map(medidos.map((m) => [m.operacion_id, m]));
  return (
    <section className="tarjeta p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Para planificar</h2>
        <p className="text-xs text-foreground-muted">El plan usa estos datos para calcular cuánto tarda la pieza y cuándo hay que pedir lo que necesita.</p>
      </div>
      <form action={guardarArticuloPiezaAction} className="space-y-3 text-sm">
        <input type="hidden" name="piezaId" value={p.id} />
        <fieldset disabled={!editable} className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-2">
            {CLASES.map(([v, l, ayuda]) => (
              <label key={v} className="flex gap-2 rounded-md border border-border p-2.5 cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input type="radio" name="clase" value={v} defaultChecked={p.clase === v} className="mt-0.5" />
                <span>
                  <span className="font-medium block">{l}</span>
                  <span className="text-xs text-foreground-muted">{ayuda}</span>
                </span>
              </label>
            ))}
          </div>
          {p.claseSugerida && <p className="text-xs text-demo-fg">El sistema sugiere marcarla como {p.claseSugerida === "comercial" ? "Comercial" : p.claseSugerida}.</p>}
          <div className="grid sm:grid-cols-4 gap-2 items-end">
            <label className="sm:col-span-2">
              Materia prima
              <input name="material" defaultValue={p.material ?? ""} placeholder="ej. Barra SAE 1045 Ø50" className="input block w-full mt-0.5" />
            </label>
            <label>
              Cantidad por pieza
              <input name="materialCantidad" type="number" step="0.001" defaultValue={p.materialCantidad ?? ""} className="input block w-full mt-0.5" />
            </label>
            <label>
              Unidad
              <select name="materialUnidad" defaultValue={p.materialUnidad ?? "kg"} className="input block w-full mt-0.5">
                {["kg", "m", "mm", "u.", "m²"].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-4 flex items-center gap-2">
              <input type="checkbox" name="materialDeStock" defaultChecked={p.materialDeStock} /> La materia prima sale de stock (no hay que comprarla para cada orden)
            </label>
            <label className="sm:col-span-2">
              Proveedor habitual
              <select name="proveedorHabitualId" defaultValue={p.proveedorHabitualId ?? ""} className="input block w-full mt-0.5">
                <option value="">—</option>
                {proveedores.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Plazo de compra (días hábiles)
              <input name="plazoCompraDias" type="number" min="0" defaultValue={p.plazoCompraDias ?? ""} placeholder="el del proveedor" className="input block w-full mt-0.5" />
            </label>
            <button className="btn">Guardar</button>
          </div>
        </fieldset>
      </form>

      {pasos.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-foreground-muted mb-1">Tiempos de cada paso</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-foreground-muted">
              <tr>
                <th className="text-left font-medium py-1">Paso</th>
                <th className="text-left font-medium py-1">Se usa</th>
                <th className="text-left font-medium py-1">Medido en planta</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pasos.map(({ o, nombre, tipo, ds, dm }) => {
                const m = medido.get(o.id);
                const propio = o.minPorUnidad != null;
                return (
                  <tr key={o.id} className="border-t border-border">
                    <td className="py-1.5">
                      {o.secuencia}. {nombre}
                      {o.descripcion ? ` · ${o.descripcion}` : ""}
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {tipo !== "interno" ? (
                        <span className="text-foreground-muted">{tipo === "tercerizado" ? "tercerizado" : "compra"}</span>
                      ) : (
                        <>
                          {o.setupMin ?? ds ?? 0} min + {o.minPorUnidad ?? dm ?? 0} min/u{" "}
                          <span className={`text-xs ${propio ? "text-verde-fg" : "text-demo-fg"}`}>{propio ? (o.tiempoOrigen === "medido" ? "medido" : "propio") : "del proceso (estimado)"}</span>
                        </>
                      )}
                    </td>
                    <td className="py-1.5 tabular-nums text-foreground-muted">
                      {m && m.n > 0 ? `${m.setup ?? 0} min + ${m.min ?? "?"} min/u (${m.n} registro${m.n === 1 ? "" : "s"})` : "—"}
                      {m && m.n > 0 && m.n < 3 && <span className="block text-xs">hacen falta 3 registros para proponerlo</span>}
                    </td>
                    <td className="py-1.5 text-right">
                      {editable && m && m.min != null && m.n >= 3 && tipo === "interno" && (
                        <form action={usarTiempoMedidoAction}>
                          <input type="hidden" name="operacionId" value={o.id} />
                          <input type="hidden" name="minPorUnidad" value={m.min} />
                          <input type="hidden" name="setupMin" value={m.setup ?? ""} />
                          <input type="hidden" name="volver" value={`/maestros/pieza/${p.id}`} />
                          <button className="text-xs text-accent hover:underline">Usar el tiempo medido</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-foreground-muted mt-1">
            Para editar varios a la vez, usá la <Link href="/maestros/tiempos" className="text-accent hover:underline">grilla de tiempos</Link>.
          </p>
        </div>
      )}
    </section>
  );
}
