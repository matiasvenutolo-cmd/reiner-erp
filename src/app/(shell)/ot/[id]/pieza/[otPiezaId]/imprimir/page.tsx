import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getOtPieza, getEstadoYOperacionActual, getContextoOtPieza } from "@/lib/data/ot";
import { getPieza, getConjunto, nombreOperacion } from "@/lib/data/maestros";
import { getHistorialOtPieza, getTiposParada } from "@/lib/data/ejecucion";
import { getUsuario } from "@/lib/data/usuarios";
import { ImprimirButton } from "@/components/ImprimirButton";

function formatearDuracion(seg: number | null): string {
  if (seg === null) return "";
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

function formatearFecha(fecha: Date | null): string {
  if (!fecha) return "";
  return new Date(fecha).toLocaleDateString("es-AR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/**
 * Export imprimible de la "OT de pieza" (2ª ronda de devolución de Fase 2,
 * docs/06-backlog-release-3.md §20): reproduce el papel que hoy llena
 * taller a mano. Los campos que el sistema todavía no modela (Armado de
 * máquina, Fabricación/dimensiones, medidas toleradas/no toleradas, Relevo)
 * se imprimen en blanco para completar a mano, igual que en el papel
 * original — no son datos inventados, son huecos del formulario real.
 */
export default async function ImprimirOtPiezaPage({ params }: { params: Promise<{ id: string; otPiezaId: string }> }) {
  const { id, otPiezaId } = await params;
  const otPieza = await getOtPieza(otPiezaId);
  if (!otPieza) notFound();

  const [pieza, historial, { routing }, contexto, tiposParada] = await Promise.all([
    getPieza(otPieza.piezaId),
    getHistorialOtPieza(otPieza.id),
    getEstadoYOperacionActual(otPieza),
    getContextoOtPieza(otPieza.id),
    getTiposParada(),
  ]);
  const conjunto = pieza ? await getConjunto(pieza.conjuntoId) : null;
  const nombreTipoParada = new Map(tiposParada.map((t) => [t.id, t.nombre]));

  const registrosPorOperacion = new Map(historial.map((h) => [h.registro.operacionId, h]));
  const filas = await Promise.all(
    routing.map(async (op) => {
      const registro = registrosPorOperacion.get(op.id);
      const operario = registro ? await getUsuario(registro.registro.usuarioId) : null;
      const paradas = registro?.paradas ?? [];
      return {
        op,
        operario,
        paradasTexto: paradas.map((p) => nombreTipoParada.get(p.tipoParadaId) ?? "—").join(", "),
        paradasTiempo: formatearDuracion(paradas.reduce((sum, p) => sum + (p.duracionSeg ?? 0), 0) || null),
        tiempoTotal: formatearDuracion(registro?.registro.duracionSeg ?? null),
      };
    }),
  );

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/ot/${id}/pieza/${otPiezaId}`} className="text-sm text-accent hover:underline">
          ← {otPieza.codigo}
        </Link>
        <ImprimirButton />
      </div>

      <div className="bg-surface border border-border rounded-lg p-8 print:border-0 print:p-0 text-sm space-y-4">
        <div className="flex items-start justify-between gap-4 border-b-2 border-foreground pb-2">
          <div>
            <Image src="/reiner-logo.png" alt="REINER" width={140} height={30} priority />
          </div>
          <div className="text-center flex-1">
            <div className="text-lg font-bold uppercase">Orden de Trabajo de Pieza</div>
          </div>
          <div className="text-right text-xs shrink-0">
            <div className="font-mono font-semibold">{otPieza.codigo}</div>
            <div>Emisión: {formatearFecha(otPieza.createdAt)}</div>
          </div>
        </div>

        <table className="w-full border-collapse">
          <tbody>
            <CampoFila label="Nombre" value={pieza?.nombre ?? "—"} colSpan={3} />
            <tr>
              <Celda label="Cod pieza" value={pieza?.codigo ?? "—"} />
              <Celda label="Conjunto" value={conjunto?.nombre ?? "—"} />
              <Celda label="Cliente" value={contexto?.clienteNombre ?? "—"} />
            </tr>
            <tr>
              <Celda label="Cant a fab" value={String(otPieza.cantidadAFabricar)} />
              <Celda label="Rev" value={pieza?.revision ?? ""} />
              <Celda label="Material" value={otPieza.material ?? pieza?.material ?? ""} />
            </tr>
            <tr>
              <Celda label="OTC" value={contexto?.otMaquina.codigo ?? "—"} />
              <Celda label="Orden de compra cliente" value={contexto?.otMaquina.ordenCompra ?? ""} />
              <Celda label="Fecha inicio" value={formatearFecha(otPieza.fechaInicio)} />
            </tr>
          </tbody>
        </table>

        <div>
          <div className="text-xs font-semibold uppercase border-b border-foreground pb-1 mb-1">Orden de trabajo</div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-[10px] uppercase">
                <th className="border border-foreground/40 px-1.5 py-1 text-left">Proceso de fabricación</th>
                <th className="border border-foreground/40 px-1.5 py-1 w-10">OPS</th>
                <th className="border border-foreground/40 px-1.5 py-1 w-28">Operario</th>
                <th className="border border-foreground/40 px-1.5 py-1 w-20">Armado de máq</th>
                <th className="border border-foreground/40 px-1.5 py-1 w-24">Fabricación</th>
                <th className="border border-foreground/40 px-1.5 py-1 w-20">Errores/paradas — tipo</th>
                <th className="border border-foreground/40 px-1.5 py-1 w-16">Tiempo</th>
                <th className="border border-foreground/40 px-1.5 py-1 w-16">Tiempo total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ op, operario, paradasTexto, paradasTiempo, tiempoTotal }) => (
                <tr key={op.id} className="h-7">
                  <td className="border border-foreground/40 px-1.5">{nombreOperacion(op)}</td>
                  <td className="border border-foreground/40 px-1.5 text-center">{op.ops ?? ""}</td>
                  <td className="border border-foreground/40 px-1.5">{operario?.nombre ?? ""}</td>
                  <td className="border border-foreground/40 px-1.5"></td>
                  <td className="border border-foreground/40 px-1.5"></td>
                  <td className="border border-foreground/40 px-1.5">{paradasTexto}</td>
                  <td className="border border-foreground/40 px-1.5">{paradasTiempo}</td>
                  <td className="border border-foreground/40 px-1.5">{tiempoTotal}</td>
                </tr>
              ))}
              {Array.from({ length: Math.max(0, 3 - filas.length) }).map((_, i) => (
                <tr key={`blank-${i}`} className="h-7">
                  <td className="border border-foreground/40 px-1.5"></td>
                  <td className="border border-foreground/40 px-1.5"></td>
                  <td className="border border-foreground/40 px-1.5"></td>
                  <td className="border border-foreground/40 px-1.5"></td>
                  <td className="border border-foreground/40 px-1.5"></td>
                  <td className="border border-foreground/40 px-1.5"></td>
                  <td className="border border-foreground/40 px-1.5"></td>
                  <td className="border border-foreground/40 px-1.5"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <Celda label="Fecha final" value={formatearFecha(otPieza.fechaFin)} />
              <Celda label="Relevo" value="" />
            </tr>
          </tbody>
        </table>

        <div>
          <div className="text-xs font-semibold uppercase border-b border-foreground pb-1 mb-1">Observaciones de calidad</div>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="uppercase">
                <th rowSpan={2} className="border border-foreground/40 px-1.5 py-1 text-left align-bottom">
                  Proceso de fabricación
                </th>
                <th colSpan={3} className="border border-foreground/40 px-1.5 py-1">
                  Medidas toleradas
                </th>
                <th colSpan={3} className="border border-foreground/40 px-1.5 py-1">
                  Medidas no toleradas
                </th>
                <th rowSpan={2} className="border border-foreground/40 px-1.5 py-1 w-16 align-bottom">
                  Revisó
                </th>
                <th rowSpan={2} className="border border-foreground/40 px-1.5 py-1 w-20 align-bottom">
                  Firma
                </th>
              </tr>
              <tr className="uppercase">
                <th className="border border-foreground/40 px-1.5 py-1 w-14">Medida</th>
                <th className="border border-foreground/40 px-1.5 py-1 w-8">OK</th>
                <th className="border border-foreground/40 px-1.5 py-1 w-10">NO OK</th>
                <th className="border border-foreground/40 px-1.5 py-1 w-14">Medida</th>
                <th className="border border-foreground/40 px-1.5 py-1 w-8">OK</th>
                <th className="border border-foreground/40 px-1.5 py-1 w-10">NO OK</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="h-6">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="border border-foreground/40 px-1.5"></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <Celda label="Piezas OK" value={String(otPieza.piezasOk)} />
              <Celda label="Piezas NO OK" value={String(otPieza.piezasNoOk)} />
              <Celda label="Piezas defectuosas" value={String(otPieza.piezasDefectuosas)} />
              <Celda label="Piezas retrabajadas" value={String(otPieza.piezasRetrabajadas)} />
            </tr>
          </tbody>
        </table>

        <div>
          <div className="text-xs font-semibold uppercase border-b border-foreground pb-1 mb-1">Observaciones generales</div>
          <div className="border border-foreground/40 h-12"></div>
        </div>
      </div>
    </div>
  );
}

function Celda({ label, value }: { label: string; value: string }) {
  return (
    <td className="border border-foreground/40 px-2 py-1 align-top">
      <div className="text-[9px] uppercase text-foreground-muted leading-none">{label}</div>
      <div className="font-medium">{value}</div>
    </td>
  );
}

function CampoFila({ label, value, colSpan }: { label: string; value: string; colSpan: number }) {
  return (
    <tr>
      <td className="border border-foreground/40 px-2 py-1 align-top" colSpan={colSpan}>
        <div className="text-[9px] uppercase text-foreground-muted leading-none">{label}</div>
        <div className="font-medium">{value}</div>
      </td>
    </tr>
  );
}
