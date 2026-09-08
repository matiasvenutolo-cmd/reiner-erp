# REINER ERP — Análisis y decisiones de arquitectura

> Fuentes: `REINER_reunion_2026-09-04.pdf` (24 pág.), `PI 04 - Procedimiento de Ordenes de Trabajo.pdf`,
> `CS - 03 - Stock de Piezas.xlsm`, `OT - Mx - OC - BASE GENERAL.xlsm`.
> Originales en `~/Downloads/REINER/`.

## 1. El negocio en cinco líneas

REINER S.A. es una metalúrgica de San Martín (Bs. As.), 12–14 personas, que fabrica máquinas
comprimidoras para laboratorios farmacéuticos. Dos familias de modelo: **RD** (2018, diseño
estabilizado) y **PS/APS** (2019–20, en estandarización). Fabrica 2–3 máquinas por año, con un
ciclo de 3–6 meses por máquina.

**Esto no es un ERP de alto volumen transaccional: es un sistema de proyecto de fabricación de
ciclo largo con muchísimo detalle por unidad.** Esa frase debe gobernar cada decisión de diseño.

## 2. El problema raíz

Toda la cadena de dolores del cliente cuelga de un solo dato que hoy no existe: **el tiempo real
por operación**. Sin él no hay tiempos estándar; sin tiempos estándar no se puede estimar fecha
de entrega; sin fecha de entrega confiable Adrián cotiza tres meses y las piezas ni siquiera
bajaron a taller.

El dato se anota hoy a mano en papel y el papel queda con el operario. Nunca se vuelca.

→ **RF-05 (carga de tiempos por el operario desde el celular) es el requerimiento pivote del
proyecto entero.** Todo lo demás de Fase 1 existe para hacerlo posible.

## 3. Hallazgos del análisis de los Excel

Lo que sigue **no está en el PDF de la reunión** y sale de abrir los `.xlsm`. Cambia el modelo de
datos y adelanta trabajo de Fase 2 a Fase 1.

### 3.1 El "stock" es en realidad WIP por etapa de proceso

`CS-03 / Stock de Piezas` tiene una fila por pieza y **18 columnas de proceso**:

    Fundicion · Fierro · Torno · CENTRO CNC · TORNO CNC · Corte Por Hilo · Fresado · Mecanizado ·
    Tallado · Soldadura · Templado · Rectificado · Pulido · Anonizado · Pavonado · Cromado ·
    Grabado Laser · Finalizado

La columna `STOCK` (disponible) es la que acumula lo que llegó a `Finalizado`. Es decir: REINER ya
piensa en **dónde está parada cada pieza dentro del flujo**, no sólo cuántas hay.

Consecuencia de diseño: `stock` no es un escalar por pieza, es una **posición por etapa**. El
semáforo de avance por máquina (RF-09) y el tablero de WIP salen casi gratis de ahí.

### 3.2 El BOM por configuración ya está modelado

`Config Piezas`: 212 filas, 15 conjuntos, con columnas `PS 120` / `PS 124` en `Si`/`No`.
Códigos de modelo = **Tipo + Modelo + Instrumentación** → `PS120I`, `PS120S`, `PS124I`, `PS124S`.

Distribución por conjunto: Compresión 43, Cabezal 32, Cargadora Forzada 32, Cerramiento 26,
Caja Reductora 16, Estructura 12, Dosificación 9, Plato de Levas 8, Mando Principal 7,
Canal de Descarga 6, Tolva Carga Forzada 5, Aspiración 5, Carga 4, Eyección 4, Descartador 3.

En Excel, agregar una variante nueva = agregar una columna (no escala). En la base es una **N:M
`pieza ↔ configuracion` con cantidad**.

### 3.3 El routing ya existe

`Lista de Piezas`: 640 filas = **211 piezas distintas × su secuencia de procesos**, con columnas
`Dispositivo` y `Procedimiento` ya previstas (hoy casi vacías, se llenan después). Esto es la tabla
`operacion` completa y migrable hoy.

### 3.4 La pantalla del operario ya está diseñada — en papel

La hoja `OT PIEZA` que se imprime y baja a taller tiene exactamente estos campos:

| Bloque | Campos |
|---|---|
| Cabecera | NOMBRE · COD PIEZA · REV · MATERIAL · CANT A FAB · CONJUNTO · OTC · CLIENTE · PROCEDIMIENTO · FECHA INICIO |
| Hoja de ruta | PROCESO DE FABRICACIÓN · OPS · OPERARIO · **ARMADO DE MAQ** · **FABRICACIÓN** · **ERRORES/PARADAS (tipo + tiempo)** |
| Cierre | FECHA FINAL · RELEVO |
| Calidad | MEDIDAS TOLERADAS (medida/OK/NO OK) · MEDIDAS NO TOLERADAS · REVISÓ |
| Conteo | PIEZAS OK · PIEZAS NO OK · PIEZAS DEFECTUOSAS · PIEZAS RETRABAJADAS |

**Decisión de diseño:** la pantalla móvil debe ser un espejo literal de este formulario. El riesgo
#1 del proyecto es que el taller no adopte la carga digital; replicar el papel que ya conocen es la
mitigación más barata y más efectiva que tenemos.

Corolario: **RF-07 (piezas buenas/rechazos) y RF-20 (checklist de calidad) suben de Fase 2 a
Fase 1**, porque el dato ya se recoge en el mismo formulario.

### 3.5 Deuda de datos a saldar antes de cargar tiempos

Los nombres de proceso están sucios: **36 variantes distintas para ~20 procesos reales**.

    CNC (105) · cnc (7) · Cnc (1)        →  CNC
    Compras (83) · compras (96) · Comprar (4)  →  Compras
    Torno (99) · torno (6) · "Torno " (1)      →  Torno
    Cromado (34) · cromado (6) · cromado/anodizado (1)
    anodizado (2) · Anodizado (1)  ·  Corte Por Hilo (47) · Corte por hilo (1) · corte por hilo (1)
    Rectificado (13) · rectificado (1)  ·  Pavonado (18) · pavonado (2)
    Pintura (12) · pintura (1)  ·  3D (1) · 3d (1)  ·  Taller (21) · taller (23)

**Si no se normaliza antes de que empiece la carga, los tiempos estándar salen fragmentados** (el
promedio de "CNC" se calcula sobre 105 filas y el de "cnc" sobre 7) y el sistema pierde credibilidad
en la primera demo. Tarea: maestro de procesos + tabla de mapeo en el script de migración.

### 3.6 Dos codificaciones conviven

- Interna del sistema: `OTM6` → `OTM6C01` → `OTM6C01P3` (máquina → conjunto → pieza).
- Nombre de archivo según PI-04: `OT - M6 - 008` (código de máquina + **número de orden de compra**).

Hay que decidir con Julián si la OC forma parte de la identidad de la OT o es sólo un atributo.
Propuesta: atributo (`ot_maquina.orden_compra`), y el código canónico es `OTM6`.

## 4. Lo que el PI-04 aporta

El procedimiento formaliza el circuito y da dos reglas que el PDF no explicita:

1. **El stock se actualiza *antes* de generar las OT** (Datos → Actualizar todo). En el sistema esto
   desaparece: el cruce contra stock es en vivo.
2. **`Cant a Fab` se ingresa manualmente**, no es `Cant Necesaria − Stock` automático. Horacio/Julián
   deciden fabricar de más para piezas troncales. → El sistema debe **proponer** la cantidad y dejarla
   editable, nunca imponerla.

## 5. Decisiones de arquitectura

| Capa | Decisión | Fundamento |
|---|---|---|
| App | Next.js App Router + TypeScript, monorepo único | Server Actions cubren casi todo el CRUD; una sola app responsive sirve escritorio (ingeniería) y móvil (taller) |
| DB | **Vercel Postgres (Neon)** + Drizzle ORM | BOM multinivel, explosión de OT y trazabilidad son joins puros. Drizzle deja las migraciones versionadas en el repo |
| Auth | Auth.js v5, credenciales + roles | Operario: PIN corto en el celular. Ingeniería/dirección: mail + password |
| Archivos | Vercel Blob | Fotos de piezas (RF-11), planos, PDFs de procedimientos |
| Jobs | Vercel Cron | Alertas de mantenimiento y calibración (RF-17), Fase 2 |
| Deploy | GitHub → Vercel, preview por rama | Julián y Horacio revisan cada avance sin esperar la reunión quincenal |
| PWA | Manifest + service worker | Ícono en el celular sin pasar por tienda; requisito implícito de la reunión |

**Roles mínimos:** `operario` (carga tiempos y movimientos de stock, ve lo suyo) · `taller` (+ avance
general y asignación) · `ingenieria` (maestros, OT, stock completo) · `direccion` (todo + indicadores).

### 5.1 Estrategia de infraestructura y costos

**Principio: el desarrollo no cuesta nada; el costo arranca cuando la infra pasa a la cuenta de REINER.**

