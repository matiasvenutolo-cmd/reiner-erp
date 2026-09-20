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
  primaryKey,
  pgEnum,
  type AnyPgColumn,
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
]);

export const tipoModeloEnum = pgEnum("tipo_modelo", ["RD", "PS"]);

export const instrumentacionEnum = pgEnum("instrumentacion", [
  "instrumentada",
  "sin_instrumentar",
]);

export const tipoPiezaEnum = pgEnum("tipo_pieza", ["fabricada", "comprada"]);

export const estadoOtEnum = pgEnum("estado_ot", [
  "pendiente",
  "en_curso",
  "terminada",
]);

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
  // Dónde está parado hoy (Release 2, pedido de Horacio en taller): filtra la
  // cola de /taller a las piezas cuya operación actual cae en ese centro. Sin
  // asignar, el operario sigue viendo todas las piezas (comportamiento previo).
  centroTrabajoId: text("centro_trabajo_id").references((): AnyPgColumn => centroTrabajo.id),
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
 * Centro de trabajo (Release 2, pedido de Horacio — docs/05-backlog-release-2.md
 * §1, §3): lugar físico de taller con su propia cola de tareas. Sembrado 1:1
 * desde `proceso` por `scripts/seed-db.ts` — es una asunción de arranque, no
 * una confirmación de Julián/Horacio (ver §7 del backlog): puede haber
 * procesos que en la planta real comparten un mismo centro físico (ej. Torno
 * y Torno CNC bajo un único "Tornos"). Se puede reagrupar después sin tocar
 * `operacion` ni `registro_operacion`, sólo reapuntando `proceso.centroTrabajoId`.
 */
export const centroTrabajo = pgTable("centro_trabajo", {
  id: text("id").primaryKey(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  orden: integer("orden").notNull().default(0),
});

export const proceso = pgTable("proceso", {
  id: text("id").primaryKey(), // código normalizado, ej. "CNC" (ver hallazgo 3.5)
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  ordenFlujo: integer("orden_flujo").notNull().default(0),
  esExterno: boolean("es_externo").notNull().default(false), // ej. Compras, Cromado tercerizado
  centroTrabajoId: text("centro_trabajo_id").references(() => centroTrabajo.id),
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
  tipo: tipoPiezaEnum("tipo").notNull().default("fabricada"),
  esDeStock: boolean("es_de_stock").notNull().default(false),
  stockMinimo: integer("stock_minimo").notNull().default(0),
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
  dispositivoId: text("dispositivo_id").references(() => dispositivo.id),
  procedimientoId: text("procedimiento_id").references(() => procedimiento.id),
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
  codigo: text("codigo").notNull().unique(), // OTM6
  numeroSerie: text("numero_serie").notNull(),
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
 * Remito (Release 2, paquete 7 — pedido de Horacio: "generación de remitos
 * para movimiento de piezas"). Un remito = un movimiento físico de piezas
 * hacia afuera de la fábrica (a un cliente o a un proceso tercerizado), con
 * numeración propia y vista imprimible en `/remitos/[id]`. MVP: un remito
 * por movimiento — varias piezas en un mismo remito queda para cuando haga
 * falta (no lo pidieron explícitamente, ver docs/05-backlog-release-2.md §9).
 */
export const remito = pgTable("remito", {
  id: id(),
  numero: integer("numero").notNull().unique(),
  piezaId: text("pieza_id")
    .notNull()
    .references(() => pieza.id),
  cantidad: integer("cantidad").notNull(),
  destino: text("destino").notNull(),
  observacion: text("observacion"),
  usuarioId: text("usuario_id")
    .notNull()
    .references(() => usuario.id),
  fecha: timestamp("fecha").notNull().defaultNow(),
});

// Nota: `tiempo_estandar` (RF-08) no es tabla: es una consulta agregada
// sobre `registro_operacion` agrupada por pieza × proceso × tipo, con
// promedio, mínimo, máximo y n_observaciones (ver docs/02-modelo-datos.md).

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
export type PiezaConfiguracion = typeof piezaConfiguracion.$inferSelect;
export type Operacion = typeof operacion.$inferSelect;
export type Ubicacion = typeof ubicacion.$inferSelect;
export type StockPieza = typeof stockPieza.$inferSelect;
export type WipPieza = typeof wipPieza.$inferSelect;
export type MovimientoStock = typeof movimientoStock.$inferSelect;
export type OtMaquina = typeof otMaquina.$inferSelect;
export type OtConjunto = typeof otConjunto.$inferSelect;
export type OtPieza = typeof otPieza.$inferSelect;
export type TipoParada = typeof tipoParada.$inferSelect;
export type RegistroOperacion = typeof registroOperacion.$inferSelect;
export type Parada = typeof parada.$inferSelect;
export type ControlCalidad = typeof controlCalidad.$inferSelect;
export type TareaRevision = typeof tareaRevision.$inferSelect;
export type ControlArmado = typeof controlArmado.$inferSelect;
export type Remito = typeof remito.$inferSelect;
export type Usuario = typeof usuario.$inferSelect;
export type Cliente = typeof cliente.$inferSelect;
export type Proveedor = typeof proveedor.$inferSelect;
