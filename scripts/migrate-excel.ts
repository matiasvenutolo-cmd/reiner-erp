/**
 * Migra los Excel reales de REINER a fixtures tipadas para el mockup.
 *
 * Fuentes (ver docs/01-analisis.md):
 *  - OT - Mx - OC - BASE GENERAL.xlsm  → hojas "Listas", "Config Piezas",
 *    "Lista de Piezas", "Stock de Piezas" (universo RD)
 *  - CS - 03 - Stock de Piezas.xlsm    → hoja "Stock de Piezas" (WIP por
 *    etapa + stock finalizado, universo RD)
 *
 * Este mismo script es el que va a sembrar Postgres el día que se conecte
 * Neon (ver docs/03-plan-fase-1.md paso 1) — por eso separa "leer y
 * normalizar" de "emitir": emitir a JSON hoy, emitir con INSERTs después.
 *
 * Uso: npx tsx scripts/migrate-excel.ts
 */
import XLSX from "xlsx";
import path from "node:path";
import fs from "node:fs";
import {
  slugify,
  MAPA_PROCESOS,
  NOMBRE_PROCESO,
  ORDEN_FLUJO,
  PROCESOS_EXTERNOS,
  COLUMNAS_STOCK_NO_WIP,
} from "./lib/normalizacion";
import type {
  ModeloFx,
  ConfiguracionFx,
  ConjuntoFx,
  ConjuntoModeloFx,
  ProcesoFx,
  DispositivoFx,
  PiezaFx,
  PiezaConfiguracionFx,
  OperacionFx,
  StockPiezaFx,
  WipPiezaFx,
  MaterialFx,
  ReporteMigracion,
} from "../src/lib/fixtures/types";

const DIR_INSUMOS = "/Users/matiasvenutolo/Downloads/REINER";
const ARCHIVO_OT = "OT - Mx - OC - BASE GENERAL.xlsm";
const ARCHIVO_CS = "CS - 03 - Stock de Piezas.xlsm";
const DIR_SALIDA = path.join(__dirname, "..", "src", "lib", "fixtures", "data");

function sj(wb: XLSX.WorkBook, nombre: string): unknown[][] {
  const hoja = wb.Sheets[nombre];
  if (!hoja) throw new Error(`No se encontró la hoja "${nombre}"`);
  return XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null }) as unknown[][];
}

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const str = String(v).trim();
  return str === "" ? null : str;
}

