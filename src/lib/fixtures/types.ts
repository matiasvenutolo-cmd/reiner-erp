/**
 * Tipos de las fixtures generadas por `scripts/migrate-excel.ts`.
 *
 * Son un subconjunto "plano" de los tipos de `src/lib/db/schema.ts`: mismos
 * campos, pero con `id` en formato slug legible (ej. "cabezal", "ps120i")
 * en lugar de uuid, porque no hay una base de datos real todavía. Son
 * 100% compatibles a nivel de tipos con las columnas `uuid`/`text` de
 * Drizzle (ambas son `string`), así que el día que se conecte Postgres
 * el reemplazo es de implementación, no de forma.
 */

export type ModeloFx = {
  id: string;
  codigo: "RD" | "PS";
  nombre: string;
  descripcion: string;
};

export type ConfiguracionFx = {
  id: string;
  modeloId: string;
  codigo: string;
  variante: string;
  instrumentacion: "instrumentada" | "sin_instrumentar";
  nombre: string;
};

export type ConjuntoFx = {
  id: string;
  codigo: string;
  nombre: string;
  orden: number;
};

export type ConjuntoModeloFx = {
  conjuntoId: string;
  modeloId: string;
};

export type ProcesoFx = {
  id: string;
  codigo: string;
  nombre: string;
  ordenFlujo: number;
  esExterno: boolean;
};

export type DispositivoFx = {
  id: string;
  codigo: string;
  nombre: string;
};

export type PiezaFx = {
  id: string;
  codigo: string;
  nombre: string;
  conjuntoId: string;
  modeloId: string; // no está en el schema real (se infiere por configuración), pero simplifica el mock
  material: string | null;
  revision: string | null;
  tipo: "fabricada" | "comprada";
  esDeStock: boolean;
  stockMinimo: number;
  fotoPathname: string | null;
};

export type PiezaConfiguracionFx = {
  piezaId: string;
  configuracionId: string;
  cantidadNecesaria: number;
};

export type OperacionFx = {
  id: string;
  piezaId: string;
  procesoId: string;
  secuencia: number;
  ops: number;
  dispositivoId: string | null;
};

export type StockPiezaFx = {
  piezaId: string;
  cantidadDisponible: number;
};

export type WipPiezaFx = {
  piezaId: string;
  procesoId: string;
  cantidad: number;
}[];

export type MaterialFx = {
  id: string;
  nombre: string;
};

export type ReporteMigracion = {
  generadoEn: string;
  fuentes: string[];
  resumen: Record<string, number>;
  conjuntosNoReconciliados: string[];
  procesosNoReconocidos: string[];
  piezasSinRouting: { total: number; ejemplo: string[] };
  piezasEnListaSinConfig: string[];
  piezasEnConfigSinLista: string[];
  advertencias: string[];
};
