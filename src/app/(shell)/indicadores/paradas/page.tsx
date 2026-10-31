import Link from "next/link";
import { asc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { usuario, centroTrabajo } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasIndicadores } from "@/components/ui/PestanasSecciones";
import { Vacio } from "@/components/ui/Aviso";
import { getParadasYRechazos } from "@/lib/data/indicadores-vista";
import { fechaCorta } from "@/lib/formato";

export const dynamic = "force-dynamic";

type Params = { periodo?: string; operario?: string; centro?: string };
const MOTIVO_RECHAZO: Record<string, string> = { medida: "Medida", terminacion: "Terminación", material: "Material", otro: "Otro" };

/**
 * Indicadores → Paradas y rechazos (reorganización 30/10 §4.4): paradas por motivo con las horas perdidas,
 * rechazos por pieza y motivo, y las tareas marcadas "No puedo hacer esta". Filtro por período, operario y centro.
 */
export default async function ParadasPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const periodo = sp.periodo === "mes" ? "mes" : sp.periodo === "todo" ? "todo" : "semana";
  const [datos, operarios, centros] = await Promise.all([
    getParadasYRechazos({ periodo, operarioId: sp.operario || undefined, centroId: sp.centro || undefined }),
    db.select({ id: usuario.id, nombre: usuario.nombre }).from(usuario).where(and(eq(usuario.rol, "operario"), eq(usuario.activo, true))).orderBy(asc(usuario.nombre)),
    db.select({ id: centroTrabajo.id, nombre: centroTrabajo.nombre }).from(centroTrabajo).orderBy(asc(centroTrabajo.orden)),
  ]);
  const { paradas, rechazos, bloqueos } = datos;
  const horasPerdidas = paradas.reduce((s, p) => s + p.horas, 0);
  const h = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`;
  return (
    <div className="space-y-6">
      <PageHeader titulo="Indicadores" descripcion="Paradas, rechazos y tareas que no se pudieron hacer. Sólo para mirar.">
        <PestanasIndicadores actual="/indicadores/paradas" />
      </PageHeader>

      <form className="flex flex-wrap items-end gap-2 text-sm">
        <select name="periodo" defaultValue={periodo} className="input py-1.5 w-auto" aria-label="Período">
          <option value="semana">Esta semana</option>
          <option value="mes">Este mes</option>
          <option value="todo">Todo</option>
        </select>
        <select name="operario" defaultValue={sp.operario ?? ""} className="input py-1.5 w-auto" aria-label="Operario">
          <option value="">Todos los operarios</option>
          {operarios.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
        <select name="centro" defaultValue={sp.centro ?? ""} className="input py-1.5 w-auto" aria-label="Centro">
          <option value="">Todos los centros</option>
          {centros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <button className="btn-secundario btn-sm">Ver</button>
      </form>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Paradas por motivo {paradas.length > 0 && <span className="text-foreground-muted font-normal text-base">· {h(horasPerdidas)} perdidas</span>}</h2>
        {paradas.length === 0 ? (
          <p className="text-sm text-foreground-muted">No hay paradas registradas en este período.</p>
        ) : (
          <ul className="tarjeta divide-y divide-border text-sm">
            {paradas.map((p) => (
              <li key={p.motivo} className="flex items-center gap-3 px-4 py-2">
                <span className="w-44 shrink-0 font-medium">{p.motivo}</span>
                <span className="flex-1 h-2 rounded-full bg-surface-muted overflow-hidden">
                  <span className="block h-full bg-naranja" style={{ width: `${horasPerdidas > 0 ? (p.horas / horasPerdidas) * 100 : 0}%` }} />
                </span>
                <span className="tabular-nums text-foreground-muted w-40 text-right">
                  {p.cantidad} parada{p.cantidad === 1 ? "" : "s"} · {h(p.horas)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Rechazos por pieza y motivo</h2>
        {rechazos.length === 0 ? (
          <p className="text-sm text-foreground-muted">No hay piezas rechazadas en este período.</p>
        ) : (
          <ul className="tarjeta divide-y divide-border text-sm">
            {rechazos.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  <span className="font-medium">{r.pieza}</span> <span className="font-mono text-xs text-foreground-muted">{r.codigo}</span>
                </span>
                <span className="text-foreground-muted">
                  {r.rechazadas} rechazada{r.rechazadas === 1 ? "" : "s"} · {MOTIVO_RECHAZO[r.motivo ?? ""] ?? "sin motivo"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">&ldquo;No puedo hacer esta&rdquo;</h2>
        {bloqueos.length === 0 ? (
          <p className="text-sm text-foreground-muted">Ningún operario marcó una tarea como que no la podía hacer en este período.</p>
        ) : (
          <ul className="tarjeta divide-y divide-border text-sm">
            {bloqueos.map((b, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  <span className="font-medium">{b.pieza}</span> · {b.motivoTexto}
                  {b.texto ? <span className="text-foreground-muted"> — {b.texto}</span> : null}
                </span>
                <span className="text-xs text-foreground-muted">
                  {fechaCorta(b.creada.toISOString().slice(0, 10))} · {b.resuelta ? "resuelta" : "sin resolver"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {paradas.length + rechazos.length + bloqueos.length === 0 && periodo !== "todo" && (
        <Vacio neutro accion={<Link href="/indicadores/paradas?periodo=todo" className="btn-texto btn-sm">Ver todo →</Link>}>
          Todavía no hay paradas ni rechazos en este período: aparecen cuando los operarios los cargan en la tablet.
        </Vacio>
      )}
    </div>
  );
}
