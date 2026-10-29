"use client";

import { useMemo, useState } from "react";
import { guardarPaso1Action } from "@/app/actions/borrador";
import { Icono } from "@/components/ui/Icono";
import { normalizarBusqueda } from "@/lib/formato";

type Opcion = { id: string; codigo: string; nombre: string };
export type DatosPaso1 = {
  id?: string;
  tipo: "maquina" | "conjunto" | "pieza";
  configuracionId?: string | null;
  conjunto?: string | null; // "configuración|conjunto"
  piezaId?: string | null;
  cantidad: number;
  destino: "cliente" | "stock";
  clienteId?: string | null;
  fechaCliente?: string | null;
  numeroSerie?: string | null;
  ordenCompra?: string | null;
  motivoStock?: string | null;
  excluidas: string[];
};

const TIPOS = [
  ["maquina", "Máquina completa", "Una configuración entera (RD, PS 120, PS 124…)"],
  ["conjunto", "Conjunto", "Un conjunto del maestro, con todas sus piezas"],
  ["pieza", "Pieza suelta", "Una pieza del maestro"],
] as const;

function Campo({ label, ayuda, children }: { label: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="etiqueta">{label}</span>
      {children}
      {ayuda && <span className="block text-xs text-foreground-muted mt-1">{ayuda}</span>}
    </label>
  );
}

/**
 * Paso 1 — Qué hay que hacer (simplificación §1). Sin plazo de entrega: la
 * fecha se define en el paso 3. La fecha que pide el cliente es una referencia.
 */
