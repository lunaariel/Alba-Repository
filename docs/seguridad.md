# Informe de seguridad y privacidad

Actualizado en la Jornada autónoma (01/11/2026). Distingue lo **implementado y probado** de lo **pendiente**. Ninguna medida se probó contra servicios reales de producción.

## Implementado y probado

| Área | Medida | Prueba |
| --- | --- | --- |
| Autorización del panel | Cada página y cada acción del panel verifican el rol en el servidor en cada solicitud (`exigirAdmin`, `exigirAdminAccion`). Quien no es admin recibe 404, sin detalles. La base vuelve a verificar (RLS y `es_admin()`) | Prueba estática de la primera línea de cada acción; reenvío de solicitudes reales capturadas (alumna y visitante) en `acciones-sensibles.mjs`, `recorrido-evaluaciones.mjs` y `recorrido-panel-cursos.mjs` |
| Actuar en nombre de otra persona | Las funciones del campus actúan solo sobre `auth.uid()`; las de servidor (`corregir_evaluacion`, `emitir_certificado`, `registrar_actividad_formativa`…) no son ejecutables por sesiones | `99h_permisos.sql`; reenvíos con una segunda alumna real |
| Revisión de permisos de la base | Todas las tablas con RLS. Listas cerradas de funciones `security definer` ejecutables por visitantes y por sesiones: una función nueva expuesta hace fallar la prueba | `tests/db/99h_permisos.sql` |
| Columnas secretas | `opciones.es_correcta`, `lecciones.video_id`, enlaces de reunión y **`respuestas_intento.correcta`** (corregido en esta jornada) no son legibles por clientes | `99h_permisos.sql`, llamadas directas a la API en CI |
| Datos personales | Área laboral y estudios: opcionales, legibles solo por la persona y la admin. Las validaciones docentes no son públicas | `99g_perfil_formacion.sql`, `recorrido-perfil.mjs` (API con el token de otra alumna y sin sesión) |
| Trazabilidad de roles | El alta o baja de admin por script exige identificar a la persona responsable (`albor.responsable`), que queda en la auditoría. Ningún rol existente se quitó | `90_panel_base.sql` |
| Modificaciones indebidas | Disparadores de inmutabilidad: versiones, condiciones de compra, vencimientos, plazos de cancelación de cada inscripción, cortesías históricas, respuestas correctas publicadas | SQL `97`–`99f` |
| Estado de borradores | `faltantes_publicacion` dejó de ser ejecutable por sesiones de alumnos | `99h_permisos.sql` |
| Accesos privados | Materiales con URL firmada y vencimiento; el acceso vencido protege lecciones, materiales y evaluación | `99d_vencimientos.sql`, `recorrido-vencimientos.mjs` |
| Validación de entradas | Todas las acciones validan con zod y la base repite las restricciones (`check`) | Pruebas de valores inválidos en los recorridos |
| Encabezados | `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` y, nuevos, `Strict-Transport-Security` y `Cross-Origin-Opener-Policy`. El encabezado `X-Powered-By` está desactivado | `tests/unit/seguridad.test.ts` |
| Exposición de archivos | Bucket privado; la alumna no lista, no sube ni borra archivos (probado con su token) | `acciones-sensibles.mjs` |

## Preparado, no activo

- **MFA de la administradora.** `exigirAdmin` y `exigirAdminAccion` exigen nivel `aal2` solo si `ADMIN_MFA_OBLIGATORIO=si`, y esa variable **no está activa**. Antes de activarla faltan:
  1. la pantalla de enrolamiento TOTP (código QR) y la de verificación al ingresar;
  2. registrar el factor de la maestra y un procedimiento de recuperación si pierde el teléfono.

  Activarla antes dejaría a la maestra sin acceso al panel, lo que este bloque prohíbe. El panel (Configuración) informa «Segundo factor no activo».

## Riesgos residuales

| Riesgo | Mitigación actual | Qué falta |
| --- | --- | --- |
| Robo de la contraseña de la admin | Rol verificado en cada solicitud, auditoría, roles solo por script con responsable | MFA activo (arriba) |
| Sin política de seguridad de contenidos (CSP) | Encabezados básicos; sin HTML de usuarios | Definir una CSP compatible con Next y el reproductor de Bunny, y probarla en el despliegue |
| Reautenticación para operaciones muy sensibles | Confirmación escrita y motivo obligatorio | Pedir la contraseña o MFA si la sesión es antigua (decidir la lista) |
| Funciones auxiliares ejecutables por visitantes (predicados de visibilidad) | Devuelven booleanos o datos públicos; están en la lista cerrada | Revisarlas al endurecer para producción |
| Puntaje interno de los envíos formativos | Visible por la API solo para la propia persona | Ocultar la columna si la maestra lo considera necesario |
| Eliminación de cuenta y exportación de datos | Por contacto con la academia | Flujo automatizado (decisión registrada en pendientes) |
| Migraciones 0014 a 0023 | Solo en local y CI, con reversión ensayada | Plan de ejecución y autorización específica para producción |
