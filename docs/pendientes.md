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

## Decisiones tomadas por la titular (30/10/2026), a implementar

- **Eliminación definitiva de cuenta** (distinta de darse de baja de los correos): quita el acceso a cursos, evaluaciones y certificados; los certificados se revocan y la verificación pública deja de mostrarlos como vigentes y no muestra datos personales. Se conserva solo lo que la ley obligue (por ejemplo, registros de pago sin datos personales innecesarios). Entrega 4.
- **Reembolso confirmado** revoca automáticamente el acceso al curso; solicitado, pendiente o fallido no. Queda auditado. Antes de implementarlo se propondrá qué pasa con un certificado ya emitido para ese curso; no se revoca en silencio. Entregas 4 y 6.
- **Duplicar talleres**: copia título, descripción, materiales y configuración; permite cambiar fecha, horario, precio y cupo; no copia inscriptos, pagos, enlaces de reunión ni asistencia; la copia nace en borrador. Entrega 3.

## Decisiones de negocio abiertas

Pasarela de pago para Guatemala · certificador FEL · política de reembolsos · dominio y hosting · fotos y biografía reales de la maestra · presupuesto.
