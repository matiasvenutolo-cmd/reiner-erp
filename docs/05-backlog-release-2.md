# Backlog Release 2 — devolución del cliente (2026-09-19)

> Fuente: comentarios crudos de Julián (ingeniería) y Horacio (producción, logística,
> taller) tras la 1ª demo, más las respuestas a las 4 preguntas de validación del
> primer informe. Este documento los reordena en funcionalidades — el cliente los dio
> por área de trabajo, no por feature, y varios piden lo mismo desde ángulos distintos.

## 0 · El circuito de Fase 1 queda validado

Las 4 preguntas del primer informe (`docs/entregables/REINER - Como se arma una OT
(OTM12).docx`, sección 04) se respondieron el 2026-09-19:

| Pregunta | Respuesta |
|---|---|
| ¿La explosión de OTM12 (17 conjuntos, 122 piezas a fabricar) corresponde a una PS124 Instrumentada? | **Sí, correcto.** |
| ¿Los 5 conjuntos sin piezas a fabricar (stock los cubre) tienen sentido? | **Sí** — aclaración importante: en la planta real es raro que un conjunto *entero* esté en estantería; lo común es tener piezas sueltas cubiertas dentro de un conjunto, no el conjunto completo. No cambia el modelo (ya funciona pieza por pieza), pero conviene no mostrar el dato como "conjunto resuelto por stock" sino como resultado agregado. |
| ¿La hoja de ruta de "Cabezal parte superior B-24" (Torno → Centro CNC → Roscado → Cromado → Grabado láser) es la secuencia real? | **Sí**, y agrega una regla nueva (ver §4 Logística/Calidad más abajo): hay control entre procesos internos (OK / NO OK / a retrabajar) y para procesos externos hace falta un control documentado que permita reclamar a tiempo al proveedor. |
| ¿La cantidad a fabricar debe quedar siempre editable? | **Sí, confirmado** — ya es así en el sistema (PI-04 §4.2.1), no requiere cambios. |

**Consecuencia:** el circuito de Fase 1 (explosión, hoja de ruta, cantidad editable) está
validado con Julián y Horacio. Lo que sigue es exclusivamente backlog de Release 2, no
correcciones sobre lo ya construido.

Las 5 preguntas que seguían abiertas en `docs/03-plan-fase-1.md` (Dosificación/Dosificador,
OPS vacío, identidad OC, columnas de CS-03, un operario ¿una OT o varias?) **siguen sin
responder** — no vinieron en esta tanda de comentarios. Quedan pendientes para la próxima
reunión, ver §5.

## 1 · Hallazgo transversal: tres pedidos distintos comparten una sola base de datos

Antes del detalle por área — tres piezas de feedback que llegaron por separado en realidad
piden la misma pieza de modelo de datos, y conviene construirla una sola vez:

- **"Centro de trabajo"** no existe hoy como concepto (`proceso` es un paso de la hoja de
  ruta, no un lugar físico con cola de tareas). Lo piden tres veces con distinto lenguaje:
  - Horacio (Producción): *"visualización por centros de trabajo cantidad de tareas
    disponibles al momento y futuras"*
  - Horacio (Taller): *"que las piezas que le aparezcan al operario sean las asignadas, o
    las que figuren en el centro de trabajo en el que se encuentra"*
  - Implícito en el Gantt y en el panel de indicadores (ambos necesitan agrupar por centro).

  → Se construye **una vez**: tabla `centro_trabajo` (o se reusa/extiende `ubicacion`,
  a confirmar con Horacio — ver pregunta en §5), `proceso.centroTrabajoId`, y una cola por
  centro que separa "disponible ahora" (predecesor de la hoja de ruta ya terminado) de
  "disponible a futuro" (bloqueado por un proceso anterior aún no cerrado).

