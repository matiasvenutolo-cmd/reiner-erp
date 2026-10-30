/**
 * Importar desde Excel (reorganización 30/10 §6.2): carga o actualiza piezas y hojas de ruta de una
 * configuración a partir de una planilla con dos hojas, "Piezas" y "Hoja de ruta".
 *
 * 1. Se lee el archivo y se guarda lo leído (tabla `importacion`).
 * 2. Vista previa: cuántas piezas y pasos son nuevos, cuántos se actualizan, errores y avisos, con hoja y fila.
 * 3. Al confirmar se vuelve a validar contra la base y, si no hay errores, se guarda todo junto.
 *
 * Errores que frenan: código de pieza repetido, paso repetido, paso de una pieza que no existe, máquina,
 * proceso o centro desconocido, datos obligatorios vacíos. Avisos que no frenan: pieza fabricada sin hoja de
 * ruta, paso sin tiempo (usa el del proceso), comprada sin proveedor, proveedor o dispositivo que no estaba cargado.
 *
 * Se puede reimportar el mismo archivo corregido: actualiza por código de pieza y nº de paso, sin duplicar.
 * Lo que no viene en el archivo no se toca: un dato vacío no borra lo que ya estaba cargado, y los pasos de la
 * base que no están en el archivo se dejan como estaban (con un aviso). Los tiempos importados quedan con
 * origen "definido" (definido por REINER).
 */
import * as XLSX from "xlsx";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { configuracion, conjunto, conjuntoModelo, pieza, piezaConfiguracion, operacion, proceso, centroTrabajo, dispositivo, proveedor, importacion } from "@/lib/db/schema";
import { normalizarBusqueda } from "@/lib/formato";

// ── Columnas de la plantilla ─────────────────────────────────────────────

const COL_PIEZAS = [
  ["maquina", "Máquina"],
  ["conjuntoCodigo", "Conjunto (código)"],
  ["conjuntoNombre", "Conjunto (nombre)"],
  ["codigo", "Código de pieza"],
  ["nombre", "Nombre"],
  ["cantidad", "Cantidad por máquina"],
  ["tipo", "Tipo"],
  ["plano", "Nº de plano"],
  ["revision", "Revisión"],
  ["material", "Material"],
] as const;

const COL_PASOS = [
  ["codigo", "Código de pieza"],
  ["paso", "Nº de paso"],
  ["proceso", "Proceso"],
  ["centro", "Centro de trabajo"],
  ["detalle", "Detalle"],
  ["dispositivo", "Dispositivo"],
  ["setup", "Setup (min)"],
  ["unidad", "Por unidad (min)"],
  ["proveedor", "Proveedor (si es tercerizado)"],
  ["plazo", "Plazo en días hábiles (si es tercerizado)"],
] as const;

export const HOJA_PIEZAS = "Piezas";
export const HOJA_PASOS = "Hoja de ruta";

