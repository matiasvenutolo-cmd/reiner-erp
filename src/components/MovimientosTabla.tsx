import Link from "next/link";
import type { MovimientoConDetalle } from "@/lib/data/logistica";
import { Etiqueta, type Tono } from "@/components/ui/Etiqueta";
import { Codigo } from "@/components/ui/Codigo";
import { capitalizar } from "@/lib/formato";

/** Tipo de movimiento con ícono y color (§2.7): ↑ egreso naranja, ↓ ingreso verde. */
export const TIPO_MOVIMIENTO: Record<string, { label: string; tono: Tono; icono: string; signo: "+" | "−" | "±" }> = {
  ingreso: { label: "Ingreso", tono: "verde", icono: "bajar", signo: "+" },
  egreso: { label: "Egreso", tono: "naranja", icono: "subir", signo: "−" },
  retiro_ot: { label: "Retiro de stock", tono: "azul", icono: "subir", signo: "−" },
  ajuste: { label: "Ajuste", tono: "gris", icono: "configuracion", signo: "±" },
};

/** Ingreso y egreso bien distintos a simple vista (devolución del socio:
 * "en la tabla de abajo se debería ver más claro cuál es egreso y cuál es
 * ingreso"). */
export function MovimientosTabla({ movimientos, mostrarPieza = true }: { movimientos: MovimientoConDetalle[]; mostrarPieza?: boolean }) {
  if (movimientos.length === 0) {
    return <p className="text-sm text-foreground-muted">Todavía no hay movimientos registrados.</p>;
  }
  return (
    <div className="tarjeta overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted text-foreground-muted text-xs">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Fecha</th>
            <th className="text-left px-4 py-2 font-medium">Tipo</th>
            {mostrarPieza && <th className="text-left px-4 py-2 font-medium">Pieza</th>}
            <th className="text-right px-4 py-2 font-medium">Cantidad</th>
            <th className="text-left px-4 py-2 font-medium">Proveedor</th>
            <th className="text-left px-4 py-2 font-medium">Control</th>
            <th className="text-left px-4 py-2 font-medium">Quién</th>
            <th className="text-left px-4 py-2 font-medium">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => {
            const tipo = TIPO_MOVIMIENTO[m.tipo];
            const signo = tipo.signo === "±" ? (m.cantidad >= 0 ? "+" : "−") : tipo.signo;
            const colorCantidad = signo === "+" ? "text-verde-fg" : "text-naranja-fg";
            return (
              <tr key={m.id} className="border-t border-border">
                <td className="px-4 py-2.5 text-foreground-muted whitespace-nowrap">{new Date(m.fecha).toLocaleDateString("es-AR")}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <Etiqueta tono={tipo.tono} icono={tipo.icono}>
                    {tipo.label}
                  </Etiqueta>
                </td>
                {mostrarPieza && (
                  <td className="px-4 py-2.5">
                    <div>{capitalizar(m.piezaNombre)}</div>
                    <Codigo valor={m.piezaCodigo} />
                  </td>
                )}
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${colorCantidad}`}>
                  {signo}
                  {Math.abs(m.cantidad)}
                </td>
                <td className="px-4 py-2.5 text-foreground-muted">{m.proveedorNombre ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {m.controlResultado ? (
                    <Etiqueta tono={m.controlResultado === "ok" ? "verde" : "rojo"}>{m.controlResultado === "ok" ? "OK" : "NO OK"}</Etiqueta>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2.5 text-foreground-muted">{m.usuarioNombre}</td>
                <td className="px-4 py-2.5 text-foreground-muted">
                  {m.observacion ?? "—"}
                  {m.remitoId && (
                    <>
                      {" · "}
                      <Link href={`/remitos/${m.remitoId}`} className="text-accent hover:underline whitespace-nowrap">
                        Ver remito →
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
