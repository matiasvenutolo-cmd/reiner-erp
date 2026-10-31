/**
 * Pieza nueva a medida (reorganización 30/10 §2.4): una pieza que no es de ninguna máquina de REINER (por
 * ejemplo, un repuesto para una máquina de otro fabricante). En un solo formulario se carga la pieza, su hoja
 * de ruta de 1 a 5 pasos y la orden, que se confirma en el mismo momento con el flujo de siempre
 * (`confirmarBorrador`): mismo código OTS…, misma entrada al plan, mismas reglas de plano y material.
 *
 * - La pieza cuelga del conjunto "Piezas a medida", que no está en ninguna máquina: no aparece en las listas de
 *   piezas de las máquinas ni se suma a una orden de máquina. Se vuelve a pedir desde "+ Generar orden" →
 *   Pieza suelta, buscándola por nombre o código.
 * - La orden no tiene máquina (`ot_maquina.configuracion_id` vacío).
 * - El tiempo que se carga es el estimado por unidad, sin setup aparte: es lo que usa el plan hasta que haya
 *   tiempos reales (Indicadores → Tiempos). En un paso tercerizado, el número es el plazo en días hábiles.
 */
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { conjunto, pieza, operacion, proceso, centroTrabajo, cliente, ordenBorrador } from "@/lib/db/schema";
import { confirmarBorrador, type ResultadoConfirmacion } from "./confirmar-orden";
import { hoyISO } from "@/lib/fecha";

export const CONJUNTO_A_MEDIDA = { id: "a-medida", codigo: "AM", nombre: "Piezas a medida", orden: 999 };
export const MAX_PASOS = 5;

export type PasoAMedida = { procesoId: string; centroId: string | null; tiempo: number | null };
export type DatosPiezaAMedida = {
  nombre: string;
  clienteId: string;
  cantidad: number;
  fechaEntrega: string;
  numeroPlano: string | null;
  revision: string | null;
  material: string | null;
  pasos: PasoAMedida[];
};

/** Lo que el formulario necesita para elegir: procesos (sin Compras, que no es un paso de fabricación), centros y clientes. */
export async function opcionesPiezaAMedida() {
  const [procesos, centros, clientes] = await Promise.all([
    db.select({ id: proceso.id, nombre: proceso.nombre, tipo: proceso.tipo, centroId: proceso.centroTrabajoId }).from(proceso).orderBy(proceso.ordenFlujo),
    db.select({ id: centroTrabajo.id, nombre: centroTrabajo.nombre }).from(centroTrabajo).orderBy(centroTrabajo.orden),
    db.select({ id: cliente.id, nombre: cliente.razonSocial }).from(cliente).orderBy(cliente.razonSocial),
  ]);
  return { procesos: procesos.filter((p) => p.tipo !== "compras"), centros, clientes };
}

/** Próximo código libre: AM-001, AM-002… */
async function proximoCodigo(): Promise<string> {
  const usados = await db.select({ codigo: pieza.codigo }).from(pieza).where(like(pieza.codigo, "AM-%"));
  const n = usados.reduce((m, u) => Math.max(m, Number(u.codigo.slice(3)) || 0), 0) + 1;
  return `AM-${String(n).padStart(3, "0")}`;
}