/** Plantilla descargable, con un ejemplo cargado en cada hoja. */
export function plantillaExcel(): Buffer {
  const libro = XLSX.utils.book_new();
  const piezas = XLSX.utils.aoa_to_sheet([
    COL_PIEZAS.map(([, t]) => t),
    ["PS 120", "C13", "Caja Reductora", "EJEMPLO-001", "Polea reductor", 1, "Fabricada", "1203", "B", "SAE 1045 Ø80"],
    ["PS 120", "C13", "Caja Reductora", "EJEMPLO-002", "Correa dentada 8M - 20 Motor - Volante", 1, "Comprada", "", "", ""],
  ]);
  const pasos = XLSX.utils.aoa_to_sheet([
    COL_PASOS.map(([, t]) => t),
    ["EJEMPLO-001", 1, "Torno", "Torno CNC", "Desbaste y terminación según plano", "Plato 3 mordazas", 45, 12, "", ""],
    ["EJEMPLO-001", 2, "Chavetero", "", "", "", "", "", "Chaveteros del Sur", 5],
    ["EJEMPLO-001", 3, "Pavonado", "", "", "", "", "", "", 7],
  ]);
  piezas["!cols"] = COL_PIEZAS.map(([, t]) => ({ wch: Math.max(12, t.length + 2) }));
  pasos["!cols"] = COL_PASOS.map(([, t]) => ({ wch: Math.max(12, t.length + 2) }));
  XLSX.utils.book_append_sheet(libro, piezas, HOJA_PIEZAS);
  XLSX.utils.book_append_sheet(libro, pasos, HOJA_PASOS);
  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ── Lectura del archivo ──────────────────────────────────────────────────

type Fila = Record<string, string> & { fila: string };

const norm = (s: unknown) => normalizarBusqueda(String(s ?? "")).replace(/[^a-z0-9]+/g, " ").trim();

function leerHoja(libro: XLSX.WorkBook, nombre: string, columnas: readonly (readonly [string, string])[]): Fila[] | null {
  const hoja = libro.SheetNames.find((n) => norm(n) === norm(nombre));
  if (!hoja) return null;
  const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[hoja], { header: 1, defval: "", raw: false });
  // La fila de títulos es la primera que tiene la columna "Código de pieza".
  const iTitulos = filas.findIndex((f) => f.some((c) => norm(c) === norm("Código de pieza")));
  if (iTitulos < 0) return [];
  const titulos = filas[iTitulos].map(norm);
  const idx = Object.fromEntries(columnas.map(([k, t]) => [k, titulos.findIndex((x) => x === norm(t) || x.startsWith(norm(t)))]));
  const salida: Fila[] = [];
  filas.slice(iTitulos + 1).forEach((f, i) => {
    if (!f.some((c) => String(c).trim() !== "")) return;
    const r: Fila = { fila: String(iTitulos + i + 2) };
    for (const [k] of columnas) r[k] = idx[k] >= 0 ? String(f[idx[k]] ?? "").trim() : "";
    salida.push(r);
  });
  return salida;
}

/** Lee las dos hojas del Excel (sin guardar nada). */
export function leerLibro(contenido: ArrayBuffer): { piezas: Fila[]; pasos: Fila[] } {
  let libro: XLSX.WorkBook;
  try {
    libro = XLSX.read(contenido, { type: "array" });
  } catch {
    throw new Error("No se pudo leer el archivo. Tiene que ser un Excel (.xlsx), como la plantilla.");
  }
  const piezas = leerHoja(libro, HOJA_PIEZAS, COL_PIEZAS);
  const pasos = leerHoja(libro, HOJA_PASOS, COL_PASOS);
  if (!piezas && !pasos) throw new Error(`El archivo no tiene las hojas "${HOJA_PIEZAS}" y "${HOJA_PASOS}". Usá la plantilla.`);
  return { piezas: piezas ?? [], pasos: pasos ?? [] };
}

/** Lee el Excel y guarda lo leído para la vista previa. Devuelve el id de la importación. */
export async function leerArchivo(nombreArchivo: string, contenido: ArrayBuffer, usuarioId: string): Promise<string> {
  const datos = leerLibro(contenido);
  const [nueva] = await db.insert(importacion).values({ archivo: nombreArchivo, datos, usuarioId }).returning({ id: importacion.id });
  return nueva.id;
}

// ── Análisis (vista previa) ──────────────────────────────────────────────

export type Problema = { hoja: string; fila: string; texto: string };

type PiezaPlan = {
  codigo: string;
  nombre: string;
  conjuntoId: string;
  configuracionId: string;
  cantidad: number;
  tipo: "fabricada" | "comprada";
  clase: string;
  plano: string | null;
  revision: string | null;
  material: string | null;
  nueva: boolean;
};
type PasoPlan = {
  id: string;
  piezaId: string;
  secuencia: number;
  procesoId: string;
  centroId: string | null;
  descripcion: string | null;
  dispositivoId: string | null;
  dispositivoNuevo: { id: string; codigo: string; nombre: string } | null;
  setup: number | null;
  unidad: number | null;
  proveedorId: string | null;
  plazo: number | null;
  nuevo: boolean;
};
type ConjuntoNuevo = { id: string; codigo: string; nombre: string; modeloId: string };

export type Analisis = {
  errores: Problema[];
  avisos: Problema[];
  piezasNuevas: number;
  piezasActualizadas: number;
  pasosNuevos: number;
  pasosActualizados: number;
  conjuntosNuevos: string[];
  configuraciones: string[];
  plan: { piezas: PiezaPlan[]; pasos: PasoPlan[]; conjuntos: ConjuntoNuevo[] };
};

