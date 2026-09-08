# REINER · ERP de producción

Mockup navegable del ERP de producción a medida para REINER S.A. (metalúrgica,
fabricante de máquinas comprimidoras para la industria farmacéutica).

No es un prototipo descartable: es la aplicación real (Next.js + TypeScript,
Postgres en Neon vía Drizzle), corriendo hoy en la cuenta de Pinaro sin costo
(tiers gratuitos). Antes de la puesta en marcha real en taller se traspasa a
la cuenta de REINER — ver [docs/01-analisis.md §5.1](docs/01-analisis.md) y
[docs/04-runbook-traspaso.md](docs/04-runbook-traspaso.md).

Deploy: **https://reiner-erp.vercel.app**

## Empezar

```bash
npm install
npx vercel link            # una sola vez, conecta esta carpeta al proyecto de Vercel
npx vercel env pull .env.local --environment=preview
npm run dev
```

El selector de usuario arriba a la derecha cambia entre los cuatro roles
(RF-12): dirección, ingeniería, taller y operario — cada uno ve una
navegación distinta. **Operario** es la pantalla mobile (`/taller`), pensada
para probarse en un celular real o con el emulador angosto del navegador.

## Base de datos

Postgres real (Neon), conectado vía la integración de Storage de Vercel. El
schema vive en [`src/lib/db/schema.ts`](src/lib/db/schema.ts) — es la fuente
de verdad del modelo de datos (docs/02-modelo-datos.md).

```bash
npm run db:push      # aplica el schema a la base (drizzle-kit push)
npm run db:seed      # siembra maestros + usuarios/clientes/tipos de parada de demo
```

`db:push` alcanza para esta etapa (un solo entorno, sin historial de
producción real todavía). El día del traspaso a la cuenta de REINER conviene
pasar a `db:generate` + migraciones versionadas — ver el runbook.

## Qué hay hecho (Fase 1)

| Pantalla | Ruta | Cubre |
|---|---|---|
| Maestros | `/maestros` | RF-01 — modelo → configuración → conjunto → pieza → hoja de ruta |
| Generar OT | `/ot/nueva` | RF-02, RF-04 — explosión automática + cruce contra stock |
| Detalle de OT | `/ot/[id]` | RF-03 — jerarquía conjunto/pieza, cantidad a fabricar editable |
| Taller (operario) | `/taller` | RF-05, RF-06, RF-07 — carga de tiempos en 2-3 toques, paradas, piezas OK/rechazadas |
| Stock | `/stock` | RF-10 — stock disponible + WIP por etapa de proceso (hallazgo 3.1) |
| Avance | `/avance` | RF-09 — semáforo de fabricación por máquina |

Los datos maestros son reales: 454 piezas, 24 conjuntos y 627 operaciones
migrados de los Excel del cliente. Ver
[docs/migracion-datos.md](docs/migracion-datos.md) para el detalle de qué se
migró y qué asunciones quedaron pendientes de validar con Julián.

## Estructura

```
scripts/migrate-excel.ts     Migra los .xlsm del cliente a fixtures JSON tipadas
scripts/seed-db.ts           Siembra Postgres con esas fixtures + datos de demo
src/lib/db/schema.ts         Schema Drizzle — el modelo de datos real (docs/02)
src/lib/db/client.ts         Cliente Postgres (Neon)
src/lib/fixtures/data/*.json Datos migrados (generados, no editar a mano — sólo los usa el seed)
src/lib/data/*.ts            Capa de datos: consultas Drizzle contra Postgres
src/app/                     Rutas de Next.js (App Router)
src/app/actions/*.ts         Server Actions (mutaciones)
docs/                        Análisis, modelo de datos, plan y runbook de traspaso
```

## Re-generar las fixtures desde los Excel

Si cambian los Excel del cliente (en `~/Downloads/REINER`):

```bash
npm run db:migrate-excel   # reescribe src/lib/fixtures/data/*.json y docs/migracion-datos.md
npm run db:seed            # vuelve a sembrar Postgres (usa onConflictDoNothing, no duplica)
```

## Documentación del proyecto

- [docs/01-analisis.md](docs/01-analisis.md) — negocio, arquitectura, costos
- [docs/02-modelo-datos.md](docs/02-modelo-datos.md) — esquema completo
- [docs/03-plan-fase-1.md](docs/03-plan-fase-1.md) — plan de construcción
- [docs/04-runbook-traspaso.md](docs/04-runbook-traspaso.md) — checklist de traspaso a la cuenta de REINER
- [docs/migracion-datos.md](docs/migracion-datos.md) — reporte de la migración (auto-generado)
