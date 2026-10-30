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

## Decisiones de negocio abiertas

Pasarela de pago para Guatemala · certificador FEL · política de reembolsos · dominio y hosting · fotos y biografía reales de la maestra · presupuesto.
