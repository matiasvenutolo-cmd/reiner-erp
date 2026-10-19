"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buscarPiezasParaRemitoAction, generarRemitoAction } from "@/app/actions/remitos";
import { HojaRemito } from "./HojaRemito";
import { Icono } from "@/components/ui/Icono";

type ResultadoPieza = { id: string; codigo: string; nombre: string };
type ItemCarrito = {
  clave: string;
  piezaId: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  tratamiento: string;
  otPiezaId?: string;
  otPiezaCodigo?: string;
  /** Pieza en fabricación: no salen más de las que llegaron a su paso tercerizado. */
  maxCantidad?: number;
};

export type PiezaParaMandar = {
  otPiezaId: string;
  otPiezaCodigo: string;
  piezaId: string;
  piezaCodigo: string;
  piezaNombre: string;
  procesoNombre: string;
  cantidad: number;
  /** v2 — último día para mandarla y que vuelva a tiempo (del plan). */
  mandarAntes?: string | null;
  mandarAntesTexto?: string | null;
  atrasada?: boolean;
};

/** v2 — por proceso: proveedor habitual (se propone solo como destino) y cuántas piezas más llegan en 3 días. */
export type SugerenciaProceso = { proveedor?: string | null; plazo?: number | null; proximas: number };

/**
 * Armar un remito con varias piezas antes de finalizarlo — pedido
 * explícito del cliente (docs/06-backlog-release-3.md §12): "cargar varias
 * piezas al mismo movimiento antes de finalizarlo". Todo el flujo (buscar,
 * agregar, sacar, generar) vive en un solo componente cliente para no
 * perder lo ya cargado en cada búsqueda. Observación del cliente en Fase 3:
 * antes de guardarlo se ve la vista previa (la misma hoja que se imprime,
 * sin número todavía); recién "Confirmar e imprimir" lo registra —con su
 * número y los egresos— y abre la impresión.
 */
