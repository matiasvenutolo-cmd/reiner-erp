import Link from "next/link";
import { listarSolicitudes, getNecesidadesProduccion, type SolicitudDetalle, type EstadoSolicitud } from "@/lib/data/gestion-compras";
import { tomarNecesidadAction } from "@/app/actions/gestion-compras";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { EstadoCompra, OrigenCompra, ImporteDoble, CantidadCompra, LinkCompra, PestanasCompras } from "@/components/compras/Partes";
import { formatearFecha, formatearImporte } from "@/lib/formato";
import { hoyISO } from "@/lib/fecha";
import { getPlan } from "@/lib/planning/datos";

export const dynamic = "force-dynamic";

/** Los pasos del circuito, en el orden en que se trabajan — cada uno es una sección de la bandeja. */
const PASOS: { id: string; titulo: string; ayuda: string; estado?: EstadoSolicitud }[] = [
  { id: "necesidades", titulo: "Necesidades de producción", ayuda: "Lo que las órdenes de trabajo necesitan comprar y todavía nadie tomó." },
  { id: "cotizar", titulo: "Para cotizar", ayuda: "Compras sin cotizaciones cargadas.", estado: "sin_cotizar" },
  { id: "elegir", titulo: "Para elegir cotización", ayuda: "Tienen cotizaciones: falta decidir con cuál se compra.", estado: "cotizando" },
  { id: "confirmar", titulo: "Para confirmar al proveedor", ayuda: "Ya se eligió la cotización: falta hacer el pedido.", estado: "a_confirmar" },
  { id: "entrega", titulo: "Esperando entrega", ayuda: "Pedidas al proveedor: falta que lleguen y registrar el control.", estado: "en_camino" },
];

