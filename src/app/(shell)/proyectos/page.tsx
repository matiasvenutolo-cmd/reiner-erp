import Link from "next/link";
import { db } from "@/lib/db/client";
import { otMaquina, configuracion, cliente, conjunto, pieza } from "@/lib/db/schema";
import { listarBorradores } from "@/lib/data/que-hace-falta";
import { descartarBorradorAction } from "@/app/actions/borrador";
import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";
import { desc, eq } from "drizzle-orm";
import { getPlan } from "@/lib/planning/datos";
import { PageHeader } from "@/components/ui/PageHeader";
import { PestanasOt } from "@/components/ui/PestanasSecciones";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { Aviso, Vacio } from "@/components/ui/Aviso";
import { fechaCorta, textoCausa, margenEntrega, MargenEntrega } from "@/components/v2/Plan";
import { capitalizar, plural } from "@/lib/formato";
import type { ProyectoPlan } from "@/lib/planning/motor";

export const dynamic = "force-dynamic";

type Fila = { m: typeof otMaquina.$inferSelect; config: string | null; cliente: string | null };

const GRUPOS = [
  { tipo: "maquina", titulo: "Máquinas" },
  { tipo: "repuesto", titulo: "Repuestos para clientes" },
  { tipo: "stock", titulo: "Órdenes para stock" },
] as const;

function Diferencia({ p }: { p: ProyectoPlan }) {
  return <MargenEntrega dias={p.diferenciaDias} />;
}

