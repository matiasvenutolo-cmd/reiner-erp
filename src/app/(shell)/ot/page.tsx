import Link from "next/link";
import { listarOtMaquinas } from "@/lib/data/ot";
import { EstadoBadge } from "@/components/EstadoBadge";

export const dynamic = "force-dynamic";

type Orden = Awaited<ReturnType<typeof listarOtMaquinas>>[number];

/**
 * Órdenes de trabajo separadas por tipo, al mismo nivel y en este orden:
 * OT Piezas → OT Conjuntos → Máquinas completas (pedido de revisión del
 * 2026-10-02). Piezas y Conjuntos son las órdenes independientes; las piezas
 * de las máquinas se ven todas juntas en /ot/piezas, sin tener que entrar a
 * cada máquina.
 */
export default async function OtPage() {
  const ordenes = await listarOtMaquinas();
  const piezas = ordenes.filter((o) => o.tipo === "suelta" && o.alcance === "pieza");
  const conjuntos = ordenes.filter((o) => o.tipo === "suelta" && o.alcance !== "pieza");
  const maquinas = ordenes.filter((o) => o.tipo === "maquina");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Órdenes de trabajo</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Al generarse quedan en ingeniería; se envían a producción desde cada orden para que aparezcan en Planificación.
          </p>
        </div>
        <Link href="/ot/nueva" className="bg-accent text-accent-foreground text-sm font-medium px-4 py-2 rounded-md hover:opacity-90 whitespace-nowrap">
          + Generar orden
        </Link>
      </div>

      <Seccion
        titulo="OT Piezas"
        descripcion="Una pieza puntual (ej. un repuesto), sin fabricar un conjunto ni una máquina."
        vacio="No hay órdenes de pieza."
        extra={
          <Link href="/ot/piezas" className="text-sm text-accent hover:underline whitespace-nowrap">
            Ver todas las piezas, también las de máquinas →
          </Link>
        }
      >
        {piezas.length > 0 && (
          <Tabla columnas={["OT", "Pieza", "Cliente", "Orden de compra", "Plazo", "Cantidad", "Estado"]}>
            {piezas.map((ot) => (
              <tr key={ot.id} className="border-t border-border hover:bg-surface-muted/50">
                <CeldaOt ot={ot} />
                <td className="px-4 py-2.5">
                  {ot.piezaUnica?.nombre ?? "—"}
                  <div className="font-mono text-xs text-foreground-muted">{ot.piezaUnica?.codigo}</div>
                </td>
                <td className="px-4 py-2.5">{ot.clienteNombre ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-foreground-muted">{ot.ordenCompra ?? "—"}</td>
                <td className="px-4 py-2.5 text-foreground-muted">{ot.plazoEntrega ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{ot.piezaUnica?.cantidad ?? "—"}</td>
                <CeldaEstado ot={ot} />
              </tr>
            ))}
          </Tabla>
        )}
      </Seccion>

      <Seccion titulo="OT Conjuntos" descripcion="Un conjunto completo, sin fabricar la máquina entera." vacio="No hay órdenes de conjunto.">
        {conjuntos.length > 0 && (
          <Tabla columnas={["OT", "Conjunto", "Cliente", "Orden de compra", "Plazo", "Piezas terminadas", "Estado"]}>
            {conjuntos.map((ot) => (
              <tr key={ot.id} className="border-t border-border hover:bg-surface-muted/50">
                <CeldaOt ot={ot} />
                <td className="px-4 py-2.5">
                  {ot.secciones[0]?.nombre ?? "—"}
                  <div className="text-xs text-foreground-muted">{ot.configuracion?.nombre}</div>
                </td>
                <td className="px-4 py-2.5">{ot.clienteNombre ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-foreground-muted">{ot.ordenCompra ?? "—"}</td>
                <td className="px-4 py-2.5 text-foreground-muted">{ot.plazoEntrega ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {ot.piezasTerminadas} / {ot.totalPiezasAFabricar}
                </td>
                <CeldaEstado ot={ot} />
              </tr>
            ))}
          </Tabla>
        )}
      </Seccion>

      <Seccion titulo="Máquinas completas" descripcion="Una máquina entera: todos sus conjuntos y piezas." vacio="No hay órdenes de máquina.">
        {maquinas.length > 0 && (
          <Tabla columnas={["OT", "Configuración", "Cliente", "Orden de compra", "Plazo", "Piezas terminadas", "Estado"]}>
            {maquinas.map((ot) => (
              <tr key={ot.id} className="border-t border-border hover:bg-surface-muted/50">
                <CeldaOt ot={ot} />
                <td className="px-4 py-2.5">{ot.configuracion?.nombre ?? "—"}</td>
                <td className="px-4 py-2.5">{ot.clienteNombre ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-foreground-muted">{ot.ordenCompra ?? "—"}</td>
                <td className="px-4 py-2.5 text-foreground-muted">{ot.plazoEntrega ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {ot.piezasTerminadas} / {ot.totalPiezasAFabricar}
                </td>
                <CeldaEstado ot={ot} />
              </tr>
            ))}
          </Tabla>
        )}
      </Seccion>
    </div>
  );
}

function Seccion({
  titulo,
  descripcion,
  vacio,
  extra,
  children,
}: {
  titulo: string;
  descripcion: string;
  vacio: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
        <div>
          <h2 className="text-base font-semibold">{titulo}</h2>
          <p className="text-xs text-foreground-muted">{descripcion}</p>
        </div>
        {extra}
      </div>
      {children || <p className="text-sm text-foreground-muted">{vacio}</p>}
    </section>
  );
}

function Tabla({ columnas, children }: { columnas: string[]; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted text-foreground-muted text-xs uppercase">
          <tr>
            {columnas.map((c) => (
              <th key={c} className="text-left px-4 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function CeldaOt({ ot }: { ot: Orden }) {
  return (
    <td className="px-4 py-2.5">
      <Link href={`/ot/${ot.id}`} className="font-mono text-xs text-accent hover:underline font-semibold">
        {ot.codigo}
      </Link>
      <div className="text-xs text-foreground-muted">{ot.tipo === "suelta" ? ot.numeroSerie : `Serie ${ot.numeroSerie}`}</div>
    </td>
  );
}

function CeldaEstado({ ot }: { ot: Orden }) {
  return (
    <td className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-1">
        <EstadoBadge estado={ot.estadoCalculado} />
        {ot.piezasSinEnviar > 0 && <span className="badge-estado badge-pendiente">{ot.piezasSinEnviar} en ingeniería</span>}
      </div>
    </td>
  );
}
