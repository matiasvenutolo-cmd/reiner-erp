/**
 * Siembra Neon con los maestros migrados de los Excel + los datos de demo
 * (usuarios, tipos de parada, clientes) que antes vivían hardcodeados en
 * src/lib/data/usuarios.ts y src/lib/data/store.ts.
 *
 * Idempotente: usa upsert (onConflictDoUpdate/DoNothing) así que correrlo
 * de nuevo después de regenerar las fixtures no duplica nada.
 *
 * Uso: npx tsx scripts/seed-db.ts
 */
if (!process.env.DATABASE_URL_UNPOOLED) {
  process.loadEnvFile(".env.local");
}

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";
import { FIXTURES } from "../src/lib/data/fixtures-loader";
import { hashSecret } from "../src/lib/auth/hash";

// Credenciales de demo — ver docs/05-backlog-release-2.md §6. Rotar antes del
// traspaso a la cuenta de REINER (docs/04-runbook-traspaso.md).
const PASSWORD_DEMO_STAFF = "reiner2026";
const PIN_DEMO_OPERARIO = "1234";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("Falta DATABASE_URL_UNPOOLED en .env.local");
  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema });

  console.log("Sembrando maestros...");

  await db.insert(schema.modelo).values(FIXTURES.modelos).onConflictDoNothing();
  await db.insert(schema.configuracion).values(FIXTURES.configuraciones).onConflictDoNothing();
  await db.insert(schema.conjunto).values(FIXTURES.conjuntos).onConflictDoNothing();
  await db.insert(schema.conjuntoModelo).values(FIXTURES.conjuntoModelo).onConflictDoNothing();
  await db.insert(schema.proceso).values(FIXTURES.procesos).onConflictDoNothing();
  if (FIXTURES.dispositivos.length) {
    await db.insert(schema.dispositivo).values(FIXTURES.dispositivos).onConflictDoNothing();
  }

  // pieza no lleva los campos modeloId (no existe en el schema real, era
  // sólo una comodidad de la fixture) — se descarta al insertar.
  const piezasParaDb = FIXTURES.piezas.map(({ modeloId: _modeloId, ...resto }) => resto);
  await db.insert(schema.pieza).values(piezasParaDb).onConflictDoNothing();

  if (FIXTURES.piezaConfiguracion.length) {
    await db.insert(schema.piezaConfiguracion).values(FIXTURES.piezaConfiguracion).onConflictDoNothing();
  }
  if (FIXTURES.operaciones.length) {
    await db.insert(schema.operacion).values(FIXTURES.operaciones).onConflictDoNothing();
  }
  if (FIXTURES.stockPieza.length) {
    await db.insert(schema.stockPieza).values(FIXTURES.stockPieza).onConflictDoNothing();
  }
  if (FIXTURES.wipPieza.length) {
    await db.insert(schema.wipPieza).values(FIXTURES.wipPieza).onConflictDoNothing();
  }

  console.log("Sembrando usuarios de demo...");
  const passwordHashDemo = await hashSecret(PASSWORD_DEMO_STAFF);
  const pinHashDemo = await hashSecret(PIN_DEMO_OPERARIO);
  const USUARIOS_DEMO = [
    { id: "adrian", nombre: "Adrián", email: "adrian@reiner.com.ar", rol: "direccion" as const, passwordHash: passwordHashDemo, pinHash: null },
    { id: "julian", nombre: "Julián", email: "julian@reiner.com.ar", rol: "ingenieria" as const, passwordHash: passwordHashDemo, pinHash: null },
    { id: "horacio", nombre: "Horacio", email: "horacio@reiner.com.ar", rol: "taller" as const, passwordHash: passwordHashDemo, pinHash: null },
    { id: "nico", nombre: "Nico", email: null, rol: "operario" as const, passwordHash: null, pinHash: pinHashDemo },
  ];
  // onConflictDoUpdate (no DoNothing): si ya existían de una siembra previa a
  // que hubiera credenciales, esto les asigna la clave/PIN de demo en vez de
  // dejarlos sin poder loguearse.
  for (const u of USUARIOS_DEMO) {
    await db
      .insert(schema.usuario)
      .values(u)
      .onConflictDoUpdate({
        target: schema.usuario.id,
        set: { passwordHash: u.passwordHash, pinHash: u.pinHash },
      });
  }

  console.log("Sembrando tipos de parada...");
  const TIPOS_PARADA = [
    { id: "falta-material", codigo: "FALTA_MATERIAL", nombre: "Falta de material" },
    { id: "falla-maquina", codigo: "FALLA_MAQUINA", nombre: "Falla de máquina/herramienta" },
    { id: "espera-instrucciones", codigo: "ESPERA_INSTRUCCIONES", nombre: "Espera de instrucciones" },
    { id: "cambio-turno", codigo: "CAMBIO_TURNO", nombre: "Cambio de turno" },
    { id: "otra", codigo: "OTRA", nombre: "Otra" },
  ];
  await db.insert(schema.tipoParada).values(TIPOS_PARADA).onConflictDoNothing();

  console.log("Sembrando clientes de demo...");
  // REINER todavía no envió su maestro real de clientes (insumo pendiente #10).
  const CLIENTES_DEMO = [
    { id: "casasco", razonSocial: "Laboratorios Casasco" },
    { id: "avellaneda", razonSocial: "Laboratorio de Avellaneda (parque alemán)" },
    { id: "otro", razonSocial: "Otro cliente" },
  ];
  await db.insert(schema.cliente).values(CLIENTES_DEMO).onConflictDoNothing();

  const counts = await Promise.all([
    db.$count(schema.pieza),
    db.$count(schema.conjunto),
    db.$count(schema.operacion),
    db.$count(schema.stockPieza),
    db.$count(schema.usuario),
  ]);
  console.log("Listo:", {
    piezas: counts[0],
    conjuntos: counts[1],
    operaciones: counts[2],
    stockPieza: counts[3],
    usuarios: counts[4],
  });

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