**Etapa 1 — desarrollo y demos (sept a mediados de octubre). Costo: USD 0.**
Todo en la cuenta del implementador, en tiers gratuitos: Vercel Hobby + Neon Free (0.5 GB storage,
100 CU-horas/mes, scale-to-zero) + Vercel Blob free. El volumen de REINER entra holgado: 211 piezas,
2-3 maquinas/ano, anos de registros de operacion son pocos MB.

**Etapa 2 — traspaso a REINER (2a quincena de octubre, ANTES de la puesta en marcha en taller).**
Cuenta propia de REINER: Vercel Pro (USD 20/mes) + Neon Launch (~USD 5/mes a este volumen,
pay-as-you-go). **Total ~USD 25/mes.**

**Por que el traspaso va en octubre y no en diciembre.** El cronograma original ubica el "despliegue
en hosting definitivo" en diciembre, pero la puesta en marcha real en taller es la 2a quincena de
octubre. Si el taller carga tiempos reales durante dos meses en la cuenta de desarrollo, esos datos
irremplazables viven todo ese tiempo en un tier con **6 horas de ventana de recuperacion**, y ademas
en diciembre hay que migrar una base de produccion viva. Traspasar antes del arranque de carga
convierte la migracion en un tramite (la base todavia tiene datos de prueba) y pone los datos reales
sobre backups decentes desde el primer registro.

**Por que se paga (los tres motivos, en orden de peso):**
1. **Ventana de recuperacion.** Neon Free retiene 6 horas de historia. El sistema va a ser la unica
   fuente de trazabilidad de maquinas que quedan en servicio 8+ anos. Neon Launch sube a 7 dias.
2. **El cap de compute es duro y suspende el servicio.** Agotar las 100 CU-horas en un mes pico
   significa operarios que no pueden fichar el inicio de una operacion. Es exactamente el momento en
   que el sistema perderia la confianza que le costo ganar.
3. **Terminos de servicio.** Vercel Hobby es explicitamente no-comercial, y define uso comercial de
   forma amplia (incluye el proyecto por el que se le pago a quien lo desarrollo). Un ERP en
   produccion de una empresa requiere Pro.

**Requisitos de diseno que impone el traspaso** (respetarlos desde el commit 1):
- Migraciones Drizzle y seed script **versionados en el repo**. Nada configurado a mano en un dashboard.
- `.env.example` completo y documentado. Cero secretos o IDs de proyecto hardcodeados.
- Sin dependencias de la cuenta del implementador: dominios, URLs absolutas, IDs de proyecto.
- La transferencia de proyecto de Vercel arrastra env vars y dominios, **pero las integraciones hay
  que volver a agregarlas del otro lado**. La integracion de Neon es una de ellas: al re-agregarla,
  cuidado con el prefijado de variables si quedan las viejas.
- Para la base, no depender de transferencia entre orgs de Neon: `pg_dump` / `pg_restore` a un
  proyecto nuevo en la org de REINER. Con el volumen de datos al momento del corte es trivial.
- El repo de GitHub se transfiere a la org de REINER al cierre (el sistema queda en propiedad de REINER).

**Como plantearselo a Adrian.** No como una objecion de costo al inicio del proyecto, sino como parte
de la puesta en produccion de octubre/noviembre, cuando ya vio el sistema funcionando. USD 25/mes para
una empresa que invirtio en instalaciones y maquinaria los ultimos 4 anos no es una discusion; pero
plantearlo en septiembre, antes de que haya nada que mostrar, si puede generar friccion innecesaria.

> El checklist paso a paso del traspaso esta en [`04-runbook-traspaso.md`](04-runbook-traspaso.md).

**Fuera de alcance (acordado en la reunión, dejarlo escrito):** integración con Bejerman, rediseño de
layout de planta, certificación ISO 9001. Lo único que sí se hace: `cliente.numero_bejerman` como
campo, para no bloquear una integración futura.

## 6. Estrategia de mockup

El mockup **es la app real con la capa de datos mockeada**, no un prototipo aparte. Mismo repo,
mismas rutas, mismos componentes; las fixtures se cargan de los `.xlsm` reales (211 piezas, 15
conjuntos, códigos verdaderos como `PS01CB124s001` y `RD001108S001`).

Dos razones: la demo con Julián se hace con *sus* piezas y *sus* códigos, lo que es mucho más
convincente que datos ficticios; y al validar no se tira nada — se enchufa Postgres y sigue.