/** Valida todo antes de escribir nada: si algo falta, no queda ni la pieza ni la orden a medias. */
async function validar(d: DatosPiezaAMedida) {
  if (!d.nombre.trim()) throw new Error("Falta el nombre de la pieza.");
  if (!d.clienteId) throw new Error("Elegí el cliente.");
  if (!Number.isInteger(d.cantidad) || d.cantidad < 1) throw new Error("La cantidad tiene que ser 1 o más.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fechaEntrega)) throw new Error("Falta la fecha de entrega.");
  if (d.fechaEntrega < hoyISO()) throw new Error("La fecha de entrega no puede ser anterior a hoy.");
  if (!d.pasos.length) throw new Error("Cargá al menos un paso de la hoja de ruta.");
  if (d.pasos.length > MAX_PASOS) throw new Error(`La hoja de ruta rápida admite hasta ${MAX_PASOS} pasos; el resto se agrega después en la ficha de la pieza.`);
  const [cli] = await db.select({ id: cliente.id }).from(cliente).where(eq(cliente.id, d.clienteId));
  if (!cli) throw new Error("Ese cliente no existe.");
  const procesos = await db.select().from(proceso).where(inArray(proceso.id, d.pasos.map((p) => p.procesoId)));
  const tipoDe = new Map(procesos.map((p) => [p.id, p.tipo]));
  d.pasos.forEach((p, i) => {
    const tipo = tipoDe.get(p.procesoId);
    if (!tipo) throw new Error(`Paso ${i + 1}: elegí el proceso.`);
    if (tipo === "compras") throw new Error(`Paso ${i + 1}: Compras no es un paso de fabricación.`);
    if (p.tiempo != null && (!Number.isFinite(p.tiempo) || p.tiempo < 0)) throw new Error(`Paso ${i + 1}: el tiempo tiene que ser un número positivo.`);
  });
  return tipoDe;
}

export async function crearPiezaAMedida(d: DatosPiezaAMedida, usuario: { id: string; nombre: string }): Promise<ResultadoConfirmacion & { codigo: string }> {
  const tipoDe = await validar(d);
  const codigo = await proximoCodigo();

  const borradorId = await db.transaction(async (tx) => {
    await tx.insert(conjunto).values(CONJUNTO_A_MEDIDA).onConflictDoNothing();
    await tx.insert(pieza).values({
      id: codigo,
      codigo,
      nombre: d.nombre.trim(),
      conjuntoId: CONJUNTO_A_MEDIDA.id,
      material: d.material?.trim() || null,
      numeroPlano: d.numeroPlano?.trim() || null,
      revision: d.revision?.trim() || null,
      tipo: "fabricada",
      clase: "fabricada",
    });
    await tx.insert(operacion).values(
      d.pasos.map((p, i) => {
        const tercerizado = tipoDe.get(p.procesoId) === "tercerizado";
        return {
          id: `${codigo}-op${i + 1}`,
          piezaId: codigo,
          procesoId: p.procesoId,
          secuencia: i + 1,
          centroTrabajoId: tercerizado ? null : p.centroId,
          setupMin: tercerizado || p.tiempo == null ? null : 0,
          minPorUnidad: tercerizado ? null : p.tiempo,
          plazoTercerizadoDias: tercerizado && p.tiempo != null ? Math.round(p.tiempo) : null,
          tiempoOrigen: p.tiempo == null ? null : "estimado",
        };
      }),
    );
    const [b] = await tx
      .insert(ordenBorrador)
      .values({ tipo: "pieza", piezaId: codigo, cantidad: d.cantidad, destino: "cliente", clienteId: d.clienteId, fechaCliente: d.fechaEntrega, usuarioId: usuario.id })
      .returning({ id: ordenBorrador.id });
    return b.id;
  });

  try {
    const r = await confirmarBorrador(borradorId, { fechaEntrega: d.fechaEntrega, prioridad: "normal", referencia: codigo }, usuario);
    return { ...r, codigo };
  } catch (e) {
    // Si la orden no se pudo confirmar, no queda una pieza suelta a medio cargar.
    const [b] = await db.select({ ot: ordenBorrador.otMaquinaId }).from(ordenBorrador).where(eq(ordenBorrador.id, borradorId));
    if (!b?.ot) {
      await db.delete(ordenBorrador).where(eq(ordenBorrador.id, borradorId));
      await db.delete(operacion).where(eq(operacion.piezaId, codigo));
      await db.delete(pieza).where(eq(pieza.id, codigo));
    }
    throw e;
  }
}