- **"Notas por pieza"** — Julián pide tres casillas separadas (material, observaciones de
  versión/diseño, observaciones de producción). `material` ya existe en el schema
  (`pieza.material`) pero no está expuesto para editar en `/maestros/pieza/[id]`. Las otras
  dos son la misma necesidad — una bitácora con autor y fecha, no un campo que se
  sobrescribe — diferenciada sólo por `tipo` (ingeniería vs. producción). Se construye como
  **una** tabla `pieza_nota` (piezaId, tipo enum, texto, usuarioId, fecha), no dos campos de
  texto sueltos: así ingeniería ve el historial de cambios de diseño sin perder versiones
  anteriores, que es literalmente lo que Julián pidió ("cambios que fue sufriendo el
  diseño").

- **Control de procesos externos** — lo confirma Julián en la respuesta de hoja de ruta
  (§0) y lo pide Horacio en Logística (§4): un control documentado en cada ingreso de
  materia prima o vuelta de un proceso tercerizado, para poder reclamarle al proveedor a
  tiempo. Es la misma funcionalidad vista desde ingeniería (calidad del proceso) y desde
  logística (control de ingreso) — un solo registro (`control_calidad` ya existe con esta
  forma; falta enlazarlo a `movimiento_stock` cuando el ingreso viene de un proceso externo,
  y a `proveedor`).

## 2 · Ingeniería (Julián)

| Pedido | Qué implica | Tamaño |
|---|---|---|
| Dividir maestros por máquina RD/PS primero, subconjuntos después | Reordenar la navegación de `/maestros` — hoy el primer nivel ya es modelo, revisar si el reclamo es sobre jerarquía visual (menos clics) más que sobre estructura | S |
| Casilla de material por pieza | Ya existe en el schema (`pieza.material`), falta exponerla editable en `/maestros/pieza/[id]` | S |
| Observaciones de versión/diseño por pieza + observaciones de producción por pieza | Tabla `pieza_nota` (ver §1) + UI de bitácora en la ficha de pieza, visible desde maestros y desde taller | M |

## 3 · Producción (Horacio)

| Pedido | Qué implica | Tamaño |
|---|---|---|
| Vista por centro de trabajo: tareas disponibles ahora / a futuro, reordenables | Requiere `centro_trabajo` (§1) + campo de prioridad/orden manual sobre la cola de OT de pieza por centro | L |
| Gantt por pieza + (a futuro) simulador de cotización sin generar OT | Depende de tiempos estándar (ya existe, RF-08) y de una lógica de scheduling que hoy no existe — el propio Horacio lo marca como "en un futuro". Se propone dejarlo para **Fase 3**, no Release 2 | L — Fase 3 |
| Stock / stock futuro / stock comprometido | "Comprometido" sale de sumar `cantidad_necesaria` de OT de pieza abiertas por pieza (dato que ya existe, falta agregarlo). "Futuro" es más ambiguo — ¿WIP a punto de terminar, o compras en camino? No hay hoy seguimiento de órdenes de compra a proveedor. Ver pregunta en §5 | M (comprometido) / L (futuro, si incluye compras) |
| Editar estado de piezas desde la lista, sin entrar a cada una (sólo Horacio) | Edición inline en `/stock` o en la cola de taller — depende de que exista un rol real que distinga "sólo Horacio" (hoy el selector de usuario es wayfinding, no seguridad; ver pregunta en §5) | M |
| Generar OT de conjunto o de pieza suelta, no sólo de máquina | Hoy sólo se genera `ot_maquina` y todo lo demás explota desde ahí (`src/lib/data/ot.ts:58`). Un repuesto o una reposición puntual necesita arrancar directo en conjunto o pieza. Decisión de diseño pendiente: ¿esa OT suelta cuelga de una máquina existente (para trazabilidad) o es un tipo de OT nuevo sin máquina padre? Ver pregunta en §5 | M |
| Horacio pueda modificar stock manualmente | `movimiento_stock` ya soporta `tipo: "ajuste"` en el schema; falta la pantalla para generarlo a mano (hoy sólo se genera automático desde taller) | S |
| Panel de indicadores (tiempos, paradas, errores, setups) | Dashboard nuevo agregando `registro_operacion` + `parada`, mismo patrón de cálculo que `/avance` | M |
| Panel de tareas de revisión cuando se fabrican piezas defectuosas/a retrabajar | Cuando se cierra una OT de pieza con `piezas_defectuosas` o `piezas_retrabajadas` > 0, generar automáticamente una tarea de seguimiento en un panel nuevo hasta que se resuelva | M |
| Control de armado habilitado cuando el conjunto está completo, con procedimiento de control | Gate sobre `ot_conjunto` (todas sus `ot_pieza` en `terminada`) que habilita un checklist ligado a `procedimiento`, mismo patrón que `control_calidad` pero a nivel conjunto | M |

## 4 · Logística (Horacio, por ahora)

| Pedido | Qué implica | Tamaño |
|---|---|---|
| Remitos para movimiento de piezas | Documento imprimible/PDF generado desde `movimiento_stock`, con numeración propia | M |
| Panel de ingresos/egresos y piezas fuera de fábrica | Dashboard sobre `movimiento_stock` filtrado por tipo; "fuera de fábrica" se apoya en `proceso.esExterno` (ya existe) para saber qué piezas están en un proceso tercerizado | M |
| Control de calidad al ingreso de materia prima / proceso tercerizado, según lo solicitado | Es la misma funcionalidad que confirmó Julián en §0 — un `control_calidad` enlazado al `movimiento_stock` de ingreso y, cuando corresponde, a `proveedor`, para poder reclamar a tiempo | M |

## 5 · Taller (operario / Nico)

| Pedido | Qué implica | Tamaño |
|---|---|---|
| Casilla de observaciones por operación | El campo ya existe de punta a punta — `registro_operacion.observacion` está en el schema **y** la Server Action (`ejecucion.ts:48`) ya lo lee de `formData`. Sólo falta el `<textarea>` en el formulario de `/taller/[otPiezaId]`. Es el único ítem de todo este backlog que es un arreglo de UI, no una funcionalidad nueva | **XS** |
| Que al operario le aparezcan sólo sus piezas asignadas o las de su centro de trabajo | Depende de `centro_trabajo` (§1) — además hay que decidir si es por asignación explícita (alguien le asigna la tarea al operario) o por ubicación (el operario "está parado" en un centro y ve la cola de ahí). Horacio lo planteó como alternativa ("o las que figuren en el centro de trabajo"), no como los dos a la vez — preguntar cuál | M |
| Perfiles con accesos administrados por Julián/Horacio | Esto es autenticación y control de acceso real (Auth.js), hoy planificado para la conexión de infraestructura definitiva de octubre (`docs/01-analisis.md §5`, `docs/03-plan-fase-1.md`). Este comentario es una señal fuerte de que conviene adelantarlo — sin roles reales, media Producción (edición inline "sólo Horacio") y Taller (accesos administrados) no se pueden cumplir del todo | Ya planificado — **candidato a adelantar** |

## 6 · Fundamento compartido que conviene construir primero

Antes de repartir el resto por prioridad, dos piezas de base desbloquean varios pedidos
a la vez y conviene resolverlas primero:

1. **Roles reales (Auth.js)** — hoy es sólo wayfinding. Sin esto, "sólo Horacio puede
   editar", "accesos administrados por Julián/Horacio" y cualquier permiso por rol quedan
   en el aire. Ya estaba planeado para octubre; adelantarlo resuelve de una vez tres pedidos
   distintos.
2. **`centro_trabajo`** — desbloquea la cola de producción, el filtro de taller por
   operario/centro, y es la base del Gantt cuando se construya en Fase 3.

## 7 · Preguntas para la próxima reunión

Nuevas, surgidas de esta devolución:

- "Centro de trabajo" — ¿es un concepto nuevo, o es lo mismo que `ubicacion`/isla que ya
  existe en el schema? Si es lo mismo, se extiende esa tabla en vez de crear una nueva.
- OT suelta de conjunto o de pieza (sin pasar por una OT de máquina completa) — ¿debe
  colgar igual de una máquina existente para trazabilidad, o es un tipo de orden
  independiente? ¿Cómo se codifica (hoy el código de pieza depende del código de conjunto,
  que depende del de máquina)?
- "Stock futuro" — ¿se refiere a piezas en WIP cerca de terminar, a compras en camino
  a proveedores, o ambas? Hoy no hay seguimiento de órdenes de compra en el sistema.
- Filtro de piezas para el operario — ¿por asignación explícita (alguien le asigna la
  tarea) o por el centro de trabajo donde está parado? Horacio los mencionó como
  alternativas, no como ambos a la vez.
- Remitos — ¿alcanza con un registro en pantalla, o necesitan que salga como documento
  imprimible/PDF para acompañar el traslado físico de piezas?

Además siguen sin responder las 5 preguntas de `docs/03-plan-fase-1.md` §"Preguntas para
la próxima reunión" (Dosificación/Dosificador, OPS vacío, identidad de la OC, columnas de
CS-03, un operario ¿una OT a la vez o varias?) — no vinieron en esta tanda.

