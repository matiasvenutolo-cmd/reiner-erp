/**
 * "Qué hace falta" (simplificación §2): para una orden, ¿qué tengo, qué fabrico
 * y qué compro? Cruza la estructura contra el stock libre y los maestros y ubica
 * cada artículo en uno de cuatro grupos. No reserva ni pide nada: sólo calcula.
 *
 * Reglas (las del documento, más dos aclaraciones marcadas "criterio"):
 * - Stock parcial: si hay 4 libres y hacen falta 6, 4 van a "Ya lo tengo" y 2 al grupo que corresponda.
 * - Comerciales y compradas a medida: "Lo compro" (lo que no cubre el stock).
 * - Con una propuesta de reclasificación sin aprobar: se queda en su tipo actual (como en el plan) con la
 *   marca "Revisar tipo", para que no se pida a Compras algo que el plan fabrica, ni al revés.
 * - Fabricadas: si tienen materia prima cargada, se descuenta del stock de materia prima; si dos piezas usan
 *   el mismo material y no alcanza para todas, todas pasan a "Falta material" con el faltante sumado.
 *   Si el material es de uso general ("se usa de stock"), hay material.
 * - Criterio: una pieza fabricada sin materia prima cargada pero con un paso "Compras" en su hoja de ruta
 *   necesita comprar material (así funcionan hoy las necesidades de compra): va a "Falta material" como
 *   "Material sin especificar". Sin paso "Compras" y sin material cargado: "Lo fabrico — tengo el material"
 *   con la marca "Sin material cargado", para no frenar la orden.
 * - Criterio: la materia prima en stock se identifica por nombre (el material de la pieza igual al artículo
 *   de materia prima, sin importar mayúsculas ni acentos). No hay otro vínculo en los maestros.
 */
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  pieza, piezaConfiguracion, conjunto, operacion, proceso, stockPieza, reservaStock, articuloStock, proveedor, ordenBorrador, otConjunto, otPieza,
} from "@/lib/db/schema";
import type { OrdenBorrador } from "@/lib/db/schema";
import { normalizarBusqueda } from "@/lib/formato";

const DEFAULT = { setupMin: 30, minPorUnidad: 15, plazoCompra: 10, plazoComercial: 20 };

export type Grupo = "compro" | "falta_material" | "fabrico" | "tengo";
export const ORDEN_GRUPOS: Grupo[] = ["compro", "falta_material", "fabrico", "tengo"];
export const TITULO_GRUPO: Record<Grupo, string> = {
  compro: "Lo compro",
  falta_material: "Lo fabrico — falta material",
  fabrico: "Lo fabrico — tengo el material",
  tengo: "Ya lo tengo",
};

export type ItemNecesario = { piezaId: string; necesaria: number; conjuntoId: string | null };

export type Fila = {
  piezaId: string;
  codigo: string;
  nombre: string;
  conjuntoId: string | null;
  conjuntoCodigo: string | null;
  conjuntoNombre: string | null;
  necesaria: number;
  stockLibre: number;
  /** Lo que sale del stock (si se eligió usarlo). */
  usaStock: number;
  /** Lo que se fabrica o se compra. */
  resto: number;
  /** Grupo de `resto` (el de `usaStock` es siempre "tengo"). */
  grupo: Grupo;
  fabricarIgual: boolean;
  marcas: string[];
  /** Material o artículo a comprar. */
  material: { clave: string; nombre: string; cantidad: number | null; unidad: string | null; especificado: boolean } | null;
  proveedor: string | null;
  plazoDias: number | null;
  plazoSupuesto: boolean;
  horas: number;
  /** Clave de la compra (para "no comprar"). */
  claveCompra: string | null;
  comprar: boolean;
  /** Estado al día (sólo en una orden ya confirmada). */
  estadoActual?: string | null;
};

export type MaterialSumado = { clave: string; nombre: string; unidad: string | null; necesario: number; libre: number; faltante: number; piezas: string[]; especificado: boolean };

export type QueHaceFalta = {
  filas: Fila[];
  materiales: MaterialSumado[];
  resumen: { piezas: number; enStock: number; fabricarYa: number; esperanMaterial: number; comprar: number };
  implica: { horasTaller: number; comprasMateriaPrima: number; articulosAComprar: number; compraMasLarga: { nombre: string; dias: number } | null };
  stockActual: Record<string, number>;
};