export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const [solicitudes, necesidadesSinOrden, plan] = await Promise.all([listarSolicitudes(), getNecesidadesProduccion(), getPlan()]);
  const hoy = hoyISO();
  // v2 — "pedir antes del…" sale del plan; las vencidas arriba.
  const compraDe = new Map(plan.resultado.compras.map((c) => [c.otPiezaId, c]));
  const necesidades = [...necesidadesSinOrden].sort((a, b) => (compraDe.get(a.otPiezaId)?.pedirAntes ?? "9999").localeCompare(compraDe.get(b.otPiezaId)?.pedirAntes ?? "9999"));
  const porEstado = (e: EstadoSolicitud) => solicitudes.filter((s) => s.estado === e);
  const pagoPendiente = solicitudes.filter((s) => s.estado === "recibida" && (s.saldo ?? 0) > 0);
  const cerradas = solicitudes.filter((s) => (s.estado === "recibida" && (s.saldo ?? 0) <= 0) || s.estado === "anulada");
  const cuenta = (id: string) => (id === "necesidades" ? necesidades.length : porEstado(PASOS.find((p) => p.id === id)!.estado!).length);
  const nada = necesidades.length + solicitudes.length - cerradas.length === 0;

  return (
    <div>
      <PageHeader
        titulo="Compras"
        descripcion="Todo lo que hay que comprar, para producción o para la empresa: se cotiza, se elige una cotización, se confirma al proveedor, se recibe y se paga."
        acciones={
          <Link href="/compras/nueva" className="btn">
            + Nueva compra general
          </Link>
        }
      >
        <PestanasCompras actual="/compras" />
      </PageHeader>

      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {/* El circuito de un vistazo: cuánto hay en cada paso, y un salto a cada sección. */}
      <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-8">
        {[...PASOS, { id: "pagar", titulo: "Recibidas, falta pagar", ayuda: "" }].map((p, i) => {
          const n = p.id === "pagar" ? pagoPendiente.length : cuenta(p.id);
          return (
            <li key={p.id}>
              <a href={`#${p.id}`} className={`tarjeta block px-3 py-2.5 h-full hover:border-accent ${n > 0 ? "" : "opacity-60"}`}>
                <div className="text-[11px] font-semibold text-foreground-muted">PASO {i + 1}</div>
                <div className="text-2xl font-semibold tabular-nums">{n}</div>
                <div className="text-xs leading-tight">{p.titulo}</div>
              </a>
            </li>
          );
        })}
      </ol>

      {nada && (
        <Aviso tipo="info">
          No hay compras en curso. Las necesidades de las órdenes de trabajo aparecen solas acá; para algo que no es de una orden
          (insumos, herramientas) usá <strong>Nueva compra general</strong>.
        </Aviso>
      )}

      <div className="space-y-8">
        <Seccion id="necesidades" titulo={PASOS[0].titulo} ayuda={PASOS[0].ayuda} cantidad={necesidades.length}>
          <div className="tarjeta overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-foreground-muted">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 font-medium">Qué hay que comprar</th>
                  <th className="text-left px-4 py-2 font-medium">Orden de trabajo</th>
                  <th className="text-right px-4 py-2 font-medium">Cantidad</th>
                  <th className="text-left px-4 py-2 font-medium">Pedir antes del</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {necesidades.map((n) => (
                  <tr key={n.otPiezaId} className="border-t border-border first:border-t-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{n.descripcion ?? (n.operacionCompraId ? `Material para ${n.piezaNombre}` : n.piezaNombre)}</div>
                      <div className="text-xs text-foreground-muted">
                        {n.piezaCodigo} · {n.esMaterial || n.operacionCompraId ? "pieza a fabricar, falta el material" : "pieza que se compra hecha"}
                      </div>
                      {n.observacion && <div className="text-xs text-foreground-muted mt-0.5">{n.observacion}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-xs">{n.otPiezaCodigo}</div>
                      <div className="text-xs text-foreground-muted">{n.conjuntoNombre}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{n.cantidad}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {compraDe.get(n.otPiezaId) ? (
                        <>
                          <div className={`text-sm font-semibold ${compraDe.get(n.otPiezaId)!.pedirAntes < hoy ? "text-rojo-fg" : ""}`}>
                            {formatearFecha(compraDe.get(n.otPiezaId)!.pedirAntes)}
                            {compraDe.get(n.otPiezaId)!.pedirAntes < hoy && " · vencida"}
                          </div>
                          <div className="text-foreground-muted">se necesita el {formatearFecha(compraDe.get(n.otPiezaId)!.llegadaNecesaria)}</div>
                        </>
                      ) : (
                        <span className="text-foreground-muted">{n.primeraPlanificada ? `1ª operación el ${formatearFecha(n.primeraPlanificada)}` : "Sin fecha: la orden no está activa"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <form action={tomarNecesidadAction}>
                        <input type="hidden" name="otPiezaId" value={n.otPiezaId} />
                        <button type="submit" className="btn btn-sm">
                          Empezar a cotizar
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>

        <Seccion id="cotizar" titulo={PASOS[1].titulo} ayuda={PASOS[1].ayuda} cantidad={porEstado("sin_cotizar").length}>
          <Lista solicitudes={porEstado("sin_cotizar")} hoy={hoy} siguiente="Cargar cotizaciones" />
        </Seccion>
        <Seccion id="elegir" titulo={PASOS[2].titulo} ayuda={PASOS[2].ayuda} cantidad={porEstado("cotizando").length}>
          <Lista solicitudes={porEstado("cotizando")} hoy={hoy} siguiente="Comparar y elegir" />
        </Seccion>
        <Seccion id="confirmar" titulo={PASOS[3].titulo} ayuda={PASOS[3].ayuda} cantidad={porEstado("a_confirmar").length}>
          <Lista solicitudes={porEstado("a_confirmar")} hoy={hoy} siguiente="Confirmar compra" />
        </Seccion>
        <Seccion id="entrega" titulo={PASOS[4].titulo} ayuda={PASOS[4].ayuda} cantidad={porEstado("en_camino").length}>
          <Lista solicitudes={porEstado("en_camino")} hoy={hoy} siguiente="Registrar entrega" />
        </Seccion>
        <Seccion id="pagar" titulo="Recibidas, falta pagar" ayuda="Llegaron OK; queda saldo sin pagar." cantidad={pagoPendiente.length}>
          <Lista solicitudes={pagoPendiente} hoy={hoy} siguiente="Registrar pago" />
        </Seccion>

        {cerradas.length > 0 && (
          <details className="tarjeta px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold">Cerradas y anuladas ({cerradas.length})</summary>
            <div className="mt-3">
              <Lista solicitudes={cerradas} hoy={hoy} siguiente="Ver" />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function Seccion({ id, titulo, ayuda, cantidad, children }: { id: string; titulo: string; ayuda: string; cantidad: number; children: React.ReactNode }) {
  if (cantidad === 0) return null;
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-base font-semibold">
        {titulo} <span className="text-foreground-muted font-normal">({cantidad})</span>
      </h2>
      <p className="text-xs text-foreground-muted mb-2">{ayuda}</p>
      {children}
    </section>
  );
}

/** Fila de una compra: qué es, de dónde viene, la fecha que importa en ese paso, el importe y el siguiente paso. */
function Lista({ solicitudes, hoy, siguiente }: { solicitudes: SolicitudDetalle[]; hoy: string; siguiente: string }) {
  return (
    <div className="tarjeta overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-foreground-muted">
          <tr className="border-b border-border">
            <th className="text-left px-4 py-2 font-medium">Compra</th>
            <th className="text-left px-4 py-2 font-medium">Fechas</th>
            <th className="text-left px-4 py-2 font-medium">Proveedor / importe</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {solicitudes.map((s) => {
            const necesidadVencida = s.fechaNecesidad && s.fechaNecesidad < hoy && !s.fechaRecepcion;
            const entregaAtrasada = s.estado === "en_camino" && s.entregaPrevista && s.entregaPrevista < hoy;
            return (
              <tr key={s.id} className="border-t border-border first:border-t-0 align-top">
                <td className="px-4 py-2.5 max-w-sm">
                  <LinkCompra s={s} />
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-foreground-muted">
                    <OrigenCompra s={s} />
                    <span className="tabular-nums">
                      <CantidadCompra s={s} />
                    </span>
                    {(s.estado === "anulada" || s.estado === "recibida") && <EstadoCompra estado={s.estado} />}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs whitespace-nowrap space-y-0.5">
                  <div className={necesidadVencida ? "text-rojo-fg font-semibold" : ""}>
                    Se necesita: {s.fechaNecesidad ? formatearFecha(s.fechaNecesidad) : <span className="text-foreground-muted">sin fecha</span>}
                  </div>
                  {s.estado === "a_confirmar" && <div>Compra prevista: {formatearFecha(s.fechaCompraPrevista)}</div>}
                  {s.estado === "en_camino" && (
                    <div className={entregaAtrasada ? "text-rojo-fg font-semibold" : ""}>
                      Entrega prevista: {formatearFecha(s.entregaPrevista)}
                      {entregaAtrasada && " · atrasada"}
                    </div>
                  )}
                  {(s.saldo ?? 0) > 0 && s.estado !== "cotizando" && <div>Pago previsto: {formatearFecha(s.fechaPagoPrevista)}</div>}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {s.elegida ? (
                    <>
                      <div className="text-xs text-foreground-muted">{s.elegida.proveedorNombre}</div>
                      <ImporteDoble importe={s.elegida.importe} />
                      {s.pagado > 0 && (s.saldo ?? 0) > 0 && (
                        <div className="text-xs text-foreground-muted">Saldo {formatearImporte(s.saldo, s.elegida.moneda)}</div>
                      )}
                    </>
                  ) : s.cotizaciones.length > 0 ? (
                    <span className="text-xs text-foreground-muted">
                      {s.cotizaciones.length} cotización{s.cotizaciones.length === 1 ? "" : "es"} para comparar
                    </span>
                  ) : (
                    <span className="text-xs text-foreground-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={`/compras/${s.id}`} className="btn-secundario btn-sm">
                    {siguiente} →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
