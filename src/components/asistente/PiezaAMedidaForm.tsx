"use client";

import { useState, useTransition } from "react";
import { crearPiezaAMedidaAction } from "@/app/actions/borrador";

type Proceso = { id: string; nombre: string; tipo: string; centroId: string | null };
type Opcion = { id: string; nombre: string };

function Campo({ label, ayuda, children, className = "" }: { label: string; ayuda?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="etiqueta">{label}</span>
      {children}
      {ayuda && <span className="block text-xs text-foreground-muted mt-1">{ayuda}</span>}
    </label>
  );
}

/**
 * "Pieza nueva a medida" (reorganización 30/10 §2.4): todo en una pantalla y la orden queda confirmada al
 * guardar. Si falta algo, el aviso aparece arriba y lo cargado se conserva.
 */
export function PiezaAMedidaForm({ procesos, centros, clientes, maxPasos, hoy }: { procesos: Proceso[]; centros: Opcion[]; clientes: Opcion[]; maxPasos: number; hoy: string }) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Clave estable por paso: al quitar uno, los demás conservan lo que tienen cargado.
  const [pasos, setPasos] = useState<{ k: number; procesoId: string }[]>([{ k: 0, procesoId: "" }]);
  const procesoDe = new Map(procesos.map((p) => [p.id, p]));
  const nombreCentro = new Map(centros.map((c) => [c.id, c.nombre]));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          setError(null);
          const r = await crearPiezaAMedidaAction(fd);
          if (r && !r.ok) setError(r.error);
        });
      }}
    >
      {error && <div className="rounded-lg border border-rojo/40 bg-rojo-bg text-rojo-fg px-3 py-2 text-sm">{error}</div>}

      <section className="tarjeta p-4 space-y-3">
        <h2 className="font-semibold">La pieza</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nombre" className="sm:col-span-2">
            <input name="nombre" required className="input" placeholder="Ej.: Punzón superior para Fette 2090" />
          </Campo>
          <Campo label="Plano" ayuda="Número de plano. Opcional.">
            <input name="numeroPlano" className="input" />
          </Campo>
          <Campo label="Revisión del plano" ayuda="Opcional.">
            <input name="revision" className="input" />
          </Campo>
          <Campo label="Material" ayuda="Opcional." className="sm:col-span-2">
            <input name="material" className="input" placeholder="Ej.: Acero 1045 Ø 50" />
          </Campo>
        </div>
      </section>

      <section className="tarjeta p-4 space-y-3">
        <h2 className="font-semibold">Hoja de ruta</h2>
        <p className="text-sm text-foreground-muted">De 1 a {maxPasos} pasos, en orden. El tiempo es el estimado por unidad; en un tercerizado, el plazo en días hábiles. Después se puede completar en la ficha de la pieza.</p>
        <ol className="space-y-2">
          {pasos.map(({ k, procesoId }, i) => {
            const pr = procesoDe.get(procesoId);
            const tercerizado = pr?.tipo === "tercerizado";
            return (
              <li key={k} className="grid gap-2 sm:grid-cols-[2rem_1fr_1fr_10rem_auto] items-end">
                <span className="text-sm font-semibold tabular-nums pb-2">{i + 1}.</span>
                <Campo label="Proceso">
                  <select name={`proceso_${i}`} required value={procesoId} onChange={(e) => setPasos((ps) => ps.map((x, j) => (j === i ? { ...x, procesoId: e.target.value } : x)))} className="input">
                    <option value="">Elegí…</option>
                    {procesos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                        {p.tipo === "tercerizado" ? " (tercerizado)" : ""}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Centro">
                  {tercerizado ? (
                    <span className="block text-sm text-foreground-muted py-2">Afuera, con el proveedor</span>
                  ) : (
                    <select name={`centro_${i}`} defaultValue="" className="input">
                      <option value="">{pr?.centroId ? `El del proceso (${nombreCentro.get(pr.centroId) ?? pr.centroId})` : "El del proceso"}</option>
                      {centros.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                </Campo>
                <Campo label={tercerizado ? "Plazo (días)" : "Tiempo (min por unidad)"}>
                  <input name={`tiempo_${i}`} inputMode="decimal" className="input" />
                </Campo>
                <button
                  type="button"
                  className="btn-texto btn-sm mb-1 disabled:opacity-30"
                  disabled={pasos.length === 1}
                  aria-label={`Quitar el paso ${i + 1}`}
                  onClick={() => setPasos((ps) => ps.filter((_, j) => j !== i))}
                >
                  Quitar
                </button>
              </li>
            );
          })}
        </ol>
        {pasos.length < maxPasos && (
          <button type="button" className="btn-secundario btn-sm" onClick={() => setPasos((ps) => [...ps, { k: Math.max(...ps.map((x) => x.k)) + 1, procesoId: "" }])}>
            + Agregar paso
          </button>
        )}
      </section>

      <section className="tarjeta p-4 space-y-3">
        <h2 className="font-semibold">La orden</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Cliente">
            <select name="clienteId" required defaultValue="" className="input">
              <option value="">Elegí…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Cantidad">
            <input name="cantidad" type="number" min={1} defaultValue={1} required className="input" />
          </Campo>
          <Campo label="Fecha de entrega comprometida">
            <input name="fechaEntrega" type="date" min={hoy} required className="input" />
          </Campo>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pendiente}>
          {pendiente ? "Creando…" : "Crear pieza y confirmar la orden"}
        </button>
        <span className="text-sm text-foreground-muted">La orden queda activa y sus tareas aparecen en Gestión.</span>
      </div>
    </form>
  );
}
