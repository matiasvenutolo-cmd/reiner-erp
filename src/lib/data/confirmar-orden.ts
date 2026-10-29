/**
 * Confirmar una orden desde el asistente (simplificación §1, paso 3, y §2 "Al
 * confirmar la orden"). Recién acá, y sólo acá:
 * - se crea la orden (ot_maquina, sus conjuntos y sus piezas) con los mismos
 *   códigos y campos que la generación de siempre (OTM… máquina, OTS… suelta);
 * - se reserva el stock que se eligió usar (con `reservarStockLibre`, la misma
 *   reserva de siempre: si el stock cambió, reserva lo que haya y el resto se fabrica);
 * - cada compra de "Falta material" y "Lo compro" queda como necesidad en
 *   Compras → Necesidades de producción, con la orden y la pieza de origen (la
 *   toma Compras, como siempre: no se crean solicitudes por fuera del perfil Compras);
 * - lo de "Lo fabrico — tengo el material" entra al plan (la misma "Pasar al plan" de siempre);
 * - la orden queda activa con la fecha comprometida, igual que al activarla desde su detalle.
 *
 * Diferencia con la generación anterior, a propósito: el stock que se reserva es
 * el que se eligió usar en el paso 2 ("Fabricar igual" no reserva), y las piezas
 * destildadas como variantes directamente no se crean.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otMaquina, otConjunto, otPieza, ordenBorrador, piezaConfiguracion, pieza, proyectoEvento, necesidadCompraOrden } from "@/lib/db/schema";
import { getConfiguracion, getConjuntos } from "./maestros";
import { reservarStockLibre } from "./stock";
import { enviarAProduccion } from "./ot";
import { getBorrador, queHaceFaltaDeBorrador } from "./que-hace-falta";
import { hoyISO } from "@/lib/fecha";
import { numero, plural } from "@/lib/formato";

export type ResultadoConfirmacion = { otMaquinaId: string; reservadas: number; compras: number; alPlan: number; esperanMaterial: number };

/** Configuración de la orden: la elegida, o para una pieza suelta la primera máquina cuya lista la incluye. */
async function configuracionDe(b: { tipo: string; configuracionId: string | null; piezaId: string | null }): Promise<string> {
  if (b.configuracionId) return b.configuracionId;
  const [fila] = await db
    .select({ cfg: piezaConfiguracion.configuracionId })
    .from(piezaConfiguracion)
    .where(eq(piezaConfiguracion.piezaId, b.piezaId ?? ""))
    .orderBy(piezaConfiguracion.configuracionId)
    .limit(1);
  if (!fila) throw new Error("Esa pieza no está en la lista de piezas de ninguna máquina: cargala en Piezas y hojas de ruta antes de confirmar.");
  return fila.cfg;
}

