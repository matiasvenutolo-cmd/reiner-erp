/**
 * Store transaccional en memoria: OT, registros de operación, paradas,
 * movimientos de stock.
 *
 * Es el reemplazo temporal de Postgres durante la etapa de mockup (ver
 * docs/01-analisis.md §6 y §5.1). Vive en `globalThis` para sobrevivir al
 * Fast Refresh de Next.js en desarrollo — sin esto, cada recompilación de
 * un archivo que importe este módulo reiniciaría los datos cargados.
 *
 * IMPORTANTE: esto se pierde en cada redeploy y no es apto para producción.
 * El día que se conecte Neon, `src/lib/data/ot.ts` y `ejecucion.ts` pasan a
 * usar Drizzle contra este mismo esquema (`src/lib/db/schema.ts`) y este
 * archivo se borra — el resto de la app no cambia porque nunca importa el
 * store directamente, sólo a través de esos dos módulos.
 */
import type { OtMaquina, OtConjunto, OtPieza, RegistroOperacion, Parada, MovimientoStock, TipoParada } from "@/lib/db/schema";

type Store = {
  otMaquina: OtMaquina[];
  otConjunto: OtConjunto[];
  otPieza: OtPieza[];
  registroOperacion: RegistroOperacion[];
  parada: Parada[];
  movimientoStock: MovimientoStock[];
  tipoParada: TipoParada[];
  contadorMaquina: number;
};

const TIPOS_PARADA_INICIALES: TipoParada[] = [
  { id: "falta-material", codigo: "FALTA_MATERIAL", nombre: "Falta de material" },
  { id: "falla-maquina", codigo: "FALLA_MAQUINA", nombre: "Falla de máquina/herramienta" },
  { id: "espera-instrucciones", codigo: "ESPERA_INSTRUCCIONES", nombre: "Espera de instrucciones" },
  { id: "cambio-turno", codigo: "CAMBIO_TURNO", nombre: "Cambio de turno" },
  { id: "otra", codigo: "OTRA", nombre: "Otra" },
];

function crearStoreVacio(): Store {
  return {
    otMaquina: [],
    otConjunto: [],
    otPieza: [],
    registroOperacion: [],
    parada: [],
    movimientoStock: [],
    tipoParada: TIPOS_PARADA_INICIALES,
    contadorMaquina: 0,
  };
}

const globalForStore = globalThis as unknown as { __reinerStore?: Store };

export const store: Store = globalForStore.__reinerStore ?? (globalForStore.__reinerStore = crearStoreVacio());

let contadorId = 0;
export function nuevoId(prefijo: string): string {
  contadorId += 1;
  return `${prefijo}-${Date.now().toString(36)}-${contadorId}`;
}