/** Tarjeta de proyecto (§2.3): máquina y cliente en grande, avance en horas y la diferencia con la entrega. */
function TarjetaProyecto({ x, p, hoy }: { x: Fila; p: ProyectoPlan; hoy: string }) {
  const causa = p.causas[0] ? textoCausa(p.causas[0].causa, hoy) : null;
  return (
    <Link href={`/proyectos/${x.m.id}`} className={`tarjeta franja ${margenEntrega(p.diferenciaDias).franja} p-4 block hover:border-accent transition-colors`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg font-bold leading-tight">{x.cliente ?? x.config ?? x.m.codigo}</div>
          <div className="text-sm text-foreground-muted">
            {[x.cliente ? x.config : null, x.m.codigo].filter(Boolean).join(" · ")}
            {x.m.esDemo && <span className="badge-estado bg-demo-bg text-demo-fg ml-2">demo</span>}
            {x.m.prioridad === "alta" && <span className="ml-2"><Etiqueta tono="naranja" sinIcono>prioridad alta</Etiqueta></span>}
          </div>
        </div>
        <Diferencia p={p} />
      </div>
      <div className="flex items-center gap-3 mt-3 text-sm">
        <div className="h-2 flex-1 rounded-full bg-surface-muted overflow-hidden">
          <div className="h-full bg-accent rounded-full" style={{ width: `${p.avancePct}%` }} />
        </div>
        <span className="tabular-nums text-foreground-muted whitespace-nowrap">{p.avancePct}% en horas</span>
      </div>
      <div className="text-sm text-foreground-muted mt-2">
        Entrega {fechaCorta(p.entrega, hoy)} · fin estimado {fechaCorta(p.finEstimado, hoy)}
      </div>
      {causa && <div className="text-sm mt-1">Atrasa: {causa.texto}.</div>}
    </Link>
  );
}

/** La máquina es un proyecto con fecha de entrega; los repuestos y las órdenes para stock usan el mismo modelo, con un solo nivel. */
export default async function ProyectosPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const [plan, todos, borradores, configs, conjs, piezasB, clientes] = await Promise.all([
    getPlan(),
    db
      .select({ m: otMaquina, config: configuracion.nombre, cliente: cliente.razonSocial })
      .from(otMaquina)
      .leftJoin(configuracion, eq(configuracion.id, otMaquina.configuracionId))
      .leftJoin(cliente, eq(cliente.id, otMaquina.clienteId))
      .orderBy(desc(otMaquina.createdAt)),
    listarBorradores(),
    db.select({ id: configuracion.id, nombre: configuracion.nombre }).from(configuracion),
    db.select({ id: conjunto.id, codigo: conjunto.codigo, nombre: conjunto.nombre }).from(conjunto),
    db.select({ id: pieza.id, nombre: pieza.nombre }).from(pieza),
    db.select({ id: cliente.id, nombre: cliente.razonSocial }).from(cliente),
  ]);
  // Qué es cada borrador, en palabras: "Máquina RD estándar × 1 · Laboratorio X".
  const nom = <T extends { id: string }>(xs: T[], id: string | null) => (id ? xs.find((x) => x.id === id) : undefined);
  const describir = (b: (typeof borradores)[number]) => {
    const que =
      b.tipo === "maquina"
        ? `Máquina ${nom(configs, b.configuracionId)?.nombre ?? ""}`
        : b.tipo === "conjunto"
          ? `${nom(conjs, b.conjuntoId)?.codigo ?? ""} ${nom(conjs, b.conjuntoId)?.nombre ?? ""}`
          : capitalizar(nom(piezasB, b.piezaId)?.nombre ?? "Pieza");
    return `${que} × ${b.cantidad} · ${b.destino === "stock" ? "para stock" : (nom(clientes, b.clienteId)?.nombre ?? "cliente")}`;
  };
  const hoy = plan.entrada.hoy;
  const planDe = new Map(plan.resultado.proyectos.map((p) => [p.id, p]));
  const activos = todos.filter((x) => planDe.has(x.m.id));
  const paraActivar = todos.filter((x) => !planDe.has(x.m.id) && ["borrador", "pausado", "activo"].includes(x.m.estadoProyecto));
  const cerrados = todos.filter((x) => ["terminado", "entregado"].includes(x.m.estadoProyecto));

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Órdenes"
        descripcion="Cada máquina es un proyecto con fecha de entrega; debajo, todo se descompone en tareas con fecha. Los repuestos y las órdenes para stock funcionan igual, con un solo nivel."
        acciones={
          <Link href="/ot/nueva" className="btn">
            + Generar orden
          </Link>
        }
      >
        <PestanasOt actual="/proyectos" />
      </PageHeader>

      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {borradores.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Borradores ({borradores.length})</h2>
          <p className="text-sm text-foreground-muted">Órdenes que se empezaron a cargar y todavía no se confirmaron: no reservan stock ni piden nada.</p>
          <ul className="tarjeta divide-y divide-border">
            {borradores.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="font-semibold">{describir(b)}</span>
                  <span className="text-sm text-foreground-muted"> · creado el {fechaCorta(b.createdAt.toISOString().slice(0, 10), hoy)}</span>
                </span>
                <span className="flex gap-2 shrink-0">
                  <Link href={`/ot/nueva?borrador=${b.id}&paso=2`} className="btn btn-sm">
                    Seguir →
                  </Link>
                  <form action={descartarBorradorAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <ConfirmarBoton mensaje="¿Descartar el borrador? No queda nada reservado ni pedido." className="btn-peligro btn-sm">
                      Descartar
                    </ConfirmarBoton>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {paraActivar.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Para activar ({paraActivar.length})</h2>
          <p className="text-sm text-foreground-muted">Cargá la fecha de entrega para que el sistema arme sus tareas y compras.</p>
          <ul className="tarjeta divide-y divide-border">
            {paraActivar.map((x) => (
              <li key={x.m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="font-semibold">{x.cliente ?? x.config}</span>
                  <span className="text-sm text-foreground-muted">
                    {" "}
                    · {x.m.codigo}
                    {x.m.plazoEntrega ? ` · plazo "${x.m.plazoEntrega}"` : ""}
                    {x.m.estadoProyecto === "pausado" ? " · pausado" : ""}
                  </span>
                </span>
                <Link href={`/proyectos/${x.m.id}`} className="btn btn-sm">
                  {x.m.estadoProyecto === "pausado" ? "Reactivar" : "Cargar fecha"} →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activos.length === 0 && <Vacio neutro>No hay proyectos activos.</Vacio>}
      {GRUPOS.map((g) => {
        const lista = activos.filter((x) => (x.m.destino ?? "maquina") === g.tipo);
        if (!lista.length) return null;
        return (
          <section key={g.tipo} className="space-y-2">
            <h2 className="text-lg font-semibold">
              {g.titulo} ({lista.length})
            </h2>
            <div className="grid md:grid-cols-2 gap-3">
              {lista
                .sort((a, b) => planDe.get(b.m.id)!.diferenciaDias - planDe.get(a.m.id)!.diferenciaDias)
                .map((x) => (
                  <TarjetaProyecto key={x.m.id} x={x} p={planDe.get(x.m.id)!} hoy={hoy} />
                ))}
            </div>
          </section>
        );
      })}

      {cerrados.length > 0 && (
        <details className="tarjeta px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">Terminados y entregados ({plural(cerrados.length, "orden", "órdenes")})</summary>
          <ul className="mt-2 divide-y divide-border text-sm">
            {cerrados.map((x) => (
              <li key={x.m.id} className="py-2 flex justify-between gap-2">
                <Link href={`/ot/${x.m.id}`} className="hover:text-accent hover:underline">
                  {x.cliente ?? x.config} · {x.m.codigo}
                </Link>
                <span className="text-foreground-muted">{x.m.estadoProyecto === "entregado" ? "Entregado" : "Terminado"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
