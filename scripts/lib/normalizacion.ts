/**
 * Tablas de normalización usadas por la migración de los Excel de REINER.
 * Ver docs/01-analisis.md §3.5 (procesos) y §3.6.
 *
 * Cualquier valor que no aparezca acá pasa "tal cual" pero queda registrado
 * en el reporte de migración como no reconocido, para que se revise a mano
 * en vez de fallar silenciosamente.
 */

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Mapa de nombres de proceso "sucios" (tal como aparecen en `Lista de Piezas`)
 * a un código canónico. Ver hallazgo 3.5: 36 variantes para ~20 procesos reales.
 */
export const MAPA_PROCESOS: Record<string, string> = {
  // CNC
  cnc: "CNC",
  Cnc: "CNC",
  CNC: "CNC",
  // Torno
  torno: "TORNO",
  "torno ": "TORNO",
  Torno: "TORNO",
  "Torno ": "TORNO",
  // Compras
  compras: "COMPRAS",
  Compras: "COMPRAS",
  Comprar: "COMPRAS",
  // Corte por hilo
  "Corte Por Hilo": "CORTE_HILO",
  "Corte por hilo": "CORTE_HILO",
  "corte por hilo": "CORTE_HILO",
  // Cromado
  Cromado: "CROMADO",
  cromado: "CROMADO",
  "cromado/anodizado": "CROMADO_ANODIZADO",
  // Taller
  taller: "TALLER",
  Taller: "TALLER",
  // Pavonado
  Pavonado: "PAVONADO",
  pavonado: "PAVONADO",
  // Rectificado
  Rectificado: "RECTIFICADO",
  rectificado: "RECTIFICADO",
  // Roscado
  Roscado: "ROSCADO",
  // Pintura
  Pintura: "PINTURA",
  pintura: "PINTURA",
  // Templado
  Templado: "TEMPLADO",
  // Arenado
  "Arenado ": "ARENADO",
  Arenado: "ARENADO",
  // Tallado
  Tallado: "TALLADO",
  // Soldadura
  Soldadura: "SOLDADURA",
  // Grabado láser
  "Grabado Laser": "GRABADO_LASER",
  // Fresado
  Fresadora: "FRESADO",
  Fresado: "FRESADO",
  // 3D
  "3D": "IMPRESION_3D",
  "3d": "IMPRESION_3D",
  // Anodizado
  anodizado: "ANODIZADO",
  Anodizado: "ANODIZADO",
  // Chavetero
  chavetero: "CHAVETERO",
  // Columnas de CS-03 no cubiertas por el vocabulario de "Lista de Piezas"
  Fundicion: "FUNDICION",
  Fierro: "FIERRO",
  Mecanizado: "MECANIZADO",
  Pulido: "PULIDO",
  // Typo del origen ("Anonizado" en vez de "Anodizado")
  Anonizado: "ANODIZADO",
  // CENTRO CNC / TORNO CNC son máquinas distintas del "CNC"/"Torno" genérico
  // de la hoja de routing de PS. Se tratan como alias del mismo proceso
  // canónico hasta confirmar con Julián si ameritan distinguirse (quedan
  // registrados en advertencias, no en silencio).
  "CENTRO CNC": "CNC",
  "TORNO CNC": "TORNO",
};

/**
 * Columnas de proceso de CS-03 que NO son un proceso de fabricación: son el
 * conteo de piezas ya terminadas (stock disponible), que se migra aparte a
 * `stock_pieza`. Si se incluyeran acá, se duplicaría el dato como si fuera
 * una etapa más del flujo.
 */
export const COLUMNAS_STOCK_NO_WIP = new Set(["Finalizado"]);

/** Nombre legible para cada código canónico de proceso. */
export const NOMBRE_PROCESO: Record<string, string> = {
  COMPRAS: "Compras",
  TORNO: "Torno",
  CNC: "Centro CNC",
  CORTE_HILO: "Corte por hilo",
  FRESADO: "Fresado",
  ROSCADO: "Roscado",
  TALLADO: "Tallado",
  SOLDADURA: "Soldadura",
  TEMPLADO: "Templado",
  RECTIFICADO: "Rectificado",
  ARENADO: "Arenado",
  ANODIZADO: "Anodizado",
  CROMADO_ANODIZADO: "Cromado/anodizado",
  PAVONADO: "Pavonado",
  CROMADO: "Cromado",
  GRABADO_LASER: "Grabado láser",
  PINTURA: "Pintura",
  IMPRESION_3D: "Impresión 3D",
  CHAVETERO: "Chavetero",
  TALLER: "Taller (armado)",
  FUNDICION: "Fundición",
  FIERRO: "Fierro",
  MECANIZADO: "Mecanizado",
  PULIDO: "Pulido",
};

/**
 * Orden de flujo aproximado (para el semáforo de avance y el WIP por etapa).
 * Basado en el orden de columnas de CS-03 (Fundicion → Finalizado), con
 * Compras y Taller agregados en los extremos porque no aparecen ahí.
 */
export const ORDEN_FLUJO: Record<string, number> = {
  COMPRAS: 0,
  FUNDICION: 10,
  FIERRO: 20,
  TORNO: 30,
  CNC: 40,
  CORTE_HILO: 50,
  FRESADO: 60,
  MECANIZADO: 70,
  ROSCADO: 75,
  CHAVETERO: 76,
  TALLADO: 80,
  SOLDADURA: 90,
  TEMPLADO: 100,
  RECTIFICADO: 110,
  ARENADO: 115,
  PULIDO: 120,
  ANODIZADO: 130,
  PAVONADO: 140,
  CROMADO: 150,
  CROMADO_ANODIZADO: 155,
  GRABADO_LASER: 160,
  IMPRESION_3D: 165,
  PINTURA: 170,
  TALLER: 180,
};

export const PROCESOS_EXTERNOS = new Set(["COMPRAS", "CROMADO", "PAVONADO", "ANODIZADO", "CROMADO_ANODIZADO"]);

/**
 * Canoniza un nombre de conjunto (case/acentos) contra la lista maestra de
 * la hoja "Listas". Devuelve el nombre canónico si hay match por
 * normalización simple (trim + minúsculas + sin acentos); si no, devuelve
 * el original tal cual y el caller debe registrarlo como no reconciliado.
 */
export function canonizarConjunto(nombre: string, maestros: string[]): { nombre: string; reconciliado: boolean } {
  const norm = (s: string) => slugify(s);
  const target = norm(nombre);
  const match = maestros.find((m) => norm(m) === target);
  return match ? { nombre: match, reconciliado: true } : { nombre: nombre.trim(), reconciliado: false };
}
