# REINER ERP v2: mejoras de usabilidad y visualización

> Rama `v2` · base `reiner_v2` · 2026-10-18.
> Arma el documento *Mejoras de usabilidad y visualización* del socio, para la reunión con el cliente.
> El documento pide frenar al final de cada etapa. Se hicieron las cinco seguidas, a pedido de Matías, y cada una quedó en su propio commit.

## Etapa A: base de diseño

- **Tokens de diseño.** Están en `src/app/globals.css`. Cada color significa una sola cosa:

  | Color | Significa |
  |---|---|
  | Rojo | atrasado |
  | Naranja | urgente, "pedir ya", "arranca tarde" o parada en curso |
  | Verde | en plazo o resuelto |
  | Gris | futuro |
  | Azul | acción principal |
  | Amarillo suave | dato estimado |
  | Violeta | dato de demo |

- **Paleta aparte por proyecto,** sin los colores de estado.
- **Modo oscuro** preparado en los tokens (`data-theme="dark"`), sin activar.
- **Tipografía de oficina:** texto base de 15 px y datos secundarios de 13 px. Un solo tipo de letra; la monoespaciada queda sólo para el código de pieza.
- **Botones:** tres tipos (principal, secundario, de texto), con alto mínimo de 40 px en oficina y 56 px en planta. Lo destructivo va como botón de texto rojo, con confirmación.
- **Íconos de una sola familia** (Lucide). No quedan emojis ni colores sueltos en las pantallas.
- **Componentes compartidos:**
  - `Codigo`: monoespaciado, gris, con botón de copiar.
  - `Etiqueta`: fondo suave más ícono.
  - `Punto`.
  - `Aviso`: el de "ok" es un aviso flotante que desaparece solo.
  - `Vacio`: una línea en verde.
  - `Sugerencia`: ícono de idea.
  - `Ayuda`: el texto de ayuda se muestra la primera vez y después queda en un ícono.
  - `BuscadorPiezas`: autocompletado sin importar mayúsculas ni acentos.
- **Encabezado fijo** al hacer scroll.
- **Esqueletos** de carga y **pantalla de error** en lenguaje de la planta.
- **Formatos únicos** en `src/lib/formato.ts`:
  - coma decimal;
  - menos de 1 h se muestra en minutos;
  - fechas relativas ("hoy", "mañana", "en 3 días");
  - año sólo si es otro;
  - "días hábiles";
  - plurales bien formados;
  - nombres de pieza con mayúscula inicial.
- **Vocabulario:** margen (no holgura), asignada (no comprometida), en fabricación (no stock futuro), atrasada para tareas y vencida para compras.

## Etapa B: vista de operario

- **Un botón principal por estado:**

  | Estado | Botón principal |
  |---|---|
  | Por empezar | Empezar setup |
  | En setup | Terminé el setup |
  | Fabricando | Terminar |
  | Parada | Seguir |

- **Tareas completas:** setup → fabricación → cierre en 4 toques.
- **Botones secundarios:** "Sin setup, empezar a fabricar" y "No puedo hacer esta" (2 toques: botón y motivo).
- **"No puedo hacer esta":** 5 motivos. La tarea queda trabada en "Qué está trabado" del jefe, con "Ya está resuelto". Si falta el plano, ingeniería recibe el aviso.
- **Terminar:** OK precargado y botones + y − sin teclado; si hay rechazos, el motivo en botones. Después, "Listo" con **Deshacer** durante 10 segundos, y la próxima tarea aparece sola.
- **Paradas:** 6 motivos en botones y el tiempo parado en grande, en naranja. Una parada de más de 30 minutos aparece en Hoy.
- **Tarjeta completa de la tarea:**
  - nombre grande y código chico;
  - paso N de M y detalle;
  - cantidad, dispositivo y material;
  - tiempo estimado con su cuenta;
  - de dónde viene y adónde va;
  - franja de urgencia, sólo si hay urgencia;
  - plano, o "Sin plano · Avisar a ingeniería";
  - observaciones.
