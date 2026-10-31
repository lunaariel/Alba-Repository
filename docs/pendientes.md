# Pendientes registrados

Este registro no se borra al cambiar de fase: cada fila se cierra solo cuando su verificación está hecha.

Estados de verificación:
- **Implementado**: el código existe.
- **Probado con simulación**: pasa pruebas automáticas con servicios falsos o locales.
- **Verificado con servicio real**: probado contra la cuenta real del proveedor.

Hasta hoy, ninguna funcionalidad está en el tercer estado.

## Fase 4 (aprobada el 30/10/2026 con estos pendientes)

| Pendiente | Estado | Qué falta | Fase prevista |
| --- | --- | --- | --- |
| Video de lecciones con Bunny Stream | Implementado; firma probada con prueba unitaria | Probar con una cuenta real | 6 |
| Almacenamiento privado de PDF | Implementado; acceso probado en simulación | Crear el bucket `materiales` en el Supabase real y descargar un PDF real | 5 (subida) y 7 |
| Tipografía del certificado | Implementado con fuentes estándar | Incrustar Fraunces y Atkinson | 5 |
| Cambio de correo electrónico | No implementado (por contacto) | Flujo con confirmación en el correo nuevo | 5 o 7 |
| Baja de cuenta | No implementado (por contacto) | Solicitud y ejecución segura | 5 |
| Devolución pedagógica de la evaluación | No implementado | Temas a reforzar sin revelar respuestas | 5 |
| Integración con servicios externos | Adaptadores simulados | Pruebas con cuentas reales | 6 |
| Revisión final de permisos y privacidad | Pruebas de RLS automáticas | Revisión completa en el entorno real | 7 |

## Fase 5 · entrega 1 (base del panel)

| Pendiente | Estado | Qué falta | Entrega prevista |
| --- | --- | --- | --- |
| Lectura de `opciones.es_correcta` desde el panel | La columna no es legible por clientes, tampoco por la admin | El editor de evaluaciones la leerá por el servidor (clave de servicio) después de `exigirAdmin()` | 2 |
| Acciones de servidor del panel | Prueba estática: cada acción empieza con `exigirAdminAccion()`. Pruebas directas en CI: `acciones-protegidas.mjs` (formularios reales del panel) y `acciones-sensibles.mjs` (26 acciones capturadas en el panel, incluidas eliminar, quitar y subir archivos, revisión favorable, bloqueo, publicar versión, criterios y talleres) reenviadas con la sesión de una alumna y sin sesión: 404 controlado y base y almacenamiento sin cambios; control positivo con la admin; API de datos y almacenamiento con el token de la alumna | Repetir con las acciones de cada entrega nueva | 4 a 6 |
| Nombre de la persona en "Asignó el rol de administración" | El registro guarda el id, no lo muestra | Mostrar el nombre en la ficha del registro | 4 |

## Fase 5 · entrega 2 (cursos y evaluaciones)

| Pendiente | Estado | Qué falta | Cuándo |
| --- | --- | --- | --- |
| Vista previa del borrador "como alumno" desde el panel | Aprobada por la titular; **no implementada** (no es necesaria para la coherencia del versionado) | Página de vista previa del borrador; hoy la publicación muestra la lista de diferencias con la versión vigente | Bloque aparte, a autorizar |
| Duplicar un curso | Aprobada por la titular; **no implementada** | Copiar curso, temario y evaluación como borrador nuevo, sin alumnos, versiones ni historial, con copia de los PDF | Bloque aparte, a autorizar |
| Subir videos a Bunny desde el panel | Se pega el id del video subido a Bunny | Subida directa con la API de Bunny | Fase 6 |
| Pestaña "Alumnos del curso" | No implementada; el editor muestra cuántos alumnos y certificados hay | Lista con avance por alumno | Entrega 4 |
| Bucket `materiales` en el Supabase real | La migración lo crea si existe el esquema de Storage; la subida se probó en el Supabase local de CI | Confirmar en el proyecto real | Fase 7 |
| Mover una lección a otro módulo | No implementado; se reordena dentro del módulo | Selector de módulo en la lección | A definir |

