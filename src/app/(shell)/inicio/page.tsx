import Link from "next/link";
import { getUsuarioActual } from "@/lib/session";
import { getParadasActivas } from "@/lib/data/ejecucion";
import { getPiezasStockBajo } from "@/lib/data/stock";
import { getPiezasFueraDeFabrica } from "@/lib/data/logistica";
import { getTareasRevision } from "@/lib/data/revision";
import { listarOtMaquinas } from "@/lib/data/ot";
import { getColaPorCentroTrabajo } from "@/lib/data/produccion";
import { EstadoBadge } from "@/components/EstadoBadge";

// Datos en vivo (stock/producción cambian todo el tiempo) — nunca prerenderizar en build.
export const dynamic = "force-dynamic";

const SALUDO: Record<string, string> = {
  direccion: "Resumen de hoy",
  ingenieria: "Lo que necesita tu atención",
  taller: "Cómo viene el piso hoy",
};

function minutosDesde(fecha: Date): number {
  return Math.max(0, Math.round((Date.now() - fecha.getTime()) / 60000));
}

/**
 * Primera pantalla diferenciada por perfil (Release 3, pedido del cliente —
 * docs/06-backlog-release-3.md §15): "que apenas ingresen puedan visualizar
 * en qué etapa se encuentran y qué hay que avanzar". No es un dashboard
 * genérico igual para los tres roles de staff: cada uno ve primero lo que
 * le toca resolver, con un link a la pantalla completa para profundizar.
 *
 * Contenido armado como propuesta a validar con Julián/Horacio (ver
 * pregunta abierta §17) — no había una respuesta cerrada de qué quiere ver
 * cada perfil, así que se construyó algo concreto con datos que ya existen
 * para reaccionar en la reunión, en vez de esperar la respuesta antes de
 * mostrar nada.
 */
