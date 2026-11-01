# Fase 6: seguridad previa, migraciones y plan por dependencias

> **Actualización del 01/11/2026:** la titular decidió lanzar primero los cursos y después los talleres. Las etapas 8 (Zoom y Meet) y 9 (grabaciones) pasan a la segunda etapa. El orden vigente está en `docs/plan-lanzamiento-cursos.md`. Los defectos D1 a D7 y el bloqueante S3 quedaron resueltos en la migración 0024 (local y CI).

Fecha: 01/11/2026. **Plan para aprobar. No se inició ninguna integración externa.**

## 1. Estado de seguridad antes del lanzamiento

Ningún mecanismo de esta lista se declara seguro solo por tener interfaz. **El MFA administrativo está preparado pero no activo.**

### Bloqueantes para producción

No se usan datos ni ventas reales sin resolver estos puntos.

| # | Punto | Estado verificado | Qué falta |
| --- | --- | --- | --- |
| S1 | **MFA real de la admin** | El código exige `aal2` solo si `ADMIN_MFA_OBLIGATORIO=si`, y la variable está apagada | Pantallas de enrolamiento TOTP y de verificación, factor de la maestra registrado, procedimiento de recuperación (códigos guardados fuera de línea y una segunda admin o un procedimiento por script con responsable). Activar la variable y probar en CI que sin `aal2` el panel responde 404 |
| S2 | **Autorización reforzada en acciones sensibles** | Confirmación escrita y motivo obligatorio | Exigir `aal2` reciente (por ejemplo, de menos de 15 min) para estas acciones: reembolsos, becas, cambios de precio y duración, roles, publicación de versiones y anulación de certificados o validaciones |
| S3 | **Renovaciones y reembolsos correctos** | D1, D2, D4 y D5 de la auditoría | Implementar los períodos de acceso (`docs/renovaciones-becas.md`) antes de abrir las ventas |
| S4 | **Webhooks de pago verificados** | Interfaz simulada | Firma verificada, idempotencia por evento, reintentos y conciliación, probados en el *sandbox* del proveedor elegido |
| S5 | **Secretos y configuración** | Claves solo en el servidor (`service_role` no llega al navegador) | Variables de producción en el proveedor de hosting, rotación de las claves de desarrollo, dominio con HTTPS |
| S6 | **Respaldo con restauración probada** | No hay base de producción | Respaldo diario del proveedor más un volcado externo, y una restauración ensayada antes del lanzamiento |
| S7 | **Migraciones con procedimiento** | Solo en local y CI | Procedimiento de la sección 2, autorizado y ejecutado |
| S8 | **Validación de cada integración real** | Ninguna conectada | Cada integración (pago, video, correo, videoconferencia) se habilita solo después de pasar sus pruebas en un entorno de prueba. Ninguna se presenta como verificada antes |

### Recomendados antes del lanzamiento

| # | Punto | Detalle |
| --- | --- | --- |
| R1 | **CSP** | Política con `nonce` compatible con Next, con el reproductor de Bunny, la pasarela y Meet o Zoom solo como enlaces. Primero en modo `Report-Only` durante una semana, luego obligatoria |
| R2 | **Error de hidratación #418** | Intermitente y sin origen identificado. Probablemente una fecha u hora formateada distinta en el servidor y el navegador. Reproducir con la compilación de producción y corregir, porque puede dejar una pantalla sin interactividad |
| R3 | **Límites de frecuencia** | Ingreso (Supabase ya limita), envíos formativos (D8), creación de órdenes |
| R4 | **Alertas** | Errores del servidor y caída del sitio (Presupuesto B) |
| R5 | **Certificado accesible tras vencer** (D6) y **verificación de vencimiento en `cambiar_version`** (D7) | Correcciones menores |
| R6 | **Política de privacidad y términos** revisados con el contador o un abogado | Incluye los datos opcionales del perfil |

### Mejoras posteriores

- eliminación de cuenta y exportación de datos automatizadas;
- ocultar el puntaje formativo interno (D9);
- rendimiento de `seguimiento_curso` (D10);
- ayudantes E2E compartidos (D15);
- DRM del video, solo si aparece piratería.

## 2. Migraciones 0014 a 0023: procedimiento verificable (no ejecutar)

**Orden obligatorio:** 0014 → 0015 → … → 0023.

**Dependencias:**

- 0015 a 0019 dependen de las versiones de 0014;
- 0018 redefine funciones de 0014 y 0016;
- 0019 usa `crear_orden` y los ítems de 0005 y 0008;
- 0021 depende de los talleres de 0016 y 0017;
- 0023 depende del panel de 0012.

### Riesgos por revisar