/** Piezas que necesita un borrador (con la cantidad de máquinas, conjuntos o piezas que se piden). */
export async function itemsDeBorrador(b: Pick<OrdenBorrador, "tipo" | "configuracionId" | "conjuntoId" | "piezaId" | "cantidad" | "excluidas">): Promise<ItemNecesario[]> {
  const k = Math.max(1, b.cantidad);
  if (b.tipo === "pieza" && b.piezaId) {
    const [p] = await db.select({ conjuntoId: pieza.conjuntoId }).from(pieza).where(eq(pieza.id, b.piezaId));
    return [{ piezaId: b.piezaId, necesaria: k, conjuntoId: p?.conjuntoId ?? null }];
  }
  if (!b.configuracionId) return [];
  const filas = await db
    .select({ piezaId: piezaConfiguracion.piezaId, necesaria: piezaConfiguracion.cantidadNecesaria, conjuntoId: pieza.conjuntoId })
    .from(piezaConfiguracion)
    .innerJoin(pieza, eq(pieza.id, piezaConfiguracion.piezaId))
    .where(b.tipo === "conjunto" && b.conjuntoId ? and(eq(piezaConfiguracion.configuracionId, b.configuracionId), eq(pieza.conjuntoId, b.conjuntoId)) : eq(piezaConfiguracion.configuracionId, b.configuracionId));
  const fuera = new Set(b.excluidas ?? []);
  return filas.filter((f) => !fuera.has(f.piezaId)).map((f) => ({ ...f, necesaria: f.necesaria * k }));
}

/** Stock libre de piezas = en almacén − reservado para alguna orden. */
export async function stockLibreDe(piezaIds: string[]): Promise<Map<string, number>> {
  if (!piezaIds.length) return new Map();
  const [st, res] = await Promise.all([
    db.select({ id: stockPieza.piezaId, c: stockPieza.cantidadDisponible }).from(stockPieza).where(inArray(stockPieza.piezaId, piezaIds)),
    db
      .select({ id: reservaStock.piezaId, c: sql<number>`sum(${reservaStock.cantidad})`.mapWith(Number) })
      .from(reservaStock)
      .where(and(inArray(reservaStock.piezaId, piezaIds), gt(reservaStock.cantidad, 0)))
      .groupBy(reservaStock.piezaId),
  ]);
  const r = new Map(res.map((x) => [x.id, x.c]));
  return new Map(piezaIds.map((id) => [id, Math.max(0, (st.find((x) => x.id === id)?.c ?? 0) - (r.get(id) ?? 0))]));
}

/**
 * El cálculo. `cubierto` (opcional): en una orden ya confirmada, cuánto de cada pieza ya está cubierto por
 * stock reservado para ella (en vez de mirar el stock libre de hoy).
 */