export function ArmadoRemito({ paraMandar = [], usuarioNombre, sugerencias = {} }: { paraMandar?: PiezaParaMandar[]; usuarioNombre: string; sugerencias?: Record<string, SugerenciaProceso> }) {
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
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

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
        maxCantidad: p.cantidad,
      })),
    ]);
  }

  // Lo pendiente de tercerizar, agrupado por operación y ordenado por "mandar antes del…": para juntar y mandar todo junto.
  const porOperacion = [...paraMandar.reduce((m, p) => m.set(p.procesoNombre, [...(m.get(p.procesoNombre) ?? []), p]), new Map<string, PiezaParaMandar[]>())]
    .map(([op, ps]) => [op, [...ps].sort((a, b) => (a.mandarAntes ?? "9999").localeCompare(b.mandarAntes ?? "9999"))] as const)
    .sort(([, a], [, b]) => (a[0]?.mandarAntes ?? "9999").localeCompare(b[0]?.mandarAntes ?? "9999"));

  function quitar(clave: string) {
    setCarrito((prev) => prev.filter((it) => it.clave !== clave));
  }

  function actualizar(clave: string, campo: "cantidad" | "tratamiento", valor: string) {
    setCarrito((prev) =>
      prev.map((it) =>
        it.clave === clave
          ? { ...it, [campo]: campo === "cantidad" ? Math.min(it.maxCantidad ?? Infinity, Math.max(1, Number(valor) || 1)) : valor }
          : it,
      ),
    );
  }

  function verVistaPrevia() {
    setError(null);
    if (!destino.trim()) {
      setError("Falta el destino.");
      return;
    }
    if (carrito.length === 0) {
      setError("Agregá al menos una pieza.");
      return;
    }
    setVistaPrevia(true);
  }

  /** Recién acá se guarda: número, piezas y egresos, y se abre la impresión. */
  function confirmarEImprimir() {
    setError(null);
    startTransition(async () => {
      try {
        const resultado = await generarRemitoAction({
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
        if (!resultado.ok) {
          setError(resultado.error);
          return;
        }
        setConfirmado(true);
        router.push(`/remitos/${resultado.id}?imprimir=1`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo generar el remito.");
      }
    });
  }

  if (vistaPrevia) {
    return (
      <div className="space-y-3">
        <div className="badge-estado badge-pendiente text-sm px-3 py-2 block">
          Vista previa — este remito todavía no se guardó. Se registra (con su número y el egreso de cada pieza) al confirmar la
          impresión.
        </div>
        <HojaRemito
          numero={null}
          fecha={new Date()}
          destino={destino.trim()}
          usuarioNombre={usuarioNombre}
          tecnico={tecnico.trim() || null}
          observacion={observacion.trim() || null}
          items={carrito.map((it) => ({ clave: it.clave, codigo: it.codigo, nombre: it.nombre, tratamiento: it.tratamiento, cantidad: it.cantidad }))}
        />
        {error && <p className="text-sm text-rojo-fg">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={confirmarEImprimir}
            disabled={isPending || confirmado}
            className="bg-accent text-accent-foreground font-medium text-sm px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50"
          >
            {isPending || confirmado ? "Guardando…" : "Confirmar e imprimir"}
          </button>
          <button
            type="button"
            onClick={() => setVistaPrevia(false)}
            disabled={isPending || confirmado}
            className="text-sm text-accent hover:underline disabled:opacity-50"
          >
            ← Volver a editar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tarjeta p-4 space-y-4">
      {paraMandar.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-1">Para mandar ({paraMandar.length})</div>
          <p className="text-xs text-foreground-muted mb-2">Ya terminaron el paso anterior. &ldquo;Mandar antes del&rdquo; es el último día para que vuelvan a tiempo.</p>
          <div className="space-y-3">
            {porOperacion.map(([operacion, piezas]) => {
              const faltan = piezas.filter((p) => !carrito.some((it) => it.clave === p.otPiezaId));
              return (
                <div key={operacion} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-sm">
                      <strong>{operacion}</strong> · {piezas.length} pieza{piezas.length === 1 ? "" : "s"}
                      {sugerencias[operacion]?.proveedor && <span className="text-foreground-muted"> · {sugerencias[operacion]!.proveedor}{sugerencias[operacion]!.plazo ? `, ${sugerencias[operacion]!.plazo} días` : ""}</span>}
                    </span>
                    <button
                      type="button"
                      disabled={faltan.length === 0}
                      onClick={() => {
                        agregarParaMandar(...faltan);
                        // El proveedor se propone solo según el habitual del proceso (se puede cambiar).
                        if (!destino.trim() && sugerencias[operacion]?.proveedor) setDestino(sugerencias[operacion]!.proveedor!);
                      }}
                      className="btn btn-sm disabled:opacity-50"
                    >
                      {faltan.length === 0 ? "Todas en el remito" : `Armar remito con estas (${faltan.length})`}
                    </button>
                  </div>
                  {(sugerencias[operacion]?.proximas ?? 0) > 0 && (
                    <div className="flex items-center gap-2 rounded-md border border-accent-borde bg-accent-soft px-2.5 py-1.5 mb-2 text-xs text-accent-hover">
                      <Icono nombre="idea" className="w-4 h-4 shrink-0" />
                      En los próximos 3 días se suman {sugerencias[operacion]!.proximas} pieza{sugerencias[operacion]!.proximas === 1 ? "" : "s"} más a {operacion}: puede convenir esperar y mandar todo junto.
                    </div>
                  )}
                  <ul className="space-y-1">
                    {piezas.map((p) => {
                      const agregada = carrito.some((it) => it.clave === p.otPiezaId);
                      return (
                        <li key={p.otPiezaId} className="flex items-center gap-2 text-sm bg-surface-muted rounded-md px-2.5 py-1.5">
                          <span className="flex-1 min-w-0 truncate">
                            {p.piezaNombre.charAt(0).toUpperCase() + p.piezaNombre.slice(1)} <span className="font-mono text-xs text-foreground-muted">{p.otPiezaCodigo}</span>
                          </span>
                          <span className="text-xs text-foreground-muted shrink-0">{p.cantidad} u.</span>
                          {p.mandarAntesTexto && <span className={`text-xs shrink-0 ${p.atrasada ? "text-rojo-fg font-semibold" : "text-foreground-muted"}`}>antes del {p.mandarAntesTexto}</span>}
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
            <thead className="text-foreground-muted text-xs">
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
                      max={it.maxCantidad}
                      value={it.cantidad}
                      onChange={(e) => actualizar(it.clave, "cantidad", e.target.value)}
                      className="input text-xs py-1 text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => quitar(it.clave)} className="text-xs text-foreground-muted hover:text-rojo-fg">
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

      {error && <p className="text-sm text-rojo-fg">{error}</p>}

      <button
        type="button"
        onClick={verVistaPrevia}
        className="bg-accent text-accent-foreground font-medium text-sm px-4 py-2 rounded-md hover:opacity-90"
      >
        Vista previa →
      </button>
    </div>
  );
}
