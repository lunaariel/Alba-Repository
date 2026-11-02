# Informe de seguridad y privacidad

Actualizado en la Fase 6A (02/11/2026). Distingue lo **implementado y probado** de lo **pendiente**. Ninguna medida se probó contra servicios reales de producción.

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
| Contenido de páginas del panel en el 404 | Defecto encontrado en CI: una página del panel que no verificaba el rol por sí misma podía llevar su texto en la respuesta 404 (Next la renderiza en paralelo al layout). Ahora toda página del panel llama a `exigirAdmin()` o a un lector de datos que lo hace | Prueba unitaria que recorre todas las páginas del panel; `recorrido-admin.mjs` (sin sesión) |
| Estado de borradores | `faltantes_publicacion` dejó de ser ejecutable por sesiones de alumnos | `99h_permisos.sql` |
| Accesos privados | Materiales con URL firmada y vencimiento; el acceso vencido protege lecciones, materiales y evaluación | `99d_vencimientos.sql`, `recorrido-vencimientos.mjs` |
| Validación de entradas | Todas las acciones validan con zod y la base repite las restricciones (`check`) | Pruebas de valores inválidos en los recorridos |
| Encabezados | `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` y, nuevos, `Strict-Transport-Security` y `Cross-Origin-Opener-Policy`. El encabezado `X-Powered-By` está desactivado | `tests/unit/seguridad.test.ts` |
| Exposición de archivos | Bucket privado; la alumna no lista, no sube ni borra archivos (probado con su token) | `acciones-sensibles.mjs` |
| **Segundo factor de la admin (Fase 6A)** | TOTP de Supabase Auth; ingreso en dos pasos; activación solo para cuentas admin; con la política encendida, `es_admin()` exige `aal2` en la base y el panel lo exige en el servidor | `99k_mfa_reforzada.sql`, `recorrido-mfa.mjs` |
| **Verificación reforzada (Fase 6A)** | Código del momento en precios, publicación, becas, revocaciones, reembolsos, bloqueos, roles y configuración; la base exige ≤ 5 min en la sesión y un solo uso; auditado sin guardar códigos | `99k_mfa_reforzada.sql`, `recorrido-mfa.mjs` |
| **CSP (Fase 6A)** | Nonce por solicitud, `strict-dynamic`, sin `unsafe-eval` en producción, `frame-ancestors 'none'`, orígenes externos justificados (`docs/csp.md`) | `mfa-csp.test.ts`; todos los recorridos con la política aplicada |
| **Recuperación de acceso (Fase 6A)** | Factor de respaldo; script con responsable, motivo y confirmación que quita factores y cierra sesiones; sin recuperación por correo | `recorrido-mfa.mjs` |
| Envíos formativos (D8, D9) | 10 por persona y minuto; la alumna no lee su puntaje interno por la API | `99k_mfa_reforzada.sql` |

## Preparado, no activo

- **Política de segundo factor.** Implementada y probada; **apagada** en todas las bases (`politica_seguridad.mfa_admin_obligatorio = false`). Encenderla en un entorno real exige migrar 0026 con autorización, habilitar TOTP en Supabase Auth, que la maestra registre su factor y uno de respaldo, y decidir la recuperación (`docs/mfa.md`). No se activó en ninguna cuenta real.

## Riesgos residuales

| Riesgo | Mitigación actual | Qué falta |
| --- | --- | --- |
| Robo de la contraseña de la admin | Segundo factor listo; rol verificado en cada solicitud, auditoría, roles solo por script con responsable | Encender la política en producción |
| CSP: estilos en línea permitidos | CSP con nonce para scripts | Verificar en el despliegue real, primero en modo observación |
| Reautenticación para operaciones muy sensibles | Implementada (verificación reforzada) | Activa solo con la política encendida |
| Funciones auxiliares ejecutables por visitantes (predicados de visibilidad) | Devuelven booleanos o datos públicos; están en la lista cerrada | Revisarlas al endurecer para producción |
| Puntaje interno de los envíos formativos | Oculto a la alumna (D9) | — |
| Eliminación de cuenta y exportación de datos | Por contacto con la academia | Flujo automatizado (decisión registrada en pendientes) |
| Migraciones 0014 a 0026 | Solo en local y CI, con reversión ensayada y ejecutor transaccional | Autorización específica para producción |
| `main` sin protección | Flujo por Pull Request y CI | Aplicar `docs/proteccion-main.md` (requiere autorización) |
| Respaldos automáticos | Procedimiento local probado | Plan con respaldos del proveedor y copia del bucket (`docs/respaldos.md`) |
