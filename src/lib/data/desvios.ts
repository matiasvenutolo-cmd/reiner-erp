/**
 * Desvíos (prueba 19/11): una pieza que salió mal en un paso (0 OK, sólo rechazadas) queda trabada ahí y el jefe de
 * planta decide en Gestión. La pieza se necesita sí o sí, así que hay dos caminos:
 * - Reprocesar: se intenta arreglar la misma pieza. El mismo paso vuelve a la cola marcado "Reproceso" y su tiempo
 *   queda medido aparte (los registros del paso posteriores a la decisión). Con 1 OK, la pieza sigue al paso siguiente.
 * - Scrap y rehacer: la pieza se tira. Queda en la orden dada de baja (0 a fabricar, con su historia) y se crea otra
 *   igual en el mismo conjunto, que arranca desde el paso 1 y pide material nuevo.
 * Se usa el mismo bloqueo que "No puedo hacer esta" (motivo "salio_mal"): el plan ya muestra la tarea trabada.
 */
import { and, eq, isNull, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tareaBloqueo, otPieza, otConjunto, pieza, operacion, proceso, colaTarea, planAjuste, necesidadCompraOrden, usuario, registroOperacion } from "@/lib/db/schema";
import { MOTIVO_SALIO_MAL } from "./ejecucion";
import { controlaMateriaPrima } from "./materia-prima";

export const DECISION_REPROCESO = "Reprocesar";
export const DECISION_SCRAP = "Scrap y rehacer";

export type Desvio = { id: string; otPiezaId: string; operacionId: string; texto: string; pieza: string; codigo: string; quien: string; cuando: Date };

