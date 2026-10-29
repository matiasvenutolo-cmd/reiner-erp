import Link from "next/link";
import { Icono } from "@/components/ui/Icono";
import { Etiqueta, type Tono } from "@/components/ui/Etiqueta";
import { capitalizar, horas, numero, plural } from "@/lib/formato";
import { ORDEN_GRUPOS, TITULO_GRUPO, type Fila, type Grupo, type QueHaceFalta as Datos } from "@/lib/data/que-hace-falta";
import { decisionBorradorAction } from "@/app/actions/borrador";

const TONO: Record<Grupo, Tono> = { compro: "naranja", falta_material: "naranja", fabrico: "azul", tengo: "verde" };
const AYUDA: Record<Grupo, string> = {
  compro: "Artículos comerciales y piezas compradas a medida que no alcanzan con el stock.",
  falta_material: "Piezas a fabricar que necesitan comprar materia prima.",
  fabrico: "Piezas a fabricar que ya tienen material: van al plan.",
  tengo: "Hay stock libre suficiente.",
};

/** "4 de stock + 2 a fabricar" */
function queSeHace(f: Fila): string {
  const accion = f.grupo === "compro" ? "a comprar" : "a fabricar";
  if (f.usaStock && f.resto) return `${numero(f.usaStock)} de stock + ${numero(f.resto)} ${accion}`;
  if (f.usaStock) return "sale del stock";
  return f.fabricarIgual ? `fabricar igual (${numero(f.resto)})` : `${numero(f.resto)} ${accion}`;
}

