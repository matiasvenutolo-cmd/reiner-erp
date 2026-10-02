# Backlog Release 3 — reunión con el cliente + reunión con el socio (2026-09-28)

> Fuente: minuta de la reunión con Julián (REINER) + minuta de la reunión posterior de
> Matías con Ignacio (socio) sobre esa misma reunión. A diferencia de Release 2, acá el
> pedido no es una lista de features sueltas — la conclusión explícita de ambas reuniones
> es que el sistema necesita una reorganización de fondo (navegación, información por
> perfil, y el modelo de Stock) antes de seguir agregando funcionalidad nueva. Este
> documento reordena ambas minutas por tema, igual que se hizo con el backlog de
> Release 2.

## 0 · La conclusión que manda: no es un problema funcional, es de organización y UX

Del lado del cliente: la primera versión priorizó trasladar la lógica del Excel al
sistema, no la experiencia de uso; la segunda incorporó mejoras puntuales, pero "todavía
falta una capa importante vinculada con las pantallas y la interfaz del usuario."

Del lado del socio, más tajante: *"El problema actual no es solamente funcional: hay
bastante trabajo pendiente de interfaz, experiencia de usuario, navegación y
organización de la información."* Y el objetivo explícito: *"que el sistema sea algo
que puedan abrir y utilizar habitualmente, y no simplemente una digitalización del
Excel original."*

Esto reencuadra todo lo que sigue: la mayoría de los puntos de abajo no son
funcionalidad nueva sobre datos que faltan — son datos que **ya existen** (o casi) y que
hay que reorganizar, agrupar o mostrar distinto. El propio cliente lo dice en el punto
19 de su minuta: *"los cambios conversados son, en términos generales, modificaciones
sencillas y no implican un cambio de desarrollo completamente diferente."* La excepción
real a esto es Stock (§11), que si se toma en serio el pedido implica repensar el
modelo de datos, no sólo la pantalla.

## 1 · Testing — lo que confirmó el socio, de forma independiente

El socio marcó exactamente el mismo diagnóstico que se le dio a Matías cuando reportó el
bug de "Abrir en taller →" (ver `docs/05-backlog-release-2.md`, cierre): *"Se había
pedido realizar un testing integral antes de entregar, pero se hizo un testing de cada
sección individualmente y no un testing punta a punta."* Y la conclusión que sacó de
eso: la IA acelera el desarrollo, pero esa velocidad no sirve sin comprensión real del
flujo completo del producto.

No es un punto nuevo para este proyecto — ya está documentado como lección en
`proyecto-reiner-erp.md` (memoria) — pero vale dejarlo anotado acá porque el cliente
llegó a la misma conclusión por su cuenta, sin que se lo hayamos contado: es una señal
de que el hueco era real, no una excusa nuestra. De acá en más, antes de dar por
cerrado un paquete de Release 3, conviene un testing punta a punta explícito (seguir un
trabajo real desde que se genera hasta que se despacha/factura, con los cuatro roles en
el medio), no sólo verificar que cada pantalla nueva carga bien.

## 2 · Navegación general

- Menú lateral en vez de la navegación superior actual — se consideró más cómodo para
  un sistema de este tamaño.
- Estructura de navegación **consistente entre roles**: hoy el orden de las opciones
  cambia según quién entra (ver `NAV_POR_ROL` en `src/lib/nav.ts`); el pedido es una
  única estructura común, con permisos/visibilidad distintos por encima, no un menú
  reordenado por perfil.
- Primera pantalla diferenciada por perfil, tipo "plan de trabajo": ver §15.

## 3 · Maestros — no debe ser protagonista

Julián necesita administrar Maestros, pero **no** como una de las primeras cosas que ve
alguien al entrar. Pedido explícito: que quede dentro de una sección de Administración,
o más escondido en el menú — sigue accesible para ingeniería cuando necesite modificar
algo, pero deja de estar al mismo nivel que Órdenes de trabajo, Stock o Logística.

## 4 · Órdenes de trabajo — repensar el concepto

Hoy la OT está centrada en la máquina completa. El cliente lo cuestiona con un dato
concreto: *"Reiner vende aproximadamente dos máquinas por año, por lo que no tiene
sentido que el seguimiento cotidiano esté centrado únicamente en visualizar órdenes por
máquina."* Necesita poder trabajar y hacer seguimiento de:

- una máquina completa;
- un conjunto específico;
- una pieza suelta;
- una etapa de producción.

Release 2 (paquete 6) ya resolvió una parte de esto — generar OT de conjunto o pieza
suelta colgando de una máquina existente. Lo que falta y es nuevo acá:

- **Planificación**: asignar un trabajo específico a una persona, para un día
  determinado, con anticipación (ej. planificar toda la semana siguiente).
- **Problema de flujo actual**: al mandar un trabajo a fabricación desde Taller, "el
  trabajo vuelve hacia atrás o desaparece de la visualización actual" — hay que revisar
  ese comportamiento puntual antes de construir la capa de planificación encima.
- Simplificar la entrada a una OT de máquina: hoy aparecen "muchos elementos y órdenes
  asociadas" y cuesta entender qué falta hacer, en qué etapa está y qué cantidad.

## 5 · Detalle de operaciones y hoja de ruta

Las operaciones aparecen con nombres genéricos ("Torno", "Torno", "Centro CNC") que no
alcanzan para saber qué hay que hacer realmente. Pedido: descripciones específicas
("Torno – Operación 1", "Roscado", etc.). Importa especialmente porque esa misma
descripción es la que ve el operario en `/taller` — hoy `proceso.nombre` es el único
texto disponible; hace falta una descripción más granular por paso de la hoja de ruta,
no sólo por proceso genérico.

## 6 · Adjuntos para Ingeniería

Espacios para adjuntar documentación por pieza/operación:

- adjunto de plano;
- adjunto de procedimiento;
- posibilidad de imágenes.

No todas las operaciones necesitan esto — el modelo tiene que permitir que una
operación no tenga ningún adjunto sin que eso sea un problema. Ingeniería necesita
permiso de edición sobre estos adjuntos.

## 7 · Compra vs. fabricación, dentro de Maestros

Ejemplo del cliente: *"Compra Chiapas soporte Wiper"* — una pieza que sólo se compra y
no tiene ningún proceso de fabricación asociado. Pedido: que el listado de Maestros ya
identifique qué piezas son de compra pura, para no tratarlas igual que las que requieren
producción. Esto es un flag por pieza (o se deriva de que su hoja de ruta esté vacía),
pero además tiene que reflejarse en cómo se arma y visualiza la OT.

## 8 · Taller / hoja del operario

Confirmación, no cambio de fondo: la pantalla simple orientada a una sola acción sigue
siendo el enfoque correcto. Se evaluó mostrar la hoja de ruta completa en esa pantalla,
pero se prefirió mantenerla simple — la complejidad del sistema no debería llegarle al
operario. (Ya existe un `<details>` colapsable con la hoja de ruta completa en
`/taller/[otPiezaId]` — revisar si eso alcanza o si el pedido es directamente sacarlo.)

## 9 · Avance

Punto que gustó al cliente: la barra de avance. Pero no alcanza con verla sólo por
máquina — necesita avance por conjunto, por pieza y por proceso/etapa, con la misma
razón de fondo que en §4: pocas máquinas por año, el seguimiento cotidiano vive en el
proceso, no en la máquina. Objetivo explícito: *"poder entrar al sistema todos los días
y entender qué cambió respecto del día anterior."*

Dos problemas puntuales detectados en la demo:

- Hoy hay información de avance duplicada en más de un lugar del sistema.
- Entrar a "Avance" hoy vuelve a abrir una orden de trabajo completa — revisar ese
  flujo, no debería depender de reabrir la OT para ver el estado.

## 10 · Revisión / retrabajos — eliminar como módulo independiente

**Esto contradice una decisión ya tomada en Release 2 (paquete 7).** Hoy `/revision`
es una pantalla propia con tareas que se autogeneran en `tarea_revision` al cerrar una
pieza con defectuosas/retrabajadas. El cliente no ve valor en esa pantalla como módulo
aparte: el ejemplo que dio fue una pieza que necesita volver a una etapa anterior (ej.
rectificado) — esa necesidad debería registrarse directamente dentro de la propia OT o
ficha de la pieza, no obligar a ir a un módulo separado a buscarla.

Se mantiene la necesidad de fondo (medir cuánto tiempo llevó el retrabajo, ya cubierto
por `registro_operacion`); lo que se cuestiona es la existencia de `/revision` como
pantalla independiente. Ver pregunta abierta en §17 sobre si se elimina del todo o se
deja como un filtro/vista dentro de la OT.

## 11 · Stock — repensar el modelo, no sólo la pantalla (el punto más grande)

El feedback más profundo de las dos reuniones. Se probó buscar una pieza por código en
`/stock` y el resultado no fue claro — "aparecen números y diferentes cantidades que no
permiten entender fácilmente qué representan." Pero el socio fue más allá del síntoma
visual: *"El concepto de stock para Reiner no parece ser simplemente una cantidad
estática de una pieza... hay que pensar el stock como un WIP (Work in Progress) por
etapa del proceso."*

Consecuencia directa señalada en la reunión: si el stock se modela como posición dentro
del proceso (no como una cantidad suelta), de esa misma información deberían poder
salir, sin duplicar datos: el estado de stock, el avance (§9), los semáforos de
producción y los tableros. Es decir, Stock deja de ser una pantalla aislada y pasa a ser
la base de datos compartida detrás de varias pantallas.

Esto es estructural, no cosmético — el cliente lo dice explícitamente: *"hay que
repensar el concepto y modelo de Stock antes de seguir simplemente modificando la
interfaz actual."*

**✅ Resuelto (2026-09-28) — y con un hallazgo importante para contarle al cliente: el
modelo WIP-por-etapa que pedía ya existía.** El schema tiene desde el arranque del
proyecto una tabla `wip_pieza` (pieza + proceso + cantidad) además de `stock_pieza`
("Finalizado") — es decir, alguien (el propio análisis inicial, hallazgo 3.1 de
`docs/01-analisis.md`) ya había modelado el stock exactamente como pidió el cliente ahora.
El problema no era el modelo: era que `wip_pieza` se cargó una sola vez al migrar el Excel
en Fase 1 y **ningún flujo de la app la volvió a tocar nunca** — cerrar una operación en
taller no la actualiza. Con meses de OT generadas y ejecutadas desde entonces, esa tabla
quedó completamente desincronizada de la realidad, que es probablemente la razón real por
la que "los números no se entendían" al buscar una pieza.

La solución no fue crear un modelo nuevo: fue dejar de leer `wip_pieza` y calcular el WIP
**en vivo** a partir de la misma ejecución real que ya alimenta `/avance` y
`/centros-trabajo` (posición de cada OT de pieza abierta en su hoja de ruta, vía
`registro_operacion`) — una sola base para stock, avance, logística y tableros, tal como
pidió el cliente, sin tablas que se desincronizan solas. Se actualizaron los tres lugares
que mostraban WIP: `/stock` (ahora cada pieza buscada muestra "En proceso" con la etapa +
"Finalizado" por separado, no un número único sin contexto), `/avance` (misma tabla
agregada, ahora en vivo) y `/logistica` ("piezas fuera de fábrica" ya no muestra piezas
que volvieron del proveedor hace meses). `wip_pieza` no se borró — puede representar stock
físico genérico sin atar a una OT puntual (trabajo que ya estaba en curso antes de este
sistema) —, sólo se dejó de usar en pantalla. Ver pregunta para confirmar con Julián/Horacio
antes de eliminar la tabla del todo.

## 12 · Procesos tercerizados / Logística / Remitos — unificar

