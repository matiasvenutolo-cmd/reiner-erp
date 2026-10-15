import Link from "next/link";
import { formatearImporte, formatearFecha, formatearNumero } from "@/lib/formato";
import { ESTADO_LABEL, type EstadoSolicitud, type Importe, type SolicitudDetalle } from "@/lib/data/gestion-compras";
import { Pestanas } from "@/components/ui/Pestanas";

const ESTILO_ESTADO: Record<EstadoSolicitud, string> = {
  anulada: "badge-pendiente line-through",
  sin_cotizar: "badge-alerta",
  cotizando: "badge-en_curso",
  a_confirmar: "badge-en_curso",
  en_camino: "bg-accent-soft text-accent",
  recibida: "badge-terminada",
};

export function EstadoCompra({ estado }: { estado: EstadoSolicitud }) {
  return <span className={`badge-estado ${ESTILO_ESTADO[estado]}`}>{ESTADO_LABEL[estado]}</span>;
}

/** De dónde sale la compra: una orden de trabajo o una compra general de la empresa. */
export function OrigenCompra({ s }: { s: Pick<SolicitudDetalle, "origen" | "ot"> }) {
  if (s.origen === "general") return <span className="badge-estado bg-surface-muted text-foreground">Compra general</span>;
  return (
    <span className="badge-estado bg-[#efe9fb] text-[#5b3aa8]" title={s.ot ? `${s.ot.otMaquinaCodigo} · ${s.ot.referencia}` : undefined}>
      Producción{s.ot ? ` · ${s.ot.otPiezaCodigo}` : ""}
    </span>
  );
}

/** Importe original y, debajo, su equivalente con el tipo de cambio guardado. */
export function ImporteDoble({ importe, tc }: { importe: Importe; tc?: { valor: number | null; fecha: string | null } }) {
  return (
    <div className="tabular-nums">
      <div className="font-semibold">{formatearImporte(importe.total, importe.moneda)}</div>
      {importe.equivalente ? (
        <div className="text-xs text-foreground-muted">
          ≈ {formatearImporte(importe.equivalente.total, importe.equivalente.moneda)}
          {tc?.valor ? ` · TC ${formatearNumero(tc.valor)} (${formatearFecha(tc.fecha)})` : ""}
        </div>
      ) : (
        <div className="text-xs text-[var(--estado-en-curso-fg)]">Sin conversión</div>
      )}
    </div>
  );
}

export function CantidadCompra({ s }: { s: Pick<SolicitudDetalle, "cantidad" | "unidad"> }) {
  return (
    <>
      {formatearNumero(s.cantidad, 3)} {s.unidad ?? ""}
    </>
  );
}

export function LinkCompra({ s }: { s: Pick<SolicitudDetalle, "id" | "numero" | "descripcion"> }) {
  return (
    <Link href={`/compras/${s.id}`} className="group block min-w-0">
      <span className="text-xs text-foreground-muted">Nº {s.numero}</span>
      <span className="block font-medium group-hover:text-accent group-hover:underline truncate">{s.descripcion}</span>
    </Link>
  );
}

export function PestanasCompras({ actual }: { actual: string }) {
  return (
    <Pestanas
      actual={actual}
      items={[
        { href: "/compras", label: "Compras" },
        { href: "/compras/gastos", label: "Gastos futuros" },
        { href: "/compras/pagos", label: "Pagos realizados" },
      ]}
    />
  );
}
