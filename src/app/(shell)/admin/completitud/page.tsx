import Link from "next/link";
import { plural } from "@/lib/formato";
import { sql, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pieza } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { aprobarReclasificacionAction, descartarReclasificacionAction } from "@/app/actions/v2";

export const dynamic = "force-dynamic";

type Fila = { id: string; codigo: string; nombre: string; piezas: number; con_ruta: number; pasos: number; con_tiempo: number; comprados: number; comprados_ok: number };

function Indicador({ titulo, valor, total, href }: { titulo: string; valor: number; total: number; href: string }) {
  const pct = total ? Math.round((valor / total) * 100) : 100;
  const color = pct >= 90 ? "bg-verde" : pct >= 50 ? "bg-naranja" : "bg-rojo";
  return (
    <Link href={href} className="block rounded-lg border border-border p-3 hover:border-accent transition-colors">
      <div className="text-xs text-foreground-muted">{titulo}</div>
      <div className="text-2xl font-semibold tabular-nums">{pct}%</div>
      <div className="h-1.5 rounded-full bg-surface-muted mt-1 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-foreground-muted mt-1">
        {valor} de {total} · completar →
      </div>
    </Link>
  );
}

/**
 * Completitud de datos: qué tan cargado está cada maestro para que el plan
 * sea confiable. Cada indicador lleva a la grilla filtrada para completarlo.
 */
export default async function CompletitudPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const [filas, duplicados, propuestas] = await Promise.all([
    db.execute<Fila>(sql`
      select c.id, c.codigo, c.nombre,
        count(distinct p.id)::int piezas,
        count(distinct p.id) filter (where exists (select 1 from operacion o where o.pieza_id = p.id))::int con_ruta,
        count(o.id) filter (where pr.tipo = 'interno')::int pasos,
        count(o.id) filter (where pr.tipo = 'interno' and o.min_por_unidad is not null)::int con_tiempo,
        count(distinct p.id) filter (where p.clase = 'comercial' or p.tipo = 'comprada')::int comprados,
        count(distinct p.id) filter (where (p.clase = 'comercial' or p.tipo = 'comprada') and p.proveedor_habitual_id is not null and coalesce(p.plazo_compra_dias, pv.plazo_dias) is not null)::int comprados_ok
      from configuracion c
      join pieza_configuracion pc on pc.configuracion_id = c.id
      join pieza p on p.id = pc.pieza_id
      left join operacion o on o.pieza_id = p.id
      left join proceso pr on pr.id = o.proceso_id
      left join proveedor pv on pv.id = p.proveedor_habitual_id
      group by c.id, c.codigo, c.nombre
      order by c.codigo`),
    db.execute<{ nombre: string; codigos: string[] }>(sql`
      select min(nombre) nombre, array_agg(codigo order by codigo) codigos
      from pieza group by lower(trim(nombre)) having count(*) > 1 order by 1`),
    db.select({ id: pieza.id, codigo: pieza.codigo, nombre: pieza.nombre }).from(pieza).where(isNotNull(pieza.claseSugerida)).orderBy(pieza.nombre),
  ]);
  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Completitud de datos"
        descripcion="Qué tan cargados están los datos que usa el plan. Mientras más completos, más confiables son las fechas. Tocá un indicador para ir a completarlo."
      />
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      <section className="space-y-3">
        {filas.map((f) => (
          <div key={f.id} className="tarjeta p-4">
            <div className="font-semibold mb-3">
              {f.codigo} <span className="text-foreground-muted font-normal">· {f.nombre} · {plural(f.piezas, "pieza")}</span>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <Indicador titulo="Piezas con hoja de ruta" valor={f.con_ruta} total={f.piezas} href={`/maestros/tiempos?config=${f.id}&filtro=sin-ruta`} />
              <Indicador titulo="Pasos con tiempo propio (no estimado)" valor={f.con_tiempo} total={f.pasos} href={`/maestros/tiempos?config=${f.id}&filtro=sin-tiempo`} />
              <Indicador titulo="Comprados con proveedor y plazo" valor={f.comprados_ok} total={f.comprados} href={`/maestros/${f.id}`} />
            </div>
          </div>
        ))}
      </section>

      {propuestas.length > 0 && (
        <section id="reclasificar" className="scroll-mt-20">
          <h2 className="text-base font-semibold">Reclasificar como artículo comercial ({propuestas.length})</h2>
          <p className="text-sm text-foreground-muted mb-2">
            El sistema propone que estas piezas se compran hechas (motores, reductores, rodamientos, celdas, o rutas con sólo &ldquo;Compras&rdquo;). Comercial = se compra con el plazo del proveedor y no lleva hoja de ruta. No se aplica solo: revisá y aprobá.
          </p>
          <form className="tarjeta overflow-hidden">
            <ul className="divide-y divide-border text-sm max-h-96 overflow-y-auto">
              {propuestas.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                  <input type="checkbox" name="piezaId" value={p.id} defaultChecked aria-label={p.nombre} />
                  <span className="font-mono text-xs text-foreground-muted w-36">{p.codigo}</span>
                  <span>{p.nombre}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-surface-muted/50">
              <button formAction={descartarReclasificacionAction} className="btn-secundario">
                Descartar las tildadas
              </button>
              <button formAction={aprobarReclasificacionAction} className="btn">
                Pasar las tildadas a Comercial
              </button>
            </div>
          </form>
        </section>
      )}

      <section>
        <h2 className="text-base font-semibold">Posibles piezas duplicadas ({duplicados.length})</h2>
        <p className="text-sm text-foreground-muted mb-2">Mismo nombre y código distinto. Puede ser correcto (variantes) o un duplicado para unificar: revisalo con ingeniería.</p>
        <div className="tarjeta divide-y divide-border text-sm max-h-96 overflow-y-auto">
          {duplicados.map((d) => (
            <div key={d.nombre} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <span className="font-medium min-w-48">{d.nombre}</span>
              {d.codigos.map((c) => (
                <Link key={c} href={`/maestros/pieza/${c}`} className="font-mono text-xs text-accent hover:underline">
                  {c}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
