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
