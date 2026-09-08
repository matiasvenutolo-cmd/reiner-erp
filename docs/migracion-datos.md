# Reporte de migración de datos — Excel → fixtures

> Generado automáticamente por `scripts/migrate-excel.ts` el 2026-09-08T21:44:48.166Z.
> Fuentes: `OT - Mx - OC - BASE GENERAL.xlsm`, `CS - 03 - Stock de Piezas.xlsm`.

Este documento se regenera en cada corrida del script. No editar a mano.

## Resumen

| Entidad | Cantidad |
|---|---|
| modelos | 2 |
| configuraciones | 5 |
| conjuntos | 24 |
| procesos | 24 |
| dispositivos | 1 |
| piezas (total) | 454 |
| piezas PS | 220 |
| piezas RD | 234 |
| pieza_configuracion | 1012 |
| operaciones (routing, todas) | 627 |
| stock_pieza (filas) | 418 |
| wip_pieza (filas) | 20 |
| materiales (hardware/consumibles) | 9 |

## Advertencias y asunciones (para validar con Julián)

1. RD no tiene variantes de configuración en los Excel actuales (a diferencia de PS120/PS124). Se creó una configuración placeholder 'RD-STD' para poder enlazar el BOM. Confirmar con Julián si existen variantes reales de RD que deban modelarse.

2. 'Config Piezas' sólo distingue diámetro (PS120/PS124), no instrumentación. Se asumió que la instrumentación no cambia el BOM general y se replicó la cantidad a ambas variantes de cada diámetro. Pendiente confirmar con Julián si hay piezas específicas de sensórica que sólo van en la variante instrumentada.

3. 'Config Piezas' tiene 26 piezas con código RD dentro del BOM de PS (hardware/subconjuntos compartidos entre familias de modelo). Se migraron como piezas RD que también aparecen en pieza_configuracion de PS, en vez de duplicarlas — confirmar con Julián si es la lectura correcta.

4. La columna "OPS" de 'Lista de Piezas' venía vacía en 47 filas; se asumió 1 operación en esos casos. Confirmar con Julián si el vacío significa 1 o 'no medido todavía'.

5. RD no tiene una hoja de routing equivalente a "Lista de Piezas": de las 234 piezas RD, sólo 22 tienen operaciones definidas (las compartidas con el BOM de PS). El resto quedó migrado como maestro + stock/WIP, pero SIN routing. Es un insumo pendiente real (coincide con el insumo #1 del PDF de la reunión, incompleto para RD).

6. La hoja "Stock de Piezas" de CS-03 aportó 212 piezas que no estaban en ninguna otra hoja (ni Config Piezas, ni Lista de Piezas, ni Stock de Piezas del otro archivo), ej. RD001108S001, RD001108S002, RD001108S003. Se crearon igual, sin BOM ni routing asociado, para no perder el dato de stock.

7. 'CENTRO CNC' y 'TORNO CNC' (columnas de CS-03) se trataron como el mismo proceso canónico que 'CNC' y 'Torno' de la hoja de routing de PS, respectivamente. Confirmar con Julián si en la práctica son máquinas/etapas distintas que deban separarse.

## Conjuntos no reconciliados contra la hoja "Listas"

Estos nombres de conjunto aparecen en los datos de piezas pero no coinciden (ni por mayúsculas/acentos) con ningún conjunto de la hoja "Listas". Se crearon igual como conjuntos propios para no perder piezas, pero hay que confirmar si son sinónimos de uno existente o son conjuntos nuevos:

- `Dosificacion`
- `Tolva Carga Forzada`
- `Descartador`
- `Tolva`
- `Cargadora por gravedad`
- `Señalizaciön`

## Piezas presentes en 'Lista de Piezas' pero ausentes de 'Config Piezas'

34 piezas tienen routing (operaciones) pero no aparecen en el BOM por configuración — quedaron migradas sin `pieza_configuracion`, así que no van a salir en la explosión de ninguna OT hasta que se agreguen a alguna configuración.

`PS05DS124s007`, `PS09FDC100s001`, `PS09FDC100s002`, `PS09FDC100s003`, `PS09FDC100s004`, `PS09FDC100s005`, `PS09FDC100s006`, `PS09FDC100s007`, `PS09FDC100s008`, `PS09FDC100s009`, `PS09FDC100s010`, `PS09FDC100s011`, `PS09FDC100s012`, `PS09FDC100s013`, `PS09FDC100s014`, `PS09FDC100s015`, `PS09FDC100s016`, `PS09FDC100s017`, `PS09FDC100s018`, `PS09FDC100s019`, `PS09FDC100s020`, `PS09FDC100s021`, `PS09FDC100s022`, `PS09FDC100s023`, `PS09FDC100s024`, `PS09FDC100s025`, `PS09FDC100s026`, `PS14RED100s014`, `PS14RED100s015`, `PS14RED100s101`, `PS14RED100s102`, `PS17CE100s100`, `PS17CE100s102`, `PS17CE100s103`

## Piezas presentes en 'Config Piezas' pero sin operaciones en 'Lista de Piezas'

42 piezas están en el BOM pero no tienen routing — van a explotar en la OT de conjunto, pero su OT de pieza va a mostrar una hoja de ruta vacía.

`PS01CB124s006`, `PS04CR120s001`, `PS05DS120s001`, `PS06EY100s004`, `PS09FC100s001`, `PS09FC100s002`, `PS09FC100s003`, `PS09FC100s004`, `PS09FC100s005`, `PS09FC100s006`, `PS09FC100s007`, `PS09FC100s008`, `PS09FC100s009`, `PS09FC100s010`, `PS09FC100s011`, `PS09FC100s012`, `PS09FC100s013`, `PS09FC100s014`, `PS09FC100s015`, `PS09FC100s016`, `PS09FC100s017`, `PS09FC100s018`, `PS09FC100s019`, `PS09FC100s020`, `PS09FC100s021`, `PS09FC100s022`, `PS09FC100s023`, `PS09FC100s024`, `PS09FC100s025`, `PS09FC100s026`, `PS10TL100s001`, `PS10TL100s002`, `PS10TL100s003`, `PS10TL100s004`, `PS10TL100s100`, `PS12CDD100s101`, `PS12CDD100s102`, `PS12CDD100s103`, `PS15MP100s003`, `PS15MP100s007`, `PS09FDC100s020`, `PS09FDC100s021`

## RD — piezas sin routing (limitación de origen, no del script)

Las 212 piezas RD no tienen una hoja de routing equivalente a la de PS. Ejemplo: `RD001108S001`, `RD001108S002`, `RD001108S003`, `RD001108S004`, `RD001108S005`.
