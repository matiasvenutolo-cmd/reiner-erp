# Plan de construcción — mockup navegable de Fase 1

Objetivo: llegar a la demo de la 2ª quincena de septiembre con el circuito completo navegable,
cargado con los datos reales de los Excel de REINER.

## Orden de construcción

**0 · Andamiaje** — Next.js + TS + Tailwind, layout con navegación por rol, repo en GitHub,
deploy a Vercel con preview por rama. Capa de datos detrás de una interfaz (`lib/data/`) para que
el cambio de fixtures → Postgres sea un reemplazo de implementación, no una reescritura.

**1 · Migración de los Excel a fixtures tipadas** — script que lee los `.xlsm`, normaliza procesos
(hallazgo 3.5), separa universos RD/PS y emite JSON tipado. Es el mismo script que después va a
sembrar Postgres.

**2 · Maestros (RF-01)** — navegación modelo → configuración → conjunto → pieza, con la hoja de
ruta (operaciones) de cada pieza. Pantalla de escritorio. *Es lo primero que Julián va a querer ver.*

**3 · Generación de OT (RF-02, RF-03, RF-04)** — formulario "nueva máquina" (configuración +
n° de serie + cliente + OC) → explosión automática a OT de conjunto y OT de pieza, con cruce vivo
contra stock y `cant. a fabricar` propuesta y editable. Vista de la OT de pieza replicando el
formato impreso.

**4 · Pantalla del operario (RF-05, RF-06, RF-07)** — **la más importante.** Móvil, espejo del
formulario en papel (§3.4 del análisis). Flujo de 2–3 toques: elegir OT de pieza (o escanear QR) →
play setup / play fabricación → pausa con tipo de parada → fin con conteo de piezas OK/NO OK.

**5 · Stock (RF-10, RF-11)** — catálogo con foto, movimientos desde el celular, y la vista de WIP
por etapa de proceso (hallazgo 3.1).

**6 · Avance de fabricación (RF-09)** — semáforo por máquina: conjuntos y piezas pendientes /
en curso / terminadas. Es lo que Adrián y Horacio van a mirar todos los días.

**7 · Usuarios y roles (RF-12)** — cuatro perfiles; en el mockup, un selector de usuario para
demostrar las cuatro vistas sin fricción.

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
