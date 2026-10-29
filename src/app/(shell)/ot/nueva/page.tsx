import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { configuracion, conjunto, pieza, piezaConfiguracion, cliente } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { Aviso } from "@/components/ui/Aviso";
import { ConfirmarBoton } from "@/components/ui/ConfirmarBoton";
import { BotonEnviar } from "@/components/ui/BotonEnviar";
import { Paso1, type DatosPaso1 } from "@/components/asistente/Paso1";
import { QueHaceFalta } from "@/components/asistente/QueHaceFalta";
import { getBorrador, queHaceFaltaDeBorrador } from "@/lib/data/que-hace-falta";
import { descartarBorradorAction, stockRevisadoAction, confirmarBorradorAction } from "@/app/actions/borrador";
import { previaConfirmacion } from "@/lib/data/confirmar-orden";
import { capitalizar, fechaCorta, numero, plural } from "@/lib/formato";
import { hoyISO } from "@/lib/fecha";

export const dynamic = "force-dynamic";

const PASOS = ["Qué", "Qué hace falta", "Cuándo"];

function Indicador({ paso, borradorId }: { paso: number; borradorId?: string }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm mt-3" aria-label="Pasos">
      {PASOS.map((l, i) => {
        const n = i + 1;
        const actual = n === paso;
        const puede = borradorId ? n <= 3 : n === 1;
        const contenido = (
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 border ${actual ? "border-accent bg-accent text-accent-foreground font-semibold" : n < paso ? "border-accent text-accent" : "border-border text-foreground-muted"}`}>
            <span className="tabular-nums">{n}</span> {l}
          </span>
        );
        return (
          <li key={l} className="flex items-center gap-2">
            {i > 0 && <span className="text-foreground-muted" aria-hidden>›</span>}
            {puede && !actual && borradorId ? <Link href={`/ot/nueva?borrador=${borradorId}&paso=${n}`}>{contenido}</Link> : contenido}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * "+ Generar orden" como asistente de tres pasos (simplificación §1): 1 Qué ·
 * 2 Qué hace falta · 3 Cuándo. Hasta confirmar, la orden es un borrador: no
 * reserva stock, no genera compras y no entra al plan. Se puede volver atrás
 * sin perder lo cargado.
 */
export default async function GenerarOrdenPage({
  searchParams,
}: {
  searchParams: Promise<{ borrador?: string; paso?: string; error?: string; ver?: string; tipo?: string; destino?: string; pieza?: string; cantidad?: string }>;
}) {
  const sp = await searchParams;
  const borrador = sp.borrador ? await getBorrador(sp.borrador) : null;
  const paso = borrador ? Math.min(3, Math.max(1, Number(sp.paso ?? 2))) : 1;
  const borradorId = borrador && !borrador.otMaquinaId ? borrador.id : undefined;

  const header = (
    <PageHeader
      migas={[{ href: "/proyectos", label: "Órdenes" }, { label: "Generar orden" }]}
      titulo={borrador ? "Orden en borrador" : "Generar orden"}
      acciones={
        <Link href="/ot/nueva/anterior" className="btn-texto btn-sm">
          Usar el formulario anterior
        </Link>
      }
    >
      <Indicador paso={paso} borradorId={borradorId} />
    </PageHeader>
  );

  if (borrador?.otMaquinaId)
    return (
      <div className="space-y-4">
        {header}
        <Aviso tipo="info">
          Este borrador ya se confirmó.{" "}
          <Link href={`/proyectos/${borrador.otMaquinaId}`} className="underline">
            Ver la orden
          </Link>
        </Aviso>
      </div>
    );

  // ── Paso 1 ──
  if (paso === 1) {
    const [configs, conjRows, piezas, piezaCfg, clientes] = await Promise.all([
      db.select().from(configuracion).orderBy(configuracion.codigo),
      db
        .selectDistinct({ cfg: piezaConfiguracion.configuracionId, id: conjunto.id, codigo: conjunto.codigo, nombre: conjunto.nombre })
        .from(piezaConfiguracion)
        .innerJoin(pieza, eq(pieza.id, piezaConfiguracion.piezaId))
        .innerJoin(conjunto, eq(conjunto.id, pieza.conjuntoId))
        .orderBy(asc(conjunto.codigo)),
      db.select({ id: pieza.id, codigo: pieza.codigo, nombre: pieza.nombre }).from(pieza).orderBy(pieza.nombre),
      db
        .select({ cfg: piezaConfiguracion.configuracionId, id: pieza.id, codigo: pieza.codigo, nombre: pieza.nombre, conjunto: conjunto.nombre, conjuntoCodigo: conjunto.codigo })
        .from(piezaConfiguracion)
        .innerJoin(pieza, eq(pieza.id, piezaConfiguracion.piezaId))
        .innerJoin(conjunto, eq(conjunto.id, pieza.conjuntoId))
        .orderBy(asc(conjunto.codigo), asc(pieza.nombre)),
      db.select({ id: cliente.id, nombre: cliente.razonSocial }).from(cliente).orderBy(cliente.razonSocial),
    ]);
    const nombreCfg = new Map(configs.map((c) => [c.id, c.nombre]));
    const piezasPorConfig: Record<string, { id: string; codigo: string; nombre: string; conjunto: string }[]> = {};
    for (const r of piezaCfg) (piezasPorConfig[r.cfg] ??= []).push({ id: r.id, codigo: r.codigo, nombre: r.nombre, conjunto: `${r.conjuntoCodigo} ${r.conjunto}` });
    // Prefill desde "Fabricar para stock" (ficha de stock) o la alerta de mínimo.
    const inicial: DatosPaso1 = borrador
      ? {
          id: borrador.id,
          tipo: borrador.tipo as DatosPaso1["tipo"],
          configuracionId: borrador.configuracionId,
          conjunto: borrador.conjuntoId ? `${borrador.configuracionId}|${borrador.conjuntoId}` : null,
          piezaId: borrador.piezaId,
          cantidad: borrador.cantidad,
          destino: borrador.destino as DatosPaso1["destino"],
          clienteId: borrador.clienteId,
          fechaCliente: borrador.fechaCliente,
          numeroSerie: borrador.numeroSerie,
          ordenCompra: borrador.ordenCompra,
          motivoStock: borrador.motivoStock,
          excluidas: borrador.excluidas ?? [],
        }
      : {
          tipo: sp.pieza ? "pieza" : "maquina",
          piezaId: sp.pieza ?? null,
          cantidad: Number(sp.cantidad) > 0 ? Number(sp.cantidad) : 1,
          destino: sp.destino === "stock" ? "stock" : "cliente",
          excluidas: [],
        };
    return (
      <div className="space-y-4">
        {header}
        {sp.error && <Aviso tipo="error">{sp.error}</Aviso>}
        <Paso1
          inicial={inicial}
          configuraciones={configs.map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre }))}
          conjuntos={conjRows.map((c) => ({ valor: `${c.cfg}|${c.id}`, etiqueta: `${c.codigo} ${c.nombre} — ${nombreCfg.get(c.cfg) ?? c.cfg}` }))}
          piezas={piezas}
          piezasPorConfig={piezasPorConfig}
          clientes={clientes}
        />
      </div>
    );
  }

  // Lo que se cargó en el paso 1, en una línea.
  const [[cfg], [conj], [pz], [cli]] = await Promise.all([
    borrador!.configuracionId ? db.select({ nombre: configuracion.nombre }).from(configuracion).where(eq(configuracion.id, borrador!.configuracionId)) : Promise.resolve([]),
    borrador!.conjuntoId ? db.select({ codigo: conjunto.codigo, nombre: conjunto.nombre }).from(conjunto).where(eq(conjunto.id, borrador!.conjuntoId)) : Promise.resolve([]),
    borrador!.piezaId ? db.select({ codigo: pieza.codigo, nombre: pieza.nombre }).from(pieza).where(eq(pieza.id, borrador!.piezaId)) : Promise.resolve([]),
    borrador!.clienteId ? db.select({ nombre: cliente.razonSocial }).from(cliente).where(eq(cliente.id, borrador!.clienteId)) : Promise.resolve([]),
  ]);
  const que =
    borrador!.tipo === "maquina" ? `Máquina ${cfg?.nombre ?? ""}` : borrador!.tipo === "conjunto" ? `Conjunto ${conj?.codigo ?? ""} ${conj?.nombre ?? ""} · ${cfg?.nombre ?? ""}` : `${capitalizar(pz?.nombre ?? "")} (${pz?.codigo ?? ""})`;
  const resumen = (
    <div className="tarjeta px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="font-semibold">
          {que} × {numero(borrador!.cantidad)}
        </div>
        <div className="text-sm text-foreground-muted">
          {borrador!.destino === "stock" ? `Para stock · ${borrador!.motivoStock ?? ""}` : `Para ${cli?.nombre ?? "el cliente"}`}
          {borrador!.fechaCliente ? ` · el cliente la quiere para el ${fechaCorta(borrador!.fechaCliente)}` : ""}
          {` · borrador del ${fechaCorta(borrador!.createdAt.toISOString().slice(0, 10))}`}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/ot/nueva?borrador=${borrador!.id}&paso=1`} className="btn-secundario btn-sm">
          ← Cambiar lo que se pide
        </Link>
        <form action={descartarBorradorAction}>
          <input type="hidden" name="id" value={borrador!.id} />
          <ConfirmarBoton mensaje="¿Descartar el borrador? No queda nada reservado ni pedido." className="btn-peligro btn-sm">
            Descartar
          </ConfirmarBoton>
        </form>
      </div>
    </div>
  );

  // ── Paso 2 ──
  if (paso === 2) {
    const datos = await queHaceFaltaDeBorrador(borrador!);
    // Si el stock cambió desde la última vez, se avisa y se marcan las piezas.
    const visto = borrador!.stockVisto ?? {};
    const cambiaron = new Set(Object.entries(datos.stockActual).filter(([id, n]) => id in visto && visto[id] !== n).map(([id]) => id));
    const base = `/ot/nueva?borrador=${borrador!.id}&paso=2`;
    return (
      <div className="space-y-4">
        {header}
        {sp.error && <Aviso tipo="error">{sp.error}</Aviso>}
        {resumen}
        {cambiaron.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-naranja-borde bg-naranja-tenue px-4 py-3 text-sm text-naranja-fg">
            <span>
              <strong>El stock cambió desde la última vez:</strong> revisá las piezas marcadas ({cambiaron.size}).
            </span>
            <form action={stockRevisadoAction}>
              <input type="hidden" name="id" value={borrador!.id} />
              <button className="btn-secundario btn-sm">Ya lo revisé</button>
            </form>
          </div>
        )}
        <QueHaceFalta datos={datos} tipo={borrador!.tipo as "maquina" | "conjunto" | "pieza"} borradorId={borrador!.id} ver={sp.ver} base={base} cambiaron={cambiaron} />
        <div className="flex flex-wrap justify-between gap-2">
          <Link href={`/ot/nueva?borrador=${borrador!.id}&paso=1`} className="btn-secundario">
            ← Volver al paso 1
          </Link>
          <Link href={`/ot/nueva?borrador=${borrador!.id}&paso=3`} className="btn">
            Ver cuándo puede estar →
          </Link>
        </div>
      </div>
    );
  }

  // ── Paso 3 — Cuándo (versión simple: la fecha se carga a mano) ──
  const previa = await previaConfirmacion(borrador!);
  const hoy = hoyISO();
  const esMaquina = borrador!.tipo === "maquina";
  const variasMaquinas = esMaquina && borrador!.cantidad > 1;
  const sugerida = borrador!.numeroSerie ?? (esMaquina ? "" : `${(pz?.codigo ?? conj?.codigo ?? "").trim()}-${hoy.slice(8, 10)}${hoy.slice(5, 7)}`);
  const fechaInicial = borrador!.fechaCliente && borrador!.fechaCliente >= hoy ? borrador!.fechaCliente : "";
  const lineas = [
    previa.reservadas > 0 && `Se reservan ${plural(previa.reservadas, "pieza")} del stock para esta orden.`,
    previa.compras > 0 && `${plural(previa.compras, "compra")} pasa${previa.compras === 1 ? "" : "n"} a Compras, con esta orden como origen.`,
    previa.noComprar > 0 && `${plural(previa.noComprar, "compra")} marcada${previa.noComprar === 1 ? "" : "s"} "No comprar": no se pide${previa.noComprar === 1 ? "" : "n"}.`,
    previa.alPlan > 0 && `${plural(previa.alPlan, "pieza")} con material entra${previa.alPlan === 1 ? "" : "n"} al plan.`,
    previa.esperanPlano > 0 && `${plural(previa.esperanPlano, "pieza")} con material espera${previa.esperanPlano === 1 ? "" : "n"} el plano: entra${previa.esperanPlano === 1 ? "" : "n"} al plan cuando ingeniería lo cargue.`,
    previa.manual && "La entrada al plan está en manual (ADMIN): las piezas se pasan desde Entrada al plan.",
    previa.esperanMaterial > 0 && `${plural(previa.esperanMaterial, "pieza")} queda${previa.esperanMaterial === 1 ? "" : "n"} esperando material.`,
  ].filter(Boolean) as string[];
  return (
    <div className="space-y-4">
      {header}
      {sp.error && <Aviso tipo="error">{sp.error}</Aviso>}
      {resumen}
      <form action={confirmarBorradorAction} className="tarjeta p-5 space-y-5 max-w-3xl">
        <input type="hidden" name="id" value={borrador!.id} />
        <h2 className="text-lg font-semibold">Cuándo puede estar</h2>
        <p className="text-sm text-foreground-muted">Por ahora la fecha más temprana posible no se calcula: cargá a mano la fecha que se compromete.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="etiqueta">Fecha de entrega comprometida</span>
            <input type="date" name="fechaEntrega" min={hoy} defaultValue={fechaInicial} required className="input" />
            {borrador!.fechaCliente && <span className="block text-xs text-foreground-muted mt-1">El cliente la quiere para el {fechaCorta(borrador!.fechaCliente, hoy)}.</span>}
          </label>
          <label className="block">
            <span className="etiqueta">Prioridad</span>
            <select name="prioridad" defaultValue="normal" className="input">
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
            </select>
          </label>
          <label className="block">
            <span className="etiqueta">{esMaquina ? "Número de serie" : "Referencia de la orden"}</span>
            <input name="referencia" defaultValue={sugerida} required className="input" />
            <span className="block text-xs text-foreground-muted mt-1">{esMaquina ? "Queda como código de la orden: OTM + número de serie." : "Queda como código de la orden: OTS + referencia."}</span>
          </label>
        </div>
        <div className="rounded-lg border border-border bg-surface-muted px-4 py-3 text-sm space-y-1">
          <div className="font-semibold">Al confirmar, y recién ahí:</div>
          <ul className="list-disc pl-5 space-y-0.5">
            {lineas.map((l) => (
              <li key={l}>{l}</li>
            ))}
            <li>La orden queda activa con la fecha comprometida.</li>
          </ul>
          <div className="text-foreground-muted">Mientras no confirmes, el borrador no reserva ni pide nada.</div>
        </div>
        {variasMaquinas && <Aviso tipo="error">Cada máquina es una orden con su propio número de serie: volvé al paso 1 y dejá cantidad 1.</Aviso>}
        <div className="flex flex-wrap justify-between gap-2">
          <Link href={`/ot/nueva?borrador=${borrador!.id}&paso=2`} className="btn-secundario">
            ← Volver a Qué hace falta
          </Link>
          <BotonEnviar disabled={variasMaquinas} enviando="Confirmando: reservando stock y armando el plan…">
            Confirmar orden
          </BotonEnviar>
        </div>
      </form>
    </div>
  );
}
