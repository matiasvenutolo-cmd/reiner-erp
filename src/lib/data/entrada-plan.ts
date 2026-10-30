/**
 * Entrada automática al plan (simplificación §4.3). La liberación por tandas
 * deja de ser un paso manual obligatorio: una pieza entra al plan sola (la
 * misma "Pasar al plan" de siempre, `enviarAProduccion`) cuando
 * - la orden está confirmada (activa o en montaje),
 * - tiene material: su primer paso no es una compra pendiente y no espera el
 *   material que dejó pedido la confirmación desde el asistente,
 * - y tiene plano y revisión, sólo si ADMIN exige plano ("exigir_plano").
 *
 * Se llama cuando algo de eso cambia: al confirmar o activar una orden, al
 * reactivarla, al llegar una compra, al cargar plano o revisión y al cambiar
 * los parámetros. Con "entrada_plan = manual" en ADMIN no hace nada y vuelve la
 * liberación por tandas de siempre.
 */
import { and, eq, gt, inArray, isNotNull, isNull, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otPieza, otConjunto, otMaquina, pieza, parametro, operacion, proceso, registroOperacion, necesidadCompraOrden, pedidoCompra } from "@/lib/db/schema";
import { enviarAProduccion } from "./ot";
import { controlaMateriaPrima } from "./materia-prima";

export async function getModoEntrada(): Promise<{ automatica: boolean; exigirPlano: boolean }> {
  const filas = await db.select().from(parametro).where(inArray(parametro.clave, ["entrada_plan", "exigir_plano"]));
  const v = (k: string) => filas.find((f) => f.clave === k)?.valor;
  return { automatica: (v("entrada_plan") ?? "automatica") !== "manual", exigirPlano: (v("exigir_plano") ?? "si") === "si" };
}

/**
 * Pasa al plan las piezas que ya pueden entrar. `materialVerificado`: las piezas vienen de "Lo fabrico —
 * tengo el material" al confirmar una orden (el material ya se cruzó contra el stock).
 * Devuelve cuántas entraron.
 */
export async function entrarAlPlanSolas(
  filtro: { otMaquinaId?: string; otPiezaIds?: string[]; piezaId?: string },
  usuarioId: string,
  opciones: { materialVerificado?: boolean } = {},
): Promise<number> {
  const modo = await getModoEntrada();
  if (!modo.automatica) return 0;
  if (filtro.otPiezaIds && !filtro.otPiezaIds.length) return 0;

  const condiciones: SQL[] = [isNull(otPieza.enviadaProduccionAt), gt(otPieza.cantidadAFabricar, 0), inArray(otMaquina.estadoProyecto, ["activo", "en_montaje"])];
  if (filtro.otMaquinaId) condiciones.push(eq(otMaquina.id, filtro.otMaquinaId));
  if (filtro.otPiezaIds) condiciones.push(inArray(otPieza.id, filtro.otPiezaIds));
  if (filtro.piezaId) condiciones.push(eq(otPieza.piezaId, filtro.piezaId));
  const candidatas = await db
    .select({ id: otPieza.id, piezaId: otPieza.piezaId, clase: pieza.clase, tipo: pieza.tipo, plano: pieza.numeroPlano, revision: pieza.revision })
    .from(otPieza)
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(otMaquina, eq(otMaquina.id, otConjunto.otMaquinaId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .where(and(...condiciones));
  // Sólo lo que se fabrica: lo que se compra hecho no pasa por el plan del taller.
  let listas = candidatas.filter((c) => (c.clase ?? "fabricada") === "fabricada" && c.tipo === "fabricada");
  if (modo.exigirPlano) listas = listas.filter((c) => c.plano && c.revision);
  if (!listas.length) return 0;

  // Sin control de materia prima (§2.2) el material no frena la entrada al plan.
  if (!opciones.materialVerificado && (await controlaMateriaPrima())) {
    const ids = listas.map((c) => c.id);
    const piezaIds = [...new Set(listas.map((c) => c.piezaId))];
    const [rutas, cerrados, esperan, llegaron, omitidas] = await Promise.all([
      db
        .select({ piezaId: operacion.piezaId, id: operacion.id, secuencia: operacion.secuencia, tipo: proceso.tipo })
        .from(operacion)
        .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
        .where(inArray(operacion.piezaId, piezaIds)),
      db.select({ otPiezaId: registroOperacion.otPiezaId, operacionId: registroOperacion.operacionId }).from(registroOperacion).where(and(inArray(registroOperacion.otPiezaId, ids), isNotNull(registroOperacion.fin))),
      db
        .select({ otPiezaId: necesidadCompraOrden.otPiezaId })
        .from(necesidadCompraOrden)
        .where(and(inArray(necesidadCompraOrden.otPiezaId, ids), eq(necesidadCompraOrden.tipo, "material"), eq(necesidadCompraOrden.omitida, false))),
      db.select({ otPiezaId: pedidoCompra.otPiezaId }).from(pedidoCompra).where(and(inArray(pedidoCompra.otPiezaId, ids), isNotNull(pedidoCompra.recibidoAt))),
      db.select({ otPiezaId: necesidadCompraOrden.otPiezaId }).from(necesidadCompraOrden).where(and(inArray(necesidadCompraOrden.otPiezaId, ids), eq(necesidadCompraOrden.omitida, true))),
    ]);
    const sinCompra = new Set(omitidas.map((x) => x.otPiezaId));
    const llego = new Set(llegaron.map((x) => x.otPiezaId));
    const esperaMaterial = new Set(esperan.map((x) => x.otPiezaId).filter((x) => !llego.has(x)));
    const cerrado = new Set(cerrados.map((x) => `${x.otPiezaId}::${x.operacionId}`));
    listas = listas.filter((c) => {
      if (esperaMaterial.has(c.id)) return false;
      if (sinCompra.has(c.id)) return true; // "No comprar": el material se consigue por otro lado
      const primero = rutas.filter((r) => r.piezaId === c.piezaId).sort((a, b) => a.secuencia - b.secuencia)[0];
      // Primer paso de Compras sin cerrar: el material todavía no llegó.
      return !(primero?.tipo === "compras" && !cerrado.has(`${c.id}::${primero.id}`) && !llego.has(c.id));
    });
  }
  return enviarAProduccion(
    listas.map((c) => c.id),
    usuarioId,
  );
}
