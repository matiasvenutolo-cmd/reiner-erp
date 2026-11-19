import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otMaquina, otConjunto, otPieza, configuracion, cliente, pieza } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPlan } from "@/lib/planning/datos";
import { estadoDePieza } from "@/lib/estado-pieza";
import { EstadoPiezaChip } from "@/components/v2/EstadoPieza";
import { capitalizar, fechaCorta, numero, plural } from "@/lib/formato";
import { getEsperaMaterialDeOrden, getNoComprarDeOrden } from "@/lib/data/gestion-compras";
import { getProveedoresAfuera } from "@/lib/data/orden-detalle";

export const dynamic = "force-dynamic";

/**
 * "Ver qué hace falta" de una orden ya confirmada: sólo lo que falta hacer hoy (prueba 19/11). La foto de cuando
 * se generó la orden (qué salía del stock, qué se compraba, qué se fabricaba) sirve para decidir en el borrador;
 * acá confundía ("1 a fabricar" de una pieza ya terminada).
 */
export default async function QueHaceFaltaOrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [[fila], plan] = await Promise.all([
    db
      .select({ m: otMaquina, config: configuracion.nombre, cliente: cliente.razonSocial })
      .from(otMaquina)
      .leftJoin(configuracion, eq(configuracion.id, otMaquina.configuracionId))
      .leftJoin(cliente, eq(cliente.id, otMaquina.clienteId))
      .where(eq(otMaquina.id, id)),
    getPlan(),
  ]);
  if (!fila) notFound();
  const m = fila.m;

  // Prueba 19/11: en una orden confirmada no se muestra la foto de cuando se generó, sino sólo lo que falta hacer hoy:
  // qué falta comprar y qué falta fabricar (en qué paso está cada pieza). Lo terminado sale de la lista.
  const [ops, esperaMaterial, noComprar, afuera] = await Promise.all([
    db
      .select({ id: otPieza.id, piezaId: otPieza.piezaId, nombre: pieza.nombre, codigo: pieza.codigo, cant: otPieza.cantidadAFabricar, stock: otPieza.stockAlGenerar })
      .from(otPieza)
      .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
      .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
      .where(eq(otConjunto.otMaquinaId, id)),
    getEsperaMaterialDeOrden(id),
    getNoComprarDeOrden(id),
    getProveedoresAfuera(id),
  ]);
  const hoy = plan.entrada.hoy;
  const tareas = plan.resultado.tareas.filter((t) => t.proyectoId === id);
  const compras = new Map(plan.resultado.compras.filter((c) => c.proyectoId === id).map((c) => [c.otPiezaId, c]));
  const filas = ops
    .filter((op) => op.cant > 0)
    .map((op) => ({ op, e: estadoDePieza(tareas.filter((t) => t.otPiezaId === op.id), compras.get(op.id), esperaMaterial.get(op.id), noComprar.has(op.id), afuera.get(op.id)) }));
  const faltaComprar = filas.filter((f) => f.e.estado === "falta_material");
  const faltaFabricar = filas.filter((f) => !["falta_material", "terminada", "no_se_compra"].includes(f.e.estado));
  const terminadas = filas.filter((f) => f.e.estado === "terminada").length;
  const delStock = ops.filter((op) => op.cant === 0 && op.stock > 0).length;
  const noSeCompran = filas.filter((f) => f.e.estado === "no_se_compra").length;

  const Fila = ({ f }: { f: (typeof filas)[number] }) => (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
      <span className="flex-1 min-w-52">
        <span className="font-medium">
          {capitalizar(f.op.nombre)} × {numero(f.op.cant)}
        </span>
        <span className="block font-mono text-[13px] text-foreground-muted">{f.op.codigo}</span>
      </span>
      <EstadoPiezaChip estado={f.e.estado} />
      <span className="text-foreground-muted min-w-60">
        {f.e.estado === "falta_material"
          ? (f.e.motivo ?? "Esperando material")
          : f.e.actual
            ? `Paso ${f.e.actual.posicion} de ${f.e.actual.totalPasos}: ${f.e.actual.paso}${f.e.motivo ? ` · ${f.e.motivo}` : ""}${f.e.actual.finPlan ? ` · termina aprox. el ${fechaCorta(f.e.actual.finPlan, hoy)}` : ""}`
            : (f.e.motivo ?? "")}
      </span>
    </li>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        migas={[{ href: "/proyectos", label: "Órdenes" }, { href: `/proyectos/${id}`, label: m.codigo }, { label: "Qué hace falta" }]}
        titulo={`Qué hace falta · ${m.codigo}`}
        acciones={
          <Link href={`/proyectos/${id}`} className="btn-secundario">
            Volver a la orden
          </Link>
        }
      />
      <p className="text-sm text-foreground-muted">
        {[fila.cliente ?? (m.destino === "stock" ? "Para stock" : null), fila.config].filter(Boolean).join(" · ")} · lo que falta hacer hoy.
      </p>
      <section className="tarjeta">
        <h2 className="font-semibold px-4 pt-3 pb-2">
          Falta comprar <span className="text-foreground-muted font-normal">· {faltaComprar.length}</span>
        </h2>
        {faltaComprar.length ? (
          <ul className="divide-y divide-border border-t border-border">
            {faltaComprar.map((f) => (
              <Fila key={f.op.id} f={f} />
            ))}
          </ul>
        ) : (
          <p className="px-4 pb-3 text-sm text-foreground-muted">No falta comprar nada.</p>
        )}
      </section>
      <section className="tarjeta">
        <h2 className="font-semibold px-4 pt-3 pb-2">
          Falta fabricar <span className="text-foreground-muted font-normal">· {faltaFabricar.length}</span>
        </h2>
        {faltaFabricar.length ? (
          <ul className="divide-y divide-border border-t border-border">
            {faltaFabricar.map((f) => (
              <Fila key={f.op.id} f={f} />
            ))}
          </ul>
        ) : (
          <p className="px-4 pb-3 text-sm text-foreground-muted">No falta fabricar nada.</p>
        )}
      </section>
      <p className="text-sm text-foreground-muted">
        {[
          terminadas && `${plural(terminadas, "pieza")} ya terminada${terminadas === 1 ? "" : "s"}`,
          delStock && `${plural(delStock, "pieza")} salió del stock`,
          noSeCompran && `${plural(noSeCompran, "pieza")} que se decidió no comprar`,
        ]
          .filter(Boolean)
          .join(" · ") || "Todavía no hay piezas terminadas."}
      </p>
    </div>
  );
}
