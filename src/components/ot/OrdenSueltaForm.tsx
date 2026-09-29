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
}: {
  configuraciones: { id: string; nombre: string }[];
  clientes: { id: string; razonSocial: string }[];
  usuarioNombre: string;
  conjuntosPorConfiguracion: Record<string, ConjuntoOpcion[]>;
  piezasPorConfiguracion: Record<string, PiezaOpcion[]>;
}) {
  const [configuracionId, setConfiguracionId] = useState("");
  const [tipoSuelta, setTipoSuelta] = useState<"conjunto" | "pieza">("conjunto");
  const [conjuntoId, setConjuntoId] = useState("");
  const [piezaId, setPiezaId] = useState("");

  const conjuntos = configuracionId ? (conjuntosPorConfiguracion[configuracionId] ?? []) : [];
  const piezas = configuracionId ? (piezasPorConfiguracion[configuracionId] ?? []) : [];
  const piezasFiltradas = useMemo(
    () => (conjuntoId ? piezas.filter((p) => p.conjuntoId === conjuntoId) : piezas),
    [piezas, conjuntoId],
  );

  return (
    <form action={crearOrdenSueltaAction} className="bg-surface border border-border rounded-lg p-5 space-y-4">
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
            <input name="cantidad" type="number" min={1} required defaultValue={1} className="input w-24" />
          </Field>
        </>
      )}

      <Field label="Referencia (identifica esta orden — ej. «Repuesto Cliente X»)">
        <input name="referencia" required placeholder="ej. Repuesto cabezal" className="input" />
      </Field>

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
        <Field label="Plazo de entrega">
          <input name="plazoEntrega" placeholder="ej. 2 semanas" className="input" />
        </Field>
      </div>

      <Field label="Emitido por">
        <input name="emitidoPor" required defaultValue={usuarioNombre} className="input" />
      </Field>

      <button
        type="submit"
        className="w-full bg-accent text-accent-foreground font-medium text-sm py-2.5 rounded-md hover:opacity-90"
      >
        Generar orden suelta
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
