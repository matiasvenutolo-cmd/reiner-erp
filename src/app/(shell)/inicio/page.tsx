import Link from "next/link";
import { getUsuarioActual } from "@/lib/session";
import { getParadasActivas } from "@/lib/data/ejecucion";
import { getPiezasStockBajo } from "@/lib/data/stock";
import { getTareasRevision } from "@/lib/data/revision";
import { listarOtMaquinas } from "@/lib/data/ot";
import { getPendientesDePlanificar, getPiezasAfueraTercerizado, getPiezasCompraPendientes, contarPiezasSinCentro } from "@/lib/data/produccion";
import { getClavesAsignadasDesdeHoy } from "@/lib/data/planificacion";
import { getPedidosPendientes } from "@/lib/data/compras";
import { EstadoBadge } from "@/components/EstadoBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icono } from "@/components/ui/Icono";

// Datos en vivo (stock/producción cambian todo el tiempo) — nunca prerenderizar en build.
export const dynamic = "force-dynamic";

function minutosDesde(fecha: Date): number {
  return Math.max(0, Math.round((Date.now() - fecha.getTime()) / 60000));
}

type Tarea = { cantidad: number; titulo: string; detalle: string; href: string; accion: string; icono: string; urgente?: boolean };

/**
 * Inicio = "qué hay que hacer hoy" (Fase 3.2, rediseño de usabilidad). En vez
 * de métricas sueltas, cada pendiente del circuito es una tarea con su
 * cantidad, una explicación de una línea y el botón que lleva exactamente a
 * donde se resuelve. Todo sale de datos que ya calculan las otras pantallas;
 * no hay reglas nuevas. Sólo se muestran las tareas que tienen algo.
 */
