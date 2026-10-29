"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ordenBorrador, pieza } from "@/lib/db/schema";
import { getUsuarioDePlanta } from "@/lib/session";
// Los borradores no tocan el plan: sólo hace falta refrescar las pantallas, sin recalcularlo.
import { revalidatePath } from "next/cache";
import { revalidatePath as invalidarTodo } from "@/lib/revalidar";
import { confirmarBorrador } from "@/lib/data/confirmar-orden";
import { plural } from "@/lib/formato";
import { itemsDeBorrador, stockLibreDe, getBorrador } from "@/lib/data/que-hace-falta";

/**
 * Asistente "+ Generar orden" (simplificación §1). Mientras la orden es un
 * borrador sólo se guarda lo cargado y lo decidido: no se toca stock, compras
 * ni plan. Eso pasa recién al confirmar, en el paso 3.
 */
const t = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function volverConError(id: string | null, paso: number, mensaje: string): never {
  redirect(`/ot/nueva?${id ? `borrador=${id}&` : ""}paso=${paso}&error=${encodeURIComponent(mensaje)}`);
}

/** Paso 1 — Qué hay que hacer. Crea el borrador o lo actualiza, y lleva al paso 2. */
export async function guardarPaso1Action(fd: FormData) {
  const u = await getUsuarioDePlanta();
  const id = t(fd, "id") || null;
  const tipo = t(fd, "tipo");
  const destino = t(fd, "destino") === "stock" ? "stock" : "cliente";
  const cantidad = Math.round(Number(t(fd, "cantidad") || 1));
  let configuracionId = t(fd, "configuracionId") || null;
  let conjuntoId: string | null = null;
  let piezaId: string | null = null;

  if (!["maquina", "conjunto", "pieza"].includes(tipo)) volverConError(id, 1, "Elegí qué tipo de orden es.");
  if (tipo === "conjunto") {
    // El conjunto se elige junto con su máquina: "configuración|conjunto".
    const [cfg, conj] = t(fd, "conjunto").split("|");
    configuracionId = cfg || null;
    conjuntoId = conj || null;
    if (!configuracionId || !conjuntoId) volverConError(id, 1, "Elegí el conjunto.");
  } else if (tipo === "pieza") {
    piezaId = t(fd, "piezaId") || null;
    if (!piezaId) volverConError(id, 1, "Buscá y elegí la pieza.");
    const [p] = await db.select({ id: pieza.id }).from(pieza).where(eq(pieza.id, piezaId!));
    if (!p) volverConError(id, 1, "Esa pieza no existe en los maestros.");
  } else if (!configuracionId) volverConError(id, 1, "Elegí la máquina.");
  if (!Number.isFinite(cantidad) || cantidad < 1) volverConError(id, 1, "La cantidad tiene que ser 1 o más.");
  const clienteId = destino === "cliente" ? t(fd, "clienteId") || null : null;
  if (destino === "cliente" && !clienteId) volverConError(id, 1, "Elegí el cliente, o marcá que es para stock.");

  const datos = {
    tipo,
    configuracionId: tipo === "pieza" ? null : configuracionId,
    conjuntoId,
    piezaId,
    cantidad,
    destino,
    clienteId,
    fechaCliente: destino === "cliente" ? t(fd, "fechaCliente") || null : null,
    numeroSerie: t(fd, "numeroSerie") || null,
    ordenCompra: t(fd, "ordenCompra") || null,
    motivoStock: destino === "stock" ? t(fd, "motivoStock") || "Reposición por mínimo" : null,
    excluidas: tipo === "maquina" ? fd.getAll("quitar").map(String) : [],
    usuarioId: u.id,
    updatedAt: new Date(),
  };
  // Si cambió qué se pide, lo decidido en el paso 2 ya no aplica.
  const anterior = id ? await getBorrador(id) : null;
  const mismaEstructura = anterior && anterior.tipo === datos.tipo && anterior.configuracionId === datos.configuracionId && anterior.conjuntoId === datos.conjuntoId && anterior.piezaId === datos.piezaId;
  const items = await itemsDeBorrador(datos);
  const stock = await stockLibreDe([...new Set(items.map((i) => i.piezaId))]);
  const stockVisto = Object.fromEntries(stock);

  let borradorId = id;
  if (anterior && !anterior.otMaquinaId) {
    await db
      .update(ordenBorrador)
      .set({ ...datos, ...(mismaEstructura ? {} : { decisiones: { fabricarIgual: [], noComprar: [] } }), stockVisto })
      .where(eq(ordenBorrador.id, anterior.id));
  } else {
    const [nuevo] = await db.insert(ordenBorrador).values({ ...datos, stockVisto }).returning({ id: ordenBorrador.id });
    borradorId = nuevo.id;
  }
  revalidatePath("/proyectos");
  revalidatePath("/ot/nueva");
  redirect(`/ot/nueva?borrador=${borradorId}&paso=2`);
}

