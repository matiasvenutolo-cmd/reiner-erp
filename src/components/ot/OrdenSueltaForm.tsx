"use client";

import { useMemo, useState } from "react";
import { crearOrdenSueltaAction } from "@/app/actions/ot";

type PiezaOpcion = { id: string; codigo: string; nombre: string; conjuntoId: string };
type ConjuntoOpcion = { id: string; nombre: string };

/**
 * OT suelta INDEPENDIENTE (no cuelga de una máquina ya registrada) — Release
 * 3, devolución del cliente: "a veces les compran o necesitan para un
 * mantenimiento producir sólo un conjunto o una pieza para un cliente".
 * Cascada simple: elegís la máquina (de dónde sale el catálogo de conjuntos
 * y piezas), después conjunto completo o una pieza puntual con cantidad.
 */
export function OrdenSueltaForm({
  configuraciones,
  clientes,
  usuarioNombre,
  conjuntosPorConfiguracion,
  piezasPorConfiguracion,
  inicial = {},
  fechaObjetivo,
  stockLibre = {},
}: {
  configuraciones: { id: string; nombre: string }[];
  clientes: { id: string; razonSocial: string }[];
  usuarioNombre: string;
  conjuntosPorConfiguracion: Record<string, ConjuntoOpcion[]>;
  piezasPorConfiguracion: Record<string, PiezaOpcion[]>;
  /** v2 — precarga desde Stock o desde la alerta de mínimo. */
  inicial?: { destino?: "repuesto" | "stock"; configuracionId?: string; piezaId?: string; cantidad?: number; motivo?: string };
  /** Fecha objetivo por defecto de una orden para stock (20 días hábiles). */
  fechaObjetivo: string;
  stockLibre?: Record<string, number>;
}) {
  const [configuracionId, setConfiguracionId] = useState(inicial.configuracionId ?? "");
  const [tipoSuelta, setTipoSuelta] = useState<"conjunto" | "pieza">(inicial.piezaId ? "pieza" : "conjunto");
  const [conjuntoId, setConjuntoId] = useState("");
  const [piezaId, setPiezaId] = useState(inicial.piezaId ?? "");
  const [destino, setDestino] = useState<"repuesto" | "stock">(inicial.destino ?? "repuesto");
  const libre = piezaId ? (stockLibre[piezaId] ?? 0) : 0;

  const conjuntos = configuracionId ? (conjuntosPorConfiguracion[configuracionId] ?? []) : [];
  const piezas = configuracionId ? (piezasPorConfiguracion[configuracionId] ?? []) : [];
  const piezasFiltradas = useMemo(
    () => (conjuntoId ? piezas.filter((p) => p.conjuntoId === conjuntoId) : piezas),
    [piezas, conjuntoId],
  );

  return (
    <form action={crearOrdenSueltaAction} className="bg-surface border border-border rounded-lg p-5 space-y-4">
      <Field label="¿Para quién es?">
        <div className="grid grid-cols-2 gap-2 text-sm">
          {(
            [
              ["repuesto", "Para un cliente", "Repuesto o mantenimiento. Prioridad alta."],
              ["stock", "Para stock", "Sin cliente: entra al almacén como libre."],
            ] as const
          ).map(([v, l, ayuda]) => (
            <label key={v} className={`flex gap-2 rounded-md border p-2.5 cursor-pointer ${destino === v ? "border-accent bg-accent-soft" : "border-border"}`}>
              <input type="radio" name="destino" value={v} checked={destino === v} onChange={() => setDestino(v)} className="mt-0.5" />
              <span>
                <span className="font-medium block">{l}</span>
                <span className="text-xs text-foreground-muted">{ayuda}</span>
              </span>
            </label>
          ))}
        </div>
      </Field>
      <Field label="Máquina (de ahí sale el catálogo de conjuntos y piezas)">
        <select
          name="configuracionId"
          required
          value={configuracionId}
          onChange={(e) => {
            setConfiguracionId(e.target.value);
            setConjuntoId("");
            setPiezaId("");
          }}
          className="input"
        >
          <option value="">Seleccionar…</option>
          {configuraciones.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </Field>

      <Field label="¿Qué se pide?">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="tipoSuelta"
              value="conjunto"
              checked={tipoSuelta === "conjunto"}
              onChange={() => setTipoSuelta("conjunto")}
            />
            Un conjunto completo
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="tipoSuelta"
              value="pieza"
              checked={tipoSuelta === "pieza"}
              onChange={() => setTipoSuelta("pieza")}
            />
            Una pieza puntual
          </label>
        </div>
      </Field>

      {tipoSuelta === "conjunto" ? (
        <Field label="Conjunto">
          <select
            name="conjuntoId"
            required
            value={conjuntoId}
            onChange={(e) => setConjuntoId(e.target.value)}
            disabled={!configuracionId}
            className="input"
          >
            <option value="">{configuracionId ? "Seleccionar…" : "Elegí primero una máquina"}</option>
            {conjuntos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <>
          <Field label="Conjunto (opcional, para acotar la lista de piezas)">
            <select
              value={conjuntoId}
              onChange={(e) => {
                setConjuntoId(e.target.value);
                setPiezaId("");
              }}
              disabled={!configuracionId}
              className="input"
            >
              <option value="">Todos los conjuntos</option>
              {conjuntos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pieza">
            <select
              name="piezaId"
              required
              value={piezaId}
              onChange={(e) => setPiezaId(e.target.value)}
              disabled={!configuracionId}
              className="input"
            >
              <option value="">{configuracionId ? "Seleccionar…" : "Elegí primero una máquina"}</option>
              {piezasFiltradas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cantidad">
            <input name="cantidad" type="number" min={1} required defaultValue={inicial.cantidad ?? 1} className="input w-24" />
          </Field>
          {destino === "repuesto" && libre > 0 && (
            <p className="text-sm rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2">
              Hay <strong>{libre}</strong> libre{libre === 1 ? "" : "s"} en stock.{" "}
              <a href={`/stock/pieza/${encodeURIComponent(piezaId)}`} className="text-accent underline">
                Usar stock
              </a>{" "}
              en vez de fabricar.
            </p>
          )}
        </>
      )}

      <Field label="Referencia (identifica esta orden — ej. «Repuesto Cliente X»)">
        <input name="referencia" required placeholder="ej. Repuesto cabezal" className="input" />
      </Field>

      {destino === "repuesto" ? (
        <>
          <Field label="Cliente">
            <select name="clienteId" required className="input">
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razonSocial}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Orden de compra">
              <input name="ordenCompra" placeholder="ej. 008" className="input" />
            </Field>
            <Field label="Fecha de entrega al cliente">
              <input name="fechaEntrega" type="date" className="input" />
            </Field>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Motivo">
            <select name="motivoStock" required defaultValue={inicial.motivo ?? "Reposición por mínimo"} className="input">
              <option>Reposición por mínimo</option>
              <option>Adelantar para próximas máquinas</option>
              <option>Otro</option>
            </select>
          </Field>
          <Field label="Fecha objetivo">
            <input name="fechaEntrega" type="date" defaultValue={fechaObjetivo} className="input" />
          </Field>
        </div>
      )}

      <Field label="Prioridad">
        <select name="prioridad" key={destino} defaultValue={destino === "repuesto" ? "alta" : "normal"} className="input w-40">
          <option value="alta">Alta</option>
          <option value="normal">Normal</option>
        </select>
      </Field>
      <p className="text-xs text-foreground-muted -mt-2">Con fecha, la orden entra sola al plan. Sin fecha queda en borrador, para activarla después desde Proyectos.</p>

      <Field label="Emitido por">
        <input name="emitidoPor" required defaultValue={usuarioNombre} className="input" />
      </Field>

      <button
        type="submit"
        className="w-full bg-accent text-accent-foreground font-medium text-sm py-2.5 rounded-md hover:opacity-90"
      >
        {destino === "stock" ? "Generar orden para stock" : "Generar orden para el cliente"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-foreground-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
