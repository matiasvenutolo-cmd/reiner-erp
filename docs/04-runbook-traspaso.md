# Runbook — traspaso de infraestructura a REINER

Checklist ejecutable para mover la aplicación de la cuenta de desarrollo a la cuenta de REINER.

**Cuándo:** 2ª quincena de octubre de 2026, **antes** de la puesta en marcha en taller.
Razón: en ese momento la base todavía tiene datos de prueba, así que la migración es un trámite.
Después del arranque de carga real, migrar significa mover producción viva y los datos
irremplazables del taller habrán vivido en un tier con 6 h de ventana de recuperación.

**Duración estimada:** media jornada, más 1–2 semanas de anticipación para los pre-requisitos
que dependen de terceros (alta de cuentas, acceso a DNS).

---

## Parte A · Requisitos de diseño (durante el desarrollo, NO el día del traspaso)

Si esto no está resuelto antes, el traspaso deja de ser un trámite.

- [ ] **A1. Migraciones Drizzle versionadas en el repo.** Nada de cambios de schema aplicados a mano.
- [ ] **A2. Seed script en el repo**, capaz de levantar una base vacía desde cero.
- [ ] **A3. `.env.example` completo**, con cada variable documentada y sin valores reales.
- [ ] **A4. Cero hardcodes** de dominios, URLs absolutas o IDs de proyecto en el código.
- [ ] **A5. ⚠️ En la base se guarda el `pathname` del blob, NUNCA la URL completa.**
      Las URLs de Vercel Blob incluyen un identificador de store. Al crear el store nuevo en la
      cuenta de REINER, **todas las URLs cambian**. Si `pieza.foto_url` guarda la URL completa,
      hay que reescribir la columna entera durante la migración. Guardando el pathname y componiendo
      la URL en runtime con una env var de base, el cambio de store es transparente.
      **Este es el gotcha más caro del traspaso y se previene con una decisión de una línea hoy.**
- [ ] **A6. `vercel.json` en el repo** con los cron jobs declarados (no configurados por dashboard).
- [ ] **A7. Verificado que el proyecto buildea desde un clone limpio** con sólo `.env.example` completado.

---

## Parte B · Pre-requisitos (1–2 semanas antes, dependen de REINER)

- [ ] **B1. REINER crea su team en Vercel y contrata Pro.**
      ⚠️ Con un **mail de empresa**, no el personal de un empleado. Si la cuenta queda a nombre de
      una persona, el día que esa persona se va la empresa pierde el control de su propio sistema.
- [ ] **B2. Método de pago cargado en el team de Vercel.** La transferencia de proyecto **falla**
      si el destino no tiene medio de pago válido.
- [ ] **B3. Organización de Neon creada** (plan Launch) bajo la misma cuenta de empresa.
- [ ] **B4. Organización de GitHub de REINER creada**, con vos como miembro con permisos de admin.
- [ ] **B5. Dominio definido y acceso al DNS confirmado.** Ej. `erp.reiner.com.ar`.
      Suele ser el cuello de botella: pedirlo con la mayor anticipación posible.
- [ ] **B6. Inventario de env vars actuales**: `vercel env ls` en el proyecto de origen, guardado.
- [ ] **B7. Definido quién será admin del lado de REINER** (propuesta: Adrián + Julián).

---

## Parte C · Día del traspaso (el orden importa)

### C1 · Resguardo
- [ ] Avisar que no se carga nada durante la ventana (en esta etapa son datos de prueba: trivial).
- [ ] `pg_dump` de la base de origen. **Usar la connection string unpooled**, no la de pgbouncer.
- [ ] Guardar el dump fuera de ambas cuentas. Verificar que el archivo no está vacío.
- [ ] Listar y descargar todos los blobs del store de origen.

### C2 · Base de datos destino
- [ ] Crear proyecto Neon en la org de REINER (plan Launch, misma región que el proyecto de Vercel).
- [ ] Anotar **ambas** connection strings: pooled y unpooled.
- [ ] `pg_restore` sobre la base nueva, con la string **unpooled**.
- [ ] **Verificar row counts tabla por tabla** contra el origen. No dar por buena la migración
      porque el comando no dio error.

### C3 · Blob destino
- [ ] Crear el store de Blob en la cuenta de REINER.
- [ ] Subir los archivos descargados en C1, **conservando los mismos pathnames**.
- [ ] Si A5 no se respetó: reescribir las URLs guardadas en la base. Si se respetó: no hay nada que hacer.