## 8 · Propuesta de orden de construcción

No es una decisión tomada — es el orden que minimiza retrabajo, para validar con Matías
antes de arrancar:

1. Roles reales (Auth.js) — desbloquea permisos de todo lo demás.
2. `pieza_nota` (material editable + bitácora de ingeniería/producción) — autocontenido,
   sin dependencias, alto valor para Julián.
3. `centro_trabajo` + cola de producción — desbloquea el filtro de taller y el panel de
   Producción.
4. Ajuste manual de stock + edición inline de piezas desde la lista.
5. Control de calidad en ingresos (materia prima / proceso tercerizado) + panel de
   ingresos/egresos de Logística — comparten el mismo dato base (`movimiento_stock`).
6. OT de conjunto/pieza suelta — una vez resuelta la pregunta de codificación con Julián.
7. Panel de indicadores, tareas de revisión de retrabajo, control de armado, remitos —
   pantallas de valor alto pero sin dependencias cruzadas entre sí, se ordenan según lo que
   pida el cliente en la reunión.
8. Fase 3 (fuera de Release 2): Gantt por pieza y simulador de cotización.

## 9 · Progreso (se actualiza a medida que se construye)

**✅ Paquete 1 — Roles reales (2026-09-20).** El selector de usuario sin contraseña de Fase 1
se reemplazó por login real: ingeniería/dirección/taller entran con email + contraseña,
operario elige su nombre y entra con PIN (pensado para el celular del taller, sin email).
Cada ruta valida el rol del usuario logueado — antes cualquier rol podía entrar a cualquier
URL a mano, ahora un operario que intenta `/usuarios` es redirigido a `/taller`. Se sumó
`/usuarios` (gestión de accesos, RF-12): alta de usuarios, cambio de rol, activar/desactivar,
restablecer contraseña o PIN — accesible para ingeniería, dirección y taller, tal como pidió
Horacio ("accesos administrados por Julián/Horacio").