export default async function InicioPage() {
  const usuario = await getUsuarioActual();

  const [paradas, stockBajo, revisionPendiente, ordenes, asignadas, tercerizados, comprasPendientes, pedidos, sinCentro] = await Promise.all([
    getParadasActivas(),
    getPiezasStockBajo(),
    getTareasRevision("pendiente"),
    listarOtMaquinas(),
    getClavesAsignadasDesdeHoy(),
    getPiezasAfueraTercerizado(),
    getPiezasCompraPendientes(),
    getPedidosPendientes(),
    contarPiezasSinCentro(),
  ]);
  const paraPlanificar = (await getPendientesDePlanificar(asignadas)).filter((p) => p.despuesDe === null && p.centroTrabajoId);
  const sinEnviar = ordenes.reduce((t, o) => t + (o.estadoCalculado !== "terminada" ? o.piezasSinEnviar : 0), 0);
  const conPedido = new Set(pedidos.map((p) => p.otPiezaId));
  const porPedir = comprasPendientes.filter((c) => !conPedido.has(c.otPiezaId)).length;
  const paraMandar = tercerizados.filter((t) => !t.remito).length;
  const afuera = tercerizados.filter((t) => t.remito).length;

  const tareas: Tarea[] = [
    { cantidad: paradas.length, titulo: "Piezas frenadas", detalle: "Operaciones en pausa ahora mismo, con su motivo.", href: "#frenado", accion: "Ver cuáles", icono: "alerta", urgente: true },
    { cantidad: sinEnviar, titulo: "Piezas sin enviar a producción", detalle: "Órdenes que siguen en ingeniería: hasta enviarlas no aparecen para planificar ni en el taller.", href: "/ot", accion: "Revisar órdenes", icono: "ot" },
    { cantidad: paraPlanificar.length, titulo: "Operaciones para planificar", detalle: "Se pueden hacer ya y no tienen operario ni día asignado.", href: "/planificacion", accion: "Planificar", icono: "planificacion" },
    { cantidad: sinCentro, titulo: "Piezas sin centro de trabajo", detalle: "Su operación actual no tiene definido dónde se hace: no entran en ninguna cola.", href: "/operaciones", accion: "Ver operaciones", icono: "operaciones" },
    { cantidad: paraMandar, titulo: "Para mandar a tercerizar", detalle: "Llegaron a un paso tercerizado y todavía no salieron con remito.", href: "/tercerizados", accion: "Armar remito", icono: "tercerizados" },
    { cantidad: afuera, titulo: "Esperando que vuelvan del proveedor", detalle: "Salieron con remito: al volver se registra la vuelta con su control.", href: "/tercerizados#esperando", accion: "Registrar vuelta", icono: "tercerizados" },
    { cantidad: porPedir, titulo: "Compras de producción sin pedir", detalle: "Material o piezas que las órdenes necesitan y todavía no se pidieron.", href: "/stock/compras", accion: "Ver compras", icono: "compras" },
    { cantidad: revisionPendiente.length, titulo: "Retrabajos pendientes", detalle: "Piezas defectuosas o a retrabajar esperando su revisión.", href: "#retrabajos", accion: "Ver cuáles", icono: "alerta" },
    { cantidad: stockBajo.length, titulo: "Stock por debajo del mínimo", detalle: "Piezas del almacén con menos unidades libres que su mínimo.", href: "#stock-bajo", accion: "Ver cuáles", icono: "stock" },
  ].filter((t) => t.cantidad > 0);

  const enCurso = ordenes.filter((o) => o.estadoCalculado !== "terminada");
  const proximas = enCurso
    .filter((o) => o.fechaComprometida)
    .sort((a, b) => new Date(a.fechaComprometida!).getTime() - new Date(b.fechaComprometida!).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <PageHeader
        titulo={`Hola, ${usuario.nombre}`}
        descripcion="Lo que hay que atender hoy en el circuito. Cada tarjeta lleva directo a donde se resuelve."
        acciones={
          <>
            <Link href="/ot/nueva" className="btn">
              + Generar orden
            </Link>
            <Link href="/planificacion" className="btn-secundario">
              Planificar
            </Link>
          </>
        }
      />

      <section>
        <h2 className="text-base font-semibold mb-3">Para hacer</h2>
        {tareas.length === 0 ? (
          <div className="tarjeta px-4 py-6 text-center text-sm text-foreground-muted">
            Todo al día: nada frenado, nada para enviar, planificar, tercerizar ni pedir.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {tareas.map((t) => (
              <Link
                key={t.titulo}
                href={t.href}
                className={`tarjeta p-4 flex flex-col gap-2 hover:border-accent transition-colors ${t.urgente ? "border-[#f3c4c4]" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded-lg p-1.5 ${t.urgente ? "bg-[var(--estado-alerta-bg)] text-[var(--estado-alerta-fg)]" : "bg-accent-soft text-accent"}`}>
                    <Icono nombre={t.icono} className="w-4 h-4" />
                  </span>
                  <span className="text-2xl font-semibold tabular-nums">{t.cantidad}</span>
                  <span className="font-medium leading-tight">{t.titulo}</span>
                </div>
                <p className="text-xs text-foreground-muted flex-1">{t.detalle}</p>
                <span className="text-sm font-semibold text-accent">{t.accion} →</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {paradas.length > 0 && (
        <Bloque id="frenado" titulo="Frenado ahora mismo" href="/planificacion" hrefLabel="Ir a Planificación">
          {paradas.slice(0, 8).map((p) => (
            <li key={p.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium">{p.piezaNombre}</span> <span className="text-foreground-muted font-mono text-xs">{p.otPiezaCodigo}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="badge-estado badge-alerta">{p.tipoParadaNombre}</span>
                <span className="text-xs text-foreground-muted">
                  hace {minutosDesde(p.inicio)} min · {p.usuarioNombre}
                </span>
              </div>
            </li>
          ))}
        </Bloque>
      )}

      {revisionPendiente.length > 0 && (
        <Bloque id="retrabajos" titulo="Retrabajos pendientes" ayuda="Entrá a la pieza para cargar las tareas del retrabajo y cronometrarlas.">
          {revisionPendiente.slice(0, 8).map((t) => (
            <li key={t.id} className="py-2">
              <Link href={`/ot/${t.otMaquinaId}/pieza/${t.otPiezaId}`} className="flex flex-wrap items-center justify-between gap-2 text-sm hover:text-accent">
                <div className="min-w-0">
                  <span className="font-medium">{t.piezaNombre}</span> <span className="text-foreground-muted font-mono text-xs">{t.otPiezaCodigo}</span>
                </div>
                <span className="text-xs text-foreground-muted shrink-0">
                  {t.piezasDefectuosas > 0 && `${t.piezasDefectuosas} defectuosas`}
                  {t.piezasDefectuosas > 0 && t.piezasRetrabajadas > 0 && " · "}
                  {t.piezasRetrabajadas > 0 && `${t.piezasRetrabajadas} a retrabajar`}
                </span>
              </Link>
            </li>
          ))}
        </Bloque>
      )}

      {stockBajo.length > 0 && (
        <Bloque id="stock-bajo" titulo="Stock por debajo del mínimo" href="/stock" hrefLabel="Ir a Stock">
          {stockBajo.slice(0, 8).map((p) => (
            <li key={p.piezaId} className="py-2 flex items-center justify-between gap-3 text-sm">
              <Link href={`/stock/pieza/${p.piezaId}`} className="min-w-0 hover:text-accent">
                <span className="font-medium">{p.piezaNombre}</span> <span className="text-foreground-muted font-mono text-xs">{p.piezaCodigo}</span>
              </Link>
              <span className="text-xs text-foreground-muted shrink-0 tabular-nums">
                {p.disponible} libres / mínimo {p.minimo}
              </span>
            </li>
          ))}
        </Bloque>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold">Órdenes en curso ({enCurso.length})</h2>
          <Link href="/avance" className="text-sm text-accent hover:underline">
            Ver avance de máquinas →
          </Link>
        </div>
        {proximas.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            {enCurso.length === 0 ? "No hay órdenes en curso." : "Ninguna orden en curso tiene plazo comprometido cargado."}
          </p>
        ) : (
          <ul className="tarjeta divide-y divide-border">
            {proximas.map((o) => (
              <li key={o.id}>
                <Link href={`/ot/${o.id}`} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm hover:bg-surface-muted">
                  <span className="min-w-0">
                    <span className="font-mono font-medium">{o.codigo}</span> <span className="text-foreground-muted">{o.configuracion?.nombre}</span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-foreground-muted">plazo {new Date(o.fechaComprometida!).toLocaleDateString("es-AR")}</span>
                    <EstadoBadge estado={o.estadoCalculado} />
                    <span className="text-xs text-foreground-muted tabular-nums">
                      {o.piezasTerminadas}/{o.totalPiezasAFabricar} piezas
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Bloque({ id, titulo, ayuda, href, hrefLabel, children }: { id: string; titulo: string; ayuda?: string; href?: string; hrefLabel?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-base font-semibold">{titulo}</h2>
        {href && (
          <Link href={href} className="text-sm text-accent hover:underline whitespace-nowrap">
            {hrefLabel} →
          </Link>
        )}
      </div>
      {ayuda && <p className="text-xs text-foreground-muted mb-2">{ayuda}</p>}
      <ul className="tarjeta px-4 divide-y divide-border">{children}</ul>
    </section>
  );
}