Hoy son conceptos separados en el sistema (`/logistica`, `/remitos`); el cliente los ve
como un solo proceso: enviar piezas a un proveedor externo (ej. cromado) y hacer el
seguimiento de ese envío. Pedido explícito de unificación, con foco en simplicidad:

- Un remito debe poder agrupar **varias piezas** en un mismo envío — de distintas
  máquinas o incluso distintos clientes — para un mismo proveedor.
- Esto **ya estaba anotado como límite conocido** en `docs/05-backlog-release-2.md`
  (paquete 7): *"Remitos: cada uno lleva una sola pieza con su cantidad... si en la
  práctica un remito real necesita agrupar varias piezas... hace falta una tabla
  `remito_item`."* Ahora es un pedido explícito y confirmado, no una hipótesis.
- Formulario simple pedido por el cliente: pieza, tratamiento, código, destino,
  cantidad, observaciones, técnico involucrado — cargar varias piezas al mismo
  movimiento antes de finalizarlo.
- El proceso de tercerización en general (no sólo el remito en sí) debería quedar
  identificado y ordenado: para qué máquina es, código de pieza, cantidad, tratamiento,
  destino.

## 13 · Centros de trabajo

Señalado por el cliente como un punto clave para dirección/supervisión: tener bien
organizado qué hay que hacer y qué se está haciendo en cada centro.

- Reemplazar las flechas de reordenar prioridad (Release 2, paquete 3) por **arrastrar y
  soltar** — se consideró incómodo el mecanismo actual.
- Poder hacer clic en una tarea/centro para ver más detalle: qué operación es, si está
  asignada, quién la tiene asignada.
- Separar mejor lo que hoy aparece junto: piezas que requieren fabricación, piezas que
  son sólo de compra, piezas que dependen de una compra todavía no resuelta.

## 14 · Indicadores — deprioritizado explícitamente

Pedido claro de posponer: *"no tiene sentido dedicar esfuerzo a esa parte antes de
resolver correctamente el funcionamiento principal del sistema."* Primero resolver
producción, órdenes de trabajo, stock/WIP, centros de trabajo, navegación y procesos
tercerizados — Indicadores (construido en Release 2, paquete 7) se retoma después, sobre
la información que genere el sistema ya reorganizado.

## 15 · Primera pantalla / plan de trabajo por perfil

Idea nueva: que la pantalla de entrada funcione como un plan de trabajo — apenas
ingresan, ver en qué etapa están y qué hay que avanzar. Se relaciona directamente con
lo ya anotado en Release 2 (pendiente sin resolver): *"la parte dirigencial debería
visualizar otra información" que producción o taller.* Este release es la oportunidad
de resolver esa diferenciación por perfil que quedó pendiente.

## 16 · Enfoque de fases — pedido explícito del cliente

- No esperar a tener todo Reiner terminado para que el cliente empiece a usarlo — mejor
  ir probando partes y dando feedback en el camino.
- Primero la reorganización general (navegación, perfiles, stock/WIP) — recién después
  de eso conviene retomar una prueba de uso intensiva y las respuestas puntuales que
  se acordó mandar por mail/WhatsApp mientras tanto.
- El cliente fue explícito en que esto no es, en general, un cambio de desarrollo
  distinto al ya hecho — son ajustes sobre la misma base de datos y lógica ya cargada.

## 17 · Preguntas abiertas para la próxima reunión

Nuevas, surgidas de esta reunión:

- Modelo de "etapa" para el stock-como-WIP (§11): ¿se deriva de la posición en la hoja
  de ruta que ya calculamos (`getEstadoYOperacionActual`), o el cliente tiene en mente
  etapas más generales que no coinciden 1:1 con los procesos de la hoja de ruta?
- Revisión (§10): ¿se elimina `/revision` del todo y la info vive sólo en la ficha de la
  OT/pieza, o conviene dejarla como una vista/filtro que junta esos casos sin ser una
  pantalla de carga manual aparte?
- Remitos multi-pieza (§12): ¿un remito agrupa piezas para un único proveedor/destino, o
  puede haber destinos distintos dentro del mismo remito?
- Adjuntos (§6): ¿qué formatos concretos maneja hoy Ingeniería (PDF, DWG, imágenes) y
  hay algún tamaño o volumen esperado que condicione dónde se guardan (Vercel Blob ya
  está previsto en el stack, sin usar todavía)?
- Primera pantalla por perfil (§15): contenido concreto que cada rol espera ver —
  hoy sólo sabemos que "no debe ser la misma para todos", falta la lista real por rol.
- Planificación semanal (§4): ¿la asignación de trabajo a una persona/día la hace
  Horacio a mano sobre un calendario, o hace falta alguna lógica de sugerencia? Además,
  ya construido y probado: ¿una asignación explícita debería poder saltarse el filtro de
  centro de trabajo de un operario, o el filtro de centro sigue mandando siempre?
- "El trabajo vuelve hacia atrás o desaparece" (§4, queja original del 4/9): no se
  encontró un caso reproducible con lo construido en Release 2 y 3 (Centros de trabajo,
  Avance por sección, acordeón de la OT) — confirmar con Horacio si el síntoma sigue
  ocurriendo con la versión actual o si ya se resolvió de rebote.
- `wip_pieza` (§11): al calcular el WIP en vivo desde la ejecución real, dejó de usarse
  en pantalla la tabla `wip_pieza` migrada del Excel en Fase 1. ¿Representaba algo más
  que "posición de cada OT en su hoja de ruta" — por ejemplo, stock físico genérico sin
  atar a una orden puntual? Si no, se puede eliminar la tabla del todo.

Siguen sin responder, además, las preguntas que ya venían arrastrándose de reuniones
anteriores (Release 1 y 2) — Dosificación/Dosificador, OPS vacío, identidad de la OC,
columnas de CS-03, un operario ¿una OT a la vez o varias?, y las de Release 2 §7
(agrupamiento de los 19 centros de trabajo restantes, alcance del ajuste de stock y del
control de armado más allá de taller).

## 18 · Propuesta de orden de construcción

No es una decisión tomada — es el orden que respeta las dependencias y el pedido
explícito del cliente de reorganizar antes de seguir sumando funcionalidad, para validar
con Matías antes de arrancar:

1. **Navegación** (menú lateral + estructura común entre roles) — bajo riesgo, alto
   impacto en cómo se percibe todo lo demás, no depende de ningún cambio de datos.
2. **Maestros → Administración** — mover/ocultar en el menú, sin tocar la lógica.
3. **Primera pantalla por perfil** (§15) — una vez resueltas las preguntas de §17 sobre
   contenido concreto por rol.
4. **Modelo de Stock como WIP por etapa** (§11) — el cambio de fondo. Se hace antes que
   Avance/Centros/Indicadores porque todos esos consumen esta misma base una vez
   resuelta.
5. **Avance ampliado** (conjunto/pieza/proceso, no sólo máquina) sobre el nuevo modelo.
6. **Órdenes de trabajo**: resolver el flujo que "desaparece" al mandar a fabricación, y
   sumar la planificación semanal por persona/día.
7. **Integrar Revisión/retrabajo dentro de la OT/pieza**, retirando `/revision` como
   módulo aparte (según lo que se resuelva en la pregunta de §17).
8. **Unificar Logística + Remitos + tercerización**, remito multi-pieza (`remito_item`).
9. **Centros de trabajo**: drag & drop + detalle por clic + separar compra/fabricación.
10. **Detalle de operaciones específico + adjuntos de ingeniería + flag compra/fabricación**
    en Maestros — encajan bien en cualquier momento, sin dependencias cruzadas fuertes.
11. **Indicadores** — al final, una vez resuelto el resto, como ya pidió el cliente.

Antes de arrancar conviene llevar las preguntas de §17 a Julián/Horacio (por escrito,
como se acordó en la reunión) — varias de las primeras etapas del orden de arriba
dependen directamente de esas respuestas (perfil/home, WIP, revisión).

## 19 · Progreso (se actualiza a medida que se construye)

**✅ Paquete 1 — Navegación unificada + Maestros/Usuarios a Administración (2026-09-28).**
Un solo array (`NAV_ITEMS` en `src/lib/nav.ts`) gobierna orden y permisos para
ingeniería/dirección/taller — antes cada rol tenía su propio orden. Menú superior
reemplazado por un sidebar (`src/components/Sidebar.tsx`, fijo en desktop, drawer con
overlay en mobile). Maestros y Usuarios quedan agrupados y visualmente secundarios bajo
"Administración". El operario mantiene su header simple de siempre (una sola pantalla, sin
sidebar). Home de ingeniería pasa de `/maestros` a `/avance`, igual que dirección y taller.
Verificado con los 3 roles de staff + operario en el navegador.

**✅ Paquete 2 — Centros de trabajo: reordenar arrastrando (2026-09-28).** Reemplazadas las
flechas de subir/bajar de Release 2 por arrastre con Pointer Events (`ColaDisponibleAhora`),
funciona con mouse y con touch sin librería externa. `moverPrioridad` (swap con el vecino)
reemplazado por `reordenarCola` (recibe la lista completa ya reordenada). Probado en el
navegador: arrastrar, soltar, recargar y confirmar que el orden nuevo persiste.

**✅ Paquete 11 (adelantado) — Stock como WIP en vivo (2026-09-28).** Ver el detalle completo
en §11 más arriba — hallazgo importante: el modelo que pedía el cliente ya existía en el
schema (`wip_pieza`), sólo que era una foto fija sin actualizar desde la migración de Fase 1.
Se reemplazó por un cálculo en vivo desde la misma ejecución real que usan Avance y Centros
de trabajo, unificando la fuente de datos en `/stock`, `/avance` y `/logistica`. Probado en
el navegador con los tres roles de staff — los tres números ahora coinciden entre sí.

**✅ Paquete 3 — Home por perfil (2026-09-28).** Nueva pantalla `/inicio`, home de
ingeniería/dirección/taller (antes era `/avance` para los tres). Contenido, armado como
propuesta concreta para validar en la reunión (no había respuesta cerrada de qué quiere ver
cada perfil — ver pregunta en §17):
- Compartido entre los tres roles: "Frenado ahora mismo" (paradas activas con motivo —
  nueva `getParadasActivas` en ejecucion.ts, primera vez que se lista esto en un solo
  lugar en vez de pieza por pieza) y "Stock por debajo del mínimo".
- Dirección: cuántas OT de máquina en curso, piezas en proceso tercerizado, y las OT más
  próximas por plazo comprometido.
- Ingeniería y dirección: tareas de revisión pendientes (reusa `getTareasRevision`).
- Taller: los centros de trabajo con más piezas esperando ahora mismo (reusa
  `getColaPorCentroTrabajo`).
Operario no cambia (sigue en `/taller`, ver §8). "Inicio" se agregó como primer ítem del
sidebar para poder volver. Probado en el navegador con Adrián, Julián y Horacio.

**✅ Paquete 10 — Revisión integrada en la OT, ya no es un módulo aparte (2026-09-28).**
Revierte una decisión de Release 2 (paquete 7): se sacó `/revision` del menú y se borró la
pantalla — pedido explícito del cliente (§10 más arriba). Ahora, cuando una pieza se cierra
con defectuosas o retrabajadas:
- En `/ot/[id]` (listado de piezas del conjunto), la fila de esa pieza muestra un badge
  "revisión pendiente" que lleva directo a su ficha.
- En `/ot/[id]/pieza/[otPiezaId]` (donde Julián/Horacio ya están mirando esa pieza
  puntual) aparece una tarjeta "Revisión / retrabajo" con el detalle y el mismo formulario
  de resolución que tenía la pantalla vieja — resolver ahí mismo, sin ir a otro lado.
- En `/inicio`, la tarjeta "Revisión pendiente" ahora linkea cada fila directo a la ficha
  de la pieza en vez de a un índice separado.