| Aspecto | Situación | Medida |
| --- | --- | --- |
| Integridad referencial | Claves foráneas nuevas: versiones, validaciones, certificados → intentos (nulable) | Verificar que no queden filas huérfanas después de cada paso |
| Conciliación | 0014 asigna una versión a todo acceso | `select public.conciliar_versionado();` tiene que devolver 0 antes de seguir |
| Idempotencia | **No son idempotentes** | Cada archivo con `psql -v ON_ERROR_STOP=1 --single-transaction`: o se aplica entero o no se aplica |
| Reversibilidad | Reversiones ensayadas; se niegan si perderían datos nuevos | Después de abrir el uso, la única vuelta atrás es restaurar el respaldo |
| Pérdida de datos | Ninguna migración borra columnas ni filas existentes (verificado en los ensayos: datos previos idénticos) | Comparar conteos y sumas antes y después |
| Datos históricos | Accesos anteriores sin vencimiento, certificados anteriores sumativos, inscripciones anteriores con 24 h | Comprobar con consultas por muestra |
| Órdenes pendientes (D5) | Una orden de curso pendiente anterior a 0019 daría acceso sin vencimiento | **Antes de 0019**: anular las órdenes de curso pendientes (con auditoría) |
| Duración comercial | 0019 impide vender un curso sin duración | Cargar la duración de cada curso antes de abrir las ventas |
| Roles | 0023 exige un responsable | Usar `scripts/asignar-admin.sql` con `responsable` |

### Procedimiento

Cada paso tiene una verificación que hay que registrar.

1. **Identificar el entorno:** proyecto, región, versión de Postgres, últimas migraciones aplicadas (`supabase_migrations.schema_migrations`). *Verificación:* la última aplicada es 0013.
2. **Congelar:** ventas cerradas, aviso en el campus y sin escrituras de la admin. *Verificación:* no hay órdenes pendientes recientes ni sesiones admin activas.
3. **Respaldo:** `pg_dump` completo, con formato personalizado y suma SHA-256, más un punto de respaldo del proveedor. *Verificación:* restaurarlo en una base temporal y comparar los conteos por tabla.
4. **Línea de base:** guardar conteos por tabla, sumas de `items_orden.precio`, cantidad de certificados y accesos por estado.
5. **Ensayo completo en una copia:** restaurar el respaldo en un proyecto de prueba, aplicar 0014 a 0023 con `--single-transaction`, correr la conciliación, `tests/db/*` adaptado a esos datos y los recorridos E2E. *Verificación:* todo en verde y conteos coherentes. **Si algo falla, se detiene y se informa.**
6. **Ventana de producción**, solo con autorización escrita. Aplicar de a un archivo y después de cada uno:
   - conteos;
   - conciliación (desde 0014);
   - `select` de muestra.
   - Antes de 0019, anular las órdenes de curso pendientes.
7. **Verificación final:**
   - recorridos con cuentas de prueba;
   - descarga de un certificado anterior;
   - verificación pública de un certificado;
   - comparación con la línea de base.
8. **Plan de vuelta atrás:**
   - si falla durante la ventana, se aplican las reversiones en orden inverso (válidas sin datos nuevos);
   - si hay dudas después de abrir, se restaura el respaldo del paso 3 y se comunica.

## 3. Plan de la Fase 6 por dependencias

Costos mensuales según `docs/presupuestos-proveedores.md`. Ninguna etapa empieza sin autorización.

**1. Infraestructura y configuración segura**

- **Depende de:** elegir el proveedor (Vercel y Supabase Pro), dominio, autorización de gasto.
- **Alcance:** proyecto de producción y uno de prueba, variables, dominio y HTTPS, migraciones (sección 2), respaldo externo, encabezados y CSP en `Report-Only`.
- **Riesgos:** configuración expuesta, migración incompleta.
- **Costo:** USD 46.25 al mes (Q354).
- **Pruebas:** despliegue de prueba, restauración de respaldo, encabezados.
- **Aceptación:** sitio en el dominio con HTTPS, base migrada y conciliada, restauración probada.
- **Decisiones:** dominio, autorización de gasto.

**2. Autenticación admin y MFA**

- **Depende de:** 1.
- **Alcance:** S1 y S2.
- **Riesgos:** que la maestra quede sin acceso.
- **Costo:** USD 0.
- **Pruebas:** E2E con un factor de prueba, panel sin `aal2` → 404, recuperación.
- **Aceptación:** la variable activa en producción y la maestra con el factor registrado.
- **Decisiones:** procedimiento de recuperación (segunda admin o script).

**3. Almacenamiento privado de videos y materiales**

- **Depende de:** 1.
- **Alcance:** biblioteca privada de Bunny con URL firmada (ya integrada) y materiales en un bucket privado.
- **Riesgos:** enlaces filtrados (mitigado con tokens de vencimiento corto).
- **Costo:** USD 3.40 a 13.20.
- **Pruebas:** reproducción con y sin acceso vigente, token vencido.
- **Aceptación:** ningún video accesible sin acceso vigente.
- **Decisiones:** ninguna nueva.

**4. Correo**