export async function calcularQueHaceFalta(
  items: ItemNecesario[],
  decisiones: { fabricarIgual: string[]; noComprar: string[] } = { fabricarIgual: [], noComprar: [] },
  cubierto?: Map<string, number>,
): Promise<QueHaceFalta> {
  // Si una pieza aparece más de una vez (varias máquinas, o en dos conjuntos), se suma.
  const porPieza = new Map<string, ItemNecesario>();
  for (const it of items) {
    const prev = porPieza.get(it.piezaId);
    porPieza.set(it.piezaId, prev ? { ...prev, necesaria: prev.necesaria + it.necesaria } : { ...it });
  }
  const ids = [...porPieza.keys()];
  const vacio: QueHaceFalta = { filas: [], materiales: [], resumen: { piezas: 0, enStock: 0, fabricarYa: 0, esperanMaterial: 0, comprar: 0 }, implica: { horasTaller: 0, comprasMateriaPrima: 0, articulosAComprar: 0, compraMasLarga: null }, stockActual: {} };
  if (!ids.length) return vacio;

  const [piezas, conjuntos, ruta, libres, mp, proveedores] = await Promise.all([
    db.select().from(pieza).where(inArray(pieza.id, ids)),
    db.select({ id: conjunto.id, codigo: conjunto.codigo, nombre: conjunto.nombre }).from(conjunto),
    db
      .select({ piezaId: operacion.piezaId, tipo: proceso.tipo, setup: operacion.setupMin, unidad: operacion.minPorUnidad, ds: proceso.setupMin, du: proceso.minPorUnidad, plazo: proceso.plazoDias })
      .from(operacion)
      .innerJoin(proceso, eq(proceso.id, operacion.procesoId))
      .where(inArray(operacion.piezaId, ids)),
    cubierto ? Promise.resolve(null) : stockLibreDe(ids),
    db.select().from(articuloStock).where(eq(articuloStock.tipo, "materia_prima")),
    db.select({ id: proveedor.id, nombre: proveedor.razonSocial, plazo: proveedor.plazoDias }).from(proveedor),
  ]);
  const infoConj = new Map(conjuntos.map((c) => [c.id, c]));
  const prov = new Map(proveedores.map((p) => [p.id, p]));
  const rutaDe = (id: string) => ruta.filter((r) => r.piezaId === id);
  // Materia prima en stock, por nombre normalizado (criterio: no hay otro vínculo).
  const libreMP = new Map<string, number>();
  for (const a of mp) {
    const disponible = Math.max(0, a.cantidad - a.asignada);
    for (const k of new Set([normalizarBusqueda(a.nombre), normalizarBusqueda(`${a.nombre} ${a.medida ?? ""}`)])) libreMP.set(k, (libreMP.get(k) ?? 0) + disponible);
  }
  const fabricarIgual = new Set(decisiones.fabricarIgual ?? []);
  const noComprar = new Set(decisiones.noComprar ?? []);

  const filas: Fila[] = [];
  for (const p of piezas) {
    const it = porPieza.get(p.id)!;
    const conj = it.conjuntoId ? infoConj.get(it.conjuntoId) : (p.conjuntoId ? infoConj.get(p.conjuntoId) : undefined);
    const libre = cubierto ? (cubierto.get(p.id) ?? 0) : (libres!.get(p.id) ?? 0);
    const igual = fabricarIgual.has(p.id);
    const usaStock = igual ? 0 : Math.min(libre, it.necesaria);
    const resto = it.necesaria - usaStock;
    const pasos = rutaDe(p.id);
    const internos = pasos.filter((x) => x.tipo === "interno");
    const pasoCompras = pasos.find((x) => x.tipo === "compras");
    const marcas: string[] = [];
    const prv = p.proveedorHabitualId ? prov.get(p.proveedorHabitualId) : undefined;
    let grupo: Grupo;
    let material: Fila["material"] = null;
    let plazo: number | null = null;
    let plazoSupuesto = false;
    const esComprada = p.clase === "comercial" || p.clase === "a_medida" || p.tipo === "comprada";
    if (p.claseSugerida && p.claseSugerida !== p.clase) marcas.push("Revisar tipo");
    if (esComprada) {
      grupo = "compro";
      plazo = p.plazoCompraDias ?? prv?.plazo ?? null;
      if (plazo == null) {
        plazo = DEFAULT.plazoComercial;
        plazoSupuesto = true;
      }
      material = { clave: `art:${p.id}`, nombre: p.nombre, cantidad: resto, unidad: "u.", especificado: true };
    } else {
      if (!pasos.length) marcas.push("Sin ruta");
      if (p.material && p.materialCantidad) {
        material = { clave: `mp:${normalizarBusqueda(p.material)}`, nombre: p.material, cantidad: p.materialCantidad * resto, unidad: p.materialUnidad, especificado: true };
        grupo = "fabrico"; // se decide abajo, al sumar por material
      } else if (pasoCompras) {
        material = { clave: `pz:${p.id}`, nombre: `Material para ${p.nombre}`, cantidad: null, unidad: null, especificado: false };
        grupo = "falta_material";
        marcas.push("Material sin especificar");
      } else {
        grupo = "fabrico";
        if (pasos.length) marcas.push("Sin material cargado");
      }
      if (material && !p.materialDeStock) {
        plazo = p.plazoCompraDias ?? prv?.plazo ?? pasoCompras?.plazo ?? null;
        if (plazo == null) {
          plazo = DEFAULT.plazoCompra;
          plazoSupuesto = true;
        }
      }
      if (p.materialDeStock) {
        grupo = "fabrico";
        material = null;
        marcas.push("Material de uso general");
      }
    }
    const horas = resto > 0 ? internos.reduce((s, x) => s + ((x.setup ?? x.ds ?? DEFAULT.setupMin) + (x.unidad ?? x.du ?? DEFAULT.minPorUnidad) * resto) / 60, 0) : 0;
    const claveCompra = grupo === "compro" || grupo === "falta_material" || material ? (material?.clave ?? null) : null;
    filas.push({
      piezaId: p.id, codigo: p.codigo, nombre: p.nombre,
      conjuntoId: conj?.id ?? null, conjuntoCodigo: conj?.codigo ?? null, conjuntoNombre: conj?.nombre ?? null,
      necesaria: it.necesaria, stockLibre: libre, usaStock, resto, grupo, fabricarIgual: igual, marcas, material,
      proveedor: prv?.nombre ?? null, plazoDias: plazo, plazoSupuesto, horas: grupo === "compro" ? 0 : horas,
      claveCompra, comprar: claveCompra ? !noComprar.has(claveCompra) : false,
    });
  }

  // Materia prima sumada por material: si no alcanza para todas las piezas que la usan, todas pasan a "Falta material".
  const porMaterial = new Map<string, Fila[]>();
  for (const f of filas) if (f.grupo !== "compro" && f.material && f.resto > 0) porMaterial.set(f.material.clave, [...(porMaterial.get(f.material.clave) ?? []), f]);
  const materiales: MaterialSumado[] = [];
  for (const [clave, fs] of porMaterial) {
    const m = fs[0].material!;
    const necesario = m.especificado ? fs.reduce((s, f) => s + (f.material!.cantidad ?? 0), 0) : 0;
    const libre = m.especificado ? (libreMP.get(clave.slice(3)) ?? 0) : 0;
    const faltante = m.especificado ? Math.max(0, necesario - libre) : 0;
    const falta = m.especificado ? faltante > 0 : true;
    for (const f of fs) f.grupo = falta ? "falta_material" : "fabrico";
    if (falta) materiales.push({ clave, nombre: m.nombre, unidad: m.unidad, necesario, libre, faltante, piezas: fs.map((f) => f.piezaId), especificado: m.especificado });
  }
  for (const f of filas) if (f.grupo === "fabrico") f.claveCompra = null;
  for (const f of filas) f.comprar = f.claveCompra ? !noComprar.has(f.claveCompra) : false;

  const conResto = filas.filter((f) => f.resto > 0);
  const compras = conResto.filter((f) => f.grupo === "compro" || f.grupo === "falta_material");
  const masLarga = compras.filter((f) => f.plazoDias != null).sort((a, b) => b.plazoDias! - a.plazoDias!)[0];
  return {
    filas: filas.sort((a, b) => (a.conjuntoCodigo ?? "").localeCompare(b.conjuntoCodigo ?? "") || a.codigo.localeCompare(b.codigo)),
    materiales,
    resumen: {
      piezas: filas.length,
      enStock: filas.filter((f) => f.usaStock > 0).length,
      fabricarYa: conResto.filter((f) => f.grupo === "fabrico").length,
      esperanMaterial: conResto.filter((f) => f.grupo === "falta_material").length,
      comprar: conResto.filter((f) => f.grupo === "compro").length,
    },
    implica: {
      horasTaller: conResto.filter((f) => f.grupo !== "compro").reduce((s, f) => s + f.horas, 0),
      comprasMateriaPrima: materiales.length,
      articulosAComprar: conResto.filter((f) => f.grupo === "compro").length,
      compraMasLarga: masLarga ? { nombre: masLarga.material?.nombre ?? masLarga.nombre, dias: masLarga.plazoDias! } : null,
    },
    stockActual: Object.fromEntries(filas.map((f) => [f.piezaId, f.stockLibre])),
  };
}

