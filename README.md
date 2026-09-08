# REINER · ERP de producción

Mockup navegable del ERP de producción a medida para REINER S.A. (metalúrgica,
fabricante de máquinas comprimidoras para la industria farmacéutica).

No es un prototipo descartable: es la aplicación real (Next.js + TypeScript),
con datos mock cargados de los Excel reales del cliente en lugar de Postgres.
El día que se valide con REINER, se conecta Neon y el resto del código no
cambia — ver [docs/01-analisis.md §6](docs/01-analisis.md).

## Empezar

```bash
npm install
npm run dev
```

Abre en `http://localhost:3000` (o el puerto que uses). No hace falta base de
datos ni variables de entorno para correr el mockup.

El selector de usuario arriba a la derecha cambia entre los cuatro roles
(RF-12): dirección, ingeniería, taller y operario — cada uno ve una
navegación distinta. **Operario** es la pantalla mobile (`/taller`), pensada
para probarse en un celular real o con el emulador angosto del navegador.

## Qué hay hecho (Fase 1)

| Pantalla | Ruta | Cubre |
|---|---|---|
| Maestros | `/maestros` | RF-01 — modelo → configuración → conjunto → pieza → hoja de ruta |
| Generar OT | `/ot/nueva` | RF-02, RF-04 — explosión automática + cruce contra stock |
| Detalle de OT | `/ot/[id]` | RF-03 — jerarquía conjunto/pieza, cantidad a fabricar editable |
| Taller (operario) | `/taller` | RF-05, RF-06, RF-07 — carga de tiempos en 2-3 toques, paradas, piezas OK/rechazadas |
| Stock | `/stock` | RF-10 — stock disponible + WIP por etapa de proceso (hallazgo 3.1) |
| Avance | `/avance` | RF-09 — semáforo de fabricación por máquina |

Los datos son reales: 454 piezas, 24 conjuntos y 627 operaciones migrados de
los Excel del cliente. Ver [docs/migracion-datos.md](docs/migracion-datos.md)
para el detalle de qué se migró y qué asunciones quedaron pendientes de
validar con Julián.

## Estructura

```
scripts/migrate-excel.ts     Migra los .xlsm del cliente a fixtures JSON tipadas
src/lib/db/schema.ts         Schema Drizzle — el modelo de datos real (docs/02)
src/lib/fixtures/data/*.json Datos migrados (generados, no editar a mano)
src/lib/data/*.ts            Capa de datos: hoy lee fixtures, mañana hace queries a Postgres
src/app/                     Rutas de Next.js (App Router)
src/app/actions/*.ts         Server Actions (mutaciones)
docs/                        Análisis, modelo de datos, plan y runbook de traspaso
```

## Re-generar las fixtures

Si cambian los Excel del cliente (en `~/Downloads/REINER`), correr:

```bash
npx tsx scripts/migrate-excel.ts
```

Esto reescribe `src/lib/fixtures/data/*.json` y `docs/migracion-datos.md`.

## Estado del store transaccional

Las OT, registros de operación y paradas viven en memoria del proceso de
Next.js (`src/lib/data/store.ts`), no en una base de datos — se pierden en
cada restart del servidor. Es correcto para esta etapa (ver
[docs/01-analisis.md §5.1](docs/01-analisis.md)); antes de la puesta en
marcha real en taller esto se reemplaza por Postgres siguiendo
[docs/04-runbook-traspaso.md](docs/04-runbook-traspaso.md).

## Documentación del proyecto

- [docs/01-analisis.md](docs/01-analisis.md) — negocio, arquitectura, costos
- [docs/02-modelo-datos.md](docs/02-modelo-datos.md) — esquema completo
- [docs/03-plan-fase-1.md](docs/03-plan-fase-1.md) — plan de construcción
- [docs/04-runbook-traspaso.md](docs/04-runbook-traspaso.md) — checklist de traspaso a la cuenta de REINER
- [docs/migracion-datos.md](docs/migracion-datos.md) — reporte de la migración (auto-generado)
