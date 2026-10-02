"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buscarPiezasParaRemitoAction, generarRemitoAction } from "@/app/actions/remitos";

type ResultadoPieza = { id: string; codigo: string; nombre: string };
type ItemCarrito = { clave: string; piezaId: string; codigo: string; nombre: string; cantidad: number; tratamiento: string; otPiezaId?: string; otPiezaCodigo?: string };

export type PiezaParaMandar = {
  otPiezaId: string;
  otPiezaCodigo: string;
  piezaId: string;
  piezaCodigo: string;
  piezaNombre: string;
  procesoNombre: string;
  cantidad: number;
};

/**
 * Armar un remito con varias piezas antes de finalizarlo — pedido
 * explícito del cliente (docs/06-backlog-release-3.md §12): "cargar varias
 * piezas al mismo movimiento antes de finalizarlo". Todo el flujo (buscar,
 * agregar, sacar, generar) vive en un solo componente cliente para no
 * perder lo ya cargado en cada búsqueda — nada de esto se guarda hasta
 * tocar "Generar remito".
 */
export function ArmadoRemito({ paraMandar = [] }: { paraMandar?: PiezaParaMandar[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ResultadoPieza[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [destino, setDestino] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function buscar(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const rows = await buscarPiezasParaRemitoAction(q);
    setResultados(rows);
    setBuscando(false);
  }

  function agregar(p: ResultadoPieza) {
    if (carrito.some((it) => it.clave === p.id)) return;
    setCarrito((prev) => [...prev, { clave: p.id, piezaId: p.id, codigo: p.codigo, nombre: p.nombre, cantidad: 1, tratamiento: "" }]);
    setQuery("");
    setResultados([]);
  }

  // Pieza en fabricación que sale a su paso tercerizado: el tratamiento ya es ese proceso.
  function agregarParaMandar(...piezas: PiezaParaMandar[]) {
    setCarrito((prev) => [
      ...prev,
      ...piezas.filter((p) => !prev.some((it) => it.clave === p.otPiezaId)).map((p) => ({
        clave: p.otPiezaId,
        piezaId: p.piezaId,
        codigo: p.piezaCodigo,
        nombre: p.piezaNombre,
        cantidad: p.cantidad,
        tratamiento: p.procesoNombre,
        otPiezaId: p.otPiezaId,
        otPiezaCodigo: p.otPiezaCodigo,
      })),
    ]);
  }

  // Lo pendiente de tercerizar, agrupado por operación: para juntar y mandar todo junto.
  const porOperacion = [...paraMandar.reduce((m, p) => m.set(p.procesoNombre, [...(m.get(p.procesoNombre) ?? []), p]), new Map<string, PiezaParaMandar[]>())];

  function quitar(clave: string) {
    setCarrito((prev) => prev.filter((it) => it.clave !== clave));
  }

  function actualizar(clave: string, campo: "cantidad" | "tratamiento", valor: string) {
    setCarrito((prev) =>
      prev.map((it) => (it.clave === clave ? { ...it, [campo]: campo === "cantidad" ? Math.max(1, Number(valor) || 1) : valor } : it)),
    );
  }

  function generar() {
    setError(null);
    if (!destino.trim()) {
      setError("Falta el destino.");
      return;
    }
    if (carrito.length === 0) {
      setError("Agregá al menos una pieza.");
      return;
    }
    startTransition(async () => {
      try {
        const id = await generarRemitoAction({
          destino: destino.trim(),
          tecnico: tecnico.trim() || undefined,
          observacion: observacion.trim() || undefined,
          items: carrito.map((it) => ({
            piezaId: it.piezaId,
            cantidad: it.cantidad,
            tratamiento: it.tratamiento || undefined,
            otPiezaId: it.otPiezaId,
          })),
        });
        router.push(`/remitos/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo generar el remito.");
      }
    });
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
      {paraMandar.length > 0 && (
        <div>
          <div className="text-xs font-medium text-foreground-muted mb-1.5">
            Pendientes de tercerizar — llegaron a su paso tercerizado y todavía no salieron ({paraMandar.length})
          </div>
          <div className="space-y-2">
            {porOperacion.map(([operacion, piezas]) => {
              const faltan = piezas.filter((p) => !carrito.some((it) => it.clave === p.otPiezaId));
              return (
                <div key={operacion}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">
                      {operacion} · {piezas.length} pieza{piezas.length === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      disabled={faltan.length === 0}
                      onClick={() => agregarParaMandar(...faltan)}
                      className="text-accent hover:underline disabled:text-foreground-muted disabled:no-underline"
                    >
                      {faltan.length === 0 ? "Todas en el remito" : `+ Agregar todas (${faltan.length})`}
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {piezas.map((p) => {
                      const agregada = carrito.some((it) => it.clave === p.otPiezaId);
                      return (
                        <li key={p.otPiezaId} className="flex items-center gap-2 text-sm bg-surface-muted rounded-md px-2.5 py-1.5">
                          <span className="font-mono text-xs text-foreground-muted">{p.otPiezaCodigo}</span>
                          <span className="flex-1 truncate">{p.piezaNombre}</span>
                          <span className="text-xs text-foreground-muted shrink-0">{p.cantidad} u.</span>
                          <button
                            type="button"
                            disabled={agregada}
                            onClick={() => agregarParaMandar(p)}
                            className="text-xs text-accent hover:underline disabled:text-foreground-muted disabled:no-underline shrink-0"
                          >
                            {agregada ? "En el remito" : "+ Agregar"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => buscar(e.target.value)}
          placeholder="…o buscar cualquier pieza del almacén por código o nombre"
          className="input"
        />
        {query && (resultados.length > 0 || buscando) && (
          <div className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-lg shadow-lg overflow-hidden">
            {buscando ? (
              <div className="px-3 py-2 text-sm text-foreground-muted">Buscando…</div>
            ) : (
              resultados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregar(p)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface-muted flex items-center gap-2"
                >
                  <span className="font-mono text-xs text-foreground-muted">{p.codigo}</span>
                  <span>{p.nombre}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {carrito.length > 0 && (
        <div className="bg-surface-muted rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-foreground-muted text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Pieza</th>
                <th className="text-left px-3 py-2 font-medium w-40">Tratamiento</th>
                <th className="text-right px-3 py-2 font-medium w-20">Cantidad</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {carrito.map((it) => (
                <tr key={it.clave} className="border-t border-border">
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-foreground-muted mr-1">{it.codigo}</span>
                    {it.nombre}
                    {it.otPiezaCodigo && <div className="text-xs text-foreground-muted">de {it.otPiezaCodigo} — en fabricación, no descuenta almacén</div>}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={it.tratamiento}
                      onChange={(e) => actualizar(it.clave, "tratamiento", e.target.value)}
                      placeholder="ej. Cromado"
                      className="input text-xs py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      value={it.cantidad}
                      onChange={(e) => actualizar(it.clave, "cantidad", e.target.value)}
                      className="input text-xs py-1 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => quitar(it.clave)} className="text-xs text-foreground-muted hover:text-red-700">
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-2">
        <input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Destino (proveedor o cliente)" className="input" />
        <input value={tecnico} onChange={(e) => setTecnico(e.target.value)} placeholder="Técnico involucrado (opcional)" className="input" />
        <input
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          placeholder="Observaciones (opcional)"
          className="input"
        />
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button
        type="button"
        onClick={generar}
        disabled={isPending}
        className="bg-accent text-accent-foreground font-medium text-sm px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Generando…" : "Generar remito →"}
      </button>
    </div>
  );
}
