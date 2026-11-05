import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otPieza, otConjunto, otMaquina, pieza, operacion, proceso, centroTrabajo, colaTarea, registroOperacion, usuario, cliente, configuracion } from "@/lib/db/schema";
import { getPlan } from "@/lib/planning/datos";
import { PageHeader } from "@/components/ui/PageHeader";
import { ImprimirButton } from "@/components/ImprimirButton";
import { EstadoPiezaChip } from "@/components/v2/EstadoPieza";
import { estadoDePieza } from "@/lib/estado-pieza";
import { capitalizar, fechaCorta, horas, numero } from "@/lib/formato";

export const dynamic = "force-dynamic";

const ESTADO_PASO: Record<string, { texto: string; clase: string }> = {
  terminada: { texto: "Hecho", clase: "bg-verde-bg text-verde-fg" },
  en_curso: { texto: "En curso", clase: "bg-accent text-accent-foreground" },
  pausada: { texto: "Parado", clase: "bg-naranja-bg text-naranja-fg" },
  lista: { texto: "Se puede hacer", clase: "bg-accent-soft text-accent-hover" },
  trabada: { texto: "Trabado", clase: "bg-rojo-bg text-rojo-fg" },
  liberada: { texto: "Espera el anterior", clase: "bg-gris-bg text-gris-fg" },
  futura: { texto: "Por enviar", clase: "bg-gris-bg text-gris-fg" },
};

/**
 * Ficha de una pieza en fabricación (prueba 1, 05/11), desde Gestión: todos los pasos de su hoja de ruta con el
 * centro, quién lo tiene asignado o quién lo hizo, el estado, el tiempo estimado contra el real y las fechas del
 * plan. Se va actualizando sola con cada asignación y con lo que se carga en la tablet, y se imprime.
 */