- **Avance del día** con barra. La cola de "Después" muestra el tiempo estimado y un punto de urgencia; al tocar una tarea se ve su detalle. "Hacer esta antes" pide un motivo y queda en la bitácora del proyecto.
- **Cola del operario:** si tiene varios centros, los junta en el orden del plan.
- **Pantalla por centro** (`/taller/centro/[id]`) para la tablet fija en la máquina: al empezar, se elige quién hace la tarea.
- **Diseño de planta:**
  - una columna, sin tablas;
  - texto de 18 px y nombre de pieza de 28 px;
  - funciona en horizontal y vertical.
- **Sin conexión:** los toques se guardan con su hora real y se mandan cuando vuelve el wifi; la franja dice "Sin conexión: se guarda y se envía después". **Está armado, pero no se probó con un corte real de wifi.**
- **Pendiente:** probarlo en una tablet real, en la planta, con un operario.

## Etapa C: estructura de oficina

- **Cada perfil entra a su pantalla:**

  | Perfil | Entra a |
  |---|---|
  | Jefe de planta | Plan de la semana |
  | Compras | Pedir esta semana |
  | Dirección | ¿Llegamos? |
  | Ingeniería | Liberación de piezas |

  Los permisos no cambian.
- **Menú por áreas:** las áreas que no son del perfil quedan colapsadas. Los números en el menú aparecen sólo cuando hay algo que hacer (Pedir, Liberación, Tercerizados, Configuración).
- **Hoy con foco:**
  - "Lo primero hoy": la decisión de mayor impacto, con su botón.
  - Tres indicadores.
  - Lo de hoy resumido por centro, con despliegue y menú de tres puntos.
  - "Sin operario" resaltado.
  - Lo trabado.
  - Como mucho 3 decisiones: primero las de entrega, después las de capacidad, al final las de datos.
  - En fin de semana o feriado, el título es el día hábil que se muestra.
- **Configuración pendiente** (nueva, primera de Admin): cada tema con su porcentaje o su número y el botón para completarlo.
  - Incluye los avisos de planos de la planta y los nombres con tildes faltantes.
  - El dato técnico "plan calculado en X ms" se mudó acá.
  - Desde Hoy queda una sola línea al pie.
- **Plan sin confirmar:** el operario ve la cola propuesta con una franja que lo aclara. El lunes, Hoy le recuerda al jefe que confirme la semana.

## Etapa D: lógica de claridad (motor)

- **Plan factible (§1.4):**
  - Al activar un proyecto, el motor lo simula. Si no llega, aparece el diálogo "Con los plazos actuales, la entrega más temprana es el… ¿Mantenés el … o la cambiás?", con hasta 3 causas.
  - Lo que nació tarde es **"Pedir ya"** y **"Arranca tarde"** (naranja), no "Vencida" ni "Atrasada".
  - Pasa a atrasada sólo si estaba en un plan confirmado y no se empezó.
  - Con la demo: 18 compras "Pedir ya" y 0 vencidas.
- **Causa raíz (§1.5):**
  - El motor sigue la cadena "espera a…" desde el último tramo de montaje hasta el conjunto que se atrasa por sí mismo, y da la causa en una frase con su acción. Ejemplo: "OTMD01 llega 16 días hábiles tarde porque el material de Mando Principal se tenía que pedir antes del vie 25/09. → Ir a pedir".
  - Muestra hasta 2 causas independientes.
  - "Secuencia de montaje" ya no aparece como causa: el conjunto dice "Espera a C14 Mando Principal", en gris.
- **Lotes (§1.6):**
  - Una tarea se parte en lotes desde el panel del plan, o con un tamaño de lote por defecto en la pieza. Cada lote es una tarjeta ("lote 2 de 5").
  - **Con lotes, un paso se completa por cantidad** y el siguiente puede arrancar con el lote terminado. Sin lotes, todo sigue igual que antes.
  - Las tareas que se reparten en varios días muestran "parte 1 de 2".
  - Demo: la orden para stock de 150 u. va en lotes de 30.
- **Carga por operario (§1.7):** el motor limita las horas de cada persona por día (8 h × 85 %), y si trabaja en dos centros las reparte. En la demo, nadie pasa de 6,8 h. La vista "Por operario" muestra la barra de cada uno, y Hoy avisa si alguien quedó sobrecargado por un movimiento manual.
- **Tests:** 15 casos (`npm test`), con los nuevos de lotes, carga por operario, plan factible y conjuntos alternativos.