## Versionado académico (31/10/2026)

| Pendiente | Estado | Qué falta | Cuándo |
| --- | --- | --- | --- |
| Bloqueo excepcional de un material PDF desde el panel | La base lo permite (`bloquear_contenido('recursos_leccion', …)`); el panel ofrece el bloqueo de lecciones y preguntas | Botón en cada material de la lección | A definir |
| Diferencias de orden y de textos entre borrador y versión vigente | La publicación lista lecciones y preguntas nuevas o quitadas y cambios de criterios | Mostrar también los cambios de orden | A definir |
| Lista de alumnos por versión | El historial de versiones muestra cuántos alumnos y certificados tiene cada una | Detalle por alumno (con la pestaña «Alumnos del curso») | Entrega 4 |
| Descartar una revisión calculada y no aplicada | Queda en estado «calculada» sin efecto | Botón para descartarla (hoy simplemente no se aplica) | A definir |
| Migraciones 0014, 0015 y 0016 en una base real | Probadas solo en local y en CI (Supabase local efímero), con conciliación y reversión. **Aplicarlas en producción no está autorizado** | Presentar entorno exacto, respaldo verificable, plan, impacto, recuperación, pruebas posteriores y riesgos de reversión; pedir autorización específica | Cuando la titular lo autorice |

## Fase 5 · entrega 3 (talleres y eventos)

| Pendiente | Estado | Qué falta | Cuándo |
| --- | --- | --- | --- |
| Venta de talleres pagos | Reserva de 15 minutos, pago simulado y pago tardío probados con el simulador | Pasarela real y política de reembolsos | Fase 6 |
| Reembolsos (incidencias «requiere reembolso» y «reembolso pendiente») | Se registran y se ven en el panel; nunca figuran como hechos | Ejecutarlos con la pasarela y cerrar la incidencia con su confirmación | Fase 6 |
| Envío real de correos (confirmación, recordatorios, reprogramación, cancelación) | Registrados como notificaciones pendientes; no se envía nada | Proveedor de correo transaccional | Fase 6 |
| Zoom o Google Meet automáticos | Enlace cargado a mano (adaptador manual) | Elegir proveedor, cuenta y credenciales | Fase 6 (no autorizado todavía) |
| Ejecución programada de `/api/procesos` | Ruta lista con clave; probada en CI llamándola dos veces | Configurar Vercel Cron o pg_cron al definir el hosting | Con el hosting |
| Materiales descargables de talleres | No implementado (figuraba en el plan; no en el pedido de la entrega) | Tabla y subida privada, copia al duplicar | A definir |
| Avisos en «Hoy» (talleres sin enlace a 48 h, incidencias) | La lista de talleres y la página de incidencias los muestran | Tablero «Hoy» | Entrega 4 |
| Errores del proveedor de reuniones (reintentos) | Columnas de estado y error existen; sin proveedor no aplica | Reintentos y aviso urgente | Fase 6 |

## Seguridad requerida por la titular (30/10/2026)

| Requisito | Estado | Qué falta | Cuándo |
| --- | --- | --- | --- |
| Trazabilidad completa de roles: fecha, cuenta afectada, rol anterior, rol nuevo y responsable (persona o servicio) | Parcial: el disparador registra alta y baja del rol admin con fecha, cuenta y autor; si lo ejecuta un script, el autor figura como "Sistema" | Exigir que el script identifique a la persona que lo ejecuta y rechazar cambios de rol sin responsable identificado | Antes del lanzamiento (Fase 7), o antes si se necesita una segunda cuenta admin |
| Autenticación multifactor (MFA) para la administradora | No implementado | Activar MFA en Supabase Auth (TOTP) y exigir nivel `aal2` en `exigirAdmin()` | Requisito previo al lanzamiento comercial |
| Nueva verificación de identidad para operaciones muy sensibles (revocar certificados, eliminar cuentas, reembolsos, cambios de rol) | En evaluación | Definir la lista y pedir una nueva verificación (contraseña o MFA) si la sesión tiene más de N minutos | Evaluación en la entrega 4; implementación antes del lanzamiento |