*Decisión técnica, no de producto:* no se usó Auth.js/next-auth como preveía
`docs/01-analisis.md §5`. Next.js 16 acababa de renombrar `middleware.ts` a `proxy.ts` (mismo
comportamiento, ver AGENTS.md) y la compatibilidad de next-auth v5 con esa convención nueva no
está verificada. Se implementó el patrón que la propia guía de Next.js recomienda para sesión
casera — JWT firmado con `jose`, cookie httpOnly, verificación en `proxy.ts` — mismas
propiedades de seguridad, sin depender de que una librería de terceros ya soporte Next 16.
No cambia nada de cara al cliente ni al runbook de traspaso más allá de una env var
(`AUTH_SECRET`, ya seteada en Vercel Production/Preview/Development).

*Credenciales de demo* (sembradas por `scripts/seed-db.ts`, para que Matías y su socio puedan
probar cada rol): Adrián/Julián/Horacio → `reiner2026`; Nico → PIN `1234`. Son sólo para esta
etapa — `docs/04-runbook-traspaso.md` C4 ya tiene el paso de rotarlas antes del traspaso.

**✅ Paquete 2 — `pieza_nota` (2026-09-20).** En `/maestros/pieza/[id]`: material editable
(el campo ya existía en el schema, faltaba exponerlo) y una bitácora con notas de ingeniería
(versión/diseño) o de producción, con autor y fecha, sin sobrescribir las anteriores. Probado
end-to-end sobre PS01CB124s001 (la misma pieza del informe de validación).