## Etapa E: pantallas y detalles

- **Plan de la semana:**
  - tarjeta mínima (pieza, cantidad, horas, franja de margen, color del proyecto) con panel lateral: operario, "Pasar a" día, candado, partir en lotes, plano;
  - leyenda y filtros por proyecto, "sólo atrasadas o urgentes" y "sólo sin operario";
  - resumen arriba con links que filtran;
  - barras de carga por fila y por día;
  - centros vacíos en una línea al final;
  - selector único de vista;
  - "Confirmada por X el …", con resumen antes de confirmar;
  - en el celular, lista por día que se despliega por centro.
- **Proyectos:**
  - tarjetas por tipo (máquinas, repuestos, stock) y "Para activar" con "Cargar fecha";
  - el detalle tiene tres datos grandes y la causa raíz;
  - conjuntos con problemas arriba, desplegados; los que están en plazo, colapsados; los que no tienen piezas, en gris;
  - barra de piezas por estado;
  - compras: las 3 más urgentes y el total;
  - "cubiertas con stock" se muestra sólo si es mayor a 0.
- **¿Llegamos?:**
  - línea de tiempo hoy → fin estimado → entrega;
  - sólo la causa raíz;
  - avance por piezas dentro de cada tarjeta;
  - la carga de 30 días como mapa de calor (en el celular, una línea por centro);
  - sin pestañas.
- **Pedir esta semana:**
  - una tarjeta por proveedor con "Marcar todo pedido" y el detalle al desplegar;
  - el mismo material sumado en una línea;
  - el plazo supuesto aparece una sola vez en el encabezado;
  - "Confirmar Aceros SA como proveedor habitual";
  - lo marcado se atenúa al instante, con **Deshacer**;
  - "Por llegar" en tarjetas;
  - el aviso de datos faltantes lleva a Configuración pendiente.
- **Stock:**
  - buscador con autocompletado;
  - tarjetas de resumen que llevan a la lista filtrada (libres / asignadas);
  - lo que está en fabricación, como barras por etapa;
  - pestañas con el número de ítems;
  - "libre" y "asignada" con el mismo color en todo el sistema;
  - mínimo vacío en una línea verde.
- **Tercerizados:**
  - "Para mandar" unificado con el armado del remito: por proceso, con "mandar antes del…" y "Armar remito con estas", que propone solo el proveedor habitual;
  - la sugerencia "puede convenir esperar", con el estilo único de sugerencia;
  - "Afuera": días que faltan para la vuelta, en color, y WhatsApp, teléfono y mail a un toque;
  - "Movimientos": filtro por fecha y tipo, y tipo con ícono y color.
- **Liberación:** una sola acción "Liberar las N" arriba y la lista para destildar excepciones. Lo que no se puede liberar muestra su motivo y "Avisar a ingeniería".
- **Maestros:**
  - en la grilla de tiempos, celdas con color según el origen (estimado, definido, medido);
  - en la ficha de pieza, la ruta como pasos numerados en línea, con el tiempo de cada uno.
- **Celular (§1.9):** se revisaron 19 pantallas a 375 px y ninguna tiene scroll horizontal de página. Las tablas anchas que quedan (servicios, compras, indicadores) se desplazan dentro de su tarjeta.
- **Búsqueda (§4.4):** encuentra igual con o sin mayúsculas y acentos.

## Lo que queda (para la próxima ronda)

| Tema | Estado |
|---|---|
| Prueba con usuarios reales | El documento la pide al terminar las etapas C y E: una persona de cada perfil, sin explicación previa. No se hizo; conviene hacerla en la reunión |
| Tablet real en planta | No probado: sólo en emulación de celular y tablet |
| Sin conexión | Armado, no probado con un corte real |
| Códigos y nombres en pantallas viejas | Las pantallas nuevas y las principales muestran el nombre primero y el código abajo. Algunas tablas de Fase 3 (detalle de OT, "todas las piezas") todavía tienen el código en la primera columna |
| Textos en primera persona | Ajustados en las pantallas nuevas; quedan mensajes de Fase 3 sin revisar |
| Lotes en ejecución | El avance por cantidad funciona. El tamaño de lote de la pieza se carga por base o desde el plan; todavía no hay un campo en la ficha |
