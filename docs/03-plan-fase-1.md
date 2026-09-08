# Plan de construcción — mockup navegable de Fase 1

Objetivo: llegar a la demo de la 2ª quincena de septiembre con el circuito completo navegable,
cargado con los datos reales de los Excel de REINER.

## Orden de construcción

**✅ 0 · Andamiaje** — Next.js 16 + TS + Tailwind v4, layout con navegación por rol. Capa de datos
detrás de una interfaz (`src/lib/data/`) para que el cambio de fixtures → Postgres sea un reemplazo
de implementación, no una reescritura. Schema Drizzle ya escrito (`src/lib/db/schema.ts`) aunque
todavía no hay conexión real. Pendiente: repo en GitHub y deploy a Vercel con preview por rama.

**✅ 1 · Migración de los Excel a fixtures tipadas** — `scripts/migrate-excel.ts`. Normaliza procesos
(hallazgo 3.5), unifica el universo de piezas por prefijo de código (no por hoja de origen — hay
piezas RD compartidas dentro del BOM de PS) y emite JSON tipado + un reporte de asunciones para
Julián (`docs/migracion-datos.md`). 454 piezas, 24 conjuntos, 627 operaciones migradas.

**✅ 2 · Maestros (RF-01)** — `/maestros`, `/maestros/[conjuntoId]`, `/maestros/pieza/[piezaId]`.
Navegación modelo → configuración → conjunto → pieza, con la hoja de ruta de cada pieza.

**✅ 3 · Generación de OT (RF-02, RF-03, RF-04)** — `/ot/nueva` → `/ot/[id]`. Explosión automática
a OT de conjunto y OT de pieza, cruzando contra stock en vivo; sólo se genera OT de pieza cuando
`cantidad_necesaria > stock` (igual que la macro real). Cantidad a fabricar editable.

**✅ 4 · Pantalla del operario (RF-05, RF-06, RF-07)** — `/taller` → `/taller/[otPiezaId]`. Mobile,
2-3 toques: elegir OT de pieza → iniciar setup/fabricación → pausar con tipo de parada → finalizar
con piezas OK/rechazadas (y el cierre completo OK/NO OK/defectuosas/retrabajadas en la última
operación de la hoja de ruta). Un operario no puede tener dos operaciones abiertas a la vez —
asunción a confirmar con Horacio, ver preguntas abajo. Pendiente: código QR para elegir la OT.

**✅ 5 · Stock (RF-10)** — `/stock`. Búsqueda de pieza + tablero de WIP por etapa de proceso
(hallazgo 3.1). Pendiente: RF-11 (foto de cada pieza — necesita Vercel Blob, se agrega al conectar
infraestructura real).

**✅ 6 · Avance de fabricación (RF-09)** — `/avance`. Semáforo por máquina con barra de progreso
(piezas terminadas / total) calculado dinámicamente a partir de los registros de operación — el
estado de pieza/conjunto/máquina no se guarda, se deriva siempre del histórico.

**✅ 7 · Usuarios y roles (RF-12)** — selector de usuario en el header, cuatro perfiles con
navegación propia. Es sólo wayfinding, no seguridad: cualquier ruta es accesible por URL directa
sin importar el rol activo — no hay que confundirlo con control de acceso real (eso llega con
Auth.js al conectar Postgres).

## Cómo seguir desde acá

- Repo en GitHub + deploy a Vercel (cierra el paso 0).
- Código QR en la OT impresa para elegir la pieza en `/taller` sin buscar en la lista (mencionado
  como mejora en la reunión, §12 del PDF).
- RF-11 (foto de pieza) y RF-08 en su forma completa (el cálculo de tiempo estándar ya existe en
  `src/lib/data/ejecucion.ts`, falta exponerlo de forma más visible en `/maestros/pieza/[id]`).
- Validar con Julián/Horacio las asunciones del reporte de migración antes de mostrar la demo como
  definitiva — son suposiciones razonables, no confirmaciones.

## Reglas de diseño no negociables

1. **Si el operario lo carga, el operario o su jefe ve algo útil el mismo día.** Regla de contención
   del propio PDF. Cualquier campo que no devuelva valor visible se corta.
2. **Dos o tres toques máximo** en la pantalla de taller. Nada más se va a usar.
3. **Nunca imponer una cantidad a fabricar**: proponer y dejar editar (PI-04 §4.2.1).
4. **Rango, no promedio**, en los tiempos estándar (mín–máx–n).
5. **Vocabulario del cliente** en toda la UI: conjunto, OT, setup/armado de máquina, isla, dispositivo,
   fierrera, postizo. El glosario del PDF es la fuente.

## Preguntas para la próxima reunión (además de las de §16 del PDF)

- ¿`Dosificacion` y `Dosificador` son el mismo conjunto? ¿`Descartador` es conjunto propio o parte de otro?
- En `Lista de Piezas`, ¿`OPS` vacío significa 1 o "no medido"?
- ¿La OC forma parte de la identidad de la OT o es un atributo? (dos codificaciones conviven, §3.6)
- Las 18 columnas de proceso de `CS-03`, ¿son un flujo secuencial fijo o cada pieza usa las suyas?
- ¿Un operario trabaja en una sola OT por vez o alterna? (define si `registro_operacion` admite solapamiento)