const entero = (s: string) => (s === "" ? null : Number(s.replace(",", ".")));
const slug = (s: string) => norm(s).replace(/ /g, "-") || "conjunto";

/** Busca por código o nombre, sin importar mayúsculas ni acentos; si no hay exacto, el único que empiece igual. */
function buscar<T extends { id: string; codigo: string; nombre: string }>(lista: T[], texto: string): T | null | "ambiguo" {
  const q = norm(texto);
  if (!q) return null;
  const exacto = lista.find((x) => norm(x.codigo) === q || norm(x.nombre) === q || norm(x.id) === q);
  if (exacto) return exacto;
  const empiezan = lista.filter((x) => norm(x.nombre).startsWith(q) || norm(x.codigo).startsWith(q.replace(/ /g, "")));
  return empiezan.length === 1 ? empiezan[0] : empiezan.length > 1 ? "ambiguo" : null;
}

export async function analizar(datos: { piezas: Record<string, unknown>[]; pasos: Record<string, unknown>[] }): Promise<Analisis> {
  const errores: Problema[] = [];
  const avisos: Problema[] = [];
  const err = (hoja: string, fila: string, texto: string) => errores.push({ hoja, fila, texto });
  const aviso = (hoja: string, fila: string, texto: string) => avisos.push({ hoja, fila, texto });
  // Las filas de ejemplo de la plantilla (código EJEMPLO-…) no se importan nunca.
  const esEjemplo = (f: Fila) => /^ejemplo-/i.test(f.codigo ?? "");
  const ejemplos = [...(datos.piezas as Fila[]).filter(esEjemplo).map((f) => ({ h: HOJA_PIEZAS, f })), ...(datos.pasos as Fila[]).filter(esEjemplo).map((f) => ({ h: HOJA_PASOS, f }))];
  for (const { h, f } of ejemplos) aviso(h, f.fila, `Fila de ejemplo de la plantilla (${f.codigo}): no se importa.`);
  const filasPiezas = (datos.piezas as Fila[]).filter((f) => !esEjemplo(f));
  const filasPasos = (datos.pasos as Fila[]).filter((f) => !esEjemplo(f));

  const codigos = [...new Set([...filasPiezas.map((f) => f.codigo), ...filasPasos.map((f) => f.codigo)].filter(Boolean))];
  const [configs, conjuntos, procesos, centros, dispositivos, proveedores, piezasBase, pasosBase] = await Promise.all([
    db.select().from(configuracion),
    db.select().from(conjunto),
    db.select().from(proceso),
    db.select().from(centroTrabajo),
    db.select().from(dispositivo),
    db.select({ id: proveedor.id, codigo: proveedor.id, nombre: proveedor.razonSocial }).from(proveedor),
    codigos.length ? db.select().from(pieza).where(inArray(pieza.id, codigos)) : Promise.resolve([]),
    codigos.length ? db.select().from(operacion).where(inArray(operacion.piezaId, codigos)) : Promise.resolve([]),
  ]);
  const configsVisibles = configs.filter((c) => !c.archivada);
  const base = new Map(piezasBase.map((p) => [p.id, p]));

  // Hoja Piezas
  const planPiezas: PiezaPlan[] = [];
  const conjuntosNuevos: ConjuntoNuevo[] = [];
  const vistos = new Map<string, string>();
  for (const f of filasPiezas) {
    const H = HOJA_PIEZAS;
    const faltan = (["maquina", "conjuntoCodigo", "conjuntoNombre", "codigo", "nombre", "cantidad", "tipo"] as const).filter((k) => !f[k]);
    if (faltan.length) {
      err(H, f.fila, `Faltan datos obligatorios: ${faltan.map((k) => COL_PIEZAS.find(([c]) => c === k)![1]).join(", ")}.`);
      continue;
    }
    if (vistos.has(f.codigo)) {
      err(H, f.fila, `El código de pieza ${f.codigo} está repetido (también en la fila ${vistos.get(f.codigo)}).`);
      continue;
    }
    vistos.set(f.codigo, f.fila);
    const cfg = buscar(configsVisibles, f.maquina) ?? buscar(configs, f.maquina);
    if (!cfg || cfg === "ambiguo") {
      err(H, f.fila, cfg === "ambiguo" ? `"${f.maquina}" coincide con más de una máquina: escribí el nombre completo.` : `Máquina desconocida: "${f.maquina}".`);
      continue;
    }
    const cantidad = entero(f.cantidad);
    if (cantidad == null || !Number.isFinite(cantidad) || cantidad <= 0 || !Number.isInteger(cantidad)) {
      err(H, f.fila, `La cantidad por máquina tiene que ser un número entero mayor a cero ("${f.cantidad}").`);
      continue;
    }
    const tipoTxt = norm(f.tipo);
    const tipo = tipoTxt.startsWith("fabric") ? "fabricada" : tipoTxt.startsWith("compr") ? "comprada" : null;
    if (!tipo) {
      err(H, f.fila, `El tipo tiene que ser "Fabricada" o "Comprada" ("${f.tipo}").`);
      continue;
    }
    let conj: { id: string } | undefined = conjuntos.find((c) => norm(c.codigo) === norm(f.conjuntoCodigo)) ?? conjuntosNuevos.find((c) => norm(c.codigo) === norm(f.conjuntoCodigo));
    if (!conj) {
      let id = slug(f.conjuntoNombre);
      if (conjuntos.some((c) => c.id === id) || conjuntosNuevos.some((c) => c.id === id)) id = `${id}-${slug(f.conjuntoCodigo)}`;
      const nuevo = { id, codigo: f.conjuntoCodigo.toUpperCase(), nombre: f.conjuntoNombre, modeloId: cfg.modeloId };
      conjuntosNuevos.push(nuevo);
      conj = nuevo;
      aviso(H, f.fila, `El conjunto ${nuevo.codigo} ${nuevo.nombre} no estaba cargado: se crea.`);
    }
    const anterior = base.get(f.codigo);
    // Comprada: artículo comercial (lo que Compras pide); si ya era "a medida", se respeta.
    const clase = tipo === "fabricada" ? "fabricada" : anterior?.clase === "a_medida" ? "a_medida" : "comercial";
    if (tipo === "comprada" && !anterior?.proveedorHabitualId) aviso(H, f.fila, `${f.codigo}: se compra y no tiene proveedor habitual cargado.`);
    planPiezas.push({
      codigo: f.codigo,
      nombre: f.nombre,
      conjuntoId: conj.id,
      configuracionId: cfg.id,
      cantidad,
      tipo,
      clase,
      plano: f.plano || null,
      revision: f.revision || null,
      material: f.material || null,
      nueva: !anterior,
    });
  }

  // Hoja Hoja de ruta
  const planPasos: PasoPlan[] = [];
  const pasosVistos = new Map<string, string>();
  const dispositivosNuevos = new Map<string, { id: string; codigo: string; nombre: string }>();
  const enArchivo = new Set(planPiezas.map((p) => p.codigo));
  for (const f of filasPasos) {
    const H = HOJA_PASOS;
    const faltan = (["codigo", "paso", "proceso"] as const).filter((k) => !f[k]);
    if (faltan.length) {
      err(H, f.fila, `Faltan datos obligatorios: ${faltan.map((k) => COL_PASOS.find(([c]) => c === k)![1]).join(", ")}.`);
      continue;
    }
    if (!enArchivo.has(f.codigo) && !base.has(f.codigo)) {
      err(H, f.fila, `El paso es de la pieza ${f.codigo}, que no existe: no está en la hoja "${HOJA_PIEZAS}" ni en los maestros.`);
      continue;
    }
    const n = entero(f.paso);
    if (n == null || !Number.isInteger(n) || n <= 0) {
      err(H, f.fila, `El número de paso tiene que ser un entero mayor a cero ("${f.paso}").`);
      continue;
    }
    const clave = `${f.codigo}#${n}`;
    if (pasosVistos.has(clave)) {
      err(H, f.fila, `El paso ${n} de ${f.codigo} está repetido (también en la fila ${pasosVistos.get(clave)}).`);
      continue;
    }
    pasosVistos.set(clave, f.fila);
    const pr = buscar(procesos, f.proceso);
    if (!pr || pr === "ambiguo") {
      err(H, f.fila, pr === "ambiguo" ? `"${f.proceso}" coincide con más de un proceso: escribí el nombre completo.` : `Proceso desconocido: "${f.proceso}".`);
      continue;
    }
    let centroId: string | null = null;
    if (f.centro) {
      const c = buscar(centros, f.centro);
      if (!c || c === "ambiguo") {
        err(H, f.fila, c === "ambiguo" ? `"${f.centro}" coincide con más de un centro: escribí el nombre completo.` : `Centro de trabajo desconocido: "${f.centro}".`);
        continue;
      }
      centroId = c.id;
    }
    const setup = entero(f.setup);
    const unidad = entero(f.unidad);
    const plazo = entero(f.plazo);
    if ([setup, unidad, plazo].some((v) => v != null && (!Number.isFinite(v) || v < 0))) {
      err(H, f.fila, "Setup, por unidad y plazo tienen que ser números (0 o más).");
      continue;
    }
    const existente = pasosBase.find((o) => o.piezaId === f.codigo && o.secuencia === n);
    if (pr.tipo === "interno" && setup == null && unidad == null && existente?.setupMin == null && existente?.minPorUnidad == null)
      aviso(H, f.fila, `${f.codigo} paso ${n} (${pr.nombre}): sin tiempo, usa el del proceso.`);
    let proveedorId: string | null = null;
    if (f.proveedor) {
      const p = buscar(proveedores, f.proveedor);
      if (p && p !== "ambiguo") proveedorId = p.id;
      else aviso(H, f.fila, `Proveedor "${f.proveedor}" no está cargado en Proveedores: el paso queda sin proveedor.`);
    }
    let dispositivoId: string | null = null;
    let dispositivoNuevo: PasoPlan["dispositivoNuevo"] = null;
    if (f.dispositivo) {
      const d = buscar(dispositivos, f.dispositivo);
      if (d && d !== "ambiguo") dispositivoId = d.id;
      else {
        const codigo = slug(f.dispositivo).toUpperCase().slice(0, 40);
        dispositivoNuevo = dispositivosNuevos.get(codigo) ?? { id: `disp-${slug(f.dispositivo)}`, codigo, nombre: f.dispositivo };
        dispositivosNuevos.set(codigo, dispositivoNuevo);
        dispositivoId = dispositivoNuevo.id;
        aviso(H, f.fila, `El dispositivo "${f.dispositivo}" no estaba cargado: se crea.`);
      }
    }
    planPasos.push({
      id: existente?.id ?? `${f.codigo}-op${n}`,
      piezaId: f.codigo,
      secuencia: n,
      procesoId: pr.id,
      centroId,
      descripcion: f.detalle || null,
      dispositivoId,
      dispositivoNuevo,
      setup,
      unidad,
      proveedorId,
      plazo,
      nuevo: !existente,
    });
  }

  // Avisos por pieza: fabricada sin hoja de ruta, pasos de la base que no vinieron en el archivo.
  for (const p of planPiezas) {
    const fila = vistos.get(p.codigo)!;
    const delArchivo = planPasos.filter((x) => x.piezaId === p.codigo);
    const deBase = pasosBase.filter((o) => o.piezaId === p.codigo);
    if (p.tipo === "fabricada" && !delArchivo.length && !deBase.length) aviso(HOJA_PIEZAS, fila, `${p.codigo}: es fabricada y no tiene hoja de ruta.`);
    const sobran = deBase.filter((o) => delArchivo.length && !delArchivo.some((x) => x.secuencia === o.secuencia));
    if (sobran.length) aviso(HOJA_PIEZAS, fila, `${p.codigo}: tiene ${sobran.length} paso(s) cargado(s) que no vienen en el archivo (${sobran.map((o) => o.secuencia).join(", ")}); se dejan como están.`);
  }

  return {
    errores,
    avisos,
    piezasNuevas: planPiezas.filter((p) => p.nueva).length,
    piezasActualizadas: planPiezas.filter((p) => !p.nueva).length,
    pasosNuevos: planPasos.filter((p) => p.nuevo).length,
    pasosActualizados: planPasos.filter((p) => !p.nuevo).length,
    conjuntosNuevos: conjuntosNuevos.map((c) => `${c.codigo} ${c.nombre}`),
    configuraciones: [...new Set(planPiezas.map((p) => configs.find((c) => c.id === p.configuracionId)?.nombre ?? p.configuracionId))],
    plan: { piezas: planPiezas, pasos: planPasos, conjuntos: conjuntosNuevos },
  };
}