/** Los desvíos sin decidir, para el aviso de Gestión. */
export async function getDesviosAbiertos(): Promise<Desvio[]> {
  const filas = await db
    .select({ b: tareaBloqueo, pieza: pieza.nombre, codigo: otPieza.codigo, quien: usuario.nombre })
    .from(tareaBloqueo)
    .innerJoin(otPieza, eq(otPieza.id, tareaBloqueo.otPiezaId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .innerJoin(usuario, eq(usuario.id, tareaBloqueo.usuarioId))
    .where(and(eq(tareaBloqueo.motivo, MOTIVO_SALIO_MAL), isNull(tareaBloqueo.resueltoAt)));
  return filas.map((f) => ({ id: f.b.id, otPiezaId: f.b.otPiezaId, operacionId: f.b.operacionId, texto: f.b.texto ?? "Salió mal", pieza: f.pieza, codigo: f.codigo, quien: f.quien, cuando: f.b.createdAt }));
}

/** Tareas en reproceso ("otPiezaId::operacionId"): se decidió reprocesar y el paso todavía no se terminó bien. */
export async function getClavesEnReproceso(): Promise<Set<string>> {
  const filas = await db
    .select({ otPiezaId: tareaBloqueo.otPiezaId, operacionId: tareaBloqueo.operacionId })
    .from(tareaBloqueo)
    .where(and(eq(tareaBloqueo.motivo, MOTIVO_SALIO_MAL), like(tareaBloqueo.texto, `${DECISION_REPROCESO} ·%`)));
  return new Set(filas.map((f) => `${f.otPiezaId}::${f.operacionId}`));
}

async function abierto(bloqueoId: string) {
  const [b] = await db.select().from(tareaBloqueo).where(and(eq(tareaBloqueo.id, bloqueoId), eq(tareaBloqueo.motivo, MOTIVO_SALIO_MAL), isNull(tareaBloqueo.resueltoAt)));
  if (!b) throw new Error("Ese desvío ya se resolvió.");
  return b;
}

/** Reprocesar: el mismo paso vuelve a estar listo (con el operario que tenía asignado), marcado como reproceso. */
export async function reprocesar(bloqueoId: string, usuarioId: string): Promise<string> {
  const b = await abierto(bloqueoId);
  await db
    .update(tareaBloqueo)
    .set({ resueltoAt: new Date(), resueltoPorId: usuarioId, texto: `${DECISION_REPROCESO} · ${b.texto ?? ""}` })
    .where(eq(tareaBloqueo.id, b.id));
  const [op] = await db.select({ codigo: otPieza.codigo }).from(otPieza).where(eq(otPieza.id, b.otPiezaId));
  return `${op?.codigo ?? "La pieza"} vuelve a la cola para reprocesar.`;
}

/**
 * Scrap y rehacer: la pieza queda dada de baja en la orden y se crea otra igual que arranca desde el paso 1. Si su
 * hoja de ruta empieza con Compras (y se controla la materia prima), pide el material nuevo a Compras.
 */
export async function scrapYRehacer(bloqueoId: string, usuarioId: string): Promise<string> {
  const b = await abierto(bloqueoId);
  const [vieja] = await db
    .select({ op: otPieza, otMaquinaId: otConjunto.otMaquinaId, nombre: pieza.nombre })
    .from(otPieza)
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .innerJoin(pieza, eq(pieza.id, otPieza.piezaId))
    .where(eq(otPieza.id, b.otPiezaId));
  if (!vieja) throw new Error("La pieza ya no existe.");
  const [primero] = await db
    .select({ tipo: proceso.tipo })
    .from(operacion)
    .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
    .where(eq(operacion.piezaId, vieja.op.piezaId))
    .orderBy(operacion.secuencia)
    .limit(1);
  const pideMaterial = primero?.tipo === "compras" && (await controlaMateriaPrima());
  // Código de la nueva: el mismo con -R1, -R2… (puede rehacerse más de una vez).
  const base = vieja.op.codigo.replace(/-R\d+$/, "");
  const previas = await db.select({ codigo: otPieza.codigo }).from(otPieza).where(like(otPieza.codigo, `${base}-R%`));
  const codigo = `${base}-R${previas.length + 1}`;
  const cantidad = vieja.op.cantidadAFabricar;

  await db.transaction(async (tx) => {
    await tx
      .update(tareaBloqueo)
      .set({ resueltoAt: new Date(), resueltoPorId: usuarioId, texto: `${DECISION_SCRAP} · ${b.texto ?? ""} → ${codigo}` })
      .where(eq(tareaBloqueo.id, b.id));
    // La vieja queda con su historia, pero sin nada que fabricar ni tareas en la cola.
    await tx.update(otPieza).set({ cantidadAFabricar: 0, piezasNoOk: vieja.op.piezasNoOk + cantidad, updatedAt: new Date() }).where(eq(otPieza.id, vieja.op.id));
    await tx.delete(colaTarea).where(eq(colaTarea.otPiezaId, vieja.op.id));
    await tx.delete(planAjuste).where(eq(planAjuste.otPiezaId, vieja.op.id));
    const [nueva] = await tx
      .insert(otPieza)
      .values({
        codigo,
        otConjuntoId: vieja.op.otConjuntoId,
        piezaId: vieja.op.piezaId,
        material: vieja.op.material,
        cantidadNecesaria: vieja.op.cantidadNecesaria,
        stockAlGenerar: 0,
        cantidadAFabricar: cantidad,
        estado: "pendiente",
      })
      .returning({ id: otPieza.id });
    if (pideMaterial)
      await tx.insert(necesidadCompraOrden).values({
        otPiezaId: nueva.id,
        otMaquinaId: vieja.otMaquinaId,
        tipo: "material",
        descripcion: `Material para rehacer ${vieja.nombre} (${codigo}) — la anterior (${vieja.op.codigo}) fue a scrap`,
        cantidad,
        omitida: false,
      });
  });
  return `${vieja.op.codigo} fue a scrap. Se rehace como ${codigo}${pideMaterial ? ": pide material nuevo a Compras" : ""}; se manda a producción desde arriba.`;
}

/** Para Indicadores: cuántas piezas se reprocesaron (y cuántas horas llevó) y cuántas fueron a scrap. */
export async function getResumenDesvios(): Promise<{ reprocesos: number; horasReproceso: number; scrap: number }> {
  const decididos = await db
    .select({ otPiezaId: tareaBloqueo.otPiezaId, operacionId: tareaBloqueo.operacionId, texto: tareaBloqueo.texto, resuelto: tareaBloqueo.resueltoAt })
    .from(tareaBloqueo)
    .where(and(eq(tareaBloqueo.motivo, MOTIVO_SALIO_MAL)));
  const reprocesos = decididos.filter((d) => d.texto?.startsWith(`${DECISION_REPROCESO} ·`) && d.resuelto);
  let seg = 0;
  for (const d of reprocesos) {
    const regs = await db
      .select({ inicio: registroOperacion.inicio, dur: registroOperacion.duracionSeg })
      .from(registroOperacion)
      .where(and(eq(registroOperacion.otPiezaId, d.otPiezaId), eq(registroOperacion.operacionId, d.operacionId)));
    // El tiempo del reproceso: lo trabajado en ese paso después de la decisión.
    seg += regs.filter((r) => r.inicio >= d.resuelto!).reduce((n, r) => n + (r.dur ?? 0), 0);
  }
  return { reprocesos: reprocesos.length, horasReproceso: seg / 3600, scrap: decididos.filter((d) => d.texto?.startsWith(`${DECISION_SCRAP} ·`)).length };
}
