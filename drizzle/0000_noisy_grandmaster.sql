CREATE TYPE "public"."estado_ot" AS ENUM('pendiente', 'en_curso', 'terminada');--> statement-breakpoint
CREATE TYPE "public"."instrumentacion" AS ENUM('instrumentada', 'sin_instrumentar');--> statement-breakpoint
CREATE TYPE "public"."resultado_control" AS ENUM('ok', 'no_ok');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('operario', 'taller', 'ingenieria', 'direccion');--> statement-breakpoint
CREATE TYPE "public"."tipo_control_calidad" AS ENUM('tolerada', 'no_tolerada');--> statement-breakpoint
CREATE TYPE "public"."tipo_modelo" AS ENUM('RD', 'PS');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento_stock" AS ENUM('ingreso', 'egreso', 'ajuste', 'retiro_ot');--> statement-breakpoint
CREATE TYPE "public"."tipo_pieza" AS ENUM('fabricada', 'comprada');--> statement-breakpoint
CREATE TYPE "public"."tipo_registro_operacion" AS ENUM('setup', 'ejecucion');--> statement-breakpoint
CREATE TABLE "cliente" (
	"id" text PRIMARY KEY NOT NULL,
	"razon_social" text NOT NULL,
	"numero_bejerman" text,
	"contacto" text,
	"pais" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracion" (
	"id" text PRIMARY KEY NOT NULL,
	"modelo_id" text NOT NULL,
	"codigo" text NOT NULL,
	"variante" text NOT NULL,
	"instrumentacion" "instrumentacion" NOT NULL,
	"nombre" text NOT NULL,
	CONSTRAINT "configuracion_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "conjunto" (
	"id" text PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "conjunto_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "conjunto_modelo" (
	"conjunto_id" text NOT NULL,
	"modelo_id" text NOT NULL,
	CONSTRAINT "conjunto_modelo_conjunto_id_modelo_id_pk" PRIMARY KEY("conjunto_id","modelo_id")
);
--> statement-breakpoint
CREATE TABLE "control_calidad" (
	"id" text PRIMARY KEY NOT NULL,
	"ot_pieza_id" text NOT NULL,
	"operacion_id" text,
	"tipo" "tipo_control_calidad" NOT NULL,
	"medida" text,
	"resultado" "resultado_control",
	"revisado_por" text
);
--> statement-breakpoint
CREATE TABLE "dispositivo" (
	"id" text PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	CONSTRAINT "dispositivo_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "modelo" (
	"id" text PRIMARY KEY NOT NULL,
	"codigo" "tipo_modelo" NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimiento_stock" (
	"id" text PRIMARY KEY NOT NULL,
	"pieza_id" text NOT NULL,
	"tipo" "tipo_movimiento_stock" NOT NULL,
	"cantidad" integer NOT NULL,
	"ot_pieza_id" text,
	"usuario_id" text NOT NULL,
	"ubicacion_id" text,
	"observacion" text,
	"fecha" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operacion" (
	"id" text PRIMARY KEY NOT NULL,
	"pieza_id" text NOT NULL,
	"proceso_id" text NOT NULL,
	"secuencia" integer DEFAULT 0 NOT NULL,
	"ops" integer,
	"dispositivo_id" text,
	"procedimiento_id" text
);
--> statement-breakpoint
CREATE TABLE "ot_conjunto" (
	"id" text PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"ot_maquina_id" text NOT NULL,
	"conjunto_id" text NOT NULL,
	"estado" "estado_ot" DEFAULT 'pendiente' NOT NULL,
	"fecha_inicio" timestamp,
	"fecha_fin" timestamp,
	CONSTRAINT "ot_conjunto_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "ot_maquina" (
	"id" text PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"numero_serie" text NOT NULL,
	"configuracion_id" text NOT NULL,
	"cliente_id" text,
	"orden_compra" text,
	"emitido_por" text,
	"fecha_emision" timestamp,
	"visado_por" text,
	"fecha_visado" timestamp,
	"plazo_entrega" text,
	"fecha_comprometida" timestamp,
	"pais" text DEFAULT 'Argentina',
	"estado" "estado_ot" DEFAULT 'pendiente' NOT NULL,
	"observaciones" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ot_maquina_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "ot_pieza" (
	"id" text PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"ot_conjunto_id" text NOT NULL,
	"pieza_id" text NOT NULL,
	"material" text,
	"cantidad_necesaria" integer NOT NULL,
	"stock_al_generar" integer DEFAULT 0 NOT NULL,
	"cantidad_a_fabricar" integer DEFAULT 0 NOT NULL,
	"estado" "estado_ot" DEFAULT 'pendiente' NOT NULL,
	"fecha_inicio" timestamp,
	"fecha_fin" timestamp,
	"piezas_ok" integer DEFAULT 0 NOT NULL,
	"piezas_no_ok" integer DEFAULT 0 NOT NULL,
	"piezas_defectuosas" integer DEFAULT 0 NOT NULL,
	"piezas_retrabajadas" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ot_pieza_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "parada" (
	"id" text PRIMARY KEY NOT NULL,
	"registro_operacion_id" text NOT NULL,
	"tipo_parada_id" text NOT NULL,
	"inicio" timestamp NOT NULL,
	"fin" timestamp,
	"duracion_seg" integer,
	"observacion" text
);
--> statement-breakpoint
CREATE TABLE "pieza" (
	"id" text PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"conjunto_id" text NOT NULL,
	"material" text,
	"revision" text,
	"tipo" "tipo_pieza" DEFAULT 'fabricada' NOT NULL,
	"es_de_stock" boolean DEFAULT false NOT NULL,
	"stock_minimo" integer DEFAULT 0 NOT NULL,
	"foto_pathname" text,
	CONSTRAINT "pieza_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "pieza_configuracion" (
	"pieza_id" text NOT NULL,
	"configuracion_id" text NOT NULL,
	"cantidad_necesaria" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "pieza_configuracion_pieza_id_configuracion_id_pk" PRIMARY KEY("pieza_id","configuracion_id")
);
--> statement-breakpoint
CREATE TABLE "procedimiento" (
	"id" text PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"titulo" text NOT NULL,
	"version" text,
	"fecha_revision" timestamp,
	"archivo_pathname" text,
	CONSTRAINT "procedimiento_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "proceso" (
	"id" text PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"orden_flujo" integer DEFAULT 0 NOT NULL,
	"es_externo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "proceso_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "proveedor" (
	"id" text PRIMARY KEY NOT NULL,
	"razon_social" text NOT NULL,
	"rubro" text,
	"condicion" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registro_operacion" (
	"id" text PRIMARY KEY NOT NULL,
	"ot_pieza_id" text NOT NULL,
	"operacion_id" text NOT NULL,
	"usuario_id" text NOT NULL,
	"tipo" "tipo_registro_operacion" NOT NULL,
	"inicio" timestamp NOT NULL,
	"fin" timestamp,
	"duracion_seg" integer,
	"piezas_ok" integer DEFAULT 0,
	"piezas_rechazadas" integer DEFAULT 0,
	"observacion" text
);
--> statement-breakpoint
CREATE TABLE "stock_pieza" (
	"pieza_id" text PRIMARY KEY NOT NULL,
	"cantidad_disponible" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tipo_parada" (
	"id" text PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	CONSTRAINT "tipo_parada_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "ubicacion" (
	"id" text PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	CONSTRAINT "ubicacion_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"email" text,
	"pin_hash" text,
	"password_hash" text,
	"rol" "rol_usuario" NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wip_pieza" (
	"pieza_id" text NOT NULL,
	"proceso_id" text NOT NULL,
	"cantidad" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "wip_pieza_pieza_id_proceso_id_pk" PRIMARY KEY("pieza_id","proceso_id")
);
--> statement-breakpoint
ALTER TABLE "configuracion" ADD CONSTRAINT "configuracion_modelo_id_modelo_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conjunto_modelo" ADD CONSTRAINT "conjunto_modelo_conjunto_id_conjunto_id_fk" FOREIGN KEY ("conjunto_id") REFERENCES "public"."conjunto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conjunto_modelo" ADD CONSTRAINT "conjunto_modelo_modelo_id_modelo_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_calidad" ADD CONSTRAINT "control_calidad_ot_pieza_id_ot_pieza_id_fk" FOREIGN KEY ("ot_pieza_id") REFERENCES "public"."ot_pieza"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_calidad" ADD CONSTRAINT "control_calidad_operacion_id_operacion_id_fk" FOREIGN KEY ("operacion_id") REFERENCES "public"."operacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_pieza_id_pieza_id_fk" FOREIGN KEY ("pieza_id") REFERENCES "public"."pieza"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_ubicacion_id_ubicacion_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_pieza_id_pieza_id_fk" FOREIGN KEY ("pieza_id") REFERENCES "public"."pieza"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_proceso_id_proceso_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."proceso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_dispositivo_id_dispositivo_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacion" ADD CONSTRAINT "operacion_procedimiento_id_procedimiento_id_fk" FOREIGN KEY ("procedimiento_id") REFERENCES "public"."procedimiento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ot_conjunto" ADD CONSTRAINT "ot_conjunto_ot_maquina_id_ot_maquina_id_fk" FOREIGN KEY ("ot_maquina_id") REFERENCES "public"."ot_maquina"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ot_conjunto" ADD CONSTRAINT "ot_conjunto_conjunto_id_conjunto_id_fk" FOREIGN KEY ("conjunto_id") REFERENCES "public"."conjunto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ot_maquina" ADD CONSTRAINT "ot_maquina_configuracion_id_configuracion_id_fk" FOREIGN KEY ("configuracion_id") REFERENCES "public"."configuracion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ot_maquina" ADD CONSTRAINT "ot_maquina_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ot_pieza" ADD CONSTRAINT "ot_pieza_ot_conjunto_id_ot_conjunto_id_fk" FOREIGN KEY ("ot_conjunto_id") REFERENCES "public"."ot_conjunto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ot_pieza" ADD CONSTRAINT "ot_pieza_pieza_id_pieza_id_fk" FOREIGN KEY ("pieza_id") REFERENCES "public"."pieza"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parada" ADD CONSTRAINT "parada_registro_operacion_id_registro_operacion_id_fk" FOREIGN KEY ("registro_operacion_id") REFERENCES "public"."registro_operacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parada" ADD CONSTRAINT "parada_tipo_parada_id_tipo_parada_id_fk" FOREIGN KEY ("tipo_parada_id") REFERENCES "public"."tipo_parada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pieza" ADD CONSTRAINT "pieza_conjunto_id_conjunto_id_fk" FOREIGN KEY ("conjunto_id") REFERENCES "public"."conjunto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pieza_configuracion" ADD CONSTRAINT "pieza_configuracion_pieza_id_pieza_id_fk" FOREIGN KEY ("pieza_id") REFERENCES "public"."pieza"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pieza_configuracion" ADD CONSTRAINT "pieza_configuracion_configuracion_id_configuracion_id_fk" FOREIGN KEY ("configuracion_id") REFERENCES "public"."configuracion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registro_operacion" ADD CONSTRAINT "registro_operacion_ot_pieza_id_ot_pieza_id_fk" FOREIGN KEY ("ot_pieza_id") REFERENCES "public"."ot_pieza"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registro_operacion" ADD CONSTRAINT "registro_operacion_operacion_id_operacion_id_fk" FOREIGN KEY ("operacion_id") REFERENCES "public"."operacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registro_operacion" ADD CONSTRAINT "registro_operacion_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_pieza" ADD CONSTRAINT "stock_pieza_pieza_id_pieza_id_fk" FOREIGN KEY ("pieza_id") REFERENCES "public"."pieza"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wip_pieza" ADD CONSTRAINT "wip_pieza_pieza_id_pieza_id_fk" FOREIGN KEY ("pieza_id") REFERENCES "public"."pieza"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wip_pieza" ADD CONSTRAINT "wip_pieza_proceso_id_proceso_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."proceso"("id") ON DELETE no action ON UPDATE no action;