# REINER ERP v2 — Planificación por proyecto (demo para la reunión)

> Rama `v2` · base `reiner_v2` (copia de la de producción) · 2026-10-18.
> Arma las dos especificaciones de Matías: *Rediseño de planificación por proyecto* y *Especificación complementaria (OT independientes, stock, tercerizados y compras)*.

## 1 · Qué es y cómo se accede

- **Un acceso aparte, sin tocar lo que usa REINER hoy.** La v2 vive en la rama `v2` y se publica en su propia URL de Vercel. Usa una **copia de la base** (`reiner_v2`, mismo servidor de Neon). Lo que se cargue en la demo no llega a producción, y producción no ve nada de la v2.
- Mismos usuarios y mismas contraseñas que producción, porque la base es una copia.
- Infraestructura nueva: ninguna. Mismo proyecto de Vercel (deploy de *preview* de la rama) y mismo servidor de base.
- Si la idea se aprueba, la rama se integra a `main`. Todos los cambios de esquema son **aditivos**: columnas y tablas nuevas, nada borrado ni renombrado. Así la integración no rompe los datos actuales.

## 2 · La idea en una línea

La máquina es un **proyecto con fecha de entrega**. Debajo, todo se descompone en **tareas con fecha**. El sistema calcula hacia atrás cuándo tiene que empezar cada cosa y hacia adelante si la capacidad alcanza. Cada pantalla responde una pregunta concreta: ¿qué hago hoy?, ¿qué pido?, ¿llegamos?

## 3 · El motor (`src/lib/planning/`)

Funciones puras con tests (`npm test`, 11 casos: ruta de 1 y de 5 pasos, tercerizado, feriado en el medio, pieza cubierta por stock, compra, capacidad, candado, niveles de holgura y fin estimado).

**Hacia atrás**, desde la entrega:

1. Entrega.
2. Montaje final y pruebas (días por configuración).
3. Conjuntos, en su secuencia de montaje.
4. Piezas, que tienen que estar listas un margen antes del montaje de su conjunto.
5. Cada paso de la ruta, del último al primero:

| Tipo de paso | Fecha que se calcula |
|---|---|
| Interno | inicio = límite − (días de trabajo + 1 de cola), donde los días salen de horas ÷ (horas por día × eficiencia) |
| Tercerizado | mandar antes del = límite − plazo − 1 día de logística |
| Compra | pedir antes del = llegada necesaria − plazo del proveedor |

- **Holgura** = días hábiles entre hoy y el último día para empezar.
- **Niveles:**
  - atrasada: menos de 0
  - urgente: de 0 a 3
  - en plazo: de 4 a 10
  - con mucho margen: más de 10

**Hacia adelante**, contra la capacidad de cada centro:

- Primero lo liberado, ordenado por holgura y después por prioridad.
- Lo no liberado se ubica recién desde la semana siguiente.
- Lo fijado con candado reserva su lugar primero.
- Lo movido a mano va a la fecha elegida, aunque sobrecargue.
- El operario es el habilitado menos cargado, salteando ausencias.

**Fin estimado** de cada proyecto = cuándo termina su último conjunto + montaje final. Se compara contra la entrega.

**Estados de cada tarea:** se calculan con lo que ya registra el sistema actual, sin tablas paralelas.

| Estado | De dónde sale |
|---|---|
| Liberada | pieza enviada a producción |
| Terminada | registro cerrado del paso |
| En curso / pausada | registro abierto o parada |
| Afuera (tercerizado) | remito posterior al último cierre |
| Pedida (compra) | pedido de compra abierto |

## 4 · Pantallas

