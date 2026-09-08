# Modelo de datos — Fase 1

Postgres. Todas las tablas con `id` (uuid), `created_at`, `updated_at`.
Nombres en español para que coincidan con el vocabulario del cliente (ver glosario del PDF).

## Maestros (migrables hoy desde los Excel)

    modelo               id · codigo(RD|PS) · nombre · descripcion
    configuracion        id · modelo_id · codigo(PS120I) · variante(120|124) ·
                         instrumentacion(instrumentada|sin_instrumentar) · nombre
    conjunto             id · codigo(C01) · nombre(Cabezal) · orden
    conjunto_modelo      conjunto_id · modelo_id                       -- ~15-18 conjuntos por modelo
    proceso              id · codigo · nombre(CNC, Torno, Compras...) · orden_flujo · es_externo
    dispositivo          id · codigo · nombre · descripcion            -- utillaje de mecanizado
    procedimiento        id · codigo(PI-04) · titulo · version · fecha_revision · archivo_url

    pieza                id · codigo(PS01CB124s001) · nombre · conjunto_id · material ·
                         revision(A1) · tipo(fabricada|comprada) · es_de_stock ·
                         stock_minimo · foto_url
    pieza_configuracion  pieza_id · configuracion_id · cantidad_necesaria
                         -- reemplaza las columnas Si/No de `Config Piezas`
    operacion            id · pieza_id · proceso_id · secuencia · ops(cantidad de operaciones) ·
                         dispositivo_id? · procedimiento_id?
                         -- 640 filas hoy en `Lista de Piezas`

## Stock (con posición por etapa — hallazgo 3.1)

    stock_pieza          pieza_id · cantidad_disponible          -- lo "Finalizado"
    wip_pieza            pieza_id · proceso_id · cantidad        -- las 18 columnas de CS-03
    ubicacion            id · codigo · nombre(isla)
    movimiento_stock     id · pieza_id · tipo(ingreso|egreso|ajuste|retiro_ot) · cantidad ·
                         ot_pieza_id? · usuario_id · ubicacion_id? · observacion · fecha

## Órdenes de trabajo

    ot_maquina           id · codigo(OTM6) · numero_serie · configuracion_id · cliente_id ·
                         orden_compra · emitido_por · fecha_emision · visado_por · fecha_visado ·
                         plazo_entrega · fecha_comprometida · pais · estado · observaciones
    ot_conjunto          id · codigo(OTM6C01) · ot_maquina_id · conjunto_id · estado ·
                         fecha_inicio · fecha_fin
    ot_pieza             id · codigo(OTM6C01P3) · ot_conjunto_id · pieza_id · material ·
                         cantidad_necesaria · stock_al_generar · cantidad_a_fabricar ·
                         estado · fecha_inicio · fecha_fin ·
                         piezas_ok · piezas_no_ok · piezas_defectuosas · piezas_retrabajadas

`cantidad_a_fabricar` se **propone** como `cantidad_necesaria − stock` pero queda editable (regla del PI-04, §4).

## Ejecución — el corazón del sistema (RF-05)

    registro_operacion   id · ot_pieza_id · operacion_id · usuario_id ·
                         tipo(setup|ejecucion) · inicio · fin · duracion_seg(generada) ·
                         piezas_ok · piezas_rechazadas · observacion
    parada               id · registro_operacion_id · tipo_parada_id · inicio · fin ·
                         duracion_seg · observacion
    tipo_parada          id · codigo · nombre        -- lista a definir con Horacio (insumo #12)

    control_calidad      id · ot_pieza_id · operacion_id? · tipo(tolerada|no_tolerada) ·
                         medida · resultado(ok|no_ok) · revisado_por

`tiempo_estandar` (RF-08) **no es una tabla**: es una vista materializada sobre `registro_operacion`
agrupada por `pieza_id × proceso_id × tipo`, con `promedio · minimo · maximo · n_observaciones`.
El PDF pide explícitamente rango y no sólo promedio — con 2–3 máquinas por año el promedio simple engaña.

## Transversales

    usuario              id · nombre · email · pin_hash · password_hash · rol · activo
    cliente              id · razon_social · numero_bejerman · contacto · pais
    proveedor            id · razon_social · rubro · condicion

## Notas de migración

1. **Normalizar procesos antes de todo lo demás** (hallazgo 3.5). Tabla de mapeo explícita en el script.
2. `CS-03` (RD, 427 filas) y `Config Piezas` (PS, 212 filas) son **dos universos de piezas distintos**
   con codificaciones distintas (`RD001108S001` vs `PS01CB124s001`). No mezclarlos: cargar cada
   familia por separado y unificar sólo a nivel de `conjunto`.
3. `Lista de Piezas` tiene la columna `OPS` con huecos (filas sin valor). Confirmar con Julián si
   vacío significa 1 o significa "no medido".
4. Los conjuntos de `Listas` (RD: 18, PS: 18) no coinciden exactamente con los de `Config Piezas`
   (`Dosificacion` vs `Dosificador`, aparece `Descartador` que no está en `Listas`). Consolidar
   con Julián — es una pregunta concreta para la próxima reunión.