export function Paso1({
  inicial,
  configuraciones,
  conjuntos,
  piezas,
  piezasPorConfig,
  clientes,
  alternativos,
}: {
  inicial: DatosPaso1;
  configuraciones: Opcion[];
  conjuntos: { valor: string; etiqueta: string }[];
  piezas: Opcion[];
  piezasPorConfig: Record<string, { id: string; codigo: string; nombre: string; conjunto: string }[]>;
  clientes: { id: string; nombre: string }[];
  /** Configuraciones con conjuntos alternativos (mismo lugar en el montaje): sólo ahí se eligen variantes. */
  alternativos: Record<string, string[]>;
}) {
  const [tipo, setTipo] = useState(inicial.tipo);
  const [configuracionId, setConfiguracionId] = useState(inicial.configuracionId ?? "");
  const [destino, setDestino] = useState(inicial.destino);
  const [piezaId, setPiezaId] = useState(inicial.piezaId ?? "");
  const [texto, setTexto] = useState(() => piezas.find((p) => p.id === inicial.piezaId)?.nombre ?? "");
  const [quitar, setQuitar] = useState<Set<string>>(new Set(inicial.excluidas));
  const indice = useMemo(() => piezas.map((p) => ({ ...p, clave: normalizarBusqueda(`${p.codigo} ${p.nombre}`) })), [piezas]);
  const q = normalizarBusqueda(texto);
  const elegida = piezas.find((p) => p.id === piezaId);
  const sugeridas = q.length >= 2 && (!elegida || elegida.nombre !== texto) ? indice.filter((p) => q.split(/\s+/).every((w) => p.clave.includes(w))).slice(0, 8) : [];
  const [conjunto, setConjunto] = useState(inicial.conjunto ?? "");
  const [textoConj, setTextoConj] = useState(() => conjuntos.find((c) => c.valor === inicial.conjunto)?.etiqueta ?? "");
  const indiceConj = useMemo(() => conjuntos.map((c) => ({ ...c, clave: normalizarBusqueda(c.etiqueta) })), [conjuntos]);
  const qc = normalizarBusqueda(textoConj);
  const conjElegido = conjuntos.find((c) => c.valor === conjunto);
  const sugeridosConj = qc.length >= 2 && (!conjElegido || conjElegido.etiqueta !== textoConj) ? indiceConj.filter((c) => qc.split(/\s+/).every((w) => c.clave.includes(w))).slice(0, 10) : [];
  // Variantes (simplificación §1): sólo para configuraciones con piezas alternativas.
  const variantes = useMemo(
    () => (tipo === "maquina" && configuracionId && alternativos[configuracionId]?.length ? (piezasPorConfig[configuracionId] ?? []) : []),
    [tipo, configuracionId, piezasPorConfig, alternativos],
  );
  const porConjunto = useMemo(() => {
    const m = new Map<string, typeof variantes>();
    for (const v of variantes) m.set(v.conjunto, [...(m.get(v.conjunto) ?? []), v]);
    return [...m];
  }, [variantes]);

  return (
    <form action={guardarPaso1Action} className="tarjeta p-5 space-y-5 max-w-3xl">
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}

      <fieldset>
        <legend className="etiqueta">Tipo</legend>
        <div className="grid sm:grid-cols-3 gap-2">
          {TIPOS.map(([v, l, ayuda]) => (
            <label key={v} className={`flex gap-2 rounded-lg border p-3 cursor-pointer ${tipo === v ? "border-accent bg-accent-soft" : "border-border"}`}>
              <input type="radio" name="tipo" value={v} checked={tipo === v} onChange={() => setTipo(v)} className="mt-1" />
              <span>
                <span className="font-semibold block">{l}</span>
                <span className="text-xs text-foreground-muted">{ayuda}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid sm:grid-cols-[1fr_8rem] gap-3 items-end">
        {tipo === "maquina" && (
          <Campo label="Qué máquina">
            <select name="configuracionId" value={configuracionId} onChange={(e) => setConfiguracionId(e.target.value)} required className="input">
              <option value="">Elegí la configuración…</option>
              {configuraciones.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {tipo === "conjunto" && (
          <Campo label="Qué conjunto" ayuda={conjElegido ? `Elegido: ${conjElegido.etiqueta}` : "Buscá por código o por nombre."}>
            <div className="relative">
              <Icono nombre="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
              <input
                value={textoConj}
                onChange={(e) => {
                  setTextoConj(e.target.value);
                  setConjunto("");
                }}
                placeholder="ej. C13, caja reductora…"
                className="input pl-9"
                aria-label="Buscar conjunto"
              />
              <input type="hidden" name="conjunto" value={conjunto} />
              {sugeridosConj.length > 0 && (
                <ul className="absolute z-30 mt-1 w-full tarjeta py-1 max-h-72 overflow-y-auto">
                  {sugeridosConj.map((c) => (
                    <li key={c.valor}>
                      <button
                        type="button"
                        onClick={() => {
                          setConjunto(c.valor);
                          setTextoConj(c.etiqueta);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted"
                      >
                        {c.etiqueta}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Campo>
        )}
        {tipo === "pieza" && (
          <Campo label="Qué pieza" ayuda={elegida ? `Elegida: ${elegida.codigo}` : "Buscá por código o por nombre."}>
            <div className="relative">
              <Icono nombre="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
              <input
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  setPiezaId("");
                }}
                placeholder="ej. engranaje, RD001110S005…"
                className="input pl-9"
                aria-label="Buscar pieza"
              />
              <input type="hidden" name="piezaId" value={piezaId} />
              {sugeridas.length > 0 && (
                <ul className="absolute z-30 mt-1 w-full tarjeta py-1 max-h-72 overflow-y-auto">
                  {sugeridas.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPiezaId(p.id);
                          setTexto(p.nombre);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-surface-muted"
                      >
                        <span className="block text-sm font-medium">{p.nombre.charAt(0).toUpperCase() + p.nombre.slice(1)}</span>
                        <span className="block font-mono text-[13px] text-foreground-muted">{p.codigo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Campo>
        )}
        <Campo label="Cantidad">
          <input name="cantidad" type="number" min={1} defaultValue={inicial.cantidad || 1} required className="input" />
        </Campo>
      </div>

      <fieldset>
        <legend className="etiqueta">Para quién</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["cliente", "Para un cliente"],
              ["stock", "Para stock"],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer ${destino === v ? "border-accent bg-accent-soft" : "border-border"}`}>
              <input type="radio" name="destino" value={v} checked={destino === v} onChange={() => setDestino(v)} />
              <span className="font-medium">{l}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {destino === "cliente" ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo label="Cliente">
            <select name="clienteId" defaultValue={inicial.clienteId ?? ""} required className="input">
              <option value="">Elegí el cliente…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="El cliente la quiere para… (opcional)" ayuda="Es una referencia, no un compromiso: la fecha se define en el paso 3.">
            <input type="date" name="fechaCliente" defaultValue={inicial.fechaCliente ?? ""} className="input" />
          </Campo>
        </div>
      ) : (
        <Campo label="Motivo">
          <select name="motivoStock" defaultValue={inicial.motivoStock ?? "Reposición por mínimo"} className="input max-w-sm">
            <option>Reposición por mínimo</option>
            <option>Adelantar para próximas máquinas</option>
            <option>Otro</option>
          </select>
        </Campo>
      )}

      <details className="rounded-lg border border-border px-3 py-2" open={!!(inicial.numeroSerie || inicial.ordenCompra)}>
        <summary className="cursor-pointer text-sm font-medium">Número de serie y orden de compra del cliente (opcional, se pueden cargar después)</summary>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <Campo label="Número de serie">
            <input name="numeroSerie" defaultValue={inicial.numeroSerie ?? ""} className="input" />
          </Campo>
          <Campo label="Orden de compra del cliente">
            <input name="ordenCompra" defaultValue={inicial.ordenCompra ?? ""} className="input" />
          </Campo>
        </div>
      </details>

      {variantes.length > 0 && (
        <details className="rounded-lg border border-border px-3 py-2" open={quitar.size > 0}>
          <summary className="cursor-pointer text-sm font-medium">
            Variantes: destildá las piezas que este pedido no lleva {quitar.size > 0 && <span className="text-foreground-muted">({quitar.size} quitadas)</span>}
          </summary>
          <p className="text-xs text-foreground-muted mt-2">Esta máquina tiene conjuntos alternativos: {alternativos[configuracionId].join(" · ")}.</p>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mt-3 max-h-96 overflow-y-auto">
            {porConjunto.map(([conj, ps]) => (
              <div key={conj}>
                <div className="text-xs font-semibold text-foreground-muted mb-1">{conj}</div>
                {ps.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm py-0.5">
                    <input
                      type="checkbox"
                      checked={!quitar.has(p.id)}
                      onChange={(e) => {
                        const s = new Set(quitar);
                        if (e.target.checked) s.delete(p.id);
                        else s.add(p.id);
                        setQuitar(s);
                      }}
                    />
                    <span>
                      {p.nombre} <span className="font-mono text-[11px] text-foreground-muted">{p.codigo}</span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          {[...quitar].map((idq) => (
            <input key={idq} type="hidden" name="quitar" value={idq} />
          ))}
        </details>
      )}

      <div className="flex justify-end">
        <button className="btn">Ver qué hace falta →</button>
      </div>
    </form>
  );
}