**Pendiente de decidir con Julián/Horacio, surgido al construir esto:**
- Hoy la bitácora sólo se ve/edita desde `/maestros`. El pedido original de Julián no
  mencionaba `/taller` — ¿production también debería poder agregar notas desde la pantalla
  del operario, o eso queda reservado a ingeniería/taller?
- El PIN de operario quedó en 4 dígitos numéricos sin más validación — ¿alcanza, o necesitan
  algo más estricto una vez que el sistema maneje datos reales de taller?
- `/usuarios` quedó abierto a ingeniería, dirección y taller por igual (nadie puede cambiarse
  el rol a sí mismo salvo que otro con acceso lo haga). ¿Adrián quiere ser el único que dé de
  alta usuarios nuevos, o está bien que Julián/Horacio también puedan?

**✅ Paquete 3 — Centros de trabajo (2026-09-20).** Nueva pantalla `/centros-trabajo`
(ingeniería, dirección, taller): por cada centro, qué piezas están disponibles para arrancar
ahora y cuáles van a llegar más adelante (dependen de que termine un paso anterior), con
flechas para reordenar manualmente la cola de "ahora" — el pedido literal de Horacio. En
`/usuarios`, cada operario puede quedar "parado" en un centro; con eso asignado, su `/taller`
sólo muestra las piezas cuya operación actual cae en ese centro (antes veía todo, sigue viendo
todo si no tiene centro asignado).

*Asunción de arranque, no confirmación:* los centros de trabajo se sembraron 1:1 desde los 24
procesos ya normalizados (hallazgo 3.5), **excepto** los marcados `esExterno` (Compras,
Cromado, Pavonado, Anodizado, Cromado/Anodizado) — no son un puesto físico de taller con un
operario que reordene una cola, son trabajo tercerizado o de compras. Se detectó probando la
pantalla real: "Compras" acumulaba 276 piezas "disponibles ahora" en una sola tarjeta con
flechas de a una, inmanejable. Confirmar con Julián/Horacio si el resto de los 19 centros
restantes corresponde 1:1 a un puesto físico real, o si conviene agrupar algunos (ej. Torno y
Torno CNC bajo un mismo centro) — se puede reagrupar después sin tocar datos de ejecución, sólo
reapuntando `proceso.centroTrabajoId`.

*Refactor incidental:* `estadoDePieza` y la pantalla `/taller/[otPiezaId]` calculaban cada una
por su cuenta "cuál es la operación actual de esta pieza" con la misma lógica duplicada. Se
unificó en `getEstadoYOperacionActual` (`src/lib/data/ot.ts`) — un solo lugar, y de paso una
consulta menos por carga de pantalla.

