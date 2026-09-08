/**
 * Carga las fixtures generadas por `scripts/migrate-excel.ts`.
 *
 * Punto único de acceso a los datos "maestros" (los que salen de los Excel
 * del cliente). El resto de `src/lib/data/*` importa de acá, nunca del JSON
 * directamente — así el día que se conecte Postgres sólo cambia este
 * archivo (y los de `src/lib/data/*` pasan de leer arrays a hacer queries).
 */
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
  MaterialFx,
} from "@/lib/fixtures/types";

import modelosData from "@/lib/fixtures/data/modelos.json";
import configuracionesData from "@/lib/fixtures/data/configuraciones.json";
import conjuntosData from "@/lib/fixtures/data/conjuntos.json";
import conjuntoModeloData from "@/lib/fixtures/data/conjunto-modelo.json";
import procesosData from "@/lib/fixtures/data/procesos.json";
import dispositivosData from "@/lib/fixtures/data/dispositivos.json";
import piezasData from "@/lib/fixtures/data/piezas.json";
import piezaConfiguracionData from "@/lib/fixtures/data/pieza-configuracion.json";
import operacionesData from "@/lib/fixtures/data/operaciones.json";
import stockPiezaData from "@/lib/fixtures/data/stock-pieza.json";
import wipPiezaData from "@/lib/fixtures/data/wip-pieza.json";
import materialesData from "@/lib/fixtures/data/materiales.json";

export const FIXTURES = {
  modelos: modelosData as ModeloFx[],
  configuraciones: configuracionesData as ConfiguracionFx[],
  conjuntos: conjuntosData as ConjuntoFx[],
  conjuntoModelo: conjuntoModeloData as ConjuntoModeloFx[],
  procesos: procesosData as ProcesoFx[],
  dispositivos: dispositivosData as DispositivoFx[],
  piezas: piezasData as PiezaFx[],
  piezaConfiguracion: piezaConfiguracionData as PiezaConfiguracionFx[],
  operaciones: operacionesData as OperacionFx[],
  stockPieza: stockPiezaData as StockPiezaFx[],
  wipPieza: wipPiezaData as { piezaId: string; procesoId: string; cantidad: number }[],
  materiales: materialesData as MaterialFx[],
};