| Área | Pantalla | Qué muestra / qué se hace |
|---|---|---|
| — | **Hoy** | Tres bloques: qué se hace hoy, qué está trabado (falta material, tercerizado demorado, falta plano si se activa la regla) y qué hay que decidir (liberar tanda, proyectos en riesgo, centros sobrecargados, stock bajo el mínimo con "Generar OT para stock") |
| Producción | **Plan de la semana** | Grilla de centros por día. Se arrastran tarjetas, se fija con candado, se cambia el operario, se recalcula. Muestra la carga por centro con sobrecarga en rojo, la fila de Tercerizados y la lista de lo que quedó sin lugar. **Sólo el jefe de planta confirma.** Al confirmar, el plan se publica en la pantalla de cada operario. Vista por centro o por operario |
| Producción | **Proyectos y órdenes** | Para activar (sin fecha), en curso y terminados. Ficha del proyecto: métricas, Gantt por conjunto, piezas por estado, liberar tanda, cambiar fecha (con motivo, queda en la bitácora), pausar, compras sin pedir. Activar pide fecha de entrega y prioridad, y deja destildar variantes |
| Producción | **¿Llegamos?** | Una tarjeta por proyecto: fin estimado contra entrega, qué conjuntos lo atrasan, % de tiempos estimados, y el mapa de carga de los centros a 30 días |
| Producción | **Tercerizados** | Para mandar, agrupado por proceso y con "mandar antes del…", avisando cuántas piezas más se suman en 3 días. Afuera: vuelta prevista, días de atraso y contacto para reclamar. El armado de remitos y la vuelta con control se conservan |
| Taller | **Mi próxima tarea** | Una tarjeta grande con la tarea que toca (pieza, cantidad, operación, dispositivo, plano, observaciones) y los botones Empezar fabricación y Empezar setup. Debajo, lo que sigue. Sale del plan confirmado. "Ver todas las piezas de mis centros" lleva a la pantalla anterior |
| Compras | **Pedir esta semana** | Vencidas / esta semana / próximas 2 semanas, agrupadas por proveedor, con "pedir antes del…". Se marca como pedido con la fecha que promete el proveedor. Pestañas **Por llegar** (en rojo si la fecha prometida atrasa la máquina; se recibe con OK / NO OK) y **Servicios de tercerizados** (precio, plazo, lote mínimo, vigencia, proveedor habitual) |
| Compras | Compras (módulo existente) | Necesidades ordenadas por "pedir antes del…" que sale del plan. En las cotizaciones: "Llega N días tarde para OTMxxx" o "llega a tiempo" |
| Compras | Proveedores | Ficha con datos para planificar: tipo, plazo estándar, procesos que hace, teléfono, email, moneda, estado (activo / en evaluación / bloqueado con motivo) |
| Stock | **Stock** | Resumen · Materia prima · Insumos comprados · Consumibles · En proceso · Terminados · Máquinas · Movimientos. Ficha de pieza: desglose "N en total: X libres · Y OTM006", asignar libres a una orden, liberar, traspasar con motivo, y **Fabricar para stock**, que abre la orden precargada |
| Ingeniería | Piezas y hojas de ruta + **Grilla de tiempos** | Grilla de piezas por pasos con setup y min/u. Vacío = usa el tiempo del proceso. Exportar e importar CSV, filtros "sin tiempo propio" y "sin hoja de ruta", y copiar la ruta de una pieza a otras. La ficha de la pieza suma tipo de artículo (fabricada / a medida / comercial), materia prima, proveedor y plazo, y el tiempo medido en planta con "Usar el tiempo medido" |
| Ingeniería | **Liberación de piezas** | La tanda que propone el sistema por proyecto: lo que empieza dentro del horizonte (15 días hábiles). Se destilda lo que no va y se libera |
| Admin | Operaciones y centros | Pestañas **Tiempos por proceso** y **Capacidad** (horas × máquinas × eficiencia). Cada dato marca si es *estimado* o *definido* |
| Admin | **Calendario** | Feriados, cierres de planta y ausencias de operarios |
| Admin | **Secuencias de montaje** | Orden de conjuntos (↑↓), días de cada uno, montaje final y margen, por configuración |
| Admin | **Completitud de datos** | Por configuración: % piezas con ruta, % pasos con tiempo propio, % comprados con proveedor y plazo. Cada indicador lleva a la grilla filtrada. Incluye la reclasificación propuesta a Comercial (se aprueba, no se aplica sola) y los posibles duplicados |
| Admin | **Datos de demo** | Cargar y borrar el escenario de demo, volver a sembrar los estimados y editar los parámetros |

**Generar orden** (conjunto o pieza suelta):

- Destino Cliente o Stock.
- Cliente: fecha de entrega, prioridad Alta por defecto, y el aviso "Hay N libres en stock — Usar stock".
- Stock: motivo y fecha objetivo (20 días hábiles por defecto), prioridad Normal, y no reserva stock libre para sí misma.
- Con fecha, la orden queda activa y entra sola al plan.

**Menú por áreas:** Hoy · Producción · Compras · Stock · Ingeniería · Admin. Los permisos por rol son los mismos de antes. Lo único nuevo son las rutas, y cada una con el perfil que corresponde.

## 5 · Datos estimados y escenario de demo

Para que el sistema se vea funcionando con conflictos reales, se sembró (`scripts/v2-semilla.ts`, sólo corre contra `reiner_v2`):

- **Tiempos por proceso:** estimados por tipo (por defecto 30 min de setup + 15 min por unidad).
- **Plazos estimados:**
  - tercerizado: 5 días hábiles
  - compra de material: 10
  - artículo comercial: 20
- **Secuencias de montaje** RD y PS, con 5 días de montaje final y 3 de margen.
- **Capacidad:** 8 h × 1 máquina × 85 %.
- **Feriados** de Argentina 2026–2027.
- **107 piezas propuestas como Comerciales** por nombre (motor, reductor, rodamiento…) o porque su ruta sólo tiene Compras. Pendientes de aprobar.

Todo lo estimado queda marcado como **estimado** y el plan lo avisa ("Plan calculado con X % de tiempos estimados").

**Escenario de demo** (Admin → Datos de demo; todo marcado *demo* y se borra con un botón):

