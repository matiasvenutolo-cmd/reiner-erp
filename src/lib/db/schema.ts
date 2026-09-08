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

export const proceso = pgTable("proceso", {
  id: text("id").primaryKey(), // código normalizado, ej. "CNC" (ver hallazgo 3.5)
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  ordenFlujo: integer("orden_flujo").notNull().default(0),
  esExterno: boolean("es_externo").notNull().default(false), // ej. Compras, Cromado tercerizado
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

// Nota: `tiempo_estandar` (RF-08) no es tabla: es una consulta agregada
// sobre `registro_operacion` agrupada por pieza × proceso × tipo, con
// promedio, mínimo, máximo y n_observaciones (ver docs/02-modelo-datos.md).

// ── Tipos inferidos (usados en toda la app) ─────────────────────────────

export type Modelo = typeof modelo.$inferSelect;
export type Configuracion = typeof configuracion.$inferSelect;
export type Conjunto = typeof conjunto.$inferSelect;
export type Proceso = typeof proceso.$inferSelect;
export type Dispositivo = typeof dispositivo.$inferSelect;
export type Procedimiento = typeof procedimiento.$inferSelect;
export type Pieza = typeof pieza.$inferSelect;
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
export type Usuario = typeof usuario.$inferSelect;
export type Cliente = typeof cliente.$inferSelect;
export type Proveedor = typeof proveedor.$inferSelect;