- **Depende de:** 1 (dominio).
- **Alcance:** Resend, SPF, DKIM y DMARC, plantillas en «usted», SMTP de Supabase Auth.
- **Riesgos:** caer en spam.
- **Costo:** USD 0.
- **Pruebas:** entrega a Gmail y Outlook, rebotes.
- **Aceptación:** confirmaciones y recuperación entregadas.
- **Decisiones:** remitente.

**5. Pasarela de pago**

- **Depende de:** 1, 2, 4 y las respuestas del contador.
- **Alcance:** adaptador de la pasarela elegida, webhooks firmados e idempotentes, *sandbox*.
- **Riesgos:** eventos de reembolso o contracargo no documentados (Recurrente).
- **Costo:** comisión por venta.
- **Pruebas:** pago aprobado, rechazado, duplicado y fuera de orden.
- **Aceptación:** S4 cumplido en *sandbox*.
- **Decisiones:** pasarela y condición tributaria.

**6. Confirmación de compra y otorgamiento de acceso**

- **Depende de:** 5.
- **Alcance:** períodos de acceso, renovaciones y becas (D1 a D5), recibo comercial, correo de confirmación.
- **Riesgos:** desincronización de vencimientos.
- **Costo:** USD 0.
- **Pruebas:** primera compra, renovación, carrera, beca, conciliación.
- **Aceptación:** ningún pago sin acceso ni acceso sin pago o beca.
- **Decisiones:** aprobar el modelo de renovaciones y becas.

**7. Reembolsos y conciliación**

- **Depende de:** 6.
- **Alcance:** reembolso parcial o total por el panel con `aal2`, revocación por período, conciliación diaria con la pasarela, incidencias.
- **Riesgos:** diferencias con la pasarela.
- **Costo:** USD 0.
- **Pruebas:** reembolso, contracargo y diferencia simulada en *sandbox*.
- **Aceptación:** la conciliación da cero diferencias.
- **Decisiones:** política de reembolsos (plazos), si no está escrita.

**8. Integración con Zoom y Meet**

- **Depende de:** 1 y 2, y elegir la licencia.
- **Alcance:**
  - creación de reuniones desde el panel con la plataforma elegida por taller;
  - enlace de anfitrión oculto;
  - Meet con acceso restringido, Zoom con sala de espera.
- **Riesgos:** verificación de la app de Google (semanas).
- **Costo:** USD 14.
- **Pruebas:** fase 1 y 2 del procedimiento de prueba.
- **Aceptación:** taller de prueba creado, al que solo entran personas inscriptas.
- **Decisiones:** qué licencia contratar.

**9. Gestión de grabaciones**

- **Depende de:** 3 y 8.
- **Alcance:** obtener la grabación (manual al principio, por API después), subirla a Bunny y usar el flujo de revisión existente.
- **Riesgos:** permisos restringidos de Drive.
- **Costo:** video por uso.
- **Pruebas:** grabación de prueba hasta su publicación.
- **Aceptación:** grabación visible solo con derecho vigente.
- **Decisiones:** ninguna nueva.

**10. Facturación fiscal**

- **Depende de:** las respuestas del contador.
- **Alcance:** FEL manual documentada, o un certificador por API.
- **Riesgos:** facturar mal.
- **Costo:** Q0 a Q500.
- **Pruebas:** en el ambiente de pruebas del certificador.
- **Aceptación:** el contador aprueba.
- **Decisiones:** emisión manual o certificador.

**11. Pruebas E2E integrales**

- **Depende de:** 2 a 9.
- **Alcance:** recorridos completos contra los *sandbox*, en celular y escritorio.
- **Riesgos:** tiempo.
- **Costo:** USD 0.
- **Pruebas:** todas.
- **Aceptación:** CI en verde con integraciones de prueba.
- **Decisiones:** ninguna.

**12. Preparación del lanzamiento**

- **Depende de:** todo lo anterior.
- **Alcance:**
  - CSP obligatoria;
  - R2;
  - alertas;
  - textos legales;
  - carga de cursos con duración y precio;
  - ensayo general;
  - plan de soporte.
- **Riesgos:** lanzar con bloqueantes abiertos.
- **Costo:** según el presupuesto elegido.
- **Pruebas:** lista S1 a S8 cerrada.
- **Aceptación:** autorización escrita de la titular.
- **Decisiones:** fecha y presupuesto.

## 4. Decisiones que realmente necesitan a la maestra

1. **Pasarela:** Recurrente o Lemon Squeezy. Depende de dónde están las compradoras y de lo que diga el contador.
2. **Contador:** consultarlo (preguntas en `docs/presupuestos-proveedores.md`).
3. **Licencia de videoconferencia:** Workspace Business Standard o Zoom Pro, después de la prueba con cuentas gratuitas, y si los talleres empiezan junto con los cursos o después.
4. **Presupuesto:** A al límite de Q500 (o por debajo, si se posponen los talleres), o B por etapas.
5. **Modelo de renovaciones y becas:** aprobarlo tal como está propuesto.
6. **Recuperación del MFA:** si habrá una segunda admin de confianza o un procedimiento técnico con responsable.
7. **Dominio** de la academia.