function n(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function main() {
  const advertencias: string[] = [];
  const conjuntosNoReconciliados = new Set<string>();
  const procesosNoReconocidos = new Set<string>();

  const wbOT = XLSX.readFile(path.join(DIR_INSUMOS, ARCHIVO_OT));
  const wbCS = XLSX.readFile(path.join(DIR_INSUMOS, ARCHIVO_CS));

  // ── 1. Modelos y conjuntos maestros (hoja "Listas") ─────────────────────

  const listas = sj(wbOT, "Listas");
  const modelos: ModeloFx[] = [
    { id: "RD", codigo: "RD", nombre: "RD", descripcion: "Primer modelo propio (2018), diseño estabilizado" },
    { id: "PS", codigo: "PS", nombre: "PS / APS", descripcion: "Segundo modelo (2019-2020), en proceso de estandarización" },
  ];

  const configuraciones: ConfiguracionFx[] = [];
  for (const row of listas.slice(2, 6)) {
    const [, codigo, tipo, variante, instrumentacion] = row as (string | number | null)[];
    if (!codigo) continue;
    configuraciones.push({
      id: slugify(String(codigo)),
      modeloId: String(tipo),
      codigo: String(codigo),
      variante: String(variante),
      instrumentacion: String(instrumentacion).toLowerCase().includes("sin")
        ? "sin_instrumentar"
        : "instrumentada",
      nombre: `${tipo} ${variante} - ${instrumentacion}`,
    });
  }
  // RD no tiene variantes de configuración en los Excel actuales (diseño
  // único y estabilizado). Se crea una configuración placeholder para poder
  // enlazar el BOM (pieza_configuracion) sin forzar un dato que no existe.
  configuraciones.push({
    id: "rd-std",
    modeloId: "RD",
    codigo: "RD-STD",
    variante: "estándar",
    instrumentacion: "instrumentada",
    nombre: "RD - configuración estándar",
  });
  advertencias.push(
    "RD no tiene variantes de configuración en los Excel actuales (a diferencia de PS120/PS124). " +
      "Se creó una configuración placeholder 'RD-STD' para poder enlazar el BOM. Confirmar con Julián " +
      "si existen variantes reales de RD que deban modelarse.",
  );

  // Conjunto maestro: unión de las columnas H (RD) y J (PS) de "Listas",
  // excluyendo los guiones y las filas de encabezado repetido.
  const conjuntoSet = new Map<string, { nombre: string; enRD: boolean; enPS: boolean; orden: number }>();
  let orden = 0;
  for (const row of listas.slice(1)) {
    const h = s((row as unknown[])[7]);
    const j = s((row as unknown[])[9]);
    for (const [valor, esRD] of [
      [h, true],
      [j, false],
    ] as [string | null, boolean][]) {
      if (!valor || valor === "-" || valor.startsWith("Conjunto")) continue;
      const key = slugify(valor);
      if (!conjuntoSet.has(key)) {
        conjuntoSet.set(key, { nombre: valor, enRD: false, enPS: false, orden: orden++ });
      }
      const entry = conjuntoSet.get(key)!;
      if (esRD) entry.enRD = true;
      else entry.enPS = true;
    }
  }

  const conjuntos: ConjuntoFx[] = [];
  const conjuntoModelo: ConjuntoModeloFx[] = [];
  const conjuntoPorNombreCanonico = new Map<string, string>(); // slug(nombre) -> id
  for (const [id, info] of conjuntoSet) {
    conjuntos.push({ id, codigo: `C${String(info.orden + 1).padStart(2, "0")}`, nombre: info.nombre, orden: info.orden });
    conjuntoPorNombreCanonico.set(id, id);
    if (info.enRD) conjuntoModelo.push({ conjuntoId: id, modeloId: "RD" });
    if (info.enPS) conjuntoModelo.push({ conjuntoId: id, modeloId: "PS" });
  }

  function resolverConjunto(nombreLibre: string): string {
    const key = slugify(nombreLibre);
    if (conjuntoPorNombreCanonico.has(key)) return key;
    // No reconciliado con la hoja "Listas": se crea igual (para no perder
    // piezas) pero se registra para que Julián lo confirme.
    conjuntosNoReconciliados.add(nombreLibre);
    if (!conjuntoSet.has(key)) {
      conjuntoSet.set(key, { nombre: nombreLibre, enRD: false, enPS: false, orden: orden++ });
      conjuntos.push({ id: key, codigo: `C${String(orden).padStart(2, "0")}`, nombre: nombreLibre, orden: orden - 1 });
      conjuntoPorNombreCanonico.set(key, key);
    }
    return key;
  }

  // ── 2. Procesos ──────────────────────────────────────────────────────────

  const procesoSet = new Set<string>();
  function resolverProceso(nombreLibre: string): string {
    const limpio = nombreLibre.trim();
    const codigo = MAPA_PROCESOS[limpio] ?? MAPA_PROCESOS[limpio.toLowerCase()];
    if (!codigo) {
      procesosNoReconocidos.add(limpio);
      const fallback = slugify(limpio).toUpperCase().replace(/-/g, "_");
      procesoSet.add(fallback);
      return fallback;
    }
    procesoSet.add(codigo);
    return codigo;
  }
  // Los de CS-03 (columnas de proceso) también entran al set:
  const PROCESOS_CS03 = [
    "FUNDICION",
    "FIERRO",
    "TORNO",
    "CNC",
    "CNC",
    "CORTE_HILO",
    "FRESADO",
    "MECANIZADO",
    "TALLADO",
    "SOLDADURA",
    "TEMPLADO",
    "RECTIFICADO",
    "PULIDO",
    "ANODIZADO",
    "PAVONADO",
    "CROMADO",
    "GRABADO_LASER",
  ];
  PROCESOS_CS03.forEach((p) => procesoSet.add(p));

  // ── 3. Piezas: BOM ("Config Piezas") + routing ("Lista de Piezas") ─────
  //
  // OJO: "Config Piezas" y "Lista de Piezas" no son 100% PS. Aparecen
  // algunas piezas con prefijo RD (ej. RD001108S007) — piezas compartidas
  // entre las dos familias de modelo (hardware/subconjuntos comunes). El
  // modelo de cada pieza se infiere SIEMPRE por el prefijo de su código,
  // nunca por la hoja de origen, y se usa un único mapa para no crear la
  // misma pieza dos veces si aparece en más de una hoja.

  function modeloDeCodigo(cod: string): "RD" | "PS" {
    return /^RD\d/i.test(cod) ? "RD" : "PS";
  }

  const piezas = new Map<string, PiezaFx>();
  function piezaVacia(cod: string, nombre: unknown, conjuntoLibre: unknown): PiezaFx {
    return {
      id: cod,
      codigo: cod,
      nombre: String(nombre ?? cod),
      conjuntoId: resolverConjunto(String(conjuntoLibre)),
      modeloId: modeloDeCodigo(cod),
      material: null,
      revision: null,
      tipo: "fabricada",
      esDeStock: false,
      stockMinimo: 0,
      fotoPathname: null,
    };
  }

  const configPiezas = sj(wbOT, "Config Piezas").slice(3);
  const piezaConfiguracion: PiezaConfiguracionFx[] = [];
  let piezasCompartidasEntreModelos = 0;

  for (const row of configPiezas) {
    const [, conjuntoLibre, codigo, nombre, cant, ps120, ps124] = row as (string | number | null)[];
    if (!codigo) continue;
    const cod = String(codigo);
    if (!piezas.has(cod)) {
      piezas.set(cod, piezaVacia(cod, nombre, conjuntoLibre));
    }
    if (modeloDeCodigo(cod) === "RD") piezasCompartidasEntreModelos++;
    const cantidad = n(cant) || 1;
    // El Excel sólo distingue diámetro (120/124), no instrumentación.
    // Se aplica la misma cantidad a ambas variantes de instrumentación de
    // ese diámetro — asunción documentada, ver reporte de migración.
    if (String(ps120).toLowerCase() === "si") {
      piezaConfiguracion.push({ piezaId: cod, configuracionId: "ps120i", cantidadNecesaria: cantidad });
      piezaConfiguracion.push({ piezaId: cod, configuracionId: "ps120s", cantidadNecesaria: cantidad });
    }
    if (String(ps124).toLowerCase() === "si") {
      piezaConfiguracion.push({ piezaId: cod, configuracionId: "ps124i", cantidadNecesaria: cantidad });
      piezaConfiguracion.push({ piezaId: cod, configuracionId: "ps124s", cantidadNecesaria: cantidad });
    }
  }
  advertencias.push(
    "'Config Piezas' sólo distingue diámetro (PS120/PS124), no instrumentación. Se asumió que la " +
      "instrumentación no cambia el BOM general y se replicó la cantidad a ambas variantes de cada " +
      "diámetro. Pendiente confirmar con Julián si hay piezas específicas de sensórica que sólo van " +
      "en la variante instrumentada.",
  );
  if (piezasCompartidasEntreModelos > 0) {
    advertencias.push(
      `'Config Piezas' tiene ${piezasCompartidasEntreModelos} piezas con código RD dentro del BOM de PS ` +
        "(hardware/subconjuntos compartidos entre familias de modelo). Se migraron como piezas RD que " +
        "también aparecen en pieza_configuracion de PS, en vez de duplicarlas — confirmar con Julián si " +
        "es la lectura correcta.",
    );
  }

  const listaPiezas = sj(wbOT, "Lista de Piezas").slice(1);
  const dispositivosMap = new Map<string, DispositivoFx>();
  const operaciones: OperacionFx[] = [];
  const secuenciaPorPieza = new Map<string, number>();
  const piezasEnListaSinConfig: string[] = [];
  let opsAsumidos = 0;

  for (const row of listaPiezas) {
    const [, conjuntoLibre, codigo, nombre, procesoLibre, ops, dispLibre] = row as (string | number | null)[];
    if (!codigo) continue;
    const cod = String(codigo);
    if (!piezas.has(cod)) {
      piezasEnListaSinConfig.push(cod);
      piezas.set(cod, piezaVacia(cod, nombre, conjuntoLibre));
    }
    if (!procesoLibre) continue;
    const procesoId = resolverProceso(String(procesoLibre));
    let dispositivoId: string | null = null;
    const dispTexto = s(dispLibre);
    if (dispTexto && dispTexto !== "-" && Number.isNaN(Number(dispTexto))) {
      const dId = slugify(dispTexto);
      if (!dispositivosMap.has(dId)) {
        dispositivosMap.set(dId, { id: dId, codigo: dId.toUpperCase(), nombre: dispTexto });
      }
      dispositivoId = dId;
    }
    const seq = (secuenciaPorPieza.get(cod) ?? 0) + 1;
    secuenciaPorPieza.set(cod, seq);
    const opsVal = ops === null || ops === undefined ? null : n(ops);
    if (opsVal === null) opsAsumidos++;
    operaciones.push({
      id: `${cod}-op${seq}`,
      piezaId: cod,
      procesoId,
      secuencia: seq,
      ops: opsVal ?? 1, // se asume 1 cuando falta, ver advertencia
      dispositivoId,
    });
  }
  if (opsAsumidos > 0) {
    advertencias.push(
      `La columna "OPS" de 'Lista de Piezas' venía vacía en ${opsAsumidos} filas; se asumió 1 operación ` +
        "en esos casos. Confirmar con Julián si el vacío significa 1 o 'no medido todavía'.",
    );
  }

  const piezasEnConfigSinLista = [...piezas.keys()].filter(
    (cod) => modeloDeCodigo(cod) === "PS" && !operaciones.some((op) => op.piezaId === cod),
  );

  // ── 4. RD: stock + WIP por etapa (CS-03) + cantidad necesaria (OT wb) ──

  const stockOT = sj(wbOT, "Stock de Piezas").slice(2);
  const cantNecesariaRD = new Map<string, number>();
  for (const row of stockOT) {
    const [, codigo, , cant] = row as (string | number | null)[];
    if (!codigo) continue;
    cantNecesariaRD.set(String(codigo), n(cant) || 1);
  }

  // OJO: esta hoja NO es exclusivamente RD. La gran mayoría de las filas son
  // RD, pero al final aparecen piezas PS (ej. PS17CE100s011, conjunto
  // "Cerramiento") — evidencia de que el seguimiento de stock/WIP para PS
  // recién empezó y quedó mezclado en el mismo archivo. Se fusiona contra
  // el mismo mapa unificado de piezas, en vez de descartar esas filas o
  // crear un duplicado con el mismo código.
  const stockCS = sj(wbCS, "Stock de Piezas");
  const headerProcesos = stockCS[1] as (string | null)[];
  const stockPieza: StockPiezaFx[] = [];
  const wipPieza: WipPiezaFx = [];
  const materiales: MaterialFx[] = [];
  const materialesSet = new Set<string>();
  const piezasNuevasDesdeStock: string[] = [];

  for (const row of stockCS.slice(3)) {
    const arr = row as (string | number | null)[];
    const [conjuntoLibre, codigo, nombre] = arr;
    if (!codigo) continue;
    const cod = String(codigo);
    const esPieza = /^(RD|PS)\d/i.test(cod);

    if (!esPieza) {
      // Hardware / consumible sin codificación jerárquica (tornillería,
      // normas DIN, etc.) — se registra como material, no como pieza.
      const matId = slugify(cod);
      if (!materialesSet.has(matId)) {
        materialesSet.add(matId);
        materiales.push({ id: matId, nombre: cod });
      }
      continue;
    }

    if (!piezas.has(cod)) {
      // Pieza que tiene stock/WIP registrado pero no aparece en "Config
      // Piezas" ni en "Lista de Piezas". Se crea igual para no perder el
      // dato de stock, y se marca para el reporte.
      const pieza = piezaVacia(cod, nombre, conjuntoLibre);
      pieza.revision = s(arr[22]);
      piezas.set(cod, pieza);
      piezasNuevasDesdeStock.push(cod);
    } else {
      const existente = piezas.get(cod)!;
      if (!existente.revision) existente.revision = s(arr[22]);
    }

    const stockFinal = n(arr[21]);
    stockPieza.push({ piezaId: cod, cantidadDisponible: stockFinal });

    for (let c = 3; c <= 20; c++) {
      const val = arr[c];
      const nombreCol = headerProcesos[c];
      if (val === null || val === undefined || !nombreCol) continue;
      if (COLUMNAS_STOCK_NO_WIP.has(String(nombreCol))) continue; // "Finalizado" ya es stockPieza
      const procesoId = resolverProceso(String(nombreCol));
      wipPieza.push({ piezaId: cod, procesoId, cantidad: n(val) });
    }
  }

  // pieza_configuracion para RD (única configuración placeholder). Sólo
  // las piezas RD que no tengan ya un link explícito (las compartidas con
  // PS, resueltas en la sección anterior, no deberían duplicarse acá).
  const piezasRD = [...piezas.values()].filter((p) => p.modeloId === "RD");
  for (const p of piezasRD) {
    piezaConfiguracion.push({
      piezaId: p.id,
      configuracionId: "rd-std",
      cantidadNecesaria: cantNecesariaRD.get(p.id) ?? 1,
    });
  }

  const piezasRDConRouting = piezasRD.filter((p) => operaciones.some((op) => op.piezaId === p.id));
  advertencias.push(
    `RD no tiene una hoja de routing equivalente a "Lista de Piezas": de las ${piezasRD.length} piezas RD, ` +
      `sólo ${piezasRDConRouting.length} tienen operaciones definidas (las compartidas con el BOM de PS). ` +
      "El resto quedó migrado como maestro + stock/WIP, pero SIN routing. Es un insumo pendiente real " +
      "(coincide con el insumo #1 del PDF de la reunión, incompleto para RD).",
  );
  if (piezasNuevasDesdeStock.length) {
    advertencias.push(
      `La hoja "Stock de Piezas" de CS-03 aportó ${piezasNuevasDesdeStock.length} piezas que no estaban ` +
        "en ninguna otra hoja (ni Config Piezas, ni Lista de Piezas, ni Stock de Piezas del otro archivo), " +
        `ej. ${piezasNuevasDesdeStock.slice(0, 3).join(", ")}. Se crearon igual, sin BOM ni routing ` +
        "asociado, para no perder el dato de stock.",
    );
  }
  advertencias.push(
    "'CENTRO CNC' y 'TORNO CNC' (columnas de CS-03) se trataron como el mismo proceso canónico que " +
      "'CNC' y 'Torno' de la hoja de routing de PS, respectivamente. Confirmar con Julián si en la " +
      "práctica son máquinas/etapas distintas que deban separarse.",
  );

  // ── 5. Ensamblar procesos finales, piezas, dispositivos ────────────────

  const procesos: ProcesoFx[] = [...procesoSet].map((codigo) => ({
    id: codigo,
    codigo,
    nombre: NOMBRE_PROCESO[codigo] ?? codigo,
    ordenFlujo: ORDEN_FLUJO[codigo] ?? 999,
    esExterno: PROCESOS_EXTERNOS.has(codigo),
  }));
  procesos.sort((a, b) => a.ordenFlujo - b.ordenFlujo);

  const piezasFinal: PiezaFx[] = [...piezas.values()];
  const dispositivos: DispositivoFx[] = [...dispositivosMap.values()];

  // ── 6. Escribir fixtures ────────────────────────────────────────────────

  fs.mkdirSync(DIR_SALIDA, { recursive: true });
  function escribir(nombre: string, data: unknown) {
    fs.writeFileSync(path.join(DIR_SALIDA, `${nombre}.json`), JSON.stringify(data, null, 2) + "\n");
  }
  escribir("modelos", modelos);
  escribir("configuraciones", configuraciones);
  escribir("conjuntos", conjuntos);
  escribir("conjunto-modelo", conjuntoModelo);
  escribir("procesos", procesos);
  escribir("dispositivos", dispositivos);
  escribir("piezas", piezasFinal);
  escribir("pieza-configuracion", piezaConfiguracion);
  escribir("operaciones", operaciones);
  escribir("stock-pieza", stockPieza);
  escribir("wip-pieza", wipPieza);
  escribir("materiales", materiales);

  const reporte: ReporteMigracion = {
    generadoEn: new Date().toISOString(),
    fuentes: [ARCHIVO_OT, ARCHIVO_CS],
    resumen: {
      modelos: modelos.length,
      configuraciones: configuraciones.length,
      conjuntos: conjuntos.length,
      procesos: procesos.length,
      dispositivos: dispositivos.length,
      "piezas (total)": piezasFinal.length,
      "piezas PS": piezasFinal.filter((p) => p.modeloId === "PS").length,
      "piezas RD": piezasRD.length,
      "pieza_configuracion": piezaConfiguracion.length,
      "operaciones (routing, todas)": operaciones.length,
      "stock_pieza (filas)": stockPieza.length,
      "wip_pieza (filas)": wipPieza.length,
      "materiales (hardware/consumibles)": materiales.length,
    },
    conjuntosNoReconciliados: [...conjuntosNoReconciliados],
    procesosNoReconocidos: [...procesosNoReconocidos],
    piezasSinRouting: {
      total: piezasRD.length - piezasRDConRouting.length,
      ejemplo: piezasRD.filter((p) => !piezasRDConRouting.includes(p)).slice(0, 5).map((p) => p.id),
    },
    piezasEnListaSinConfig,
    piezasEnConfigSinLista,
    advertencias,
  };
  escribir("_reporte-migracion", reporte);

  // ── 7. Reporte legible para humanos ────────────────────────────────────

  const md = generarReporteMarkdown(reporte);
  fs.writeFileSync(path.join(__dirname, "..", "docs", "migracion-datos.md"), md);

  console.log("Migración completa. Resumen:");
  console.table(reporte.resumen);
  if (conjuntosNoReconciliados.size || procesosNoReconocidos.size) {
    console.log(
      `⚠️  ${conjuntosNoReconciliados.size} conjuntos y ${procesosNoReconocidos.size} procesos no reconciliados. ` +
        "Ver docs/migracion-datos.md",
    );
  }
  console.log(`Fixtures en ${path.relative(process.cwd(), DIR_SALIDA)}/`);
  console.log("Reporte en docs/migracion-datos.md");
}

function generarReporteMarkdown(r: ReporteMigracion): string {
  const lineas: string[] = [];
  lineas.push("# Reporte de migración de datos — Excel → fixtures\n");
  lineas.push(`> Generado automáticamente por \`scripts/migrate-excel.ts\` el ${r.generadoEn}.`);
  lineas.push(`> Fuentes: ${r.fuentes.map((f) => `\`${f}\``).join(", ")}.\n`);
  lineas.push("Este documento se regenera en cada corrida del script. No editar a mano.\n");

  lineas.push("## Resumen\n");
  lineas.push("| Entidad | Cantidad |");
  lineas.push("|---|---|");
  for (const [k, v] of Object.entries(r.resumen)) lineas.push(`| ${k} | ${v} |`);
  lineas.push("");

  lineas.push("## Advertencias y asunciones (para validar con Julián)\n");
  r.advertencias.forEach((a, i) => lineas.push(`${i + 1}. ${a}\n`));

  if (r.conjuntosNoReconciliados.length) {
    lineas.push("## Conjuntos no reconciliados contra la hoja \"Listas\"\n");
    lineas.push(
      "Estos nombres de conjunto aparecen en los datos de piezas pero no coinciden (ni por " +
        "mayúsculas/acentos) con ningún conjunto de la hoja \"Listas\". Se crearon igual como " +
        "conjuntos propios para no perder piezas, pero hay que confirmar si son sinónimos de uno " +
        "existente o son conjuntos nuevos:\n",
    );
    r.conjuntosNoReconciliados.forEach((c) => lineas.push(`- \`${c}\``));
    lineas.push("");
  }

  if (r.procesosNoReconocidos.length) {
    lineas.push("## Procesos no reconocidos (fuera del mapa de normalización)\n");
    r.procesosNoReconocidos.forEach((p) => lineas.push(`- \`${p}\``));
    lineas.push("");
  }

  lineas.push("## Piezas presentes en 'Lista de Piezas' pero ausentes de 'Config Piezas'\n");
  lineas.push(
    `${r.piezasEnListaSinConfig.length} piezas tienen routing (operaciones) pero no aparecen en el ` +
      "BOM por configuración — quedaron migradas sin `pieza_configuracion`, así que no van a salir " +
      "en la explosión de ninguna OT hasta que se agreguen a alguna configuración.\n",
  );
  if (r.piezasEnListaSinConfig.length) {
    lineas.push(r.piezasEnListaSinConfig.map((c) => `\`${c}\``).join(", ") + "\n");
  }

  lineas.push("## Piezas presentes en 'Config Piezas' pero sin operaciones en 'Lista de Piezas'\n");
  lineas.push(
    `${r.piezasEnConfigSinLista.length} piezas están en el BOM pero no tienen routing — van a explotar ` +
      "en la OT de conjunto, pero su OT de pieza va a mostrar una hoja de ruta vacía.\n",
  );
  if (r.piezasEnConfigSinLista.length) {
    lineas.push(r.piezasEnConfigSinLista.map((c) => `\`${c}\``).join(", ") + "\n");
  }

  lineas.push("## RD — piezas sin routing (limitación de origen, no del script)\n");
  lineas.push(
    `Las ${r.piezasSinRouting.total} piezas RD no tienen una hoja de routing equivalente a la de PS. ` +
      "Ejemplo: " + r.piezasSinRouting.ejemplo.map((c) => `\`${c}\``).join(", ") + ".\n",
  );

  return lineas.join("\n");
}

main();