/** "Qué hace falta" de un borrador, con lo decidido. */
export async function queHaceFaltaDeBorrador(b: OrdenBorrador) {
  const items = await itemsDeBorrador(b);
  return calcularQueHaceFalta(items, b.decisiones);
}

/**
 * "Ver qué hace falta" en una orden ya confirmada (modo consulta): lo cubierto por stock es lo que se
 * reservó para la orden, y cada fila suma su estado al día (terminada, pedido, recibido…).
 */
export async function queHaceFaltaDeOrden(otMaquinaId: string, estados: Map<string, string>) {
  const ops = await db
    .select({ op: otPieza, conjuntoId: otConjunto.conjuntoId })
    .from(otPieza)
    .innerJoin(otConjunto, eq(otConjunto.id, otPieza.otConjuntoId))
    .where(eq(otConjunto.otMaquinaId, otMaquinaId));
  const items: ItemNecesario[] = ops.map((x) => ({ piezaId: x.op.piezaId, necesaria: x.op.cantidadNecesaria, conjuntoId: x.conjuntoId }));
  const cubierto = new Map<string, number>();
  for (const x of ops) cubierto.set(x.op.piezaId, (cubierto.get(x.op.piezaId) ?? 0) + Math.max(0, x.op.cantidadNecesaria - x.op.cantidadAFabricar));
  const r = await calcularQueHaceFalta(items, { fabricarIgual: [], noComprar: [] }, cubierto);
  for (const f of r.filas) f.estadoActual = estados.get(f.piezaId) ?? null;
  return r;
}

export async function getBorrador(id: string): Promise<OrdenBorrador | null> {
  const [b] = await db.select().from(ordenBorrador).where(eq(ordenBorrador.id, id));
  return b ?? null;
}

/** Borradores abiertos (sin confirmar), para listarlos aparte en Órdenes. */
export async function listarBorradores() {
  return db.select().from(ordenBorrador).where(sql`${ordenBorrador.otMaquinaId} is null`).orderBy(sql`${ordenBorrador.updatedAt} desc`);
}

