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
| Acciones de servidor del panel | `exigirAdminAccion()` lista; todavía no hay acciones | Probar cada acción con una alumna (debe ser rechazada) | 2 a 6 |
| Nombre de la persona en "Asignó el rol de administración" | El registro guarda el id, no lo muestra | Mostrar el nombre en la ficha del registro | 4 |

## Fase 5 · entrega 2 (cursos y evaluaciones)

| Pendiente | Estado | Qué falta | Cuándo |
| --- | --- | --- | --- |
| Vista previa del curso "como alumno" desde el panel | No implementado (el plan lo incluía) | Página de vista previa para borradores; hoy se ve el curso publicado en el sitio | Entrega 4 o antes del lanzamiento |
| Duplicar un curso | No implementado (no figuraba en el pedido de esta entrega) | Copiar curso, temario y evaluación como borrador, con copia de los PDF | A definir |
| Subir videos a Bunny desde el panel | Se pega el id del video subido a Bunny | Subida directa con la API de Bunny | Fase 6 |
| Pestaña "Alumnos del curso" | No implementada; el editor muestra cuántos alumnos y certificados hay | Lista con avance por alumno | Entrega 4 |
| Bucket `materiales` en el Supabase real | La migración lo crea si existe el esquema de Storage; la subida se probó en el Supabase local de CI | Confirmar en el proyecto real | Fase 7 |
| Mover una lección a otro módulo | No implementado; se reordena dentro del módulo | Selector de módulo en la lección | A definir |

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

## Decisiones de negocio abiertas

Pasarela de pago para Guatemala · certificador FEL · política de reembolsos · dominio y hosting · fotos y biografía reales de la maestra · presupuesto.
