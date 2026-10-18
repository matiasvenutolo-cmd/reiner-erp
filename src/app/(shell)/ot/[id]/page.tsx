import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getOtMaquinaDetalle } from "@/lib/data/ot";
import { getPiezasPorIds, getPiezasPorConfiguracion } from "@/lib/data/maestros";
import { getControlesArmado, getProcedimientos } from "@/lib/data/armado";
import { getOtPiezaIdsConRevisionPendiente } from "@/lib/data/revision";
import { EstadoBadge } from "@/components/EstadoBadge";
import { ConjuntosView } from "@/components/ot/ConjuntosView";
import type { ConjuntoData } from "@/components/ot/ConjuntoAccordion";
import { completarOtConjuntoAction, enviarAProduccionAction } from "@/app/actions/ot";

export default async function OtMaquinaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detalle = await getOtMaquinaDetalle(id);
  if (!detalle) notFound();
  const { otMaquina, clienteNombre, configuracion, conjuntos, estadoCalculado } = detalle;

  const piezaIds = conjuntos.flatMap((c) => c.piezas.map((p) => p.otPieza.piezaId));
  const [piezasPorId, piezasConfigTodas, procedimientos, otPiezaIdsConRevision] = await Promise.all([
    getPiezasPorIds(piezaIds),
    configuracion ? getPiezasPorConfiguracion(configuracion.id) : Promise.resolve([]),
    getProcedimientos(),
    getOtPiezaIdsConRevisionPendiente(otMaquina.id),
  ]);
  const piezasConfigPorConjunto = new Map<string, typeof piezasConfigTodas>();
  for (const p of piezasConfigTodas) {
    const arr = piezasConfigPorConjunto.get(p.conjuntoId) ?? [];
    arr.push(p);
    piezasConfigPorConjunto.set(p.conjuntoId, arr);
  }

  const conjuntosConPiezas: ConjuntoData[] = await Promise.all(
    conjuntos
      .filter((c) => c.piezas.length > 0)
      .map(async (c) => ({
        otConjuntoId: c.otConjunto.id,
        otConjuntoCodigo: c.otConjunto.codigo,
        conjuntoNombre: c.conjunto?.nombre ?? c.otConjunto.codigo,
        estadoConjunto: c.estadoConjunto,
        filas: c.piezas.map(({ otPieza, estado, sinRouting, pasos }) => ({
          otPieza,
          estado,
          sinRouting,
          pasos,
          pieza: piezasPorId.get(otPieza.piezaId),
          tieneRevisionPendiente: otPiezaIdsConRevision.has(otPieza.id),
        })),
        piezasParaAgregar: (piezasConfigPorConjunto.get(c.otConjunto.conjuntoId) ?? []).map((p) => ({
          id: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
        })),
        // Control de armado (docs/05-backlog-release-2.md §3, §9): sólo tiene
        // sentido cuando el conjunto está terminado — ahí se habilita.
        controlesArmado: c.estadoConjunto === "terminada" ? await getControlesArmado(c.otConjunto.id) : [],
        procedimientos,
      })),
  );
  const sinPiezas = conjuntos.filter((c) => c.piezas.length === 0);
  const sinEnviar = conjuntos.reduce((n, c) => n + c.piezas.filter((p) => !p.otPieza.enviadaProduccionAt).length, 0);
  // Cubierto por stock ≠ sin piezas en la lista de la configuración (ej. Lubricación en una PS):
  // el texto anterior decía "el stock cubría la necesidad" para los dos casos.
  const conjuntosSinFabricar = sinPiezas.filter((c) => (piezasConfigPorConjunto.get(c.otConjunto.conjuntoId) ?? []).length > 0);
  const conjuntosVacios = sinPiezas.filter((c) => (piezasConfigPorConjunto.get(c.otConjunto.conjuntoId) ?? []).length === 0);

  return (
    <div className="space-y-6">
      <PageHeader
        migas={[{ href: "/proyectos", label: "Proyectos y órdenes" }, { label: otMaquina.codigo }]}
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {otMaquina.codigo}
            <EstadoBadge estado={estadoCalculado} />
            {otMaquina.tipo === "suelta" && (
              <span className="badge-estado bg-surface-muted text-foreground-muted">
                {otMaquina.alcance === "pieza" ? "Orden de pieza" : "Orden de conjunto"}
              </span>
            )}
          </span>
        }
        descripcion={[configuracion?.nombre, otMaquina.tipo === "suelta" ? otMaquina.numeroSerie : `Serie ${otMaquina.numeroSerie}`, clienteNombre]
          .filter(Boolean)
          .join(" · ")}
      />

      {sinEnviar > 0 && (
        <form action={enviarAProduccionAction} className="bg-accent-soft rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <input type="hidden" name="otMaquinaId" value={otMaquina.id} />
          <span className="text-sm">
            {sinEnviar} pieza{sinEnviar === 1 ? "" : "s"} todavía en ingeniería. Al enviarlas a producción aparecen en Planificación para
            asignarles día y operario.
          </span>
          <ConfirmarBoton mensaje={`¿Enviar ${sinEnviar} pieza${sinEnviar === 1 ? "" : "s"} a producción? Van a aparecer en Planificación y en el taller.`}>
            Enviar{" "}
            {sinEnviar === conjuntos.reduce((n, c) => n + c.piezas.length, 0)
              ? "toda la OT"
              : sinEnviar === 1
                ? "la pieza que falta"
                : `las ${sinEnviar} piezas que faltan`}{" "}
            a producción
          </ConfirmarBoton>
        </form>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Emitido por" value={otMaquina.emitidoPor ?? "—"} />
        <Metric label="Orden de compra" value={otMaquina.ordenCompra ?? "—"} />
        <Metric label="Plazo de entrega" value={otMaquina.plazoEntrega ?? "—"} />
        <Metric label="Conjuntos a fabricar" value={String(conjuntosConPiezas.length)} />
      </div>

      <ConjuntosView otMaquinaId={otMaquina.id} conjuntos={conjuntosConPiezas} />

      {conjuntosSinFabricar.length > 0 && (
        <div className="text-sm">
          <h2 className="text-sm font-semibold mb-2 text-foreground-muted">
            {conjuntosSinFabricar.length} conjunto{conjuntosSinFabricar.length === 1 ? "" : "s"} sin piezas a
            fabricar (el stock cubría la necesidad al generar la OT)
          </h2>
          <ul className="space-y-1.5">
            {conjuntosSinFabricar.map((c) => (
              <li key={c.otConjunto.id} className="flex items-center justify-between bg-surface border border-border rounded-md px-3 py-2">
                <span>{c.conjunto?.nombre}</span>
                <form action={completarOtConjuntoAction}>
                  <input type="hidden" name="otMaquinaId" value={otMaquina.id} />
                  <input type="hidden" name="otConjuntoId" value={c.otConjunto.id} />
                  <button type="submit" className="text-xs text-accent hover:underline whitespace-nowrap">
                    Generar OT de todas formas →
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      {conjuntosVacios.length > 0 && (
        <p className="text-xs text-foreground-muted">
          Sin piezas cargadas para esta máquina en Maestros: {conjuntosVacios.map((c) => c.conjunto?.nombre).join(", ")}.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2">
      <div className="text-xs text-foreground-muted">{label}</div>
      <div className="font-semibold truncate">{value}</div>
    </div>
  );
}