- OTM006 activa, con entrega = emisión + 4 meses = 18/02/2027.
- Una PS-120i para un "Cliente de prueba", con prioridad alta y entrega ajustada, que compite por los mismos centros.
- Una orden para stock de 150 unidades.
- Vacaciones de un operario.
- Precios de servicios de Cromados del Norte.
- Materias primas y consumibles en stock.

Estado al 18/10:

- OTM006 llega 1 día tarde.
- La demo PS llega 20 días tarde.
- La orden de stock llega 18 días tarde.
- Torno y Corte por hilo están sobrecargados.
- La semana del 19/10 ya quedó confirmada como jefe de planta, así que *Mi próxima tarea* muestra tareas.

## 6 · Lo que la demo simplifica (para decidir si se hace en la versión real)

- **Cuarentena:** el estado se muestra en la especificación, pero hoy una recepción NO OK no deja unidades en un estado "cuarentena" del stock.
- **Asignar / liberar / traspasar** cambian las reservas, pero no generan un movimiento de stock propio. El enum de movimientos tiene sólo ingreso, egreso, ajuste y retiro, y agregar tipos es un cambio de esquema que conviene hacer al integrar.
- **Compra con varias líneas y recepción parcial:** en *Pedir esta semana* se marcan varias líneas juntas para un mismo proveedor (un pedido por línea). La OC multi-línea dentro del módulo de Compras queda para la etapa D.
- **Plazos reales por proveedor:** el % de entregas a tiempo y la sugerencia de actualizar el plazo cuando el real supera al pactado en más del 20 % todavía no están.
- **Filtros avanzados y CSV de las vistas de stock:** stock inmovilizado, por debajo del mínimo en todas las vistas, etc.
- **Proveedor sugerido:** si una pieza no tiene proveedor habitual y hay un único proveedor activo de materia prima, *Pedir esta semana* lo propone (marcado "sugerido").

## 7 · Preguntas abiertas para la reunión

| # | Pregunta | Quién |
|---|---|---|
| 1 | La especificación dice que el operario entra **sin contraseña**. Hoy entra con nombre + PIN. ¿Se saca el PIN? | Adrián / Horacio |
| 2 | Rectificado, Soldadura, Pulido, Grabado láser, Impresión 3D y Chavetero figuran como **internos** en la especificación, pero en el maestro están como **tercerizados**. Se dejaron como están. ¿Cuál es el correcto? | Julián |
| 3 | La regla "no se libera sin plano" quedó como **parámetro desactivado**, porque hoy ninguna pieza tiene plano cargado y con la regla activa no se podría liberar nada. ¿Cuándo se activa? | Julián |
| 4 | En las secuencias de montaje figuran juntos conjuntos que parecen **alternativos** (C09 / C23, C20 / C22) y el Cabezal de RD-STD trae las variantes D-8, B-10 y BD-8. ¿Son opcionales según el pedido? | Julián / Horacio |
| 5 | Tiempos, secuencias de montaje y capacidad son **estimados**. ¿Quién los carga y para cuándo? (La grilla está pensada para cargar un conjunto en menos de 15 minutos.) | Horacio / Julián |
| 6 | **107 piezas** propuestas como artículos comerciales. Hay que revisarlas y aprobarlas en Admin → Completitud | Julián |
| 7 | Hay **3 proveedores** cargados, sin plazo ni contacto completos. ¿Lucio puede completar la base con tipo y plazo? | Lucio |
| 8 | **Piezas duplicadas** (mismo nombre, código distinto, por ejemplo Freno tipo B RD001110S005 / S007): ¿se unifican? | Julián |
| 9 | ¿La diferencia entre las 234 piezas del maestro RD-STD y las 138 de la OTM006 es por stock descontado? | Julián |
| 10 | Fecha de entrega de la OTM006: se tomó **emisión + 4 meses** (18/02/2027) a partir del plazo "4 meses". ¿Es la fecha comprometida? | Adrián |
| 11 | Recepción NO OK: ¿va a cuarentena en el stock, con la decisión de retrabajo, reenvío o rehacer? (ver §6) | Horacio / Lucio |
| 12 | ¿Los movimientos de asignación, liberación y traspaso se registran como movimientos de stock propios? (ver §6) | Horacio |

## 8 · Archivos principales

- Motor:
  - `src/lib/planning/` — `calendario.ts`, `motor.ts` + `motor.test.ts`, `datos.ts` (carga desde la base), `carga.ts`
- Acciones v2: `src/app/actions/v2.ts`
- Semilla y demo: `src/lib/data/v2-semillas.ts`, `scripts/v2-semilla.ts`
- Pantallas nuevas: `inicio`, `planificacion`, `proyectos`, `llegamos`, `taller`, `pedir`, `liberacion`, `admin/*`, `maestros/tiempos`, `stock/{materia-prima,consumibles,maquinas,movimientos}`
- Esquema: `src/lib/db/schema.ts`. Los agregados v2 están marcados con el comentario `// v2`.