### C4 · Transferencia del proyecto de Vercel
- [ ] Iniciar la transferencia desde la cuenta de origen hacia el team de REINER.
- [ ] Aceptar desde el team de REINER (el código de transferencia vence a las 24 h).
- [ ] ⚠️ **Las integraciones NO se transfieren: hay que volver a agregarlas del otro lado.**
- [ ] ⚠️ **Antes de re-agregar la integración de Neon, borrar las env vars de base de datos viejas.**
      Si quedan las anteriores, la integración nueva **prefija todas sus variables** y la app
      no encuentra ninguna de las que espera.
- [ ] Setear las env vars apuntando a la base y al store nuevos (Production, Preview y Development).
- [ ] Regenerar `AUTH_SECRET`. Invalida sesiones abiertas — irrelevante en esta etapa, y es
      buena higiene que el secreto de producción nunca haya existido en la cuenta de desarrollo.
      (No hay `AUTH_URL`/`NEXTAUTH_URL`: la sesión real se implementó a mano con `jose` + Proxy,
      no con Auth.js/next-auth — ver docs/05-backlog-release-2.md §9 por qué.)
- [ ] **Rotar la contraseña/PIN de los 4 usuarios de demo** (`reiner2026` para Adrián/Julián/
      Horacio, `1234` para Nico — sembrados por `scripts/seed-db.ts`). Regenerar `AUTH_SECRET`
      invalida las sesiones abiertas pero NO cambia estas credenciales: viajan con los datos en el
      `pg_dump`/`pg_restore` de C2. Hacerlo desde `/usuarios` (ingeniería, dirección o taller
      pueden restablecer la clave/PIN de cualquiera) antes de repartir accesos reales.

### C5 · Repositorio
- [ ] Transferir el repo de GitHub a la organización de REINER.
- [ ] Reconectar el proyecto de Vercel al repo en su nueva ubicación.
- [ ] Verificar que un push a `main` dispara deploy.

### C6 · Dominio y deploy
- [ ] Agregar el dominio en el proyecto de Vercel y configurar los registros DNS.
- [ ] Esperar la emisión del certificado SSL.
- [ ] Redeploy completo (no basta con la transferencia: hay que rebuildear con las env vars nuevas).

### C7 · Verificación funcional (smoke test, en el dominio definitivo)
- [ ] Login con un usuario de cada rol: operario, taller, ingeniería, dirección.
- [ ] Los maestros muestran las 211 piezas y los 15 conjuntos.
- [ ] Las fotos de piezas **cargan** (valida C3 y A5).
- [ ] Generar una OT de máquina de prueba: explota a conjuntos y piezas correctamente.
- [ ] Desde un celular real, en la red del taller: iniciar y cerrar una operación completa.
- [ ] Registrar un movimiento de stock y verificar que impacta.
- [ ] Revisar que los cron jobs figuran registrados en el proyecto.

### C8 · Accesos y cierre
- [ ] Agregar a Adrián y Julián al team de Vercel con el rol que corresponda.
- [ ] Credenciales cargadas en un gestor de contraseñas **de la empresa**, no en un mail ni un Excel.
- [ ] Confirmar por escrito a Adrián que la facturación arranca en este momento y su monto.

---

## Parte D · Post-traspaso

- [ ] **A las 24 h:** verificar que el primer backup automático de Neon corrió.
- [ ] **A los 7 días:** confirmar que la ventana de point-in-time restore está efectivamente en 7 días.
- [ ] **Al primer ciclo de facturación:** revisar el consumo real contra lo estimado y avisarle a Adrián
      si difiere. Es la última oportunidad de ajustar la expectativa antes del cierre del proyecto.
- [ ] **Mantener la infraestructura vieja encendida y sin borrar durante 3–4 semanas.** Es la red de
      seguridad si aparece algo que el smoke test no cubrió. Recién después, dar de baja.
- [ ] Recién ahí: bajar la cuenta de desarrollo a free o eliminar el proyecto.

---

## Resumen de los cuatro gotchas

1. **URLs de Blob guardadas en la base** → guardar pathname (A5). Prevención de una línea, hoy.
2. **Integraciones duplicadas de Neon prefijan todas las env vars** → limpiar las viejas antes de
   re-agregar la integración (C4).
3. **Migraciones y restore con la connection string unpooled**, no la de pgbouncer (C1, C2).
4. **Sin medio de pago en el destino, la transferencia de Vercel falla** (B2).
