import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasStock } from "@/components/ui/PestanasSecciones";
import Link from "next/link";
import { Aviso, Vacio } from "@/components/ui/Aviso";
import { and, desc, eq, gt, like, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reservaStock, otMaquina, movimientoStock, otPieza, otConjunto, pieza, stockConjunto, conjunto as conjuntoT, configuracion, cliente } from "@/lib/db/schema";
import { redirect } from "next/navigation";
import { reservaVigente } from "@/lib/data/stock";
import { getUsuarioActual } from "@/lib/session";
import { cargarPiezaTerminadaAction } from "@/app/actions/stock";
import { Codigo } from "@/components/ui/Codigo";
import { Etiqueta, ESTADO_STOCK } from "@/components/ui/Etiqueta";
import { capitalizar, numero } from "@/lib/formato";
import { getPiezasFinalizadas } from "@/lib/data/stock";
import { getConjuntos, getConfiguraciones } from "@/lib/data/maestros";
import { FiltrosStock } from "@/components/FiltrosStock";

export const dynamic = "force-dynamic";

export default async function StockFinalizadoPage({
  searchParams,
}: {
  searchParams: Promise<{ conjunto?: string; maquina?: string; tipo?: string; estado?: string; ok?: string; error?: string }>;
}) {
  const { conjunto, maquina, tipo, estado, ok, error } = await searchParams;
  // Tanda 2 (05/11): las piezas compradas están en Insumos; acá, los productos terminados.
  if (tipo === "comprada") redirect("/stock/insumos");
  const tipoFiltro = "fabricada" as const;

  const [todasPiezas, conjuntos, configuraciones, reservas, origenes, usuario, catalogo] = await Promise.all([
    getPiezasFinalizadas({ conjuntoId: conjunto, configuracionId: maquina, tipo: tipoFiltro }),
    getConjuntos(),
    getConfiguraciones(),
    // Para qué orden está reservada cada pieza, y de qué orden salió (reorganización 30/10 §5.3).
    db
      .select({ piezaId: reservaStock.piezaId, codigo: otMaquina.codigo, cantidad: sql<number>`sum(${reservaStock.cantidad})`.mapWith(Number) })
      .from(reservaStock)
      .innerJoin(otMaquina, eq(otMaquina.id, reservaStock.otMaquinaId))
      .where(and(gt(reservaStock.cantidad, 0), reservaVigente))
      .groupBy(reservaStock.piezaId, otMaquina.codigo),
    db
      .selectDistinctOn([movimientoStock.piezaId], { piezaId: movimientoStock.piezaId, codigo: otMaquina.codigo })
      .from(movimientoStock)
      .innerJoin(otPieza, eq(otPieza.id, movimientoStock.otPiezaId))
      .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
      .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
      .where(and(eq(movimientoStock.tipo, "ingreso"), like(movimientoStock.observacion, "Pieza terminada%")))
      .orderBy(movimientoStock.piezaId, desc(movimientoStock.fecha)),
    getUsuarioActual(),
    db.select({ id: pieza.id, codigo: pieza.codigo, nombre: pieza.nombre }).from(pieza).where(eq(pieza.tipo, "fabricada")).orderBy(pieza.nombre),
  ]);
  const [conjuntosStock, maquinasTerminadas] = await Promise.all([
    db
      .select({ s: stockConjunto, codigo: conjuntoT.codigo, nombre: conjuntoT.nombre, config: configuracion.nombre, orden: otMaquina.codigo, destino: otMaquina.destino })
      .from(stockConjunto)
      .innerJoin(conjuntoT, eq(conjuntoT.id, stockConjunto.conjuntoId))
      .leftJoin(configuracion, eq(configuracion.id, stockConjunto.configuracionId))
      .leftJoin(otMaquina, eq(otMaquina.id, stockConjunto.otMaquinaId))
      .where(gt(stockConjunto.cantidad, 0))
      .orderBy(desc(stockConjunto.createdAt)),
    db
      .select({ id: otMaquina.id, codigo: otMaquina.codigo, serie: otMaquina.numeroSerie, config: configuracion.nombre, cliente: cliente.razonSocial })
      .from(otMaquina)
      .leftJoin(configuracion, eq(configuracion.id, otMaquina.configuracionId))
      .leftJoin(cliente, eq(cliente.id, otMaquina.clienteId))
      .where(and(eq(otMaquina.destino, "maquina"), eq(otMaquina.estadoProyecto, "terminado"))),
  ]);
  const reservasDe = new Map<string, { codigo: string; cantidad: number }[]>();
  for (const r of reservas) reservasDe.set(r.piezaId, [...(reservasDe.get(r.piezaId) ?? []), r]);
  const origenDe = new Map(origenes.map((o) => [o.piezaId, o.codigo]));
  // Desde las tarjetas del resumen: sólo lo libre o sólo lo asignado (§2.6).
  const piezas = todasPiezas.filter((p) => (estado === "libre" ? p.disponible - p.comprometido > 0 : estado === "asignada" ? p.comprometido > 0 : true));
  const totalUnidades = piezas.reduce((sum, p) => sum + p.disponible, 0);
  const totalComprometido = piezas.reduce((sum, p) => sum + p.comprometido, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Stock"
        descripcion={`Productos terminados: piezas, conjuntos y máquinas. ${piezas.length} pieza${piezas.length === 1 ? "" : "s"} distinta${piezas.length === 1 ? "" : "s"} · ${totalUnidades} unidades, ${totalComprometido} reservadas para una orden.`}
      >
        <PestanasStock actual="/stock/finalizado?tipo=fabricada" />
      </PageHeader>

      <FiltrosStock
        conjuntos={conjuntos.map((c) => ({ id: c.id, nombre: c.nombre }))}
        configuraciones={configuraciones.map((c) => ({ id: c.id, nombre: c.nombre }))}
      />

      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {usuario.rol === "taller" && (
        <details className="tarjeta px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Cargar una pieza terminada a mano</summary>
          <form action={cargarPiezaTerminadaAction} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-60">
              <span className="etiqueta">Pieza (código o nombre)</span>
              <input name="piezaId" list="piezas-fabricadas" required className="input" placeholder="ej. PS16ES100s004" />
              <datalist id="piezas-fabricadas">
                {catalogo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </datalist>
            </label>
            <label className="w-24">
              <span className="etiqueta">Cantidad</span>
              <input name="cantidad" type="number" min={1} defaultValue={1} required className="input" />
            </label>
            <label className="flex-1 min-w-48">
              <span className="etiqueta">Motivo</span>
              <input name="motivo" required className="input" placeholder="ej. ya estaba hecha en el depósito" />
            </label>
            <button className="btn">Cargar</button>
          </form>
          <p className="text-xs text-foreground-muted mt-2">Queda libre, y &ldquo;Qué hace falta&rdquo; la tiene en cuenta en las órdenes nuevas.</p>
        </details>
      )}
      {estado && (
        <p className="text-sm">
          Mostrando sólo lo {estado === "libre" ? "libre" : "reservado para una orden"}.{" "}
          <Link href={`/stock/finalizado${tipoFiltro ? `?tipo=${tipoFiltro}` : ""}`} className="text-accent hover:underline">
            Ver todo
          </Link>
        </p>
      )}
      <h2 className="text-lg font-semibold">Piezas</h2>
      {piezas.length === 0 ? (
        <Vacio neutro>No hay piezas con stock que coincidan con el filtro.</Vacio>
      ) : (
        <ul className="tarjeta divide-y divide-border">
          {piezas.map((p) => {
            const libre = p.disponible - p.comprometido;
            return (
              <li key={p.piezaId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                <div className="flex-1 min-w-48">
                  <Link href={`/stock/pieza/${p.piezaId}`} className="font-medium hover:text-accent hover:underline">
                    {capitalizar(p.piezaNombre)}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <Codigo valor={p.piezaCodigo} />
                    <span className="text-xs text-foreground-muted">{p.conjuntoNombre}</span>
                    {p.tipo === "comprada" && <span className="text-xs text-foreground-muted">· se compra</span>}
                  </div>
                </div>
                <span className="text-sm tabular-nums">{numero(p.disponible)} en almacén</span>
                <span className="flex gap-1.5">
                  {libre > 0 && <Etiqueta tono={ESTADO_STOCK.libre.tono} sinIcono>{numero(libre)} libre{libre === 1 ? "" : "s"}</Etiqueta>}
                  {p.comprometido > 0 && (
                    <Etiqueta tono={ESTADO_STOCK.asignada.tono} sinIcono>
                      {numero(p.comprometido)} reservada{p.comprometido === 1 ? "" : "s"}
                      {reservasDe.get(p.piezaId)?.length ? ` para ${reservasDe.get(p.piezaId)!.map((r) => `${r.codigo}${reservasDe.get(p.piezaId)!.length > 1 ? ` (${numero(r.cantidad)})` : ""}`).join(", ")}` : ""}
                    </Etiqueta>
                  )}
                </span>
                {origenDe.get(p.piezaId) && <span className="text-xs text-foreground-muted">salió de {origenDe.get(p.piezaId)}</span>}
              </li>
            );
          })}
        </ul>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Conjuntos</h2>
        <p className="text-sm text-foreground-muted">Entran con el control de armado OK; sus piezas salen de la lista de piezas.</p>
        {conjuntosStock.length === 0 ? (
          <Vacio neutro>Todavía no hay conjuntos armados en stock.</Vacio>
        ) : (
          <ul className="tarjeta divide-y divide-border">
            {conjuntosStock.map(({ s: c, codigo, nombre, config, orden, destino }) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span className="flex-1 min-w-48">
                  <span className="font-medium">
                    {codigo} {nombre}
                  </span>
                  {config && <span className="block text-xs text-foreground-muted">{config}</span>}
                </span>
                <span className="tabular-nums">{numero(c.cantidad)} armado{c.cantidad === 1 ? "" : "s"}</span>
                {orden && destino !== "stock" ? (
                  <Etiqueta tono={ESTADO_STOCK.asignada.tono} sinIcono>reservado para {orden}</Etiqueta>
                ) : (
                  <Etiqueta tono={ESTADO_STOCK.libre.tono} sinIcono>libre</Etiqueta>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Máquinas</h2>
        {maquinasTerminadas.length === 0 ? (
          <Vacio neutro>No hay máquinas terminadas sin entregar.</Vacio>
        ) : (
          <ul className="tarjeta divide-y divide-border">
            {maquinasTerminadas.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <Link href={`/proyectos/${m.id}`} className="flex-1 min-w-48 font-medium hover:text-accent hover:underline">
                  {m.config ?? m.codigo} · serie {m.serie}
                </Link>
                <span className="text-foreground-muted">{m.cliente ?? "Para stock"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