export async function getImportacion(id: string) {
  const [i] = await db.select().from(importacion).where(eq(importacion.id, id));
  return i ?? null;
}

// ── Aplicar ──────────────────────────────────────────────────────────────

/** Guarda la importación (todo o nada). Se vuelve a validar contra la base en este momento. */
export async function aplicarImportacion(id: string): Promise<Record<string, number>> {
  const imp = await getImportacion(id);
  if (!imp) throw new Error("Esa importación ya no existe: volvé a subir el archivo.");
  if (imp.aplicadaAt) throw new Error("Esa importación ya se guardó.");
  const a = await analizar(imp.datos);
  if (a.errores.length) throw new Error("El archivo tiene errores: corregilos en el Excel y volvé a subirlo.");
  const { piezas, pasos, conjuntos } = a.plan;

  await db.transaction(async (tx) => {
    for (const c of conjuntos) {
      await tx.insert(conjunto).values({ id: c.id, codigo: c.codigo, nombre: c.nombre }).onConflictDoNothing();
      await tx.insert(conjuntoModelo).values({ conjuntoId: c.id, modeloId: c.modeloId }).onConflictDoNothing();
    }
    for (const p of piezas) {
      // Un dato vacío en el Excel no borra lo que ya estaba cargado.
      const cambios = {
        nombre: p.nombre,
        conjuntoId: p.conjuntoId,
        tipo: p.tipo,
        clase: p.clase,
        ...(p.plano ? { numeroPlano: p.plano } : {}),
        ...(p.revision ? { revision: p.revision } : {}),
        ...(p.material ? { material: p.material } : {}),
      };
      if (p.nueva) await tx.insert(pieza).values({ id: p.codigo, codigo: p.codigo, ...cambios });
      else await tx.update(pieza).set(cambios).where(eq(pieza.id, p.codigo));
      await tx
        .insert(piezaConfiguracion)
        .values({ piezaId: p.codigo, configuracionId: p.configuracionId, cantidadNecesaria: p.cantidad })
        .onConflictDoUpdate({ target: [piezaConfiguracion.piezaId, piezaConfiguracion.configuracionId], set: { cantidadNecesaria: p.cantidad } });
    }
    const nuevosDisp = [...new Map(pasos.filter((x) => x.dispositivoNuevo).map((x) => [x.dispositivoNuevo!.id, x.dispositivoNuevo!])).values()];
    for (const d of nuevosDisp) await tx.insert(dispositivo).values(d).onConflictDoNothing();
    for (const o of pasos) {
      const tiempos = o.setup != null || o.unidad != null;
      const cambios = {
        procesoId: o.procesoId,
        secuencia: o.secuencia,
        ...(o.centroId ? { centroTrabajoId: o.centroId } : {}),
        ...(o.descripcion ? { descripcion: o.descripcion } : {}),
        ...(o.dispositivoId ? { dispositivoId: o.dispositivoId } : {}),
        ...(o.setup != null ? { setupMin: Math.round(o.setup) } : {}),
        ...(o.unidad != null ? { minPorUnidad: o.unidad } : {}),
        ...(tiempos ? { tiempoOrigen: "definido" } : {}),
        ...(o.proveedorId ? { proveedorId: o.proveedorId } : {}),
        ...(o.plazo != null ? { plazoTercerizadoDias: Math.round(o.plazo) } : {}),
      };
      if (o.nuevo) await tx.insert(operacion).values({ id: o.id, piezaId: o.piezaId, ...cambios });
      else await tx.update(operacion).set(cambios).where(and(eq(operacion.id, o.id), eq(operacion.piezaId, o.piezaId)));
    }
    const resultado = { piezasNuevas: a.piezasNuevas, piezasActualizadas: a.piezasActualizadas, pasosNuevos: a.pasosNuevos, pasosActualizados: a.pasosActualizados, conjuntosNuevos: conjuntos.length };
    await tx.update(importacion).set({ aplicadaAt: new Date(), resultado }).where(eq(importacion.id, id));
  });
  return { piezasNuevas: a.piezasNuevas, piezasActualizadas: a.piezasActualizadas, pasosNuevos: a.pasosNuevos, pasosActualizados: a.pasosActualizados, conjuntosNuevos: conjuntos.length };
}