/** Paso 2 — una decisión: "Usar stock / Fabricar igual" o "Comprar / No comprar". */
export async function decisionBorradorAction(fd: FormData) {
  await getUsuarioDePlanta();
  const id = t(fd, "id");
  const b = await getBorrador(id);
  if (!b || b.otMaquinaId) volverConError(null, 1, "Ese borrador ya no existe.");
  const d = { fabricarIgual: [...(b!.decisiones?.fabricarIgual ?? [])], noComprar: [...(b!.decisiones?.noComprar ?? [])] };
  const alternar = (lista: string[], v: string) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  if (t(fd, "fabricarIgual")) d.fabricarIgual = alternar(d.fabricarIgual, t(fd, "fabricarIgual"));
  if (t(fd, "noComprar")) d.noComprar = alternar(d.noComprar, t(fd, "noComprar"));
  await db.update(ordenBorrador).set({ decisiones: d, updatedAt: new Date() }).where(eq(ordenBorrador.id, id));
  revalidatePath("/ot/nueva");
  redirect(`/ot/nueva?borrador=${id}&paso=2${t(fd, "ver") ? `&ver=${t(fd, "ver")}` : ""}#${t(fd, "ancla") || "grupos"}`);
}

/** "Ya lo revisé": el stock cambió desde la última vez y la persona ya miró las piezas marcadas. */
export async function stockRevisadoAction(fd: FormData) {
  await getUsuarioDePlanta();
  const id = t(fd, "id");
  const b = await getBorrador(id);
  if (!b) volverConError(null, 1, "Ese borrador ya no existe.");
  const items = await itemsDeBorrador(b!);
  const stock = await stockLibreDe([...new Set(items.map((i) => i.piezaId))]);
  await db.update(ordenBorrador).set({ stockVisto: Object.fromEntries(stock) }).where(eq(ordenBorrador.id, id));
  revalidatePath("/ot/nueva");
  redirect(`/ot/nueva?borrador=${id}&paso=2`);
}

/** Descartar un borrador: como nunca reservó ni pidió nada, no queda nada colgado. */
export async function descartarBorradorAction(fd: FormData) {
  await getUsuarioDePlanta();
  const id = t(fd, "id");
  const b = await getBorrador(id);
  if (b && !b.otMaquinaId) await db.delete(ordenBorrador).where(eq(ordenBorrador.id, id));
  revalidatePath("/proyectos");
  redirect(`/proyectos?ok=${encodeURIComponent("Borrador descartado: no quedó nada reservado ni pedido.")}`);
}

/**
 * Paso 3 — "Confirmar orden". Recién acá se reserva stock, se dejan las compras en Compras,
 * entra al plan lo que tiene material y la orden queda activa con su fecha.
 */
export async function confirmarBorradorAction(fd: FormData) {
  const u = await getUsuarioDePlanta();
  const id = t(fd, "id");
  let resultado: Awaited<ReturnType<typeof confirmarBorrador>>;
  try {
    resultado = await confirmarBorrador(id, { fechaEntrega: t(fd, "fechaEntrega"), prioridad: t(fd, "prioridad") === "alta" ? "alta" : "normal", referencia: t(fd, "referencia") }, { id: u.id, nombre: u.nombre });
  } catch (e) {
    volverConError(id, 3, e instanceof Error ? e.message : "No se pudo confirmar la orden.");
  }
  // Esto sí cambia el plan, el stock y Compras: se invalida todo lo que lo mira.
  for (const r of ["/inicio", "/planificacion", "/proyectos", "/llegamos", "/pedir", "/liberacion", "/stock", "/compras", "/ot"]) invalidarTodo(r, "layout");
  const r = resultado!;
  const partes = [
    `${plural(r.reservadas, "pieza")} reservada${r.reservadas === 1 ? "" : "s"} del stock`,
    `${plural(r.compras, "compra")} en Compras`,
    `${plural(r.alPlan, "pieza")} al plan`,
  ];
  if (r.esperanMaterial) partes.push(`${plural(r.esperanMaterial, "pieza")} esperando material`);
  redirect(`/proyectos/${r.otMaquinaId}?ok=${encodeURIComponent(`Orden confirmada: ${partes.join(" · ")}.`)}`);
}
