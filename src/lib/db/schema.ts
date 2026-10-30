/**
 * Schema de base de datos — REINER ERP.
 *
 * Fuente de verdad del modelo de datos, ver docs/02-modelo-datos.md.
 *
 * Las claves son `text`, no `uuid`. Los maestros migrados desde los Excel
 * (modelo, conjunto, pieza, proceso, configuración...) usan como id el
 * mismo código/slug legible que trae el Excel (ej. "cabezal", "ps120i",
 * "RD001108S001") — así las URLs y los datos de fixtures son directamente
 * las claves primarias, sin tabla de mapeo. Los registros que crea la app
 * en runtime (OT, registros de operación, paradas...) generan un uuid con
 * `crypto.randomUUID()` vía `$defaultFn`. Ambos casos son `string` en
 * TypeScript — daba lo mismo para el código, así que se eligió lo más
 * legible para depurar.
 */
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  primaryKey,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// ── Enums ────────────────────────────────────────────────────────────────

export const rolUsuarioEnum = pgEnum("rol_usuario", [
  "operario",
  "taller",
  "ingenieria",
  "direccion",
  // Fase 3.2: perfil de Compras (Lucio) — sólo el módulo de Compras y Proveedores.
  "compras",
]);

export const tipoModeloEnum = pgEnum("tipo_modelo", ["RD", "PS"]);

export const instrumentacionEnum = pgEnum("instrumentacion", [
  "instrumentada",
  "sin_instrumentar",
]);

export const tipoPiezaEnum = pgEnum("tipo_pieza", ["fabricada", "comprada"]);

/**
 * `interno`: paso hecho en la planta, con centro de trabajo propio.
 * `tercerizado`: se manda a otra empresa (Cromado, Pavonado, Anodizado...) y
 * vuelve — es lo que se ve en Tercerizados/remitos.
 * `compras`: no se manda a ningún lado, es una compra directa (material o
 * componente) que hace falta antes de seguir — se vincula con stock, no con
 * Tercerizados (devolución del cliente, ver docs/06-backlog-release-3.md).
 * Reemplaza el booleano `esExterno`, que trataba "Compras" y "Cromado" como
 * la misma cosa.
 */
export const tipoProcesoEnum = pgEnum("tipo_proceso", ["interno", "tercerizado", "compras"]);

export const estadoOtEnum = pgEnum("estado_ot", [
  "pendiente",
  "en_curso",
  "terminada",
]);

/**
 * `maquina`: OT de una máquina completa, con su número de serie (el caso de
 * siempre). `suelta`: sólo un conjunto o una pieza puntual, sin fabricar la
 * máquina entera — para cuando un cliente compra un repuesto o pide un
 * conjunto para mantenimiento (Release 3, devolución del cliente: "a veces
 * les compran o necesitan para un mantenimiento producir sólo un conjunto o
 * una pieza"). Sigue colgando de una fila en `ot_maquina` (mantiene la
 * trazabilidad y el esquema de códigos existente — ver la nota de diseño en
 * `generarOrdenSuelta`), sólo que `numeroSerie` pasa a ser una referencia
 * libre en vez de un número de serie real.
 */
export const tipoOrdenEnum = pgEnum("tipo_orden", ["maquina", "suelta"]);

/** De qué es una orden suelta: un conjunto completo o una pieza puntual — para
 * mostrar en /ot "OT Piezas", "OT Conjuntos" y "Máquinas completas" por separado. */
export const alcanceSueltaEnum = pgEnum("alcance_suelta", ["conjunto", "pieza"]);

export const tipoRegistroOperacionEnum = pgEnum("tipo_registro_operacion", [
  "setup",
  "ejecucion",
]);

export const tipoMovimientoStockEnum = pgEnum("tipo_movimiento_stock", [
  "ingreso",
  "egreso",
  "ajuste",
  "retiro_ot",
]);

export const tipoControlCalidadEnum = pgEnum("tipo_control_calidad", [
  "tolerada",
  "no_tolerada",
]);

export const resultadoControlEnum = pgEnum("resultado_control", ["ok", "no_ok"]);

export const tipoNotaPiezaEnum = pgEnum("tipo_nota_pieza", ["ingenieria", "produccion"]);

export const tipoAdjuntoPiezaEnum = pgEnum("tipo_adjunto_pieza", ["plano", "foto"]);

export const estadoTareaRevisionEnum = pgEnum("estado_tarea_revision", ["pendiente", "resuelta"]);

// ── Transversales ────────────────────────────────────────────────────────