## Decisiones tomadas por la titular (30/10/2026), a implementar

- **Eliminación definitiva de cuenta** (distinta de darse de baja de los correos): quita el acceso a cursos, evaluaciones y certificados; los certificados se revocan y la verificación pública deja de mostrarlos como vigentes y no muestra datos personales. Se conserva solo lo que la ley obligue (por ejemplo, registros de pago sin datos personales innecesarios). Entrega 4.
- **Reembolso confirmado** revoca automáticamente el acceso al curso; solicitado, pendiente o fallido no. Queda auditado. Antes de implementarlo se propondrá qué pasa con un certificado ya emitido para ese curso; no se revoca en silencio. Entregas 4 y 6.
- **Duplicar talleres**: copia título, descripción, materiales y configuración; permite cambiar fecha, horario, precio y cupo; no copia inscriptos, pagos, enlaces de reunión ni asistencia; la copia nace en borrador. Entrega 3.

## Lista de control permanente (pedido de la titular, 30/10/2026)

Ninguna de estas medidas se considera implementada hasta que exista una prueba que lo demuestre.

### Seguridad

| Medida | Estado | Prueba que la demostrará |
| --- | --- | --- |
| MFA obligatorio para la administradora antes del lanzamiento | No implementado | Recorrido: sin segundo factor, `/admin` responde 404 |
| Nueva verificación de identidad para operaciones muy sensibles | En evaluación | Recorrido: una operación sensible con sesión antigua pide verificar |
| Responsable real de los cambios de rol, incluidos los hechos por scripts | Parcial (el script figura como "Sistema") | SQL: un cambio de rol sin responsable identificado se rechaza |
| Validación de permisos en todas las acciones nuevas del panel | Vigente para las 19 acciones actuales (prueba estática + 404 + SQL) | Cada entrega nueva amplía la prueba; falta invocar una acción directamente con sesión de alumna |
| Registro de auditoría de operaciones críticas | Vigente para cursos, temario, evaluaciones, talleres, roles, cupones, configuración | Cada operación crítica nueva suma su prueba SQL |

### Integraciones (ninguna activa; no se activan proveedores pagos ni credenciales de producción sin autorización)

| Integración | Estado |
| --- | --- |
| Validación real de Bunny Stream | Firma probada en prueba unitaria; sin cuenta real |
| Subida de videos desde el panel | No implementada (se pega el id) |
| Almacenamiento privado de PDF en el entorno definitivo | Probado en el Supabase local de CI; falta el proyecto real |
| Correo transaccional | Adaptador simulado |
| Cambio de correo y eliminación de cuenta | No implementados (decisión de la titular registrada arriba) |
| Pagos reales y reembolsos | Adaptador simulado; ventas cerradas |
| Facturación según la jurisdicción comercial (FEL en Guatemala) | Solo recibo comercial no fiscal |
| Videoconferencias automáticas (Zoom o Meet) | Adaptador manual |

## Planes presentados y en espera de aprobación (30/10/2026)

- Versionado académico: **implementado** (31/10/2026, migraciones 0014 y 0015), aprobado condicionalmente por la titular. Vista previa de borradores y duplicación de cursos: aprobadas, sin implementar, como bloque aparte.
- Fase 5, entrega 3: talleres y eventos. **Implementada en local y en pruebas** (31/10/2026, migración 0016), a la espera de la aprobación de la titular. No se aplicó en ninguna base real.
- Defecto detectado al planificar: un pago aprobado después del vencimiento de la reserva, sin lugar disponible, deja la orden pendiente sin aviso. Su corrección está prevista en la entrega 3.

## Decisiones de negocio abiertas

Pasarela de pago para Guatemala · certificador FEL · política de reembolsos · dominio y hosting · fotos y biografía reales de la maestra · presupuesto.