export default async function InicioPage() {
  const usuario = await getUsuarioActual();

  const [paradas, stockBajo, revisionPendiente] = await Promise.all([
    getParadasActivas(),
    getPiezasStockBajo(),
    getTareasRevision("pendiente"),
  ]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">Hola, {usuario.nombre}</h1>
        <p className="text-sm text-foreground-muted mt-1">{SALUDO[usuario.rol] ?? "Resumen de hoy"}</p>
      </div>

      {usuario.rol === "direccion" && <PanelDireccion />}
      {usuario.rol === "taller" && <PanelTaller />}

      {paradas.length > 0 && (
        <Tarjeta titulo="Frenado ahora mismo" href="/centros-trabajo" hrefLabel="Ver centros de trabajo">
          <ul className="divide-y divide-border">
            {paradas.slice(0, 5).map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{p.piezaNombre}</span>{" "}
                  <span className="text-foreground-muted font-mono text-xs">{p.otPiezaCodigo}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="badge-estado badge-alerta">{p.tipoParadaNombre}</span>
                  <span className="text-xs text-foreground-muted">hace {minutosDesde(p.inicio)} min · {p.usuarioNombre}</span>
                </div>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {(usuario.rol === "ingenieria" || usuario.rol === "direccion") && revisionPendiente.length > 0 && (
        <Tarjeta titulo={`Revisión pendiente (${revisionPendiente.length})`}>
          <ul className="divide-y divide-border">
            {revisionPendiente.slice(0, 5).map((t) => (
              <li key={t.id} className="py-2">
                <Link
                  href={`/ot/${t.otMaquinaId}/pieza/${t.otPiezaId}`}
                  className="flex items-center justify-between gap-3 text-sm hover:text-accent"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{t.piezaNombre}</span>{" "}
                    <span className="text-foreground-muted font-mono text-xs">{t.otPiezaCodigo}</span>
                  </div>
                  <span className="text-xs text-foreground-muted shrink-0">
                    {t.piezasDefectuosas > 0 && `${t.piezasDefectuosas} defectuosas`}
                    {t.piezasDefectuosas > 0 && t.piezasRetrabajadas > 0 && " · "}
                    {t.piezasRetrabajadas > 0 && `${t.piezasRetrabajadas} a retrabajar`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {stockBajo.length > 0 && (
        <Tarjeta titulo={`Stock por debajo del mínimo (${stockBajo.length})`} href="/stock" hrefLabel="Ir a Stock">
          <ul className="divide-y divide-border">
            {stockBajo.slice(0, 5).map((p) => (
              <li key={p.piezaId} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{p.piezaNombre}</span>{" "}
                  <span className="text-foreground-muted font-mono text-xs">{p.piezaCodigo}</span>
                </div>
                <span className="text-xs text-foreground-muted shrink-0 tabular-nums">
                  {p.disponible} / mínimo {p.minimo}
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {paradas.length === 0 && revisionPendiente.length === 0 && stockBajo.length === 0 && (
        <div className="bg-surface border border-border rounded-lg p-6 text-center text-foreground-muted text-sm">
          Sin alertas por ahora — nada frenado, sin revisión pendiente y el stock está por
          encima del mínimo en todas las piezas.
        </div>
      )}
    </div>
  );
}

async function PanelDireccion() {
  const [ordenes, fueraDeFabrica] = await Promise.all([listarOtMaquinas(), getPiezasFueraDeFabrica()]);
  const enCurso = ordenes.filter((o) => o.estadoCalculado !== "terminada");
  const proximasAVencer = [...enCurso]
    .filter((o) => o.fechaComprometida)
    .sort((a, b) => new Date(a.fechaComprometida!).getTime() - new Date(b.fechaComprometida!).getTime())
    .slice(0, 5);
  const totalFueraDeFabrica = fueraDeFabrica.reduce((sum, p) => sum + p.cantidad, 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <MetricCard label="OT de máquina en curso" value={enCurso.length} href="/avance" />
      <MetricCard label="Piezas en proceso tercerizado" value={totalFueraDeFabrica} href="/logistica" />
      {proximasAVencer.length > 0 && (
        <div className="sm:col-span-2 bg-surface border border-border rounded-lg p-4">
          <h2 className="font-semibold text-sm mb-2">Próximas por plazo comprometido</h2>
          <ul className="divide-y divide-border">
            {proximasAVencer.map((o) => (
              <li key={o.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <Link href={`/ot/${o.id}`} className="min-w-0 hover:underline">
                  <span className="font-mono font-medium">{o.codigo}</span>{" "}
                  <span className="text-foreground-muted">{o.configuracion?.nombre}</span>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <EstadoBadge estado={o.estadoCalculado} />
                  <span className="text-xs text-foreground-muted tabular-nums">
                    {o.piezasTerminadas}/{o.totalPiezasAFabricar}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

async function PanelTaller() {
  const colas = await getColaPorCentroTrabajo();
  const conCarga = colas
    .filter((c) => c.disponibleAhora.length > 0)
    .sort((a, b) => b.disponibleAhora.length - a.disponibleAhora.length)
    .slice(0, 5);

  if (conCarga.length === 0) return null;

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-sm">Centros con más piezas esperando</h2>
        <Link href="/centros-trabajo" className="text-xs text-accent hover:underline">
          Ver todos →
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {conCarga.map(({ centro, disponibleAhora }) => (
          <li key={centro.id} className="py-2 flex items-center justify-between text-sm">
            <span className="font-medium">{centro.nombre}</span>
            <span className="text-foreground-muted tabular-nums">{disponibleAhora.length} disponibles ahora</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tarjeta({
  titulo,
  href,
  hrefLabel,
  children,
}: {
  titulo: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-sm">{titulo}</h2>
        {href && (
          <Link href={href} className="text-xs text-accent hover:underline whitespace-nowrap">
            {hrefLabel} →
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function MetricCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="bg-surface border border-border rounded-lg p-4 hover:border-accent transition-colors">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-foreground-muted mt-0.5">{label}</div>
    </Link>
  );
}