function FilaPieza({ f, grupo, borradorId, ver }: { f: Fila; grupo: Grupo; borradorId?: string; ver?: string }) {
  const compra = grupo === "compro" || grupo === "falta_material";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-sm">
      <div className="flex-1 min-w-52">
        <div className="font-medium">{capitalizar(f.nombre)}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[13px] text-foreground-muted">{f.codigo}</span>
          {f.marcas.map((m) => (
            <Etiqueta key={m} tono={m === "Revisar tipo" ? "estimado" : "gris"} sinIcono>
              {m}
            </Etiqueta>
          ))}
          {f.estadoActual && <Etiqueta tono={f.estadoActual.tono} sinIcono>{f.estadoActual.texto}</Etiqueta>}
        </div>
      </div>
      <div className="text-xs text-foreground-muted tabular-nums w-28">
        hacen falta <strong className="text-foreground">{numero(f.necesaria)}</strong>
        <br />
        en stock {numero(f.stockLibre)}
      </div>
      <div className="w-44 font-medium">{queSeHace(f)}</div>
      {compra && f.material && (
        <div className="text-xs text-foreground-muted w-56">
          {f.material.especificado && f.material.cantidad != null && grupo === "falta_material" ? `${f.material.nombre} · ${numero(f.material.cantidad, 2)} ${f.material.unidad ?? ""}` : grupo === "compro" ? `Comprar ${numero(f.resto)} u.` : "Material sin especificar en la pieza"}
          <br />
          {f.proveedor ?? "sin proveedor habitual"} · {f.plazoDias} días{f.plazoSupuesto ? " (supuesto)" : ""}
        </div>
      )}
      {/* Si se eligió "Fabricar igual" la pieza pasa a otro grupo: el botón la acompaña para poder volver atrás. */}
      {borradorId && (grupo === "tengo" || f.fabricarIgual) && (
        <form action={decisionBorradorAction}>
          <input type="hidden" name="id" value={borradorId} />
          <input type="hidden" name="fabricarIgual" value={f.piezaId} />
          <input type="hidden" name="ancla" value={`grupo-${grupo}`} />
          {ver && <input type="hidden" name="ver" value={ver} />}
          <button className="inline-flex rounded-md border border-border overflow-hidden text-xs" aria-label={f.fabricarIgual ? "Cambiar a usar stock" : "Cambiar a fabricar igual"}>
            <span className={`px-2 py-1 ${!f.fabricarIgual ? "bg-accent text-accent-foreground" : ""}`}>Usar stock</span>
            <span className={`px-2 py-1 ${f.fabricarIgual ? "bg-accent text-accent-foreground" : ""}`}>Fabricar igual</span>
          </button>
        </form>
      )}
      {borradorId && compra && f.claveCompra && (
        <form action={decisionBorradorAction}>
          <input type="hidden" name="id" value={borradorId} />
          <input type="hidden" name="noComprar" value={f.claveCompra} />
          <input type="hidden" name="ancla" value={`grupo-${grupo}`} />
          {ver && <input type="hidden" name="ver" value={ver} />}
          <button className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${f.comprar ? "border-accent bg-accent-soft text-accent-hover" : "border-border text-foreground-muted"}`}>
            <Icono nombre={f.comprar ? "ok" : "cerrar"} className="w-3.5 h-3.5" />
            {f.comprar ? "Comprar" : "No comprar"}
          </button>
        </form>
      )}
    </li>
  );
}

/**
 * Pantalla "Qué hace falta" (simplificación §2): ¿qué tengo, qué fabrico y qué
 * compro? En un borrador se deciden "Usar stock / Fabricar igual" y "Comprar";
 * en una orden confirmada es sólo consulta, con el estado al día.
 */
export function QueHaceFalta({ datos, tipo, borradorId, ver, base, cambiaron }: { datos: Datos; tipo: "maquina" | "conjunto" | "pieza"; borradorId?: string; ver?: string; base: string; cambiaron?: Set<string> }) {
  const { filas, resumen, implica, materiales } = datos;
  const filasDe = (g: Grupo) => filas.filter((f) => (g === "tengo" ? f.usaStock > 0 : f.resto > 0 && f.grupo === g));

  // Pieza suelta: una sola tarjeta (§2, "Para pieza o conjunto suelto").
  if (tipo === "pieza" && filas.length === 1) {
    const f = filas[0];
    const partes = [
      `${capitalizar(f.nombre)} × ${numero(f.necesaria)}`,
      f.stockLibre >= f.necesaria && !f.fabricarIgual ? "Hay en stock" : f.stockLibre > 0 ? `Hay ${numero(f.stockLibre)} en stock` : "No hay en stock",
      f.resto ? (f.grupo === "compro" ? "Hay que comprarla" : "Hay que fabricarla") : null,
      f.resto && f.grupo === "falta_material" ? `Falta material: ${f.material?.especificado ? f.material.nombre : "sin especificar en la pieza"}` : null,
      f.resto && f.grupo === "fabrico" ? "Tiene el material" : null,
    ].filter(Boolean);
    return (
      <div className="tarjeta p-5 space-y-3">
        <div className="text-lg font-semibold">{partes.join(" · ")}</div>
        <div className="flex flex-wrap gap-2 text-sm text-foreground-muted">
          <span className="font-mono">{f.codigo}</span>
          {f.marcas.map((m) => (
            <Etiqueta key={m} tono="gris" sinIcono>
              {m}
            </Etiqueta>
          ))}
          {f.estadoActual && <Etiqueta tono={f.estadoActual.tono} sinIcono>{f.estadoActual.texto}</Etiqueta>}
        </div>
        {f.resto > 0 && f.grupo !== "compro" && <p className="text-sm">{horas(f.horas)} de taller{f.plazoDias && f.grupo === "falta_material" ? ` · el material tarda ${f.plazoDias} días${f.plazoSupuesto ? " (plazo supuesto)" : ""}` : ""}.</p>}
        {f.resto > 0 && f.grupo === "compro" && <p className="text-sm">{f.proveedor ?? "Sin proveedor habitual"} · {f.plazoDias} días{f.plazoSupuesto ? " (plazo supuesto)" : ""}.</p>}
        {borradorId && (
          <ul className="tarjeta divide-y divide-border">
            <FilaPieza f={f} grupo={f.usaStock > 0 ? "tengo" : f.grupo} borradorId={borradorId} />
          </ul>
        )}
      </div>
    );
  }

  const enlaces: [Grupo, number, string][] = [
    ["tengo", resumen.enStock, "en stock"],
    ["fabrico", resumen.fabricarYa, "se pueden fabricar ya"],
    ["falta_material", resumen.esperanMaterial, "esperan material"],
    ["compro", resumen.comprar, "hay que comprarlas"],
  ];
  return (
    <div className="space-y-4">
      <div className="tarjeta p-4 space-y-1.5">
        <p className="text-lg">
          De <strong>{plural(resumen.piezas, "pieza")}</strong>:{" "}
          {enlaces.map(([g, n, l], i) => (
            <span key={g}>
              {i > 0 && " · "}
              <Link href={ver === g ? base : `${base}${base.includes("?") ? "&" : "?"}ver=${g}#grupo-${g}`} className={`hover:underline ${ver === g ? "font-semibold text-accent" : ""}`}>
                <strong>{numero(n)}</strong> {l}
              </Link>
            </span>
          ))}
        </p>
        <p className="text-sm text-foreground-muted">
          {horas(implica.horasTaller)} de taller · {plural(implica.comprasMateriaPrima, "compra")} de materia prima · {plural(implica.articulosAComprar, "artículo")} a comprar
          {implica.compraMasLarga && (
            <>
              {" "}
              · la compra más larga: <strong className="text-foreground">{capitalizar(implica.compraMasLarga.nombre)}</strong>, {implica.compraMasLarga.dias} días
            </>
          )}
        </p>
      </div>

      <div id="grupos" className="space-y-3">
        {ORDEN_GRUPOS.filter((g) => !ver || ver === g).map((g) => {
          const lista = filasDe(g);
          // Los que piden decisión arriba y abiertos; "Lo fabrico" y "Ya lo tengo", cerrados.
          const abierto = !!ver || g === "compro" || g === "falta_material";
          const porConjunto = new Map<string, Fila[]>();
          for (const f of lista) porConjunto.set(f.conjuntoId ?? "", [...(porConjunto.get(f.conjuntoId ?? "") ?? []), f]);
          const agrupar = tipo === "maquina" && porConjunto.size > 1;
          return (
            <details key={g} id={`grupo-${g}`} open={abierto && lista.length > 0} className="tarjeta scroll-mt-24">
              <summary className="flex flex-wrap items-center gap-2 px-4 py-3 cursor-pointer list-none">
                <Icono nombre="derecha" className="w-4 h-4 text-foreground-muted" />
                <span className="font-semibold">{TITULO_GRUPO[g]}</span>
                <Etiqueta tono={lista.length ? TONO[g] : "gris"} sinIcono>
                  {plural(lista.length, "pieza")}
                </Etiqueta>
                <span className="text-sm text-foreground-muted">{AYUDA[g]}</span>
              </summary>
              {lista.length === 0 ? (
                <p className="px-4 pb-3 text-sm text-foreground-muted">Nada en este grupo.</p>
              ) : (
                <div className="border-t border-border">
                  {g === "falta_material" && materiales.some((m) => m.especificado) && (
                    <div className="px-4 py-3 space-y-1.5 bg-naranja-tenue border-b border-border">
                      <div className="text-xs font-semibold text-naranja-fg">Materia prima a comprar, sumada por material</div>
                      {materiales
                        .filter((m) => m.especificado)
                        .map((m) => (
                          <details key={m.clave} className="text-sm">
                            <summary className="cursor-pointer">
                              <strong>{m.nombre}</strong> · {numero(m.faltante, 2)} {m.unidad ?? ""} · para {plural(m.piezas.length, "pieza")}
                              {m.libre > 0 && <span className="text-foreground-muted"> (hay {numero(m.libre, 2)} en stock)</span>}
                            </summary>
                            <ul className="ml-5 text-xs text-foreground-muted">
                              {m.piezas.map((id) => {
                                const f = filas.find((x) => x.piezaId === id);
                                return f ? <li key={id}>{capitalizar(f.nombre)} · {numero(f.material?.cantidad ?? 0, 2)} {f.material?.unidad ?? ""}</li> : null;
                              })}
                            </ul>
                          </details>
                        ))}
                    </div>
                  )}
                  {agrupar ? (
                    [...porConjunto].map(([cid, fs]) => (
                      <details key={cid} className="border-b border-border last:border-b-0" open={!!ver && porConjunto.size <= 3}>
                        <summary className="px-4 py-2 text-sm cursor-pointer list-none flex items-center gap-2 hover:bg-surface-muted/50">
                          <Icono nombre="derecha" className="w-3.5 h-3.5 text-foreground-muted" />
                          <span className="font-medium">
                            {fs[0].conjuntoCodigo} {fs[0].conjuntoNombre}
                          </span>
                          <span className="text-foreground-muted">· {plural(fs.length, "pieza")}</span>
                          {cambiaron && fs.some((f) => cambiaron.has(f.piezaId)) && <Etiqueta tono="naranja" sinIcono>stock cambió</Etiqueta>}
                        </summary>
                        <ul className="divide-y divide-border bg-surface">
                          {fs.map((f) => (
                            <FilaPieza key={f.piezaId} f={f} grupo={g} borradorId={borradorId} ver={ver} />
                          ))}
                        </ul>
                      </details>
                    ))
                  ) : (
                    <ul className="divide-y divide-border">
                      {lista.map((f) => (
                        <FilaPieza key={f.piezaId} f={f} grupo={g} borradorId={borradorId} ver={ver} />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}