export default async function FichaPiezaPage({ params }: { params: Promise<{ otPiezaId: string }> }) {
  const { otPiezaId } = await params;
  const [fila] = await db
    .select({ op: otPieza, pieza, ordenId: otMaquina.id, ordenCodigo: otMaquina.codigo, cliente: cliente.razonSocial, config: configuracion.nombre })
    .from(otPieza)
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .leftJoin(cliente, eq(cliente.id, otMaquina.clienteId))
    .leftJoin(configuracion, eq(configuracion.id, otMaquina.configuracionId))
    .where(eq(otPieza.id, otPiezaId));
  if (!fila) notFound();

  const [plan, ruta, cola, registros, centros, personas] = await Promise.all([
    getPlan(),
    db
      .select({ id: operacion.id, secuencia: operacion.secuencia, descripcion: operacion.descripcion, proceso: proceso.nombre, tipo: proceso.tipo, centroId: operacion.centroTrabajoId, centroProceso: proceso.centroTrabajoId })
      .from(operacion)
      .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
      .where(eq(operacion.piezaId, fila.op.piezaId))
      .orderBy(asc(operacion.secuencia)),
    db.select().from(colaTarea).where(eq(colaTarea.otPiezaId, otPiezaId)),
    db.select().from(registroOperacion).where(eq(registroOperacion.otPiezaId, otPiezaId)).orderBy(asc(registroOperacion.inicio)),
    db.select({ id: centroTrabajo.id, nombre: centroTrabajo.nombre }).from(centroTrabajo),
    db.select({ id: usuario.id, nombre: usuario.nombre }).from(usuario),
  ]);
  const hoy = plan.entrada.hoy;
  const tareas = plan.resultado.tareas.filter((t) => t.otPiezaId === otPiezaId);
  const tareaDe = new Map(tareas.map((t) => [t.operacionId, t]));
  const nombre = new Map(personas.map((u) => [u.id, u.nombre]));
  const nombreCentro = new Map(centros.map((c) => [c.id, c.nombre]));
  const e = estadoDePieza(tareas);
  const pasos = ruta.map((r) => {
    const t = tareaDe.get(r.id);
    const c = cola.find((x) => x.operacionId === r.id);
    const delPaso = registros.filter((x) => x.operacionId === r.id);
    // Compras se cierra al recibir el material: tiene fecha, pero no es tiempo ni trabajo de un operario.
    const regs = r.tipo === "compras" ? [] : delPaso;
    const realSeg = regs.reduce((n, x) => n + (x.duracionSeg ?? 0), 0);
    const hicieron = [...new Set(regs.map((x) => nombre.get(x.usuarioId) ?? "—"))];
    const fin = delPaso.filter((x) => x.fin).at(-1)?.fin ?? null;
    return {
      r,
      t,
      centro: r.tipo === "interno" ? (nombreCentro.get(c?.centroId ?? t?.centroId ?? r.centroId ?? r.centroProceso ?? "") ?? "—") : r.tipo === "tercerizado" ? "Tercerizado" : "Compra",
      asignado: c?.operarioId ? (nombre.get(c.operarioId) ?? "—") : null,
      hicieron,
      realHoras: realSeg ? realSeg / 3600 : null,
      terminadoEl: t?.estado === "terminada" && fin ? fin.toISOString().slice(0, 10) : null,
    };
  });
  const finPieza = tareas.map((t) => t.finPlan).filter((f): f is string => !!f).sort().at(-1) ?? null;
  const estimadas = pasos.reduce((n, p) => n + (p.r.tipo === "interno" ? (p.t?.horas ?? 0) : 0), 0);
  const reales = pasos.reduce((n, p) => n + (p.realHoras ?? 0), 0);
  const orden = [fila.config?.split(" - ")[0], fila.cliente].filter(Boolean).join(" · ") || fila.ordenCodigo;

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        migas={[{ href: "/gestion", label: "Gestión" }, { label: fila.pieza.codigo }]}
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {capitalizar(fila.pieza.nombre)} × {numero(fila.op.cantidadAFabricar)}
            {tareas.length > 0 && <EstadoPiezaChip estado={e.estado} />}
          </span>
        }
        descripcion={`${fila.pieza.codigo} · ${fila.op.codigo} · ${orden}`}
        acciones={
          <div className="flex flex-wrap gap-2 print:hidden">
            <ImprimirButton />
            <Link href={`/ot/${fila.ordenId}/pieza/${otPiezaId}/imprimir`} className="btn-secundario">
              Hoja de OT en papel
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Dato titulo="Orden" valor={<Link href={`/proyectos/${fila.ordenId}`} className="hover:text-accent hover:underline">{fila.ordenCodigo}</Link>} />
        <Dato titulo="Termina aprox." valor={finPieza ? fechaCorta(finPieza, hoy) : "—"} />
        <Dato titulo="Horas estimadas" valor={horas(estimadas)} />
        <Dato titulo="Horas reales hasta hoy" valor={reales ? horas(reales) : "—"} />
      </div>
      {e.motivo && <p className="text-sm text-foreground-muted">{e.motivo}</p>}

      <div className="tarjeta overflow-x-auto print:border-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-foreground-muted">
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2 font-medium w-8">#</th>
              <th className="text-left px-2 py-2 font-medium">Paso</th>
              <th className="text-left px-2 py-2 font-medium">Centro</th>
              <th className="text-left px-2 py-2 font-medium">Operario</th>
              <th className="text-left px-2 py-2 font-medium">Estado</th>
              <th className="text-right px-2 py-2 font-medium">Estimado</th>
              <th className="text-right px-2 py-2 font-medium">Real</th>
              <th className="text-left px-3 py-2 font-medium">Cuándo</th>
            </tr>
          </thead>
          <tbody>
            {pasos.map(({ r, t, centro, asignado, hicieron, realHoras, terminadoEl }) => {
              const est = ESTADO_PASO[t?.estado ?? "futura"] ?? ESTADO_PASO.futura;
              return (
                <tr key={r.id} className="border-t border-border first:border-t-0">
                  <td className="px-3 py-2 text-foreground-muted">{r.secuencia}</td>
                  <td className="px-2 py-2">
                    <div className="font-medium">{r.proceso}</div>
                    {r.descripcion?.trim() && <div className="text-xs text-foreground-muted">{r.descripcion}</div>}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{centro}</td>
                  <td className="px-2 py-2">
                    {hicieron.length ? hicieron.join(", ") : asignado ?? (r.tipo === "interno" ? <span className="text-foreground-muted">Sin asignar</span> : "—")}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className={`badge-estado ${est.clase}`}>{est.texto}</span>
                    {t?.motivoTraba && t.estado !== "terminada" && <div className="text-xs text-foreground-muted mt-0.5">{t.motivoTraba}</div>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{r.tipo === "interno" && t ? horas(t.horas) : r.tipo === "tercerizado" && t ? `${t.dias} días` : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{realHoras ? horas(realHoras) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {terminadoEl ? `${r.tipo === "compras" ? "Llegó el" : "Hecho el"} ${fechaCorta(terminadoEl, hoy)}` : t?.fechaPlan ? `${fechaCorta(t.fechaPlan, hoy)}${t.finPlan && t.finPlan !== t.fechaPlan ? ` → ${fechaCorta(t.finPlan, hoy)}` : ""}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-foreground-muted print:hidden">
        Las fechas son las del plan de hoy: se corren solas con cada asignación y con lo que el operario carga en la tablet.
      </p>
      <p className="hidden print:block text-xs">Impreso el {fechaCorta(hoy)}. Las fechas son las del plan a ese día.</p>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: React.ReactNode }) {
  return (
    <div className="tarjeta px-4 py-3">
      <div className="text-xs text-foreground-muted">{titulo}</div>
      <div className="font-semibold">{valor}</div>
    </div>
  );
}