export const usuario = pgTable("usuario", {
  id: text("id").primaryKey(), // slug legible (ej. "julian"), no random
  nombre: text("nombre").notNull(),
  email: text("email").unique(),
  pinHash: text("pin_hash"),
  passwordHash: text("password_hash"),
  rol: rolUsuarioEnum("rol").notNull(),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const cliente = pgTable("cliente", {
  id: id(),
  razonSocial: text("razon_social").notNull(),
  numeroBejerman: text("numero_bejerman"),
  contacto: text("contacto"),
  pais: text("pais"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const proveedor = pgTable("proveedor", {
  id: id(),
  razonSocial: text("razon_social").notNull(),
  rubro: text("rubro"),
  condicion: text("condicion"),
  // Fase 3.2 — datos que pidió el cliente para el registro de proveedores. Todos opcionales.
  cuit: text("cuit"),
  contacto: text("contacto"),
  condicionPago: text("condicion_pago"),
  direccion: text("direccion"),
  horario: text("horario"),
  observaciones: text("observaciones"),
  // v2 — planificación: plazo estándar que usa el motor si no hay cotización, tipo, procesos que hace y estado.
  plazoDias: integer("plazo_dias"),
  tipoProveedor: text("tipo_proveedor"), // materia_prima | comercial | servicio
  procesos: text("procesos"), // procesos tercerizados que hace, separados por coma
  estadoProveedor: text("estado_proveedor").notNull().default("activo"), // activo | evaluacion | bloqueado
  motivoBloqueo: text("motivo_bloqueo"),
  monedaHabitual: text("moneda_habitual").notNull().default("ARS"),
  telefono: text("telefono"),
  email: text("email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Maestros ─────────────────────────────────────────────────────────────

export const modelo = pgTable("modelo", {
  id: text("id").primaryKey(), // "RD" | "PS"
  codigo: tipoModeloEnum("codigo").notNull(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const configuracion = pgTable("configuracion", {
  id: text("id").primaryKey(), // slug del código, ej. "ps120i"
  modeloId: text("modelo_id")
    .notNull()
    .references(() => modelo.id),
  codigo: text("codigo").notNull().unique(), // ej. PS120I
  variante: text("variante").notNull(), // ej. "120", "124"
  instrumentacion: instrumentacionEnum("instrumentacion").notNull(),
  nombre: text("nombre").notNull(),
  // v2 — montaje: días de montaje final y pruebas, y margen entre pieza terminada y montaje del conjunto.
  montajeFinalDias: integer("montaje_final_dias").notNull().default(5),
  margenMontajeDias: integer("margen_montaje_dias").notNull().default(3),
  montajeOrigen: text("montaje_origen").notNull().default("estimado"),
  // Reorganización 30/10 §6.1 — archivada: no aparece en ninguna pantalla ni en los cálculos, pero no se borra.
  archivada: boolean("archivada").notNull().default(false),
});

export const conjunto = pgTable("conjunto", {
  id: text("id").primaryKey(), // slug del nombre, ej. "cabezal"
  codigo: text("codigo").notNull().unique(), // ej. C01
  nombre: text("nombre").notNull(), // ej. Cabezal
  orden: integer("orden").notNull().default(0),
});

export const conjuntoModelo = pgTable(
  "conjunto_modelo",
  {
    conjuntoId: text("conjunto_id")
      .notNull()
      .references(() => conjunto.id),
    modeloId: text("modelo_id")
      .notNull()
      .references(() => modelo.id),
  },
  (t) => [primaryKey({ columns: [t.conjuntoId, t.modeloId] })],
);

/**
 * Centro de trabajo: lugar físico (máquina o puesto) con su propia cola de
 * tareas — los 6 del cliente (Taller, Electrónica, Corte por hilo, Torno,
 * Torno CNC, Centro de mecanizado). No es lo mismo que una operación
 * (`proceso`): cada tipo de operación tiene un centro por defecto
 * (`proceso.centroTrabajoId`, editable en Administración → Operaciones y
 * centros) y una pieza puntual puede usar otro (`operacion.centroTrabajoId`).
 */
export const centroTrabajo = pgTable("centro_trabajo", {
  id: text("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  orden: integer("orden").notNull().default(0),
  // v2 — capacidad: horas por día, máquinas iguales y eficiencia planificable (0,85 = 85 %).
  horasDia: numeric("horas_dia", { precision: 5, scale: 2, mode: "number" }).notNull().default(8),
  maquinas: integer("maquinas").notNull().default(1),
  eficiencia: numeric("eficiencia", { precision: 4, scale: 2, mode: "number" }).notNull().default(0.85),
  capacidadOrigen: text("capacidad_origen").notNull().default("estimado"),
});

/**
 * Reemplaza `usuario.centroTrabajoId` (FK único) — devolución del cliente
 * (2ª ronda, pregunta 4 de Fase 2): "un operario puede ocupar dos puestos,
 * un puesto de trabajo puede ser ocupado por dos operarios también". No es
 * 1 a 1 como asumía el modelo original; es de varios a varios.
 */
export const usuarioCentroTrabajo = pgTable(
  "usuario_centro_trabajo",
  {
    usuarioId: text("usuario_id")
      .notNull()
      .references(() => usuario.id),
    centroTrabajoId: text("centro_trabajo_id")
      .notNull()
      .references(() => centroTrabajo.id),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.centroTrabajoId] })],
);

export const proceso = pgTable("proceso", {
  id: text("id").primaryKey(), // código normalizado, ej. "CNC" (ver hallazgo 3.5)
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  ordenFlujo: integer("orden_flujo").notNull().default(0),
  tipo: tipoProcesoEnum("tipo").notNull().default("interno"),
  centroTrabajoId: text("centro_trabajo_id").references(() => centroTrabajo.id),
  // v2 — tiempos por defecto del proceso (los heredan los pasos sin tiempo propio).
  setupMin: integer("setup_min"),
  minPorUnidad: numeric("min_por_unidad", { precision: 8, scale: 2, mode: "number" }),
  plazoDias: integer("plazo_dias"), // tercerizado / compras: días hábiles
  tiempoOrigen: text("tiempo_origen").notNull().default("estimado"), // estimado | definido
});

export const dispositivo = pgTable("dispositivo", {
  id: text("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
});

export const procedimiento = pgTable("procedimiento", {
  id: id(),
  codigo: text("codigo").notNull().unique(), // ej. PI-04
  titulo: text("titulo").notNull(),
  version: text("version"),
  fechaRevision: timestamp("fecha_revision"),
  // Se guarda el pathname del blob, NUNCA la URL completa (ver runbook §A5).
  archivoPathname: text("archivo_pathname"),
});

export const pieza = pgTable("pieza", {
  id: text("id").primaryKey(), // = codigo (ej. "PS01CB124s001", "RD001108S001")
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  conjuntoId: text("conjunto_id")
    .notNull()
    .references(() => conjunto.id),
  material: text("material"),
  revision: text("revision"),
  numeroPlano: text("numero_plano"),
  tipo: tipoPiezaEnum("tipo").notNull().default("fabricada"),
  esDeStock: boolean("es_de_stock").notNull().default(false),
  stockMinimo: integer("stock_minimo").notNull().default(0),
  // v2 — tipo de artículo y materia prima.
  clase: text("clase").notNull().default("fabricada"), // fabricada | a_medida | comercial
  claseSugerida: text("clase_sugerida"), // propuesta de reclasificación pendiente de aprobar
  materialCantidad: numeric("material_cantidad", { precision: 10, scale: 3, mode: "number" }),
  materialUnidad: text("material_unidad"),
  materialDeStock: boolean("material_de_stock").notNull().default(false),
  proveedorHabitualId: text("proveedor_habitual_id"),
  plazoCompraDias: integer("plazo_compra_dias"),
  tamanoLote: integer("tamano_lote"), // v2 usabilidad — lote por defecto para partir tareas grandes
  // Pathname del blob, no URL completa (ver runbook §A5).
  fotoPathname: text("foto_pathname"),
});

/**
 * Bitácora por pieza (RF nuevo, devolución del cliente 2026-09-19): Julián
 * pidió tres casillas separadas (material, observaciones de versión/diseño,
 * observaciones de producción) — `material` ya estaba en `pieza`; las otras
 * dos se unifican acá en una sola tabla append-only con `tipo`, así ingeniería
 * ve el historial completo de cambios en vez de un campo que se sobrescribe
 * (ver docs/05-backlog-release-2.md §1 y §2).
 */
export const piezaNota = pgTable("pieza_nota", {
  id: id(),
  piezaId: text("pieza_id")
    .notNull()
    .references(() => pieza.id),
  tipo: tipoNotaPiezaEnum("tipo").notNull(),
  texto: text("texto").notNull(),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Adjuntos de ingeniería por pieza (planos, procedimientos, fotos) — Release
 * 3, devolución del cliente: "ingeniería debe poder... agregar un plano y/o
 * imágenes". Tabla aparte de `piezaNota` (no una nota más) porque esto es un
 * archivo en Vercel Blob, no texto; y aparte del viejo `pieza.fotoPathname`
 * (nunca usado, sólo admitía una foto) porque una pieza puede tener varios
 * adjuntos a la vez (un plano + varias fotos). Se guarda el `pathname` del
 * blob, NUNCA la URL completa (ver runbook §A5 — la URL cambia si cambia el
 * store, el pathname no).
 */
export const piezaAdjunto = pgTable("pieza_adjunto", {
  id: id(),
  piezaId: text("pieza_id")
    .notNull()
    .references(() => pieza.id),
  tipo: tipoAdjuntoPiezaEnum("tipo").notNull(),
  nombreArchivo: text("nombre_archivo").notNull(),
  pathname: text("pathname").notNull(),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const piezaConfiguracion = pgTable(
  "pieza_configuracion",
  {
    piezaId: text("pieza_id")
      .notNull()
      .references(() => pieza.id),
    configuracionId: text("configuracion_id")
      .notNull()
      .references(() => configuracion.id),
    cantidadNecesaria: integer("cantidad_necesaria").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.piezaId, t.configuracionId] })],
);

export const operacion = pgTable("operacion", {
  id: text("id").primaryKey(), // ej. "PS01CB124s001-op1"
  piezaId: text("pieza_id")
    .notNull()
    .references(() => pieza.id),
  procesoId: text("proceso_id")
    .notNull()
    .references(() => proceso.id),
  secuencia: integer("secuencia").notNull().default(0),
  ops: integer("ops"), // cantidad de operaciones, ver nota de migración
  // Detalle específico de este paso (ej. "Roscado" u "Operación 1" para un
  // proceso genérico como "Torno" que se repite en la ruta) — Release 3,
  // pedido del cliente (docs/06-backlog-release-3.md §5): los nombres de
  // proceso migrados del Excel son genéricos y no alcanzan para saber qué
  // hay que hacer, sobre todo para el operario. Opcional: si no se carga,
  // se sigue mostrando el nombre del proceso.
  descripcion: text("descripcion"),
  dispositivoId: text("dispositivo_id").references(() => dispositivo.id),
  procedimientoId: text("procedimiento_id").references(() => procedimiento.id),
  // Centro de trabajo para ESTA pieza, distinto del que tiene por defecto su
  // tipo de operación (proceso.centroTrabajoId). null = usar el de defecto.
  centroTrabajoId: text("centro_trabajo_id").references(() => centroTrabajo.id),
  // v2 — tiempo propio del paso (null = hereda el del proceso).
  setupMin: integer("setup_min"),
  minPorUnidad: numeric("min_por_unidad", { precision: 8, scale: 2, mode: "number" }),
  esperaHoras: numeric("espera_horas", { precision: 6, scale: 2, mode: "number" }).notNull().default(0),
  plazoTercerizadoDias: integer("plazo_tercerizado_dias"),
  tiempoOrigen: text("tiempo_origen"), // null = hereda | estimado | definido | medido
  /** Reorganización 30/10 §6.2 — proveedor de este paso si es tercerizado (del Excel de hojas de ruta). */
  proveedorId: text("proveedor_id"),
});

// ── Stock (con posición por etapa — hallazgo 3.1) ───────────────────────

export const ubicacion = pgTable("ubicacion", {
  id: id(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(), // isla
});

export const stockPieza = pgTable("stock_pieza", {
  piezaId: text("pieza_id")
    .primaryKey()
    .references(() => pieza.id),
  cantidadDisponible: integer("cantidad_disponible").notNull().default(0), // "Finalizado"
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const wipPieza = pgTable(
  "wip_pieza",
  {
    piezaId: text("pieza_id")
      .notNull()
      .references(() => pieza.id),
    procesoId: text("proceso_id")
      .notNull()
      .references(() => proceso.id),
    cantidad: integer("cantidad").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.piezaId, t.procesoId] })],
);

export const movimientoStock = pgTable("movimiento_stock", {
  id: id(),
  piezaId: text("pieza_id")
    .notNull()
    .references(() => pieza.id),
  tipo: tipoMovimientoStockEnum("tipo").notNull(),
  cantidad: integer("cantidad").notNull(),
  otPiezaId: text("ot_pieza_id"),
  // Referencia suelta al remito que generó este egreso (mismo criterio que
  // otPiezaId arriba: sin FK real, es sólo trazabilidad) — devolución del
  // cliente: "generar un movimiento y que quede registrado y a la vez se
  // haga el remito", en vez de dos acciones desconectadas en la misma
  // pantalla (ver `generarRemito` en remitos.ts).
  remitoId: text("remito_id"),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  ubicacionId: text("ubicacion_id").references(() => ubicacion.id),
  // Control de calidad en ingresos (Release 2, pedido de Horacio/Julián en la
  // devolución del 2026-09-19 — docs/05-backlog-release-2.md §4): sólo
  // aplica a tipo "ingreso" (materia prima o vuelta de un proceso
  // tercerizado). `proveedorId` permite reclamar a tiempo si el control da
  // no_ok — que es justo lo que pidió Julián al confirmar la hoja de ruta
  // de B-24. Reusa `resultadoControlEnum`, ya definido para el control de
  // calidad de fabricación (misma semántica ok/no_ok).
  proveedorId: text("proveedor_id").references(() => proveedor.id),
  controlResultado: resultadoControlEnum("control_resultado"),
  observacion: text("observacion"),
  fecha: timestamp("fecha").notNull().defaultNow(),
});

// ── Órdenes de trabajo ───────────────────────────────────────────────────

export const otMaquina = pgTable("ot_maquina", {
  id: id(),
  codigo: text("codigo").notNull().unique(), // OTM6 (máquina) u OTS6 (suelta)
  tipo: tipoOrdenEnum("tipo").notNull().default("maquina"),
  alcance: alcanceSueltaEnum("alcance"), // sólo en tipo "suelta"
  numeroSerie: text("numero_serie").notNull(), // en una orden "suelta" es una referencia libre, no un número de serie real
  configuracionId: text("configuracion_id")
    .notNull()
    .references(() => configuracion.id),
  clienteId: text("cliente_id").references(() => cliente.id),
  ordenCompra: text("orden_compra"),
  emitidoPor: text("emitido_por"),
  fechaEmision: timestamp("fecha_emision"),
  visadoPor: text("visado_por"),
  fechaVisado: timestamp("fecha_visado"),
  plazoEntrega: text("plazo_entrega"),
  fechaComprometida: timestamp("fecha_comprometida"),
  pais: text("pais").default("Argentina"),
  estado: estadoOtEnum("estado").notNull().default("pendiente"),
  observaciones: text("observaciones"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // v2 — proyecto: fecha de entrega comprometida, estado, prioridad, destino y marca de demo.
  fechaEntrega: date("fecha_entrega"),
  fechaInicioProyecto: date("fecha_inicio_proyecto"),
  prioridad: text("prioridad").notNull().default("normal"), // normal | alta
  estadoProyecto: text("estado_proyecto").notNull().default("borrador"), // borrador | activo | en_montaje | terminado | entregado | pausado | archivado
  /** Reorganización 30/10 §6.1 — el estado que tenía antes de archivarla, para desarchivarla igual que estaba. */
  estadoAntesDeArchivar: text("estado_antes_de_archivar"),
  destino: text("destino").notNull().default("maquina"), // maquina | repuesto | stock
  motivoStock: text("motivo_stock"),
  esDemo: boolean("es_demo").notNull().default(false),
});

export const otConjunto = pgTable("ot_conjunto", {
  id: id(),
  codigo: text("codigo").notNull().unique(), // OTM6C01
  otMaquinaId: text("ot_maquina_id")
    .notNull()
    .references(() => otMaquina.id),
  conjuntoId: text("conjunto_id")
    .notNull()
    .references(() => conjunto.id),
  estado: estadoOtEnum("estado").notNull().default("pendiente"),
  fechaInicio: timestamp("fecha_inicio"),
  fechaFin: timestamp("fecha_fin"),
});

export const otPieza = pgTable("ot_pieza", {
  id: id(),
  codigo: text("codigo").notNull().unique(), // OTM6C01P3
  otConjuntoId: text("ot_conjunto_id")
    .notNull()
    .references(() => otConjunto.id),
  piezaId: text("pieza_id")
    .notNull()
    .references(() => pieza.id),
  material: text("material"),
  cantidadNecesaria: integer("cantidad_necesaria").notNull(),
  stockAlGenerar: integer("stock_al_generar").notNull().default(0),
  cantidadAFabricar: integer("cantidad_a_fabricar").notNull().default(0),
  estado: estadoOtEnum("estado").notNull().default("pendiente"),
  fechaInicio: timestamp("fecha_inicio"),
  fechaFin: timestamp("fecha_fin"),
  piezasOk: integer("piezas_ok").notNull().default(0),
  piezasNoOk: integer("piezas_no_ok").notNull().default(0),
  piezasDefectuosas: integer("piezas_defectuosas").notNull().default(0),
  piezasRetrabajadas: integer("piezas_retrabajadas").notNull().default(0),
  // Orden manual dentro de la cola de "disponible ahora" de su centro de
  // trabajo (Release 2, pedido de Horacio: "que se puedan ordenar según cuál
  // se quiere hacer primero"). Menor = primero. No es prioridad de negocio,
  // sólo el orden que taller eligió — ver /centros-trabajo.
  prioridad: integer("prioridad").notNull().default(0),
  // Pedido de fabricación: al generar la OT la pieza queda en ingeniería; recién
  // cuando ingeniería la envía a producción aparece para planificar, en las colas
  // de los centros y en /taller. null = todavía no enviada.
  enviadaProduccionAt: timestamp("enviada_produccion_at"),
  enviadaProduccionPorId: text("enviada_produccion_por_id").references(() => usuario.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Stock comprometido (2ª ronda de Fase 2, pregunta 5: "piezas que están en
 * stock, que serán utilizadas para una máquina ya vendida"). Al generar una
 * OT, lo que el stock cubre queda reservado para esa máquina y deja de
 * contar como libre — antes dos OT podían descontar la misma pieza del
 * almacén. `cantidad` es lo que sigue reservado: baja al retirarla.
 */
export const reservaStock = pgTable("reserva_stock", {
  id: id(),
  otMaquinaId: text("ot_maquina_id")
    .notNull()
    .references(() => otMaquina.id),
  piezaId: text("pieza_id")
    .notNull()
    .references(() => pieza.id),
  cantidad: integer("cantidad").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Compra pedida al proveedor y todavía no recibida — separa en Stock
 * "pendiente de compra" de "comprado, esperando que llegue". Cuelga de la
 * OT de pieza que la necesita (pieza comprada entera o materia prima de una
 * pieza fabricada cuyo paso actual es Compras).
 */
export const pedidoCompra = pgTable("pedido_compra", {
  id: id(),
  otPiezaId: text("ot_pieza_id")
    .notNull()
    .references(() => otPieza.id),
  proveedorId: text("proveedor_id").references(() => proveedor.id),
  cantidad: integer("cantidad").notNull(),
  observacion: text("observacion"),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  fechaPedido: timestamp("fecha_pedido").notNull().defaultNow(),
  recibidoAt: timestamp("recibido_at"),
  fechaPrometida: date("fecha_prometida"), // v2 — la que promete el proveedor
});

/**
 * Gestión de Compras (Fase 3.2). Una solicitud es algo que hay que comprar:
 * una necesidad de una orden de trabajo (origen "orden_trabajo", cuelga de la
 * OT de pieza y no copia sus datos) o una compra general de la empresa
 * (insumos, herramientas). Tiene sus cotizaciones alternativas; la elegida a
 * mano por Compras es la única que cuenta como compra prevista. Las fechas
 * son conceptos distintos y se guardan por separado: necesidad del material,
 * compra prevista, confirmación al proveedor, recepción y pago.
 */
export const origenSolicitudEnum = pgEnum("origen_solicitud_compra", ["orden_trabajo", "general"]);
export const monedaEnum = pgEnum("moneda", ["ARS", "USD", "EUR"]);

export const solicitudCompra = pgTable("solicitud_compra", {
  id: id(),
  numero: integer("numero").notNull().unique(),
  origen: origenSolicitudEnum("origen").notNull(),
  otPiezaId: text("ot_pieza_id").references(() => otPieza.id),
  descripcion: text("descripcion").notNull(),
  cantidad: numeric("cantidad", { precision: 14, scale: 3, mode: "number" }).notNull(),
  unidad: text("unidad"),
  observacion: text("observacion"),
  /** Cuándo se necesita el material — la carga Compras con lo que indique Producción (no se calcula). */
  fechaNecesidad: date("fecha_necesidad"),
  cotizacionElegidaId: text("cotizacion_elegida_id"),
  /** Programación: cuándo se prevé hacer la compra y cuándo pagarla. */
  fechaCompraPrevista: date("fecha_compra_prevista"),
  fechaPagoPrevista: date("fecha_pago_prevista"),
  /** Compra confirmada al proveedor. En una necesidad de OT crea el pedido de Stock → Compras. */
  confirmadaAt: timestamp("confirmada_at"),
  pedidoCompraId: text("pedido_compra_id").references(() => pedidoCompra.id),
  anuladaAt: timestamp("anulada_at"),
  creadoPorId: text("creado_por_id")
    .notNull()
    .references(() => usuario.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cotizacionCompra = pgTable("cotizacion_compra", {
  id: id(),
  solicitudId: text("solicitud_id")
    .notNull()
    .references(() => solicitudCompra.id),
  proveedorId: text("proveedor_id")
    .notNull()
    .references(() => proveedor.id),
  cantidad: numeric("cantidad", { precision: 14, scale: 3, mode: "number" }).notNull(),
  precioUnitario: numeric("precio_unitario", { precision: 16, scale: 2, mode: "number" }).notNull(),
  moneda: monedaEnum("moneda").notNull(),
  /** Pesos por unidad de moneda extranjera, tal como se usó al cargarla — no cambia sola. */
  tipoCambio: numeric("tipo_cambio", { precision: 16, scale: 4, mode: "number" }),
  tipoCambioMoneda: monedaEnum("tipo_cambio_moneda"),
  tipoCambioFecha: date("tipo_cambio_fecha"),
  tipoCambioFuente: text("tipo_cambio_fuente"),
  tiempoEntregaDias: integer("tiempo_entrega_dias"),
  condicionPago: text("condicion_pago"),
  observaciones: text("observaciones"),
  fechaConfirmacionPosible: date("fecha_confirmacion_posible"),
  fecha: date("fecha").notNull(),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Entrega de una compra general, con su control OK / NO OK (puede haber una NO
 * OK y después otra OK). La de una necesidad de OT se sigue registrando como
 * llegada de su pedido (movimiento de stock con control), como siempre.
 */
export const recepcionCompra = pgTable("recepcion_compra", {
  id: id(),
  solicitudId: text("solicitud_id")
    .notNull()
    .references(() => solicitudCompra.id),
  fecha: date("fecha").notNull(),
  resultado: resultadoControlEnum("resultado").notNull(),
  observacion: text("observacion"),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Pago de una compra: recién acá el gasto se considera efectuado (definición del cliente). */
export const pagoCompra = pgTable("pago_compra", {
  id: id(),
  solicitudId: text("solicitud_id")
    .notNull()
    .references(() => solicitudCompra.id),
  fecha: date("fecha").notNull(),
  importe: numeric("importe", { precision: 16, scale: 2, mode: "number" }).notNull(),
  moneda: monedaEnum("moneda").notNull(),
  observacion: text("observacion"),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Planificación semanal (Release 3, docs/06-backlog-release-3.md §4):
 * "asignar un trabajo específico a una persona, para un día determinado,
 * con anticipación (ej. planificar toda la semana siguiente)". Asigna una
 * OT de pieza completa (no una operación puntual) a un operario para un
 * día — si para cuando llega ese día la pieza ya avanzó de etapa, la
 * asignación queda igual como referencia de que alguien se comprometió a
 * mirarla ese día, no se borra sola.
 */
export const asignacionTrabajo = pgTable("asignacion_trabajo", {
  id: id(),
  otPiezaId: text("ot_pieza_id")
    .notNull()
    .references(() => otPieza.id),
  operarioId: text("operario_id")
    .notNull()
    .references(() => usuario.id),
  // Qué operación de la hoja de ruta se hace ese día — de ahí sale el centro de
  // trabajo y la carga por centro × día en Planificación.
  operacionId: text("operacion_id").references(() => operacion.id),
  fecha: date("fecha").notNull(),
  asignadoPorId: text("asignado_por_id")
    .notNull()
    .references(() => usuario.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  dePlanConfirmado: boolean("de_plan_confirmado").notNull().default(false), // v2 — la publicó "Confirmar semana"
});

// ── Ejecución — el corazón del sistema (RF-05) ──────────────────────────

export const tipoParada = pgTable("tipo_parada", {
  id: text("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
});

export const registroOperacion = pgTable("registro_operacion", {
  id: id(),
  otPiezaId: text("ot_pieza_id")
    .notNull()
    .references(() => otPieza.id),
  operacionId: text("operacion_id")
    .notNull()
    .references(() => operacion.id),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  tipo: tipoRegistroOperacionEnum("tipo").notNull(),
  inicio: timestamp("inicio").notNull(),
  fin: timestamp("fin"),
  duracionSeg: integer("duracion_seg"), // calculado al cerrar
  piezasOk: integer("piezas_ok").default(0),
  piezasRechazadas: integer("piezas_rechazadas").default(0),
  observacion: text("observacion"),
  motivoRechazo: text("motivo_rechazo"), // v2 usabilidad — medida | terminacion | material | otro
});

export const parada = pgTable("parada", {
  id: id(),
  registroOperacionId: text("registro_operacion_id")
    .notNull()
    .references(() => registroOperacion.id),
  tipoParadaId: text("tipo_parada_id")
    .notNull()
    .references(() => tipoParada.id),
  inicio: timestamp("inicio").notNull(),
  fin: timestamp("fin"),
  duracionSeg: integer("duracion_seg"),
  observacion: text("observacion"),
});

export const controlCalidad = pgTable("control_calidad", {
  id: id(),
  otPiezaId: text("ot_pieza_id")
    .notNull()
    .references(() => otPieza.id),
  operacionId: text("operacion_id").references(() => operacion.id),
  tipo: tipoControlCalidadEnum("tipo").notNull(),
  medida: text("medida"),
  resultado: resultadoControlEnum("resultado"),
  revisadoPor: text("revisado_por"),
});

/**
 * Tarea de revisión de retrabajo (Release 2, paquete 7 — pedido de Horacio:
 * "que cuando se fabriquen piezas por retrabajar o piezas defectuosas se
 * genere en otro panel tareas de revisión de proceso para darles
 * seguimiento"). Se crea sola, no a mano: `finalizarOperacion` inserta una
 * fila acá cuando el cierre de una OT de pieza (la última operación de su
 * hoja de ruta) reporta `piezasDefectuosas` o `piezasRetrabajadas` > 0. Ver
 * docs/05-backlog-release-2.md §9.
 */
export const tareaRevision = pgTable("tarea_revision", {
  id: id(),
  otPiezaId: text("ot_pieza_id")
    .notNull()
    .references(() => otPieza.id),
  piezasDefectuosas: integer("piezas_defectuosas").notNull().default(0),
  piezasRetrabajadas: integer("piezas_retrabajadas").notNull().default(0),
  estado: estadoTareaRevisionEnum("estado").notNull().default("pendiente"),
  resolucion: text("resolucion"),
  resueltoPorId: text("resuelto_por_id").references(() => usuario.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

/**
 * Subtareas de un retrabajo, con cronómetro — devolución del cliente: "que
 * en los retrabajos se puedan ir agregando tareas y te permita temporizar
 * cuánto te lleva ese retrabajo". Mismo patrón inicio/fin/duracionSeg que
 * `registro_operacion` (calculado sólo al cerrar) — "una tarea corriendo a
 * la vez por tarea de revisión" es la misma regla de simplicidad que ya usa
 * taller, aplicada acá en vez de a nivel de usuario global.
 */
export const tareaRevisionItem = pgTable("tarea_revision_item", {
  id: id(),
  tareaRevisionId: text("tarea_revision_id")
    .notNull()
    .references(() => tareaRevision.id),
  descripcion: text("descripcion").notNull(),
  inicio: timestamp("inicio"),
  fin: timestamp("fin"),
  duracionSeg: integer("duracion_seg"), // calculado al detener, igual que registro_operacion
  usuarioId: text("usuario_id").references(() => usuario.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Control de armado (Release 2, paquete 7 — pedido de Horacio: "que cuando
 * todas las piezas de un conjunto estén listas se habilite una sección de
 * control de armado, donde también podamos poner procedimientos de armado y
 * control en donde se asiente que todo el conjunto funciona bien"). Reusa
 * `resultadoControlEnum` (ok/no_ok) igual que `controlCalidad`.
 */
export const controlArmado = pgTable("control_armado", {
  id: id(),
  otConjuntoId: text("ot_conjunto_id")
    .notNull()
    .references(() => otConjunto.id),
  procedimientoId: text("procedimiento_id").references(() => procedimiento.id),
  resultado: resultadoControlEnum("resultado").notNull(),
  observacion: text("observacion"),
  revisadoPorId: text("revisado_por_id")
    .notNull()
    .references(() => usuario.id),
  fecha: timestamp("fecha").notNull().defaultNow(),
});

/**
 * Remito (Release 2, paquete 7; multi-pieza desde Release 3). Un remito =
 * un envío físico hacia afuera de la fábrica (a un cliente o a un proceso
 * tercerizado), con numeración propia y vista imprimible en
 * `/remitos/[id]`. Encabezado del envío — las piezas viven en `remitoItem`.
 * Pedido explícito del cliente (docs/06-backlog-release-3.md §12): "un
 * remito debe poder agrupar varias piezas... de distintas máquinas o
 * incluso distintos clientes, para un mismo proveedor" — ya estaba anotado
 * como límite conocido en Release 2 (un remito por pieza), ahora resuelto.
 */
export const remito = pgTable("remito", {
  id: id(),
  numero: integer("numero").notNull().unique(),
  destino: text("destino").notNull(),
  // Persona a cargo del envío del lado de REINER — pedido explícito del
  // cliente ("técnico involucrado").
  tecnico: text("tecnico"),
  observacion: text("observacion"),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  fecha: timestamp("fecha").notNull().defaultNow(),
});

export const remitoItem = pgTable("remito_item", {
  id: id(),
  remitoId: text("remito_id")
    .notNull()
    .references(() => remito.id),
  piezaId: text("pieza_id")
    .notNull()
    .references(() => pieza.id),
  cantidad: integer("cantidad").notNull(),
  // Qué se le hace a la pieza en destino (ej. "Cromado") — pedido del
  // cliente, el mismo formulario simple que describió: "pieza, tratamiento,
  // código, destino, cantidad, observaciones".
  tratamiento: text("tratamiento"),
  // OT de pieza que sale a un proceso tercerizado (piezas en fabricación, no
  // del almacén): el remito registra el egreso pero no descuenta stock, y
  // marca que esa pieza ya salió y está esperando volver.
  otPiezaId: text("ot_pieza_id"),
});

// Nota: `tiempo_estandar` (RF-08) no es tabla: es una consulta agregada
// sobre `registro_operacion` agrupada por pieza × proceso × tipo, con
// promedio, mínimo, máximo y n_observaciones (ver docs/02-modelo-datos.md).

// ── v2 — Planificación por proyecto ──────────────────────────────────────

/** Feriados nacionales y días de cierre de la planta. */
export const feriado = pgTable("feriado", {
  fecha: date("fecha").primaryKey(),
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull().default("nacional"), // nacional | cierre
});

/** Ausencias y vacaciones: restan capacidad al centro del operario. */
export const ausencia = pgTable("ausencia", {
  id: id(),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  desde: date("desde").notNull(),
  hasta: date("hasta").notNull(),
  motivo: text("motivo"),
});

/** Secuencia de montaje de cada configuración: orden y días por conjunto. */
export const montajeConjunto = pgTable(
  "montaje_conjunto",
  {
    configuracionId: text("configuracion_id")
      .notNull()
      .references(() => configuracion.id),
    conjuntoId: text("conjunto_id")
      .notNull()
      .references(() => conjunto.id),
    orden: integer("orden").notNull(),
    dias: integer("dias").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.configuracionId, t.conjuntoId] })],
);

/** Parámetros generales (horizonte de liberación, exigir plano…). */
export const parametro = pgTable("parametro", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull(),
  nota: text("nota"),
});

/** Ajustes manuales al plan propuesto: tarea movida, operario cambiado o fijada con candado. */
export const planAjuste = pgTable(
  "plan_ajuste",
  {
    otPiezaId: text("ot_pieza_id")
      .notNull()
      .references(() => otPieza.id),
    operacionId: text("operacion_id").notNull(),
    fecha: date("fecha"),
    centroTrabajoId: text("centro_trabajo_id"),
    operarioId: text("operario_id"),
    fijada: boolean("fijada").notNull().default(false),
    usuarioId: text("usuario_id").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.otPiezaId, t.operacionId] })],
);

/** Bitácora del proyecto: cambios de fecha (con motivo), pausas, liberaciones. */
export const proyectoEvento = pgTable("proyecto_evento", {
  id: id(),
  otMaquinaId: text("ot_maquina_id")
    .notNull()
    .references(() => otMaquina.id),
  tipo: text("tipo").notNull(),
  texto: text("texto").notNull(),
  usuarioId: text("usuario_id").notNull(),
  fecha: timestamp("fecha").notNull().defaultNow(),
});

/** Condición vigente de un proveedor para un servicio tercerizado. */
export const proveedorServicio = pgTable("proveedor_servicio", {
  id: id(),
  proveedorId: text("proveedor_id")
    .notNull()
    .references(() => proveedor.id),
  procesoId: text("proceso_id")
    .notNull()
    .references(() => proceso.id),
  precio: numeric("precio", { precision: 14, scale: 2, mode: "number" }),
  unidadPrecio: text("unidad_precio"), // pieza | kg | lote
  moneda: text("moneda").notNull().default("ARS"),
  plazoDias: integer("plazo_dias"),
  loteMinimo: integer("lote_minimo"),
  vigenteHasta: date("vigente_hasta"),
  habitual: boolean("habitual").notNull().default(false),
  esDemo: boolean("es_demo").notNull().default(false),
});

/** Stock que no es una pieza del maestro: materia prima y consumibles de taller. */
export const articuloStock = pgTable("articulo_stock", {
  id: id(),
  tipo: text("tipo").notNull(), // materia_prima | consumible
  nombre: text("nombre").notNull(),
  medida: text("medida"),
  unidad: text("unidad").notNull().default("u."),
  cantidad: numeric("cantidad", { precision: 12, scale: 3, mode: "number" }).notNull().default(0),
  asignada: numeric("asignada", { precision: 12, scale: 3, mode: "number" }).notNull().default(0),
  minimo: numeric("minimo", { precision: 12, scale: 3, mode: "number" }).notNull().default(0),
  ubicacion: text("ubicacion"),
  proveedorId: text("proveedor_id"),
  centroUso: text("centro_uso"),
  esDemo: boolean("es_demo").notNull().default(false),
});

// ── Tipos inferidos (usados en toda la app) ─────────────────────────────

export type Modelo = typeof modelo.$inferSelect;
export type Configuracion = typeof configuracion.$inferSelect;
export type Conjunto = typeof conjunto.$inferSelect;
export type CentroTrabajo = typeof centroTrabajo.$inferSelect;
export type Proceso = typeof proceso.$inferSelect;
export type Dispositivo = typeof dispositivo.$inferSelect;
export type Procedimiento = typeof procedimiento.$inferSelect;
export type Pieza = typeof pieza.$inferSelect;
export type PiezaNota = typeof piezaNota.$inferSelect;
export type PiezaAdjunto = typeof piezaAdjunto.$inferSelect;
export type PiezaConfiguracion = typeof piezaConfiguracion.$inferSelect;
export type Operacion = typeof operacion.$inferSelect;
export type Ubicacion = typeof ubicacion.$inferSelect;
// ── v2 · mejoras de usabilidad ──────────────────────────────────────────────

/** "No puedo hacer esta" (operario): la tarea queda trabada con su motivo hasta que alguien la destraba. */
export const tareaBloqueo = pgTable("tarea_bloqueo", {
  id: id(),
  otPiezaId: text("ot_pieza_id")
    .notNull()
    .references(() => otPieza.id),
  operacionId: text("operacion_id").notNull(),
  motivo: text("motivo").notNull(), // falta_material | falta_pieza_anterior | falta_plano | maquina | otro
  texto: text("texto"),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resueltoAt: timestamp("resuelto_at"),
  resueltoPorId: text("resuelto_por_id"),
});

/** "Hacer esta antes" (operario): cambia el orden de su cola, con motivo; el jefe lo ve en la bitácora. */
export const tareaAdelanto = pgTable("tarea_adelanto", {
  id: id(),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  otPiezaId: text("ot_pieza_id").notNull(),
  operacionId: text("operacion_id").notNull(),
  motivo: text("motivo").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Avisos de la planta al jefe o a ingeniería ("no tengo más tareas", "falta el plano"). */
export const avisoPlanta = pgTable("aviso_planta", {
  id: id(),
  tipo: text("tipo").notNull(), // sin_tareas | falta_plano | otro
  texto: text("texto").notNull(),
  otPiezaId: text("ot_pieza_id"),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resueltoAt: timestamp("resuelto_at"),
});

/** Tamaño de lote elegido a mano para una tarea (pisa el de la pieza). */
export const tareaLote = pgTable(
  "tarea_lote",
  {
    otPiezaId: text("ot_pieza_id").notNull(),
    operacionId: text("operacion_id").notNull(),
    tamano: integer("tamano").notNull(),
  },
  (t) => [primaryKey({ columns: [t.otPiezaId, t.operacionId] })],
);

/** Semana confirmada por el jefe de planta: quién y cuándo. */
export const semanaConfirmada = pgTable("semana_confirmada", {
  lunes: date("lunes").primaryKey(),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  confirmadaAt: timestamp("confirmada_at").notNull().defaultNow(),
  tareas: integer("tareas").notNull().default(0),
});

// ── v2 · simplificación "Qué hace falta" ────────────────────────────────────

/**
 * Orden en borrador del asistente "+ Generar orden" (simplificación §1): lo que
 * se cargó en el paso 1 y lo decidido en el paso 2. Mientras es borrador no hay
 * ninguna fila en ot_maquina: no reserva stock, no genera compras y no entra al
 * plan. Recién al confirmar (paso 3) se crea la orden con la generación de siempre.
 */
export const ordenBorrador = pgTable("orden_borrador", {
  id: id(),
  tipo: text("tipo").notNull(), // maquina | conjunto | pieza
  configuracionId: text("configuracion_id"),
  conjuntoId: text("conjunto_id"),
  piezaId: text("pieza_id"),
  cantidad: integer("cantidad").notNull().default(1),
  destino: text("destino").notNull().default("cliente"), // cliente | stock
  clienteId: text("cliente_id"),
  fechaCliente: date("fecha_cliente"), // "El cliente la quiere para…": referencia, no compromiso
  numeroSerie: text("numero_serie"),
  ordenCompra: text("orden_compra"),
  motivoStock: text("motivo_stock"),
  /** Piezas que este pedido no lleva (variantes). */
  excluidas: jsonb("excluidas").$type<string[]>().notNull().default([]),
  /** Decisiones del paso 2: piezas a fabricar igual aunque haya stock, y compras que no se confirman. */
  decisiones: jsonb("decisiones").$type<{ fabricarIgual: string[]; noComprar: string[] }>().notNull().default({ fabricarIgual: [], noComprar: [] }),
  /** Stock libre por pieza la última vez que se miró el paso 2 (para avisar si cambió). */
  stockVisto: jsonb("stock_visto").$type<Record<string, number>>(),
  usuarioId: text("usuario_id").notNull(),
  otMaquinaId: text("ot_maquina_id"), // la orden creada al confirmar
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type OrdenBorrador = typeof ordenBorrador.$inferSelect;

/**
 * Necesidad de compra que deja una orden al confirmarse desde el asistente
 * (simplificación §2, "Al confirmar la orden"): cada compra de "Falta material"
 * y "Lo compro" aparece en Compras → Necesidades de producción, con la orden y
 * la pieza de origen. No es una solicitud: la toma Compras, como siempre.
 * Con `omitida` (se eligió "No comprar") la pieza no aparece como necesidad.
 */
export const necesidadCompraOrden = pgTable("necesidad_compra_orden", {
  id: id(),
  otPiezaId: text("ot_pieza_id")
    .notNull()
    .unique()
    .references(() => otPieza.id),
  otMaquinaId: text("ot_maquina_id")
    .notNull()
    .references(() => otMaquina.id),
  tipo: text("tipo").notNull(), // articulo | material
  descripcion: text("descripcion").notNull(),
  /** Unidades a comprar (artículo) o piezas a fabricar que esperan el material — la misma unidad que los pedidos. */
  cantidad: integer("cantidad").notNull(),
  observacion: text("observacion"),
  omitida: boolean("omitida").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type NecesidadCompraOrden = typeof necesidadCompraOrden.$inferSelect;

export type StockPieza = typeof stockPieza.$inferSelect;
export type WipPieza = typeof wipPieza.$inferSelect;
export type MovimientoStock = typeof movimientoStock.$inferSelect;
export type OtMaquina = typeof otMaquina.$inferSelect;
export type OtConjunto = typeof otConjunto.$inferSelect;
export type OtPieza = typeof otPieza.$inferSelect;
export type AsignacionTrabajo = typeof asignacionTrabajo.$inferSelect;
export type TipoParada = typeof tipoParada.$inferSelect;
export type RegistroOperacion = typeof registroOperacion.$inferSelect;
export type Parada = typeof parada.$inferSelect;
export type ControlCalidad = typeof controlCalidad.$inferSelect;
export type TareaRevision = typeof tareaRevision.$inferSelect;
export type TareaRevisionItem = typeof tareaRevisionItem.$inferSelect;
export type ControlArmado = typeof controlArmado.$inferSelect;
export type Remito = typeof remito.$inferSelect;
export type RemitoItem = typeof remitoItem.$inferSelect;
export type Usuario = typeof usuario.$inferSelect;
export type Cliente = typeof cliente.$inferSelect;
export type Proveedor = typeof proveedor.$inferSelect;
export type ReservaStock = typeof reservaStock.$inferSelect;
export type PedidoCompra = typeof pedidoCompra.$inferSelect;
export type SolicitudCompra = typeof solicitudCompra.$inferSelect;
export type CotizacionCompra = typeof cotizacionCompra.$inferSelect;
export type PagoCompra = typeof pagoCompra.$inferSelect;
export type RecepcionCompra = typeof recepcionCompra.$inferSelect;
export type Feriado = typeof feriado.$inferSelect;
export type MontajeConjunto = typeof montajeConjunto.$inferSelect;
export type PlanAjuste = typeof planAjuste.$inferSelect;
export type ProveedorServicio = typeof proveedorServicio.$inferSelect;
export type ArticuloStock = typeof articuloStock.$inferSelect;

/**
 * Importación desde Excel (reorganización 30/10 §6.2): lo leído del archivo queda guardado entre la vista
 * previa y la confirmación. Al confirmar se vuelve a validar contra la base y se guarda el resultado.
 */
export const importacion = pgTable("importacion", {
  id: id(),
  archivo: text("archivo").notNull(),
  /** Filas leídas de las hojas "Piezas" y "Hoja de ruta", con su número de fila del Excel. */
  datos: jsonb("datos").$type<{ piezas: Record<string, unknown>[]; pasos: Record<string, unknown>[] }>().notNull(),
  usuarioId: text("usuario_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  aplicadaAt: timestamp("aplicada_at"),
  resultado: jsonb("resultado").$type<Record<string, number>>(),
});
