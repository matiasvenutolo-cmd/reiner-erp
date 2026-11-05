import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otMaquina, otConjunto, otPieza, pieza, configuracion, cliente, colaTarea, registroOperacion, usuario } from "@/lib/db/schema";
import { getPlan } from "@/lib/planning/datos";
import { ImprimirButton } from "@/components/ImprimirButton";
import { EstadoPiezaChip } from "@/components/v2/EstadoPieza";
import { estadoDePieza } from "@/lib/estado-pieza";
import { capitalizar, fechaCorta, horas, numero } from "@/lib/formato";
import type { Tarea } from "@/lib/planning/motor";

export const dynamic = "force-dynamic";

const CHIP: Record<string, string> = {
  terminada: "bg-verde-bg text-verde-fg border-verde/40",
  en_curso: "bg-accent text-accent-foreground border-accent",
  pausada: "bg-naranja-bg text-naranja-fg border-naranja-borde",
  trabada: "bg-rojo-bg text-rojo-fg border-rojo/40",
  lista: "bg-accent-soft text-accent-hover border-accent/40",
};

/**
 * Informe de la orden (tanda 2, 05/11): cómo viene en tiempo real cada pieza de la orden en su hoja de ruta. Una
 * fila por pieza con cada paso (hecho, en curso, quién lo tiene), las horas estimadas contra las reales y cuándo
 * termina. Pensado para imprimir y colgar, o para mirar en una reunión.
 */