export async function confirmarBorrador(
  borradorId: string,
  datos: { fechaEntrega: string; prioridad: "normal" | "alta"; referencia: string },
  usuario: { id: string; nombre: string },
): Promise<ResultadoConfirmacion> {
  const b = await getBorrador(borradorId);
  if (!b) throw new Error("Ese borrador ya no existe.");
  if (b.otMaquinaId) throw new Error("Este borrador ya se confirmó.");
  if (!datos.fechaEntrega) throw new Error("Falta la fecha de entrega comprometida.");
  if (datos.fechaEntrega < hoyISO()) throw new Error("La fecha comprometida no puede ser anterior a hoy.");
  const referencia = datos.referencia.trim();
  if (!referencia) throw new Error(b.tipo === "maquina" ? "Falta el número de serie de la máquina." : "Falta la referencia de la orden.");
  if (b.tipo === "maquina" && b.cantidad > 1) throw new Error("Cada máquina es una orden con su número de serie: volvé al paso 1 y dejá cantidad 1.");

  // Lo que se muestra en el paso 2 es lo que se hace: mismo cálculo, con el stock de este momento.
  const qhf = await queHaceFaltaDeBorrador(b);
  if (!qhf.filas.length) throw new Error("La orden no tiene piezas: revisá el paso 1.");
  const configuracionId = await configuracionDe(b);
  const cfg = await getConfiguracion(configuracionId);
  if (!cfg) throw new Error("Configuración inválida.");

  const esMaquina = b.tipo === "maquina";
  const codigo = `${esMaquina ? "OTM" : "OTS"}${referencia}`;
  const [existente] = await db.select({ id: otMaquina.id }).from(otMaquina).where(eq(otMaquina.codigo, codigo));
  if (existente) throw new Error(esMaquina ? `Ya existe una orden con el número de serie ${referencia} (${codigo}).` : `Ya existe una orden con la referencia "${referencia}" (${codigo}).`);

  const [orden] = await db
    .insert(otMaquina)
    .values({
      codigo,
      tipo: esMaquina ? "maquina" : "suelta",
      alcance: esMaquina ? null : (b.tipo as "conjunto" | "pieza"),
      numeroSerie: referencia,
      configuracionId,
      clienteId: b.destino === "stock" ? null : b.clienteId,
      ordenCompra: b.ordenCompra,
      emitidoPor: usuario.nombre,
      fechaEmision: new Date(),
      estado: "pendiente",
      fechaEntrega: datos.fechaEntrega,
      fechaInicioProyecto: hoyISO(),
      prioridad: datos.prioridad,
      estadoProyecto: "activo",
      destino: b.destino === "stock" ? "stock" : esMaquina ? "maquina" : "repuesto",
      motivoStock: b.destino === "stock" ? b.motivoStock : null,
    })
    .returning({ id: otMaquina.id });

  // El borrador se marca como confirmado antes de reservar nada: un segundo clic no genera otra orden.
  const tomado = await db
    .update(ordenBorrador)
    .set({ otMaquinaId: orden.id, updatedAt: new Date() })
    .where(and(eq(ordenBorrador.id, b.id), isNull(ordenBorrador.otMaquinaId)))
    .returning({ id: ordenBorrador.id });
  if (!tomado.length) {
    await db.delete(otMaquina).where(eq(otMaquina.id, orden.id));
    throw new Error("Este borrador ya se confirmó.");
  }

  // Conjuntos: en una máquina, todos los del modelo más los que tengan piezas (como la generación de siempre).
  const todos = await getConjuntos();
  const idsConjunto = new Set(qhf.filas.map((f) => f.conjuntoId).filter((x): x is string => !!x));
  if (esMaquina) for (const c of await getConjuntos(cfg.modeloId)) idsConjunto.add(c.id);
  const conjuntos = todos.filter((c) => idsConjunto.has(c.id));
  const creados = conjuntos.length
    ? await db
        .insert(otConjunto)
        .values(conjuntos.map((c, i) => ({ codigo: esMaquina ? `${codigo}${c.codigo}` : `${codigo}C${String(i + 1).padStart(2, "0")}`, otMaquinaId: orden.id, conjuntoId: c.id, estado: "pendiente" as const })))
        .returning()
    : [];
  const otcDe = new Map(creados.map((c) => [c.conjuntoId, c]));

  // Reserva: sólo lo que se eligió usar del stock.
  const cobertura = await reservarStockLibre({
    otMaquinaId: orden.id,
    piezas: qhf.filas.filter((f) => f.usaStock > 0).map((f) => ({ piezaId: f.piezaId, necesaria: f.usaStock })),
  });

  const materiales = await db.select({ id: pieza.id, material: pieza.material }).from(pieza).where(inArray(pieza.id, qhf.filas.map((f) => f.piezaId)));
  const materialDe = new Map(materiales.map((m) => [m.id, m.material]));
  const seq = new Map<string, number>();
  const aInsertar: (typeof otPieza.$inferInsert)[] = [];
  const filaDeCodigo = new Map<string, (typeof qhf.filas)[number]>();
  for (const f of qhf.filas) {
    const otc = f.conjuntoId ? otcDe.get(f.conjuntoId) : creados[0];
    if (!otc) continue;
    const cubre = cobertura.get(f.piezaId)?.cubre ?? 0;
    const aFabricar = f.necesaria - cubre;
    if (aFabricar <= 0) continue; // como siempre: sólo hay OT de pieza si queda algo por fabricar o comprar
    const n = (seq.get(otc.id) ?? 0) + 1;
    seq.set(otc.id, n);
    const cod = `${otc.codigo}P${n}`;
    filaDeCodigo.set(cod, f);
    aInsertar.push({ codigo: cod, otConjuntoId: otc.id, piezaId: f.piezaId, material: materialDe.get(f.piezaId) ?? null, cantidadNecesaria: f.necesaria, stockAlGenerar: cubre, cantidadAFabricar: aFabricar, estado: "pendiente" });
  }
  const piezasCreadas = aInsertar.length ? await db.insert(otPieza).values(aInsertar).returning({ id: otPieza.id, codigo: otPieza.codigo, cantidad: otPieza.cantidadAFabricar }) : [];

  // Compras → Necesidades de producción, con la orden y la pieza de origen.
  const materialSumado = new Map(qhf.materiales.map((m) => [m.clave, m]));
  const necesidades: (typeof necesidadCompraOrden.$inferInsert)[] = [];
  const alPlan: string[] = [];
  let esperanMaterial = 0;
  for (const op of piezasCreadas) {
    const f = filaDeCodigo.get(op.codigo)!;
    if (f.grupo === "fabrico") {
      alPlan.push(op.id);
      continue;
    }
    if (f.grupo === "falta_material") esperanMaterial += 1;
    const esMaterial = f.grupo === "falta_material";
    const m = f.material;
    const sumado = m ? materialSumado.get(m.clave) : undefined;
    const descripcion = esMaterial
      ? `Material para fabricar ${f.nombre} (${f.codigo})${m?.especificado ? ` — ${m.nombre}${m.cantidad != null ? `, ${numero(m.cantidad, 2)} ${m.unidad ?? ""}`.trimEnd() : ""}` : " — material sin especificar en la pieza"}`
      : `${f.nombre} (${f.codigo})`;
    const observacion =
      sumado && sumado.especificado && sumado.piezas.length > 1
        ? `El mismo material sirve para ${plural(sumado.piezas.length, "pieza")} de esta orden: hacen falta ${numero(sumado.necesario, 2)} ${sumado.unidad ?? ""} en total, hay ${numero(sumado.libre, 2)} libres, faltan ${numero(sumado.faltante, 2)}.`
        : null;
    necesidades.push({ otPiezaId: op.id, otMaquinaId: orden.id, tipo: esMaterial ? "material" : "articulo", descripcion, cantidad: op.cantidad, observacion, omitida: !f.comprar });
  }
  if (necesidades.length) await db.insert(necesidadCompraOrden).values(necesidades);
  const nAlPlan = await enviarAProduccion(alPlan, usuario.id);

  const reservadas = [...cobertura.values()].filter((c) => c.cubre > 0).length;
  const compras = necesidades.filter((n) => !n.omitida).length;
  const partes = [`entrega ${datos.fechaEntrega}`, `${plural(reservadas, "pieza")} reservada${reservadas === 1 ? "" : "s"} del stock`, `${plural(compras, "compra")} a Compras`, `${plural(nAlPlan, "pieza")} al plan`];
  if (b.excluidas?.length) partes.push(`${plural(b.excluidas.length, "pieza")} destildada${b.excluidas.length === 1 ? "" : "s"} (variantes)`);
  await db.insert(proyectoEvento).values({ otMaquinaId: orden.id, tipo: "activado", texto: `Confirmada desde Generar orden: ${partes.join(" · ")}`, usuarioId: usuario.id });

  return { otMaquinaId: orden.id, reservadas, compras, alPlan: nAlPlan, esperanMaterial };
}

/** Lo que va a pasar al confirmar, para mostrarlo en el paso 3 antes de hacerlo. */
export async function previaConfirmacion(b: NonNullable<Awaited<ReturnType<typeof getBorrador>>>) {
  const qhf = await queHaceFaltaDeBorrador(b);
  const conResto = qhf.filas.filter((f) => f.resto > 0);
  return {
    reservadas: qhf.filas.filter((f) => f.usaStock > 0).length,
    compras: conResto.filter((f) => (f.grupo === "compro" || f.grupo === "falta_material") && f.comprar).length,
    noComprar: conResto.filter((f) => (f.grupo === "compro" || f.grupo === "falta_material") && !f.comprar).length,
    alPlan: conResto.filter((f) => f.grupo === "fabrico").length,
    esperanMaterial: conResto.filter((f) => f.grupo === "falta_material").length,
  };
}