`src/lib/data/revision.ts` sigue siendo el único lugar que lee/escribe `tarea_revision`
(se agregaron `getTareasRevisionDePieza` y `getOtPiezaIdsConRevisionPendiente`) — sólo
cambió desde dónde se llama. Probado de punta a punta: se cerró una pieza real como Nico
con 2 defectuosas, apareció el badge en la OT y la tarjeta en el home de Julián, se
resolvió desde la ficha de la pieza, y las tres pantallas se actualizaron.

**✅ Paquete extra — comentarios de Matías sobre lo pusheado (2026-09-28).** Tres ajustes
directos, fuera del orden de §18 pero rápidos de resolver:
- **Subtítulos sin jerga interna.** Varias pantallas mostraban texto pensado para uso
  interno (códigos `RF-XX`, citas a `docs/05-backlog-release-2.md §X`, "pedido de
  Horacio/Julián en la devolución del 2026-09-19") directo en los subtítulos que ve el
  cliente. Se limpiaron todos (Maestros, Avance, Usuarios, Remitos, Indicadores,
  Logística, OT, OT nueva) — quedan descripciones simples de qué hace la pantalla, sin
  atribución ni referencias a documentos internos.
- **Avance por sección, no sólo por máquina.** El cliente vende 2-3 máquinas por año — ver
  siempre la misma tarjeta de máquina todo el año no aporta nada al día a día. Cada tarjeta
  de `/avance` ahora suma una fila "Por sección": un bloque de color por cada conjunto de
  la máquina (gris = pendiente, azul = en curso, verde = terminado), clickeable, que lleva
  directo a esa sección dentro de la OT (`/ot/[id]#seccion-[id]`, con scroll automático).
  Así se ve de un vistazo qué partes de la máquina se están moviendo y cuáles están
  frenadas, no sólo el % global. Nueva función `listarOtMaquinas` extendida con
  `secciones` en `src/lib/data/ot.ts`, reusando los mismos datos ya batcheados (sin
  queries nuevas).
- **Landing pública con las fases del proyecto.** Pedido ya charlado antes con el cliente:
  que al abrir el link del ERP sin sesión aparezcan las fases de trabajo y un botón para
  entrar. Nueva página `src/app/page.tsx` (fuera del route group `(shell)`, igual que
  `/login`, para no repetir el bug de loop de Release 2 §9 con `getUsuarioActual()`) —
  4 fases con estado (Fase 1 y 2 completas, Fase 3 en curso, Puesta en marcha próximamente)
  y un botón "Entrar al sistema →". `proxy.ts` ahora trata `/` igual que `/login`: pública
  sin sesión, redirige a la home del rol si ya hay una. Contenido de las fases tomado de lo
  ya documentado (docs/01-analisis.md, docs/03-plan-fase-1.md) — sin fechas ni costos de
  infraestructura, eso se conversa aparte con Adrián.

**✅ Paquete extra 2 — segunda ronda de comentarios de Matías (2026-09-28).** Dos ajustes más:

- **La OT de máquina, más interactiva.** Mismo razonamiento que motivó "avance por sección":
  una OT de máquina casi no cambia (2-3 al año), así que la pantalla que la muestra tiene que
  ganarse el uso diario con lo que pasa DENTRO de ella, no con la OT en sí. `/ot/[id]` pasó de
  tablas planas siempre abiertas a un acordeón por sección (`src/components/ot/
  ConjuntoAccordion.tsx` + `ConjuntosView.tsx`, ambos client): cada conjunto se abre solo si
  está en curso, con una mini barra de progreso en el encabezado y un toggle global "Ocultar
  piezas terminadas". La columna "Estado" (un badge plano) se reemplazó por "Progreso"
  (`src/components/ProgresoOperaciones.tsx`): una fila de segmentos, uno por operación de la
  hoja de ruta, coloreados según cuántas ya se completaron — la textura real de "todo lo que se
  arma para cada OT", que es justo lo que no cambia con la cantidad de máquinas vendidas. Los
  links "Por sección" de `/avance` siguen funcionando: al llegar con el hash de una sección, el
  acordeón correspondiente se abre solo además del scroll nativo. Requirió extender
  `getEstadosBatch`/`getOtMaquinaDetalle` (`src/lib/data/ot.ts`) para devolver también
  `totalOps`/`completadas` por pieza, no sólo el estado agregado — mismas consultas ya
  batcheadas, sin queries nuevas.
- **La landing de "/" con todo el alcance real del proyecto, no sólo lo de hoy.** La primera
  versión sólo mostraba 4 fases con una frase cada una — muy por debajo del alcance real y,
  como señaló Matías, ni mencionaba Indicadores (que la propia minuta dice que se revisa al
  final). Se reescribió con una lista de ítems por fase (hecho/pendiente, con Indicadores
  explícito en Fase 3 como "revisión final, una vez resuelto el resto") y una fase
  "Próximamente" con lo que sigue después de esta reorganización — estimación de fecha de
  entrega y simulador de cotización (ya estaba anotado como Fase 3 en
  `docs/05-backlog-release-2.md §3`, antes de que esta Release 3 existiera como tal), puesta en
  marcha real y cierre. Deliberadamente no se incluyó nada de costos/infraestructura de
  traspaso (eso es una conversación aparte con Adrián, no contenido para una página pública).

**✅ Paquete extra 3 — tercera ronda de comentarios de Matías (2026-09-28).**

- **Tarjeta de máquina 100% clickeable en /avance.** Antes sólo el código de la OT era link;
  el resto de la tarjeta no hacía nada. `src/components/avance/MaquinaCard.tsx` (nuevo,
  client): toda la tarjeta navega a la OT con un clic, y los bloques de "Por sección"
  siguen yendo a su propia ancla (`stopPropagation` en el click del bloque para que no
  dispare también la navegación de la tarjeta completa).
- **Tooltip por paso en el Progreso del acordeón, sin clickear.** `ProgresoOperaciones` sólo
  tenía cantidades (2/5); ahora cada segmento lleva el nombre real del proceso en su `title`
  nativo del navegador ("Torno — hecho", "Cromado — pendiente"), visible al pasar el mouse.
  Requirió que `getEstadosBatch` (`src/lib/data/ot.ts`) devuelva la hoja de ruta completa por
  pieza (`pasos: {nombre, completado}[]`, ordenada por secuencia) en vez de sólo un conteo —
  mismas dos consultas ya batcheadas, con un join a `proceso` que no estaba.
- **Resumen general arriba de las tarjetas en /avance.** La pantalla seguía siendo "sólo las
  máquinas" aunque ahora tuvieran más detalle — pedido explícito de usarla para algo más.
  Se agregó una franja de 4 métricas de toda la planta antes del grid de tarjetas: OT de
  máquina en curso, piezas terminadas/total, piezas frenadas ahora mismo (reusa
  `getParadasActivas`, ya construida para `/inicio`) y piezas en proceso tercerizado (reusa
  `getPiezasFueraDeFabrica`). Se extrajo `src/components/MetricCard.tsx` de `/inicio` para
  reusarlo acá — segunda vez que se necesitaba el mismo patrón.

**✅ Paquete 10 (parcial) — Detalle de operaciones específico + flag compra/fabricación
(2026-09-28).**

- **Detalle de operaciones.** Se agregó `operacion.descripcion` (texto libre, opcional) al
  schema — cuando se carga, reemplaza al nombre genérico del proceso ("Torno") en todas las
  pantallas que muestran la hoja de ruta: la pantalla del operario en `/taller` (la prioridad
  que pidió el cliente explícitamente), la ficha de la OT de pieza, y el tooltip de
  `ProgresoOperaciones`. Se edita inline en `/maestros/pieza/[id]` → Hoja de ruta → columna
  "Detalle" (nuevo componente `DescripcionOperacionInput`, guarda al perder el foco). Sin
  detalle cargado, todo sigue mostrando el nombre del proceso como hasta ahora — no rompe
  nada de lo existente.
- **Flag compra/fabricación.** `pieza.tipo` (`fabricada`/`comprada`) **ya existía en el
  schema desde el arranque del proyecto**, pero `scripts/migrate-excel.ts` siempre cargó
  `"fabricada"` — no había forma de derivarlo del Excel, así que hoy ninguna pieza está
  marcada como compra pura aunque existan casos reales (ej. "Compra Chiapas soporte Wiper",
  el ejemplo del cliente). Se expuso como toggle manual en `/maestros/pieza/[id]` (nuevo
  `TipoPiezaSelect`, auto-submit) y como badge "Compra" en el listado de
  `/maestros/[conjuntoId]` — ingeniería lo va corrigiendo pieza por pieza a medida que las
  identifica, no hay forma automática de saberlo con los datos que hay.

**Gotcha técnico, no de producto:** este cambio de schema se aplicó con `drizzle-kit push`
directo a la base de dev, igual que todos los anteriores de Release 2 y 3 — pero **no existe
ninguna migración generada (`drizzle-kit generate`) desde la inicial del 2026-09-08**
(`drizzle/0000_noisy_grandmaster.sql`), pese a que el schema creció mucho desde entonces
(centro_trabajo, tarea_revision, control_armado, remito, pieza_nota, proveedor, y ahora
operacion.descripcion). `docs/01-analisis.md §5.1` exige migraciones versionadas en el repo
antes del traspaso a la cuenta de REINER — hoy no se está cumpliendo. No se corrigió en esta
sesión por el riesgo de generar una migración grande sin poder probarla contra una base
limpia; hay que resolverlo antes del traspaso de octubre (ver `docs/04-runbook-traspaso.md`).

**✅ Paquete 8 — Unificar Logística + Remitos, remito multi-pieza (2026-09-28).** Pedido
explícito del cliente (§12 más arriba): "un remito debe poder agrupar varias piezas... para
un mismo proveedor", y que Logística y Remitos dejen de ser conceptos separados.

- Schema: `remito` pasa a ser sólo el encabezado del envío (destino, técnico involucrado,
  observación); nueva tabla `remito_item` (pieza, cantidad, tratamiento) agrupa varias
  piezas bajo un mismo remito. Los 3 remitos de demo que ya existían se migraron a la
  nueva estructura sin perder datos (se hizo en dos pasos — agregar la tabla nueva y migrar
  primero, borrar las columnas viejas después — porque `drizzle-kit push` no puede resolver
  en modo no interactivo la ambigüedad de "¿esto es un rename o un drop+create?").
- `src/components/logistica/ArmadoRemito.tsx` (nuevo, client): buscar y agregar piezas a un
  carrito (con tratamiento y cantidad por pieza) antes de generar el remito — todo en un
  solo componente para no perder lo cargado entre búsquedas, la búsqueda misma se resuelve
  llamando un Server Action directo desde el cliente, sin recargar la página. Reemplaza el
  viejo flujo "una pieza, un remito" que vivía en la tabla de ingresos/egresos.
- `/remitos` y `/remitos/[id]`: listado y vista imprimible actualizados al modelo
  multi-pieza (código, pieza, tratamiento, cantidad por fila; técnico en el encabezado si
  se cargó).
- `src/lib/nav.ts`: "Remitos" se saca del menú lateral — se fusiona con Logística. La ruta
  `/remitos` sigue accesible como historial vía "Ver remitos anteriores →" dentro de
  Logística, con una excepción en `rutaPermitida` (mismo patrón que `/taller/<id>` en
  Release 2) ya que dejó de tener su propio ítem de `NAV_ITEMS`.

Probado de punta a punta en el navegador: se armó un remito real con dos piezas distintas
(Wiper + Tuerca de elevación) para "Cromados del Sur" desde `/logistica` y se generó
correctamente como REMITO N° 0004 con ambas filas en la vista imprimible.

**✅ Paquete 6 — Planificación semanal (2026-09-28).** Pedido explícito del cliente (§4 más
arriba): "asignar un trabajo específico a una persona, para un día determinado, con
anticipación (ej. planificar toda la semana siguiente)".

- **Investigación previa, antes de construir:** el otro punto de §4 — "al mandar un trabajo
  a fabricación desde Taller, el trabajo vuelve hacia atrás o desaparece de la
  visualización actual" — es una queja de la reunión original (4/9), de **antes** de que
  existieran Centros de trabajo, Avance por sección o el acordeón de la OT. Se revisó
  `getColaPorCentroTrabajo` (produccion.ts): una pieza en curso sigue apareciendo en
  "disponible ahora" de su centro (no desaparece al empezarla), y con todo lo construido en
  esta Release 3 el estado de cualquier pieza es visible desde /avance, /centros-trabajo,
  /inicio y la ficha de la OT. No se encontró un bug puntual reproducible — queda como
  pregunta para confirmar con Horacio en la próxima reunión si el síntoma persiste con la
  versión actual o si ya quedó resuelto de rebote.
- Nueva tabla `asignacion_trabajo` (otPieza + operario + fecha) — se asigna la OT de pieza
  completa, no una operación puntual; si la pieza avanza de etapa antes de esa fecha la
  asignación queda igual, como referencia de que alguien se comprometió a mirarla ese día.
- Nueva pantalla `/planificacion`: grilla semana (lunes a sábado) × operario con lo ya
  asignado, navegación semana anterior/siguiente, y debajo el trabajo disponible para
  asignar (mismos datos que `/centros-trabajo`, con un formulario de asignar operario+fecha
  por fila).
- `/taller` (operario): las piezas asignadas para hoy muestran un badge "Asignado hoy" y
  suben al principio de la lista.

**Interacción encontrada al probar, sin resolver — pregunta para la próxima reunión:** el
filtro de centro de trabajo de Release 2 (`usuario.centroTrabajoId`) tiene prioridad sobre
la asignación — un operario con centro fijo asignado (ej. Nico → Torno) NO ve una pieza
asignada para hoy si esa pieza está en otro centro en este momento. Probado en el
navegador: se asignó una pieza en "Corte por hilo" a Nico (centro "Torno") para hoy y no
apareció en su `/taller`. ¿Una asignación explícita de Horacio debería poder saltarse el
filtro de centro, o el filtro de centro sigue siendo la regla y una asignación fuera de su
centro no tiene sentido? No se resolvió unilateralmente — es una decisión de producto.

**✅ Paquete extra 4 — /stock rediseñada de nuevo, comentario directo de Matías
(2026-09-28).** El paquete de Stock en vivo (más arriba) arregló los números; no arregló
que la pantalla abriera vacía — sólo título, descripción y un buscador sin nada hasta
escribir algo. Comentario textual: *"qué imagen me da a mí como ingeniero esa hoja? qué
puedo ver? qué puedo accionar? nada."*

- 4 métricas arriba (mismo `MetricCard` que Avance/Inicio): piezas por debajo del mínimo,
  unidades finalizadas, unidades en proceso, unidades en proceso tercerizado.
- Nueva sección "Por debajo del mínimo": accionable, con ajuste inline para taller — antes
  esta alerta, la más importante de todas, no se veía en ningún lado.
- "En proceso, por etapa" pasa de tabla numérica a barras horizontales proporcionales,
  mismo lenguaje visual que Avance y el acordeón de la OT.
- El buscador baja a "Buscar una pieza puntual", ya no es lo único en la pantalla.

**Otro campo modelado y nunca usado, mismo patrón que `pieza.tipo` y `wip_pieza`:**
`pieza.stockMinimo` quedó siempre en 0 desde la migración del Excel — la alerta de mínimo
no tenía nada para mostrar porque nada podía estar "por debajo de 0". Se agregó editable
en `/maestros/pieza/[id]`, probado end-to-end (se cargó un mínimo real, apareció en la
alerta, se revirtió).

**✅ Paquete extra 5 — /stock: drill-down por etapa + selector de piezas (2026-09-28).**
Tercer comentario seguido de Matías sobre esta misma pantalla: *"pensá que no tenemos el
detalle del stock en ningún lado si no"* — las barras de "por etapa" mostraban un número
agregado (ej. "Compras: 517 u. · 105 piezas") sin ningún lugar donde ver CUÁLES piezas lo
componen.

- Cada barra de etapa es ahora un link a `/stock/etapa/[procesoId]` (nuevo): el detalle
  pieza por pieza de esa etapa puntual — código, nombre, OT pieza y máquina, cada uno
  linkeado a su ficha. Nueva `getPiezasEnEtapa` en `stock.ts`, mismo cálculo batcheado que
  `getResumenWipEnCursoPorProceso` pero sin agregar al final.
  - *Bug encontrado y corregido en el momento:* la página de detalle mostraba
    "289 piezas distintas" (= cantidad de líneas de OT) mientras el agregado de origen
    decía "105 piezas" (= piezas de catálogo distintas, deduplicadas) — mismo dato, dos
    definiciones de "pieza" distintas mostrando números que no coinciden entre pantallas,
    exactamente el tipo de inconsistencia que motivó reconstruir Stock en primer lugar. Se
    corrigió mostrando ambos números con su propia etiqueta ("105 piezas distintas en 289
    órdenes de trabajo").
- Selector de piezas (`PiezaSelect`, nuevo) al lado del buscador de texto: pedido de
  Matías, *"podríamos poner un seleccionable de todo lo que se puede buscar"* — un
  `<select>` con las ~450 piezas del catálogo (código — nombre), elegir una navega igual
  que si se hubiera escrito el código a mano.

**✅ Paquete extra 6 — las 4 tarjetas de /stock, todas a un destino real (2026-09-28).**
Matías: *"los botones de las cards no te llevan a ningún lado salvo el último que te manda
a logística. Por qué?"* — las primeras tres usaban anclas `#minimo`/`#etapas` dentro de la
misma página; dos problemas reales, no percepción: (1) `#minimo` sólo existía en el DOM
cuando había piezas por debajo del mínimo — con 0 (el caso normal) el link apuntaba a un
id inexistente; (2) `#etapas` sí existe siempre, pero en una pantalla de esta altura ya
está visible sin scrollear, así que el clic navegaba (el hash de la URL cambiaba) sin
ningún movimiento perceptible — indistinguible de "no hace nada".

- "Por debajo del mínimo" ahora se renderiza siempre (antes sólo con `stockBajo.length >
  0`), con un mensaje positivo cuando no hay ninguna — el ancla nunca vuelve a apuntar a
  un id que no existe.
- "Unidades finalizadas en stock" → nueva página `/stock/finalizado`: todas las piezas con
  stock disponible, ordenadas de mayor a menor.
- "Unidades en proceso" → nueva página `/stock/en-proceso`: TODAS las piezas en proceso
  en cualquier etapa, en una sola lista plana con columna "Etapa" — complementa (no
  reemplaza) el desglose por etapa de abajo, que sigue en la misma pantalla con sus links
  a `/stock/etapa/[procesoId]`.
- `getPiezasEnEtapa` se generalizó a `getPiezasEnProceso(procesoId?)` — sin argumento trae
  todo, con argumento filtra a una etapa — mismo cálculo batcheado, una sola función para
  los dos casos en vez de duplicar la consulta.

Pendiente: el resto de los paquetes de §18 (adjuntos de ingeniería, indicadores).

**✅ Paquete 9 — Centros de trabajo: detalle por clic + separar compra/fabricación
(2026-09-28).** Pedido explícito y remarcado por Matías como "de las cosas más
importantes del sistema" — quedaba pendiente del §13 original.

- **Detalle por clic**: cada pieza de la cola (tanto "disponible ahora" como "a futuro")
  ahora es un link a `/ot/[otMaquinaId]/pieza/[otPiezaId]` — la misma pantalla de detalle
  que ya usan Stock y Avance. El arrastre para reordenar sigue funcionando: el `pointerdown`
  que inicia el drag quedó acotado al ícono ⠿ (antes estaba en toda la fila, que ahora es
  el link) — probado en el navegador simulando la secuencia completa de Pointer Events
  (down → move → up), confirmando que el reorden se sigue guardando.
  - Esa pantalla de detalle ahora también muestra, junto al estado: **si está asignada y a
    quién** (reusa `asignacionTrabajo` de Planificación — antes esa información sólo se veía
    en `/planificacion` o como badge "Asignado hoy" en `/taller`), y resalta en la hoja de
    ruta cuál es la **operación actual** en vez de dejar que se deduzca mirando qué fila no
    tiene operario. Se agregó `getEstadoYOperacionActual` en vez de `estadoDePieza` (ya
    traía `operacionActual`, sólo no se estaba usando acá) — nueva consulta:
    `getAsignacionesVigentesBatch` en `planificacion.ts`.
  - En la propia pantalla de Centros de trabajo también se ve un badge compacto
    "Asignada hoy/el DD·MM a &lt;nombre&gt;" sin necesidad de entrar al detalle, para no
    perder el vistazo rápido que ya tenía la pantalla.
- **Separar compra/fabricación**: el problema real, encontrado al leer `getColaPorCentroTrabajo`,
  es que una pieza `comprada` no tiene hoja de ruta (no la fabrica ningún centro) y hoy
  simplemente desaparece de todas las colas — no está "junto" con las de fabricación, está
  invisible, aunque su OT de pieza siga abierta esperando que llegue. Nueva sección
  "Piezas de compra pendientes" al pie de la pantalla: junta las OT de pieza de piezas
  `comprada` cuyo stock actual todavía no cubre lo que esa orden necesita (`getPiezasCompraPendientes`
  en `produccion.ts`) — son justo las que "dependen de una compra todavía no resuelta" y
  frenan el armado de su conjunto igual que una pieza trabada en un centro. Probado
  marcando temporalmente una pieza real como `comprada` con stock insuficiente: aparece
  correctamente con "faltan X de Y" por cada OT máquina que la necesita; revertido después
  del test.
  - Nota: hoy no hay ninguna pieza real marcada `tipo = comprada` en los datos (el único
    caso se probó y revirtió en una ronda anterior de testing) — la sección funciona pero
    está vacía en este momento; se llena sola en cuanto ingeniería marque piezas de compra
    en Maestros.

**✅ Paquete 7 — Adjuntos de ingeniería: planos y fotos por pieza (2026-09-28).** Pausado
explícitamente hasta ahora ("no avancemos con lo de ingeniería aún, te paso las credenciales
de Blob para que ya las tengas") — Matías dio el visto bueno para construirlo en esta misma
ronda ("ingeniería debe poder editar los maestros y agregar no sólo observaciones, sino
también agregar un plano y/o imágenes").

- Tabla nueva `pieza_adjunto` (id, piezaId, tipo `plano`\|`foto`, nombreArchivo, pathname,
  usuarioId, createdAt) — aparte de `pieza_nota` (esto es un archivo, no texto) y aparte del
  viejo `pieza.fotoPathname` (nunca se usó, sólo admitía una foto; una pieza puede tener un
  plano + varias fotos a la vez).
- `src/lib/blob.ts`: wrapper de `@vercel/blob` — `subirAdjunto`/`eliminarAdjunto` pasan el
  token explícito (`BLOB_READ_WRITE_TOKEN`) porque el SDK intenta autenticar por OIDC primero
  si detecta `VERCEL_OIDC_TOKEN` en el entorno, y ese modo falla en "development" si el
  proyecto no lo tiene habilitado ahí — gotcha encontrado al probar el primer upload.
- **Nueva env var `BLOB_PUBLIC_BASE_URL`**: en la base sólo se guarda el `pathname` del blob
  (nunca la URL completa, ver runbook §A5 — la URL completa incluye el store y cambia si el
  store cambia). `urlDeAdjunto()` la reconstruye en runtime combinando esta env var con el
  pathname — es lo único que hay que actualizar el día del traspaso a la cuenta de REINER
  para que todos los adjuntos sigan resolviendo, sin tocar una sola fila de la base. Agregada
  a Production/Preview/Development en Vercel además de `.env.local`.
- `next.config.ts`: `experimental.serverActions.bodySizeLimit` subido a 15 MB (el default de
  Next, 1 MB, no alcanza para un plano o una foto de celular).
- Sección "Adjuntos de ingeniería" en `/maestros/pieza/[piezaId]`: subir (tipo + archivo,
  server action directa con `FormData`), listar (miniatura para fotos, badge para planos,
  autor y fecha) y eliminar (borra del blob y de la base). Probado en el navegador subiendo
  un archivo de texto como "plano" y una imagen real como "foto" (miniatura visible),
  confirmando que la URL pública resuelve y descargando el archivo; después eliminados los
  dos adjuntos de prueba.

**✅ Paquete extra 7 — OT suelta independiente: conjunto o pieza sin máquina completa
(2026-09-28).** Devolución del cliente: *"a veces les compran o necesitan para un
mantenimiento producir sólo un conjunto o una pieza para un cliente."* La "OT suelta" que ya
existía (Release 2, §6) sólo cubre agregar una pieza puntual a una máquina YA registrada en
el sistema — el límite quedó anotado en su momento en el propio comentario del código
("no cubre una máquina entregada antes de que existiera este sistema... queda para cuando
surja el caso real") y ahora apareció ese caso real.

- Columna nueva `ot_maquina.tipo` (`"maquina"` \| `"suelta"`, default `"maquina"` — push
  aditivo, sin ambigüedad de rename). Una orden suelta sigue creando una fila en
  `ot_maquina` (reutiliza todo el cálculo de estado y las pantallas existentes tal cual)
  pero con prefijo de código **OTS** en vez de **OTM**, y `numeroSerie` pasa a usarse como
  una referencia libre en vez de un número de serie real.
- `generarOrdenSuelta` (`ot.ts`): a diferencia de `generarOtMaquina`, NO explota todos los
  conjuntos del modelo — crea sólo el `ot_conjunto` pedido (uno) y, según el caso, o bien
  la explosión normal de ESE conjunto contra stock (conjunto completo) o una única
  `ot_pieza` con la cantidad que cargó quien la pidió (pieza puntual, mismo criterio que
  `generarOtPiezaSuelta`: la cantidad no sale de ningún cálculo de BOM).
- `/ot/nueva` ahora tiene dos pestañas ("Máquina completa" / "Conjunto o pieza suelta").
  La pestaña nueva es un formulario en cascada: elegís la máquina (de ahí sale el catálogo
  de conjuntos y piezas vía `piezaConfiguracion`), después "un conjunto completo" o "una
  pieza puntual" con su cantidad.
- `/ot` y `/ot/[id]` muestran un badge "Suelta"/"Orden suelta" y la referencia en vez de
  "Serie N" cuando `tipo = "suelta"` — el resto de la pantalla de detalle (acordeón de
  conjuntos, piezas, progreso) es la misma que ya existía, sin casos especiales.
- Probado en el navegador de punta a punta: generada una orden suelta de conjunto completo
  (Cabezal de PS120I, código `OTSTEST-suelta-conjunto-01`, creó sólo 1 conjunto con 9
  piezas a fabricar) y una de pieza puntual (Freno tipo D de RD-std, cantidad 5, código
  `OTSTEST-suelta-pieza-01`) — verificado el badge en el listado, el código con prefijo
  OTS, y que la cantidad cargada (5) persistió correctamente en el detalle; ambas órdenes
  de prueba borradas después.

## 20 · Segunda devolución del cliente (2026-09-29) — organizada por área

El cliente respondió las 11 preguntas del informe de Fase 2 y mandó observaciones nuevas
por área. Antes de tocar código se cruzó cada respuesta con su pregunta original (ver
`docs/entregables/REINER - Fase 2 - Informe de avance.docx`, sección final) — quedó
documentado en el chat con el usuario, no repetido acá para no duplicar. Dos hallazgos de
esa vuelta condicionan el modelo de datos y quedan como pregunta abierta, no resueltos
unilateralmente:

- **Centros de trabajo reales**: el cliente mandó una lista de 6 (Taller, Electrónica,
  Corte por hilo, Torno, Torno CNC, Centro de mecanizado) — bastante más corta que los ~12
  procesos que hoy generan centro propio. Falta el mapeo completo (qué proceso actual va a
  cuál de los 6) antes de tocar `centro_trabajo`.
- **Operario ↔ centro de trabajo es de varios a varios**, no 1 a 1 como asume hoy
  `usuario.centroTrabajoId` (un operario puede ocupar dos puestos, un puesto puede tener
  dos operarios) — esto es además la causa más probable de la pregunta abierta del §17
  sobre planificación asignada fuera del centro fijo del operario. Cambio de modelo real,
  pendiente de encarar (tabla puente `usuario_centro_trabajo` en vez del FK único).

Del resto de las respuestas: 2, 3, 6, 9, 10 y 11 confirman diseño o trabajo ya construido
(sin acción). 5, 7 y 8 alimentan el trabajo de esta sección.

**✅ Paquete extra 8 — Maestros: todos los campos de la pieza editables (2026-09-29).**
Devolución del cliente: *"todos los campos de las piezas deberían ser editables por
ingeniería, hojas de ruta, nro de plano, revisión, material, etc."*

- `pieza.revision` pasó de sólo lectura a editable (mismo patrón que Material).
- Columna nueva `pieza.numeroPlano` (push aditivo) — editable igual que Revisión. No se
  mezcla con los adjuntos de planos (archivo) del paquete anterior: uno es el número de
  plano como dato, el otro es el archivo en sí.
- **Hoja de ruta editable de verdad**, no sólo el texto de `descripcion` (que ya existía):
  el "Proceso" de cada paso ahora es un `<select>` con auto-submit
  (`ProcesoOperacionSelect`), se puede agregar una operación al final (elige proceso,
  `agregarOperacion` calcula la siguiente secuencia sola), eliminarla (bloqueado por la
  propia base si ya tiene `registro_operacion` — el error de FK no se traga en silencio) y
  moverla un lugar arriba/abajo intercambiando `secuencia` con el vecino (nada de
  drag&drop — una hoja de ruta rara vez pasa de 10 pasos).
- **Corrección de la pregunta 8** (OPS vacío = dato que falta, no "1"): `OperacionConDetalle.ops`
  pasa de `number` a `number | null` — antes `getRoutingPieza` defaulteaba a 1 con `?? 1`,
  mostrando un valor inventado como si fuera real. Ahora un OPS vacío se muestra
  explícitamente como "falta cargar", nunca como "1".
- Probado en el navegador: reordenar (subir/bajar, confirmado por el orden de los
  `<select>` en el DOM ya que varios pasos comparten el mismo proceso visualmente),
  cambiar el proceso de un paso, agregar y eliminar una operación de prueba — todo
  revertido al estado original después.

**✅ Paquete extra 9 — Tercerizados: generar un remito registra el egreso solo
(2026-09-29).** Devolución del cliente: *"generar un movimiento y que quede registrado y a
la vez se haga el remito"* + *"que quede toda centralizada la info, no en diferentes
pestañas."* Confirmado en el código antes de tocar nada: `generarRemito` y
`registrarIngreso`/`registrarEgreso` eran dos flujos totalmente desconectados en la misma
pantalla — armar un remito nunca tocaba `movimiento_stock` ni `stock_pieza`, así que una
pieza mandada a cromar seguía figurando como disponible hasta que alguien registrara el
egreso a mano por separado (o no lo hiciera).

- `generarRemito` ahora inserta, en la misma transacción que crea el remito y sus items,
  un `movimiento_stock` tipo "egreso" por cada pieza (con el número de remito y el
  tratamiento en la observación) y descuenta `stock_pieza.cantidadDisponible`.
- Columna nueva `movimiento_stock.remitoId` (push aditivo, sin FK real — mismo criterio
  suelto que ya usa `otPiezaId`, es trazabilidad, no integridad referencial) para poder
  volver del movimiento al remito que lo generó.
- "Movimientos recientes" en Tercerizados ahora muestra un link "Ver remito →" cuando el
  movimiento vino de uno.
- El "Registrar ingreso o egreso" manual sigue existiendo tal cual — sigue haciendo falta
  para movimientos que no pasan por remito (ej. compra de materia prima).
- Probado en el navegador de punta a punta: armado un remito de prueba para
  "Cabezal parte inferior D-20" (stock 1→0 tras generarlo, confirmado en su ficha de
  Maestros), verificado el link "Ver remito →" en Movimientos recientes apuntando al
  remito correcto — remito, movimiento y stock revertidos después.

**✅ Paquete extra 10 — Avance: iniciar/finalizar una operación sin entrar a cada pieza
(2026-09-29).** Devolución del cliente: *"que se puedan modificar los estados de la pieza
desde el avance y no tener que entrar a cada pieza (tanto así como de conjunto)."*

- Cada tarjeta de máquina en `/avance` suma un "▸ Ver piezas" (estado de React, sin
  navegar) que expande, agrupado por conjunto, las piezas todavía no terminadas con su
  operación actual — y ahí mismo un botón ▶ Iniciar o (si el usuario tiene esa operación
  abierta) el formulario compacto de ✔ Finalizar. Son las MISMAS acciones que ya usa
  `/taller` (`iniciarOperacionAction`/`finalizarOperacionAction`, sin lógica nueva) — sólo
  se les dio un lugar más para vivir, sin duplicar la máquina de estados.
- `listarOtMaquinas` (ot.ts) extiende `secciones` con el detalle por pieza necesario
  (`SeccionPieza`: operación actual, si es la última de la ruta) — sale de
  `getEstadosBatch`, ya calculado en batch para toda la máquina, así que no agrega
  ninguna consulta nueva por pieza (el mismo problema de N+1 que ya frenó a
  `/centros-trabajo` una vez, documentado arriba en el propio archivo).
- Respeta la regla existente de "una sola operación abierta por usuario a la vez": el
  botón Iniciar desaparece de toda la pantalla en cuanto el usuario tiene una operación
  abierta en cualquier lado, y sólo esa pieza puntual muestra el Finalizar — mismo
  comportamiento que ya fuerza `/taller`, no una regla nueva.
- Alcance acotado a propósito: no hay una acción de "cerrar todo el conjunto de un
  golpe" — cada pieza puede estar en un paso distinto de su hoja de ruta (algunas en
  setup, otras en fabricación), así que un cierre masivo sin que alguien confirme
  OK/rechazadas por pieza sería inventar datos de producción. "Tanto así como de
  conjunto" se interpretó como "agrupado por conjunto en la vista", no como un botón de
  cierre masivo — a confirmar con el cliente si el pedido era literal.
- Probado en el navegador: expandido "OTM999" (pendiente), iniciada la operación de
  "Soporte superior gabinete" (Taller/armado, su última operación) directamente desde
  Avance, confirmado que el resto de los botones Iniciar de la pantalla desaparecieron,
  finalizada con OK=1, y confirmado que el contador de la tarjeta pasó de 0/128 a 1/128
  y el estado de "Pendiente" a "En curso" sin recargar manualmente — revertido después
  (borrado el registro de ejecución, restablecidos los contadores de la OT de pieza).

**✅ Paquete extra 11 — Revisión: subtareas de retrabajo con cronómetro (2026-09-29).**
Devolución del cliente, con el ejemplo que trajo: *"hay que retrabajar un eje de
compresión, se genera automáticamente, una vez en revisión, entro a ese retrabajo y lo
voy editando... agrego una tarea y puedo iniciar un contador para que temporice y así
saber cuánto me cuesta esto a fin de cuentas."*

- Tabla nueva `tarea_revision_item` (descripción, inicio, fin, duracionSeg, usuario) —
  mismo patrón inicio/fin/duracionSeg que `registro_operacion`, calculado sólo al
  detener. Una tarea corriendo a la vez POR RETRABAJO (no por usuario global como en
  taller) — tiene sentido acotarlo así porque un retrabajo es una unidad de trabajo en
  sí misma, no una cola de operario.
- Dentro de cada tarea de revisión pendiente (en la ficha de la OT de pieza, donde ya
  vivían desde Release 3 §10): agregar una subtarea (texto libre), iniciarla (▶,
  deshabilitado si ya hay otra corriendo en ese mismo retrabajo), detenerla (⏸, calcula
  la duración), o eliminarla si todavía no arrancó. El total de tiempo registrado se
  suma y se muestra arriba de la lista. El "Resolver" final (ya existía) queda
  intacto — las subtareas son el detalle de CÓMO se llegó a esa resolución, no la
  reemplazan.
- Probado en el navegador de punta a punta: generado un retrabajo real (finalizando una
  operación desde Avance con piezas a retrabajar > 0), agregadas 3 subtareas, iniciada y
  detenida la primera (duración calculada correctamente), iniciada la segunda y
  confirmado que el botón Iniciar de la tercera queda deshabilitado mientras la segunda
  corre — todo revertido después (subtareas, tarea de revisión, registro de ejecución y
  contadores de la OT de pieza).

**✅ Paquete extra 12 — Operario ↔ centro de trabajo: de varios a varios (2026-09-30).**
Devolución del cliente (2ª ronda, pregunta 4 de Fase 2): *"un operario puede ocupar dos
puestos, un puesto de trabajo puede ser ocupado por dos operarios también."* El modelo
original asumía 1 a 1 (`usuario.centroTrabajoId`, FK único) — quedaba anotado en el
propio comentario del código como una asunción de arranque.

- `usuario.centroTrabajoId` reemplazado por una tabla puente `usuario_centro_trabajo`
  (PK compuesta usuarioId+centroTrabajoId). Migración en 3 pasos sobre la base ya
  sembrada: tabla nueva (aditivo) → migrar el único dato real que había (Nico → Torno)
  → recién ahí borrar la columna vieja. Sin ambigüedad de rename en ningún paso.
  `getCentrosDeUsuario`/`getCentrosDeUsuariosBatch`/`asignarCentrosTrabajo` nuevas en
  `produccion.ts`.
- `/usuarios`: el `<select>` de uno solo pasa a una lista de checkboxes compacta detrás
  de un resumen ("2 centros") — cada click llama la acción directo con la lista completa
  ya actualizada (no depende de que el DOM de hidden inputs se sincronice a tiempo con
  un `requestSubmit()`).
- `/taller`: el filtro de "sólo lo que está en mi centro" pasa de `===` a
  pertenencia a un conjunto — sin centros asignados, el operario sigue viendo todo
  (comportamiento sin cambios).
- **De paso, arreglada la pregunta abierta del backlog (§17)** sobre Planificación: una
  pieza asignada para HOY ahora se ve igual aunque su etapa actual esté en otro centro —
  antes el filtro de centro la tapaba silenciosamente incluso habiendo una asignación
  explícita, que es justo lo que había quedado sin resolver.
- Probado en el navegador de punta a punta con los dos roles reales: desde `/usuarios`
  (Horacio) se le agregó "Corte por hilo" a Nico (que ya tenía "Torno" migrado),
  confirmado "2 centros" tras recargar; logueado como Nico, `/taller` mostró 5 piezas —
  confirmado por consulta directa que las 5 estaban en su paso actual de Corte por hilo
  (no Torno), probando que el OR entre centros funciona. Sacado "Corte por hilo" de
  nuevo (vuelta al estado migrado original, sólo Torno): `/taller` pasó a mostrar "No hay
  piezas pendientes" — Torno no tiene nada disponible ahora mismo, confirmando que el
  filtro no cae en "mostrar todo" por error.

**✅ Paquete extra 13 — Centros de trabajo reales del cliente (2026-09-30).** Devolución
del cliente (2ª ronda, pregunta 1 de Fase 2): *"los centros de trabajo serían, taller,
electrónica, corte por hilo, torno, torno cnc, centro de mecanizado."* Su lista es más
corta que los procesos internos que ya existían (~19), así que antes de tocar nada se
comparó con el comentario original de la migración (`scripts/lib/normalizacion.ts`):
*"CENTRO CNC / TORNO CNC son máquinas distintas del 'CNC'/'Torno' genérico... hasta
confirmar con Julián si ameritan distinguirse"* — la respuesta confirma que sí son
distintos, pero **no aclara si "Torno CNC" o "Centro de mecanizado" del cliente SON
alguno de los centros ya existentes con nombre parecido (`CNC`="Centro CNC",
`MECANIZADO`="Mecanizado") o son un tercer concepto**. Terminología real de taller
("Torno CNC" = torno con control numérico, "Centro de mecanizado" = fresadora CNC) hace
plausibles varias lecturas distintas, así que no se adivinó:

- Se agregaron **tres centros/procesos nuevos** (aditivo, nada renombrado ni borrado):
  `TORNO_CNC` ("Torno CNC"), `CENTRO_MECANIZADO` ("Centro de mecanizado") y
  `ELECTRONICA` ("Electrónica" — no existía ningún concepto parecido antes). Los ~19
  centros que ya existían (incluidos "Centro CNC" y "Mecanizado") quedaron intactos.
  `procesos.json` actualizado y `scripts/seed-db.ts` re-corrido (idempotente,
  `onConflictDoNothing`) para sembrarlos en la base ya viva sin tocar el resto.
  `NOMBRE_PROCESO`/`ORDEN_FLUJO` en `normalizacion.ts` actualizados para que una futura
  re-migración del Excel los reconozca.
- Quedan vacíos (sin ninguna operación ruteada) hasta que ingeniería los empiece a usar
  — ahora aparecen como opción en "Agregar operación" de la hoja de ruta editable de
  Maestros (paquete extra 8).
- **Pregunta para la próxima reunión**: ¿"Torno CNC" y "Centro de mecanizado" son estos
  centros nuevos y vacíos, o en realidad son los ya existentes "Centro CNC"/"Mecanizado"
  con otro nombre? Si es lo segundo, hay que fusionar en vez de dejarlos como conceptos
  separados — y de paso hacen falta las piezas actuales para saber qué operaciones
  reasignar.
- Probado en el navegador: confirmado que los tres aparecen en el selector de "Agregar
  operación" de Maestros, con ids e ítems distintos de `CNC`/`MECANIZADO`; `/centros-
  trabajo` sigue mostrando los mismos 12 centros con trabajo real que antes (los tres
  nuevos no tienen nada ruteado todavía, así que no aparecen ahí — mismo comportamiento
  que cualquier centro sin cola).

**✅ Paquete extra 14 — Resolución de centros CNC + export de OT de pieza (2026-09-30).**
El cliente contestó la pregunta que había quedado abierta en el paquete 13, y de paso
mandó una foto de la "OT de pieza" real en papel que usa taller, pidiendo poder
exportarla desde el sistema.

- **Centros CNC**: la respuesta ("Torno" / "Centro de mecanizado CNC") confirma que son
  sólo dos máquinas, no tres — así que los dos centros vacíos agregados en el paquete 13
  (`TORNO_CNC`, `CENTRO_MECANIZADO`) se borraron (no tenían ninguna operación ruteada
  todavía, confirmado antes de borrar) y el `CNC` existente (que sí tiene 122 operaciones
  reales cargadas, antes "Centro CNC") se renombró directamente a "Centro de mecanizado
  CNC". `MECANIZADO` ("Mecanizado", el de Fierro/CS-03) no se tocó — el cliente no lo
  nombró y tiene datos reales propios. Aplicado en la base viva (updates/deletes
  puntuales, sin duplicar) y en `procesos.json`/`normalizacion.ts` para que una
  re-siembra futura quede consistente. Probado en `/centros-trabajo`: "Centro de
  mecanizado CNC" muestra el mismo trabajo real que antes tenía "Centro CNC" (1 ahora,
  122 a futuro), sin los dos centros vacíos.
- **Export de OT de pieza**: nueva pantalla `/ot/[id]/pieza/[otPiezaId]/imprimir`
  (botón "Imprimir OT" en la ficha de la pieza), que reproduce el papel que hoy llena
  taller a mano — mismo layout, usando `window.print()` como ya se hacía para el remito
  (`ImprimirButton`, mismo patrón). Se completan con datos reales todos los campos que el
  sistema ya tiene: pieza, conjunto, cliente, OTC, Nº de orden de compra del cliente
  (`otMaquina.ordenCompra`, que resuelve de paso la pregunta 9 de Fase 2), hoja de ruta
  con operario y tiempo real por paso (de `registro_operacion`), tipo y tiempo de
  paradas, y los 4 contadores de piezas OK/NO OK/defectuosas/retrabajadas. Los campos que
  el papel trae pero el sistema no modela todavía (Armado de máquina, Fabricación/
  dimensiones, medidas toleradas y no toleradas, Relevo, Firma) se imprimen en blanco
  para completar a mano, igual que en el original — no son datos inventados, son huecos
  reales del formulario que ingeniería/calidad sigue llenando a mano.
  - `getContextoOtPieza` nueva en `data/ot.ts` (resuelve otConjunto → otMaquina →
    cliente desde una OT de pieza).
  - **Pendiente para la próxima reunión**: "COD HS PROD CNC/TORNO/HILO/TALLER" en el
    papel original parece un costo/tarifa por hora por centro — si lo es, es exactamente
    el dato que falta para los Indicadores de costo (paquete pendiente desde la primera
    ronda). Vale la pena preguntarle al cliente qué son esos códigos antes de modelarlos,
    en vez de adivinar.
- Probado en el navegador con datos reales: `OTM999C16P2` (sin historial) imprime todos
  los campos en blanco correctamente; `OTM12C01P12` (con historial real) muestra "Nico"
  y "0 min" en el paso de Torno, "Centro de mecanizado CNC" como paso 2, y "015" como
  orden de compra del cliente — confirmando que el merge de centros y el export leen el
  mismo dato real sin duplicar ni inventar nada.

## 21 · Revisión del socio antes de enviar a REINER (2026-10-02)

Matías pasó el listado de respuestas del cliente con comentarios de su socio en rojo
(`listado de respuestas reiner.docx`). Cada comentario se contrastó contra el código
antes de tocar nada:

| Comentario del socio | Diagnóstico | Qué se hizo |
|---|---|---|
| #1 centros "Corregirlo" | Ya resuelto en el paquete 14 (Torno + Centro de mecanizado CNC) | — |
| #2 "No lo veo resuelto" | El cliente contestó "no" (sólo taller ajusta stock): no había cambio que hacer | — |
| #5 stock futuro/comprometido "No lo veo implementado" | Cierto. "Futuro" existía como "En proceso" sin ese nombre; "comprometido" no existía: la explosión de OT leía el stock sin reservarlo, dos máquinas podían contar la misma pieza | Paquete 15 |
| #7 Descartador | El socio indica dejarlo así | — |
| #9 orden de compra "no veo nada vinculado" | Existía (alta de OT, detalle, OT impresa) pero no en el listado de OT | Columna en `/ot` |
| Revisión "No lo veo resuelto" | El cronómetro existe, pero sólo aparece dentro de una pieza con retrabajo pendiente y no había ninguno. No se volvió a crear `/revision` (el cliente pidió sacarla en §10) | Más visible: tarjeta en Inicio para todo el staff (antes sólo ingeniería/dirección) y marca "retrabajo →" en Avance |
| Stock confuso + "te manda a maestros" | Cierto | Paquete 15 |
| Logística (egreso manual, búsqueda, ingreso/egreso poco claros, tabla de "en manos del proveedor") | Cierto | Paquete 16 |
| Avance "no lo veo bien resuelto" | Lo del paquete 10 era iniciar/finalizar cronometrado, a nombre de quien lo usaba, en una lista plana de 100+ piezas | Paquete 17 |
| Indicadores de costo | Sigue pendiente de que el cliente defina de dónde sale el costo | — |

**✅ Paquete extra 15 — Stock en cuatro grupos + ficha de stock + compras.**
- `reserva_stock` (nueva): al generar una OT (máquina, suelta de conjunto, completar
  conjunto) lo que el stock cubre queda reservado para esa máquina (`reservarStockLibre`
  reemplaza al `getStockDisponible` de la explosión). Libre = almacén − comprometido. Las
  4 OT existentes se reconstruyeron con un script único sobre datos reales (lista de
  piezas de la configuración vs. lo que el stock cubrió al generar, topeado por el stock
  real y en orden de creación): 215 reservas, 290 unidades.
- `/stock`: cuatro tarjetas — en almacén libre, comprometido, stock futuro (en
  fabricación), compras pedidas / por pedir. "Compras" ya no figura como una etapa del
  stock futuro (era la fila más grande y mezclaba "falta comprar" con "en fabricación").
- `/stock/pieza/[id]` (nueva): reemplaza el link a Maestros. Muestra almacén, libre,
  comprometido por OT, en fabricación y pedido; **"Registrar retiro"** con cantidad, OT y
  motivo, que guarda quién lo sacó. Sin OT sólo puede tocar lo libre; con OT consume su
  reserva. La corrección de conteo (sólo taller) quedó plegada abajo.
- `pedido_compra` (nueva) + `/stock/compras`: pendientes de pedir → "Pedido" (proveedor,
  cantidad) → "Pedidas, esperando que lleguen" → registrar llegada con control. NO OK
  queda asentado y el pedido sigue abierto; OK cierra el paso de Compras de la pieza
  fabricada (pasa sola a su siguiente etapa) o, si es pieza comprada, suma al almacén ya
  reservada para su OT. Esos cierres van sin duración y se excluyen del tiempo estándar.

**✅ Paquete extra 16 — Tercerizados ordenado por circuito.** Arriba "Afuera, esperando
que vuelvan" (una fila por OT de pieza, con "Registrar vuelta" + control: OK cierra el
paso tercerizado); después armar remito (genera el egreso solo); después movimientos con
tipo en color (↓ Ingreso verde, ↑ Egreso rojo, cantidades +/− coloreadas). **Se sacó el
egreso manual.** El ingreso suelto (sin pedido ni remito) quedó plegado al final.

**✅ Paquete extra 17 — Avance: cambiar estados de pieza y de conjunto.** Reemplaza el
iniciar/finalizar del paquete 10. Cada cuadradito de "Por sección" despliega ese conjunto
dentro de la tarjeta; cada pieza tiene un selector Pendiente/En curso/Terminada y cada
conjunto un "Cambiar todo a…". Se guarda en `ot_pieza.estado_manual` (pisa al estado
derivado en Avance, OT, Stock, Centros de trabajo y Taller), sin crear registros ni
tiempos; "Automático" lo devuelve a lo que calcula taller.

Probado en el navegador y con scripts (todo revertido después): estado por pieza y por
conjunto en OTM999 (0→1→25→0/25 piezas); pedido → llegada NO OK (sigue abierto) → OK
(cierra Compras, dos ingresos asentados); retiro rechazado por exceder lo libre (mensaje
en pantalla) y retiro para OTM999 (almacén 32→29, reserva 8→5); OT suelta de prueba
reservando stock (libre 21→20) y vuelta de tercerizado cerrando su paso.

**Para la próxima reunión:**
- Indicadores de costo: de dónde sale el costo (¿los "COD HS PROD" del papel de OT?).
- ¿Quién puede retirar del almacén? Hoy cualquier usuario de oficina/taller (no operarios).
- El estado manual de Avance no cronometra: si taller sigue cargando en `/taller`, el
  manual pisa al automático hasta volverlo a "Automático".

## 22 · Testing integral punta a punta (2026-10-02)

Lo que pidió el cliente en §1: seguir un trabajo real de punta a punta con los cuatro
roles, no probar pantallas sueltas. Se generó una máquina de prueba (OTME2E, PS 124
Instrumentada, OC "OC-E2E") y una orden suelta (OTSE2E-suelta), y se siguió una pieza
real — Soporte de volante v2, la de la foto de la OT en papel: Compras → CNC → Corte por
hilo → Pavonado — de principio a fin. Todo lo creado se borró al terminar (reservas de
vuelta a la línea base de 215 / 290 u.).

**Recorrido y resultado**

| Paso | Rol | Resultado |
|---|---|---|
| Sin sesión: landing pública, todo lo demás → login | — | ✅ |
| Operario sólo ve su pantalla; 12 rutas de oficina lo devuelven a `/taller` | Nico | ✅ |
| Menú único para staff, Maestros/Usuarios en Administración | Julián, Horacio, Adrián | ✅ |
| Maestros: material, revisión, Nº de plano, stock mínimo (dispara alerta en Stock e Inicio), agregar/mover/eliminar operación, detalle de operación, bitácora, adjunto (subir, descargar, borrar) | Julián | ✅ |
| Generar OT de máquina: explosión contra stock, reservas, OC en listado y detalle | Julián | ✅ tras corregir 2 bugs (abajo) |
| Orden suelta de conjunto | Julián | ✅ |
| Compra: pedir → recibir con control → la pieza pasa sola a CNC | Horacio | ✅ |
| Planificar para hoy | Horacio | ✅ tras corregir bug de fecha |
| Operario: ve la pieza asignada primera aunque no sea de su centro, ve el detalle de ingeniería, setup + parada + reanudar + fabricación | Nico | ✅ |
| Parada visible en Inicio ("Frenado ahora mismo") y Avance | Horacio | ✅ |
| Cierre con defectuosa → retrabajo en Inicio → subtareas, cronómetro, resolver | Nico → Julián | ✅ |
| Remito mixto (pieza en fabricación + pieza del almacén) → vuelta del proveedor → pieza terminada | Horacio | ✅ tras rehacer el circuito (abajo) |
| Avance: conjunto entero a Terminada y vuelta a automático; impacto en Compras | Horacio | ✅ |
| Retiro de stock para una OT consume su reserva | Horacio | ✅ |
| Centros de trabajo, Indicadores, Usuarios, OT impresa | todos | ✅ |
| Typecheck, lint de lo tocado, build de producción | — | ✅ |

**Bugs encontrados y corregidos**

1. **`/taller` (la pantalla del operario) tardaba 33 s a 3 min en abrir**: calculaba el
   estado pieza por pieza sobre ~500 OT de pieza. Reescrita con las mismas consultas
   agrupadas que Centros de trabajo (`getCandidatasTaller`): 0,4–2,7 s. Además ya no
   lista piezas esperando compra o afuera en un tercerizado (no es trabajo de taller),
   salvo que estén asignadas para hoy.
2. **Generar una OT de máquina tardaba 82 s** (una a cuatro consultas por cada una de las
   ~190 piezas; en Vercel podía cortarse). La reserva de stock ahora se resuelve con dos
   consultas para toda la OT: 7 s.
3. **Grave, venía de antes: cada OT de máquina dejaba afuera 13–16 piezas de la lista.**
   La migración del Excel creó conjuntos duplicados sin vincular a ningún modelo
   (Dosificacion C19, Tolva Carga Forzada C20, Descartador C21, Tolva C22, Cargadora por
   gravedad C23, Señalización C24), y la explosión sólo recorría los conjuntos del modelo:
   sus piezas (Leva de dosificación, Cilindro de tolva, Base de descartador...) no
   entraban en ninguna OT. Afecta a OTM12, OTM010, OTM009 y OTM999. La explosión ahora
   incluye todo conjunto con piezas en la lista de la configuración (verificado: 173 a
   fabricar + 19 cubiertas por stock = las 192 de la lista).
4. El texto "sin piezas a fabricar (el stock cubría la necesidad)" también aparecía para
   conjuntos que no tienen ninguna pieza cargada en esa máquina (ej. Tolva de Carga
   Forzada C08 en una PS): ahora se distinguen los dos casos.
5. **Planificación asignaba por defecto al lunes de la semana**, no a hoy — la asignación
   quedaba en el pasado. Y el "hoy" del sistema se calculaba en UTC: entre las 21 y las 24
   hs el operario veía como "Asignado hoy" lo de mañana. Nuevo `hoyISO()` en hora de
   Argentina (`src/lib/fecha.ts`).
6. **Tercerizados mezclaba "lista para mandar" con "afuera"**, y el remito descontaba del
   almacén aunque la pieza que salía estuviera en fabricación. Ahora `remito_item` puede
   llevar la OT de pieza: esas salidas registran el egreso sin tocar el almacén, se
   agregan al remito con un clic con el tratamiento ya cargado, y "Afuera" muestra con qué
   remito, a qué destino y desde cuándo. La vuelta del último paso cierra la pieza igual
   que el cierre en taller (piezas OK y fecha de fin).
7. La ficha y la OT impresa mostraban sólo el último registro de cada operación: se perdía
   el setup y sus paradas. Ahora suman todos los registros (`resumirHistorialPorOperacion`).
8. `ot_pieza.fechaInicio` nunca se grababa — la OT impresa siempre salía sin fecha de
   inicio. Se graba al iniciar la primera operación.
9. El link de vuelta de la ficha de pieza mostraba el identificador interno de la OT en
   vez de su código.
10. Eliminar una operación en Maestros dejaba huecos en la numeración ("Operación 5" en una
    ruta de 4 pasos). Se renumera, y las pantallas muestran la posición.
11. El operario veía "Iniciar fabricación" en pasos tercerizados o de compras. Ahora ve
    que está esperando la compra o que sale con remito.
12. Tareas de retrabajo de pocos segundos se veían como "0 min" — ahora en segundos.
13. "Por debajo del mínimo" no mostraba piezas que nunca entraron al almacén (sin fila de
    stock), que son justo las más urgentes.
14. Las piezas de compra marcadas a mano como terminadas seguían figurando para comprar.
15. Inicio de dirección decía "OT de máquina en curso: 7" contando también las pendientes,
    mientras Avance decía 4: ahora dice "Órdenes de trabajo abiertas (sin terminar)".
16. Generar una OT con una serie repetida tiraba una página de error genérica: ahora
    vuelve al formulario con el mensaje.

**✅ Resuelto después, con el visto bueno de Matías**
- **OT existentes completadas** con las piezas que les faltaban por el bug 3, con la misma
  regla que la explosión (lo que cubre el stock libre se reserva, en orden de antigüedad de
  la OT; el resto se fabrica): OTM12 123→135, OTM010 118→133, OTM009 118→133, OTM999
  128→138 piezas a fabricar. Los contadores de avance cambian por eso, no por un retroceso.
- **Dosificacion unificado dentro de Dosificador** (confirmado por el cliente, pregunta 7):
  las 10 piezas pasaron a Dosificador en Maestros y, en cada OT, sus OT de pieza se
  movieron al conjunto C05 renumeradas a continuación; el conjunto duplicado se borró.
  Actualizados `piezas.json`/`conjuntos.json` y un alias en la migración del Excel
  (`ALIAS_CONJUNTO`) para que una carga desde cero no vuelva a crearlo.

**Para preguntarle al cliente**
- Tolva Carga Forzada (C20, con piezas) vs Tolva de Carga Forzada (C08, vacío), y
  Cargadora por gravedad (C23, con piezas) vs Carga por Gravedad (C10, vacío): ¿son el
  mismo conjunto? Parece que sí, pero no está confirmado. Descartador quedó "por ahora
  así" según el socio (el cliente dijo que es parte de Canal de Descarga).
- Alguien está usando el Avance nuevo en producción (OTM999: Cabezal marcado "en curso" y
  una pieza de PreCompresion "terminada" a mano, hoy 10:51 hs) — no se tocó.
- Los dos errores de lint que quedan (`ColaDisponibleAhora.tsx`, `ConjuntoAccordion.tsx`)
  son de antes y no rompen nada.

## 23 · Revisión del circuito de OT (2026-10-02)

Pedido de Matías: reorganizar Órdenes de trabajo, el circuito ingeniería → producción →
operario, Planificación y centros de trabajo, verificando antes que nada contradiga lo que
ya definió el cliente. Se relevó cada punto contra el código y los documentos antes de tocar
nada; las decisiones de fondo las tomó Matías.

**Lo que se encontró al revisar (antes de cambiar)**
- Generar una OT ya equivalía a liberarla: sus piezas aparecían al instante en las colas de
  los centros, en Planificación y en /taller. No existía un "pedido de fabricación".
- "Abrir en taller →" llevaba desde la ficha de la pieza a la pantalla del operario, donde
  cualquiera de oficina podía "Iniciar fabricación" a su propio nombre (punto 8 del pedido).
- Avance y OT se solapan: las dos muestran el progreso por conjunto; Avance además
  modificaba estados (pedido del cliente en la 2ª ronda); su tabla "por etapa" repite la de
  Stock. El objetivo original del cliente para Avance, "entender qué cambió respecto del día
  anterior" (§9), nunca se implementó.
- "Cambiar todo a…" ponía a mano el mismo estado en todas las piezas del conjunto,
  pisando lo que carga taller.
- La asignación era pieza + operario + día, sin operación ni centro: no había forma de ver
  la carga de un centro por día.
- No se identificó cuál es el paso "indicar que se quiere fabricar" del recorrido descripto.
- Cruce con el cliente: respondió (pregunta 11) que un operario "puede alternar entre
  varias" OT, pero el sistema no deja abrir una segunda operación con otra abierta (se puede
  alternar pausando). Conviene confirmarlo.
- `docs/01-analisis.md` ya definía asignación = rol taller, OT = ingeniería: encaja con
  "ingeniería envía → taller planifica".

**✅ Paquete extra 18 — Órdenes por tipo.** `/ot` en tres secciones, en este orden: OT
Piezas, OT Conjuntos, Máquinas completas. Piezas y Conjuntos son las órdenes
independientes (nueva columna `ot_maquina.alcance`; la orden existente "tapa polea de
repuesto" quedó como de pieza). Las piezas de las máquinas se ven todas juntas en la nueva
`/ot/piezas` (filtros por orden, estado, producción y texto), sin entrar a cada máquina.

**✅ Paquete extra 19 — Enviar a producción.** Nueva marca `ot_pieza.enviada_produccion_at`
(+ quién). Al generar una OT sus piezas quedan "en ingeniería": no aparecen en Planificación,
en las colas de los centros ni en /taller hasta que se envían — por pieza (fila del
acordeón o ficha), por conjunto o toda la OT de una vez. Las 540 OT de pieza que ya existían
quedaron marcadas como enviadas (ya estaban en uso). "Abrir en taller" se reemplazó por
"Enviar a producción" o, si ya se envió, "Planificar →"; la oficina ya no puede entrar a la
pantalla del operario ni iniciar fabricación (se sacó la excepción de acceso de Release 2 y el
servidor rechaza iniciar una pieza no enviada).

**✅ Paquete extra 20 — Avance sólo de lectura.** Se sacó el cambio manual de estados
("Cambiar todo a…" y el selector por pieza) y la columna `estado_manual` — el estado vuelve
a salir sólo de lo que se carga en taller. Avance queda como tablero (métricas, tarjeta por
orden con su avance y secciones que llevan a la OT); la gestión se hace en la OT.
**Contradice el pedido del cliente de la 2ª ronda** ("que se puedan modificar los estados de
la pieza desde el avance"): hay que explicárselo. Se perdieron los 32 estados manuales que
alguien había cargado hoy en OTM999 (OT de prueba).

**✅ Paquete extra 21 — Planificación por operación, centro y día.** La asignación ahora es
operación + operario + día (`asignacion_trabajo.operacion_id`), de donde sale el centro.
- Vista "Por centro de trabajo" (por defecto): carga de cada centro por día con lo asignado
  y cuánto queda sin asignar.
- Vista "Por operario": la grilla de siempre, con la operación de cada trabajo y "Imprimir
  hojas" por día → `/planificacion/hojas`: lista del día + la OT de pieza de cada trabajo,
  una por página (la hoja se extrajo a `HojaOtPieza`, la misma de la impresión individual).
- "Pendiente de asignar", por centro: cada operación interna pendiente de lo enviado a
  producción — la actual ("se puede hacer ya") y las siguientes ("después de …"), para
  planificar los próximos días. Lo asignado de hoy en adelante sale de la lista; una
  asignación de un día pasado que no se hizo vuelve a aparecer.

Probado de punta a punta (orden de pieza de prueba, borrada después): generada → en
ingeniería, no aparece en Planificación → enviada → aparece "se puede hacer ya" en Torno y
"después de Torno" en Corte por hilo → Torno asignado a Nico hoy y Corte por hilo mañana →
vista por centro y por operario, hojas del día impresas → Nico la ve con "Asignado hoy";
la oficina rebota de /taller/[pieza]. Typecheck y build de producción OK.

**Centros de trabajo (punto 1) — no se tocó, necesita al cliente.** Hay 20 centros; 13 tienen
operaciones reales en hojas de ruta (Torno 106, Centro de mecanizado CNC 113, Corte por hilo
49, Taller 44, Rectificado 14, Pintura 13, Roscado 12, Templado 8, Tallado 5, Arenado 5,
Fresado 3, Soldadura 3, Grabado láser 2, Impresión 3D 2, Chavetero 1). Para dejar sólo los
del cliente hace falta saber **en qué centro se hace cada uno de esos procesos** (Templado y
Arenado podrían ser tercerizados) — borrarlos sin ese mapeo deja más de 80 operaciones sin
centro. Y está la diferencia 5 vs 6: el cliente listó 6 (con "Torno CNC" y "Centro de
mecanizado" por separado) y después escribió "Torno / Centro de mecanizado CNC", que se
interpretó como una sola máquina (hoy hay 5). Preguntas para el cliente:
1. ¿"Torno CNC" es un centro aparte o es el mismo "Centro de mecanizado CNC"?
2. Para cada proceso de la lista de arriba que no es uno de sus centros: ¿en qué centro se
   hace, o es tercerizado?

**Sin cambios, a propósito:** Stock, Tercerizados y Remitos (punto 12); la tabla "por etapa"
de Avance que repite la de Stock (se marca, no se sacó: no estaba pedido).

## 24 · Operaciones ≠ centros de trabajo (2026-10-02)

Definición de Matías sobre la duda de §23: los centros son los 6 del cliente, **Taller,
Electrónica, Corte por hilo, Torno, Torno CNC y Centro de mecanizado** — Torno, Torno CNC y
Centro de mecanizado son máquinas distintas (se descarta la fusión del paquete 14). Roscado,
Rectificado, Pintura, etc. son operaciones que se hacen en alguno de esos centros o se
tercerizan; no son centros, y no se asume dónde se hace cada una si no está confirmado.

**Chequeo previo contra lo definido por el cliente:** sin conflictos. La lista de centros
coincide con su respuesta (pregunta 1); Compras sigue separado de tercerizado (lo dijo el
cliente) y no se edita desde el panel; el filtro de centros del operario (pedido de Horacio)
sigue igual. El modelo ya separaba operación (`proceso`) de centro (`centro_trabajo`) con un
centro por defecto por tipo de operación; faltaba que fuera editable, por pieza, y con las
opciones "Tercerizado" y "sin asignar".

**Hallazgo en los Excel originales:** las hojas de ruta (OT - BASE GENERAL) usan una sola
operación "CNC"; CS-03 tiene columnas "TORNO CNC" y "CENTRO CNC" (existen las dos máquinas),
pero nada dice cuál hace cada operación CNC. Decisión de Matías: CNC queda **sin centro**
hasta que confirme el cliente.

**✅ Paquete extra 22 — Panel "Operaciones y centros" (Administración).**
- Centros: renombrar, agregar uno nuevo (ej. una máquina que compren) y eliminar sólo si
  nada lo usa.
- Operaciones: para cada tipo, dónde se hace por defecto — un centro, "Tercerizado" (va a
  Tercerizados, no a una cola de taller) o "Asignar centro de trabajo…" (sin decidir).
  Compras se muestra fijo ("se resuelve con stock").
- Por pieza: en su hoja de ruta (Maestros) cada paso interno tiene "Centro de trabajo": el
  de defecto o uno elegido sólo para esa pieza (`operacion.centro_trabajo_id`, nueva). Todo
  el sistema (colas, /taller, Planificación y su carga por centro) usa el de la pieza si lo
  tiene y si no el de defecto.
- Sin centro: no entra en ninguna cola ni se puede planificar. Aparece en Planificación
  ("Sin centro de trabajo asignado", por operación) y como aviso en Centros de trabajo, con
  link a asignarlo.
- Tercerizados: lo pendiente de tercerizar se agrupa por operación con "Agregar todas" para
  juntarlo en un mismo remito.

**Datos (base compartida):** quedaron los 6 centros (se creó Torno CNC y Centro de
mecanizado; Taller pasó a llamarse "Taller"); se borraron los 15 centros 1:1 que venían de
cada proceso y el "Centro de mecanizado CNC" de la fusión anterior (ninguno lo usaba un
operario ni una pieza). Por defecto sólo quedaron asignadas las inequívocas: Torno → Torno,
Corte por hilo → Corte por hilo, Taller → Taller, Electrónica → Electrónica. CNC, Fresado,
Roscado, Chavetero, Tallado, Soldadura, Templado, Rectificado, Arenado, Grabado láser,
Impresión 3D y Pintura quedaron sin asignar; los 4 tercerizados de siempre siguen
tercerizados. **No se borró ninguna operación de ninguna pieza.** La operación "Centro de
mecanizado CNC" volvió a llamarse "CNC", como en el Excel.

**Siembra:** `seed-db.ts` ya no crea un centro por proceso ni re-pisa el centro por defecto en
cada corrida (lo que se configure en el panel se respeta); los 6 centros y el mapeo inicial
salen de `centros-trabajo.json`/`procesos.json` (`CENTROS_TRABAJO`/`CENTRO_POR_DEFECTO` en
`scripts/lib/normalizacion.ts`).

**Bug corregido de paso:** los selects que guardan solos al cambiar (centro, destino, proceso,
tipo de pieza, rol) volvían a mostrar el valor anterior después de guardar — React 19 resetea
el formulario al terminar la acción. Ahora se rearman con el valor guardado.

Probado: crear y borrar un centro; Roscado → Torno CNC (aparece su grupo en Planificación
con 6 pendientes) y vuelta a sin asignar; Rectificado → Tercerizado (sale de Planificación) y
vuelta; centro propio de una pieza (sus 3 OT pasan a Centro de mecanizado, el resto de CNC
no) y vuelta. Todo revertido a la línea base.

**Para preguntarle al cliente:** dónde se hace cada operación sin asignar — en particular
**CNC (113 pasos): ¿Torno CNC o Centro de mecanizado?**, y cuáles de Roscado, Rectificado,
Templado, Arenado, Pintura, etc. son tercerizadas. Se carga directo en el panel, sin código.