*Bug encontrado y corregido probando en el navegador (no en el diseño):* la primera versión de
`getColaPorCentroTrabajo` llamaba a `getEstadoYOperacionActual` una vez por cada OT de pieza
dentro de un for-loop — con las ~450 piezas × 3 máquinas ya sembradas, eso son miles de
consultas secuenciales a Neon y **tumbó el build de producción** (Next intenta prerenderizar
la página y Vercel corta a los 60s). Se reescribió a 3 consultas batched siempre, sin importar
cuántas OT de pieza haya. Un segundo bug — piezas cuya hoja de ruta pasa dos veces por el mismo
centro aparecían duplicadas en "a futuro" (React tiraba warnings de keys repetidas) — se
corrigió listando cada pieza una sola vez por centro, en su primera aparición.

**Pendiente de decidir con Julián/Horacio, surgido al construir esto:**
- ¿Los 19 centros internos restantes son cada uno un puesto físico real, o hay que agrupar
  alguno? (ver asunción arriba)
- El trabajo tercerizado/de compras excluido de esta cola necesita igual algún seguimiento —
  ya está pedido en §4 ("control de calidad en ingresos de materia prima o proceso
  tercerizado"). ¿Alcanza con esa pantalla, o Horacio espera verlo también acá de alguna forma?
- El operario queda "parado" en un centro manualmente desde `/usuarios` — ¿eso lo asigna
  Horacio a mano cada vez que alguien cambia de puesto, o conviene que el propio operario lo
  elija al loguearse?

**✅ Paquete 4 — Ajuste manual de stock (2026-09-20).** En `/stock`, cada pieza buscada tiene
ahora una columna "Ajustar" (sólo visible y habilitada para taller): se escribe la cantidad
correcta y se guarda, con un motivo opcional. Es la primera escritura de toda la app sobre
`stock_pieza` y `movimiento_stock` (tipo `ajuste`) — hasta ahora ambas tablas sólo se leían, el
stock migrado de los Excel es una foto fija y cerrar una operación en taller todavía no la
actualiza (esa es la próxima pieza natural de este backlog, no estaba pedida todavía). El ajuste
no pisa el número sin dejar rastro: guarda el delta en `movimiento_stock` con quién lo cambió y
por qué antes de actualizar el saldo.

*Interpretación de un pedido ambiguo, a confirmar con Horacio:* el comentario original mezclaba
dos ideas — "editar los estados de las piezas... desde la lista" y, dos líneas después,
"que Horacio también pueda modificar el stock". Se implementaron como una sola funcionalidad
(editar la cantidad de stock disponible inline, desde `/stock`) porque el estado de una OT de
pieza no es un campo que se pueda editar a mano — se deriva siempre del histórico de
operaciones (ver §9 del paquete 3) — así que "editar el estado de una pieza" sólo tiene sentido
hoy si se refiere a su cantidad de stock. Falta confirmar con Horacio si esto cubre lo que
pedía o si hay algo más específico detrás de esa frase.

*Gateado a rol "taller", literal del pedido ("esto solo lo podria hacer horacio digamos")* —
ni ingeniería ni dirección pueden ajustar stock hoy, algo inusual que vale la pena confirmar:
¿Adrián o Julián deberían poder hacerlo también, o realmente sólo Horacio?

**Deuda técnica encontrada y corregida de paso, no pedida en ningún paquete:** al probar este
paquete, `/avance` tardaba 15 a 37 segundos en cargar — el mismo patrón de N+1 que ya había
tumbado el build de `/centros-trabajo` (`listarOtMaquinas`/`getOtMaquinaDetalle` en
`src/lib/data/ot.ts` llamaban una consulta por cada OT de pieza, ~450 piezas × 3 máquinas
sembradas). Bloqueaba probar cualquier otra pantalla como Horacio (su home es `/avance`), así
que se corrigió ahí mismo con el mismo patrón de queries batched — bajó a 1.8-3s. De paso se
sacó también un N+1 más chico en `/ot/[id]` (`getPieza` una vez por fila en vez de
`getPiezasPorIds`, que ya existía sin usar).

**Sin empezar:** el resto del orden de §8 (control de calidad en ingresos, OT de conjunto/pieza
suelta, panel de indicadores, etc.).