export default async function InformeOrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [fila] = await db
    .select({ m: otMaquina, config: configuracion.nombre, cliente: cliente.razonSocial })
    .from(otMaquina)
    .leftJoin(configuracion, eq(configuracion.id, otMaquina.configuracionId))
    .leftJoin(cliente, eq(cliente.id, otMaquina.clienteId))
    .where(eq(otMaquina.id, id));
  if (!fila) notFound();
  const plan = await getPlan();
  const hoy = plan.entrada.hoy;
  const p = plan.resultado.proyectos.find((x) => x.id === id);
  const tareas = plan.resultado.tareas.filter((t) => t.proyectoId === id);
  const piezas = await db
    .select({ id: otPieza.id, codigo: otPieza.codigo, nombre: pieza.nombre, cant: otPieza.cantidadAFabricar, tipo: pieza.tipo })
    .from(otPieza)
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .where(eq(otConjunto.otMaquinaId, id));
  const ids = piezas.map((x) => x.id);
  const [cola, registros, personas] = await Promise.all([
    ids.length ? db.select().from(colaTarea).where(inArray(colaTarea.otPiezaId, ids)) : [],
    ids.length ? db.select().from(registroOperacion).where(inArray(registroOperacion.otPiezaId, ids)) : [],
    db.select({ id: usuario.id, nombre: usuario.nombre }).from(usuario),
  ]);
  const nombre = new Map(personas.map((u) => [u.id, u.nombre]));
  // Sólo lo que se fabrica: lo que se compra hecho va en Compras.
  const filas = piezas
    .map((x) => {
      const ts = tareas.filter((t) => t.otPiezaId === x.id).sort((a, b) => a.posicion - b.posicion);
      const internas = ts.filter((t) => t.tipo === "interno");
      const real = registros.filter((r) => r.otPiezaId === x.id && r.operacionId && internas.some((t) => t.operacionId === r.operacionId)).reduce((n, r) => n + (r.duracionSeg ?? 0), 0) / 3600;
      return {
        x,
        ts,
        e: estadoDePieza(ts),
        estimadas: internas.reduce((n, t) => n + t.horas, 0),
        real,
        fin: ts.map((t) => t.finPlan).filter((f): f is string => !!f).sort().at(-1) ?? null,
      };
    })
    .filter((f) => f.ts.some((t) => t.tipo !== "compras"))
    .sort((a, b) => (a.fin ?? "9").localeCompare(b.fin ?? "9"));
  const quien = (t: Tarea) => {
    const hizo = registros.find((r) => r.otPiezaId === t.otPiezaId && r.operacionId === t.operacionId && r.tipo === "ejecucion");
    const c = cola.find((q) => q.otPiezaId === t.otPiezaId && q.operacionId === t.operacionId);
    return nombre.get(hizo?.usuarioId ?? c?.operarioId ?? "") ?? null;
  };
  const totalEst = filas.reduce((n, f) => n + f.estimadas, 0);
  const totalReal = filas.reduce((n, f) => n + f.real, 0);

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/proyectos/${id}`} className="btn-texto">
          ← Volver a la orden
        </Link>
        <ImprimirButton />
      </div>

      <div className="bg-surface border border-border rounded-lg p-6 print:border-0 print:p-0 space-y-4 text-sm">
        <div className="flex items-start justify-between gap-4 border-b-2 border-foreground pb-2">
          <div>
            <div className="text-lg font-bold">Informe de la orden {fila.m.codigo}</div>
            <div className="text-foreground-muted">{[fila.config, fila.cliente ?? (fila.m.destino === "stock" ? "Para stock" : null)].filter(Boolean).join(" · ")}</div>
          </div>
          <Image src="/reiner-logo.png" alt="REINER" width={120} height={26} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Dato titulo="Fin estimado" valor={p ? fechaCorta(p.finEstimado, hoy) : "—"} />
          <Dato titulo="Avance" valor={p ? `${p.avancePct}%` : "—"} />
          <Dato titulo="Piezas terminadas" valor={`${filas.filter((f) => f.e.estado === "terminada").length} de ${filas.length}`} />
          <Dato titulo="Horas reales / estimadas" valor={`${horas(totalReal)} / ${horas(totalEst)}`} />
        </div>

        <table className="w-full text-xs border-collapse">
          <thead className="text-foreground-muted">
            <tr className="border-b border-border">
              <th className="text-left py-1.5 pr-2 font-medium">Pieza</th>
              <th className="text-left py-1.5 pr-2 font-medium">Estado</th>
              <th className="text-left py-1.5 pr-2 font-medium">Hoja de ruta</th>
              <th className="text-right py-1.5 pr-2 font-medium whitespace-nowrap">Real / est.</th>
              <th className="text-right py-1.5 font-medium whitespace-nowrap">Termina</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ x, ts, e, estimadas, real, fin }) => (
              <tr key={x.id} className="border-b border-border align-top break-inside-avoid">
                <td className="py-1.5 pr-2">
                  <div className="font-semibold">
                    {capitalizar(x.nombre)} × {numero(x.cant)}
                  </div>
                  <div className="font-mono text-[10px] text-foreground-muted">{x.codigo}</div>
                </td>
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  <EstadoPiezaChip estado={e.estado} />
                </td>
                <td className="py-1.5 pr-2">
                  <div className="flex flex-wrap gap-1">
                    {ts.map((t) => {
                      const q = t.tipo === "interno" ? quien(t) : null;
                      return (
                        <span key={t.clave} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${CHIP[t.estado] ?? "bg-surface-muted text-foreground-muted border-border"}`} title={`${t.paso}: ${t.estado}`}>
                          {t.estado === "terminada" ? "✓" : t.estado === "en_curso" ? "▶" : "·"} {t.posicion}. {t.tipo === "compras" ? "Material" : t.paso}
                          {q && <span className="opacity-80">({q})</span>}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap">
                  {real ? horas(real) : "—"} / {horas(estimadas)}
                </td>
                <td className="py-1.5 text-right whitespace-nowrap">{e.estado === "terminada" ? "Terminada" : fin ? fechaCorta(fin, hoy) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap justify-between gap-2 text-[11px] text-foreground-muted">
          <span>✓ hecho · ▶ en curso · entre paréntesis, quién lo hizo o lo tiene asignado.</span>
          <span>Impreso el {fechaCorta(hoy)}: las fechas son las del plan a ese día y se corren con el avance real.</span>
        </div>
      </div>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-[11px] text-foreground-muted">{titulo}</div>
      <div className="font-semibold">{valor}</div>
    </div>
  );
}
