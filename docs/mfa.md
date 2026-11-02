# Segundo factor (MFA) y verificación reforzada

Fase 6A (02/11/2026). **Implementado y probado solo en local y en CI** (Supabase local efímero). La política está **apagada** en todas las bases: no se activó en ninguna cuenta real.

## Cómo funciona

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| Factor TOTP | Supabase Auth (`auth.mfa_factors`) | Genera y guarda el secreto. La aplicación nunca lo guarda en tablas propias; lo muestra **una sola vez** (QR y texto) al activarlo |
| Política | `public.politica_seguridad` (migración 0026) | `mfa_admin_obligatorio` y `reforzada_minutos` (5). Se cambia **solo por script** con responsable (`scripts/politica-mfa.sql`), queda auditado |
| Nivel de sesión | Token firmado por Auth (`aal`, `amr`, `session_id`) | PostgREST verifica la firma; la base lee los claims. Nada viene del navegador |
| `es_admin()` | Base | Con la política encendida exige `aal = aal2`. RLS y todas las funciones del panel rechazan una sesión admin sin segundo factor, **también por la API directa** |
| `exigirAdmin()` | Aplicación | Sin rol: 404. Con rol y sin segundo factor: va a `/segundo-factor` |
| Verificación reforzada | Disparadores de la base + `clienteOperacionSensible()` | Las operaciones sensibles exigen el código del momento: el servidor lo verifica con Supabase Auth (token nuevo) y la base comprueba que el factor se verificó hace ≤ 5 minutos **en esa sesión** y que esa verificación no se usó antes |

## Flujo de la administradora

1. **Ingreso**: correo y contraseña.
2. Si tiene un factor: `/segundo-factor` pide el código de 6 dígitos (cualquier persona con factor, admin o no).
3. Si es admin, la política está encendida y no tiene factor: `/segundo-factor/activar` (solo cuentas con rol admin; para el resto, 404).
4. **Activación**: «Generar el código QR» (Supabase Auth crea el factor) → escanear → escribir el código → «Confirmar y activar». Un código incorrecto no activa nada. Queda en la auditoría (`segundo_factor_activado`).
5. **Panel**: con `aal2`.
6. **Factor de respaldo**: Configuración › Seguridad › «Agregar un factor de respaldo» (exige haber verificado el factor actual en esa sesión).
7. **Quitar un factor**: operación sensible (código del momento). Con la política encendida no se puede quitar el único factor.
8. **Reautenticación**: cada operación sensible pide un código nuevo (ver abajo).

## Operaciones sensibles (verificación reforzada)

La base las protege con disparadores; la interfaz agrega el campo «Código de su app autenticadora» solo cuando la política está encendida.

| Operación | Disparador (tabla) | Acción del panel |
| --- | --- | --- |
| Cambiar precio o duración comercial de un curso | `cursos` (update de precio, duración o estado) | `guardarDatosCurso` (solo si cambian) |
| Publicar, archivar o volver a borrador un curso | `cursos` | `cambiarEstadoCurso` |
| Eliminar un curso | `cursos` (delete) | `eliminarCurso` |
| Publicar una versión | `versiones_curso` (insert) | `publicarVersion` |
| Precio o estado de un taller; eliminarlo; cancelarlo | `talleres` | `guardarTaller` (si cambia el precio), `cambiarEstadoTaller`, `eliminarTaller`, `cancelarTaller` |
| Condiciones de venta de grabaciones | `grabaciones_taller` | `guardarCondicionesGrabacion` |
| Cupones | `cupones` | (sin pantalla; también por API) |
| Revisión favorable (corrección académica excepcional) | `revisiones_evaluacion` → aplicada | `aplicarRevision` |
| Bloqueo excepcional de contenido | `lecciones`, `recursos_leccion`, `preguntas` | `bloquearContenido` |
| Anular una validación docente | `validaciones_formativas` | `anularValidacion` |
| Otorgar o revocar accesos (becas, otorgamientos) | `periodos_acceso` | `otorgarBeca`, `revocarBeca`, `reintentarOtorgamiento` |
| Resolver incidencias (reembolsos) | `incidencias` → resuelta | `resolverReembolsoParcial` |
| Contacto público, moneda, zona, talleres públicos | `configuracion_academia` | (por script hoy) |
| Roles de administración | `roles_usuario` | (solo por script) |

**Política de vigencia**: 5 minutos desde la verificación (configurable de 1 a 15 por script). **Un solo uso**: cada verificación sirve para una operación (una transacción); un segundo intento con la misma verificación se rechaza (`verificacion_reforzada_usada`). Si la operación falla, la verificación no queda consumida. Se registra sesión, instante y acción; **nunca el código**.

**Exentos**: la clave de servicio (webhooks y procesos) y los scripts del servidor sin sesión, que tienen sus propios controles (responsable obligatorio, auditoría). Quien no es admin no llega a estos disparadores: RLS ya le niega la operación.

**No hay bloqueos irreversibles**: con la política apagada todo funciona como antes; encenderla no quita roles ni sesiones; apagarla es un script.

## Encender la política en un entorno real (no autorizado todavía)

1. Aplicar la migración 0026 (procedimiento de `docs/estrategia-migracion.md`, con autorización).
2. Habilitar TOTP en Supabase Auth (Authentication › Multi-Factor › TOTP: *enroll* y *verify*).
3. La administradora activa su factor principal y uno de respaldo desde Configuración › Seguridad (con la política aún apagada).
4. Decidir el procedimiento de recuperación (`docs/recuperacion-acceso.md`).
5. `psql … -v activa=true -v minutos=5 -v responsable="'…'" -f scripts/politica-mfa.sql`.
6. Probar ingreso, una operación sensible y el rechazo sin código.

## Pruebas

- `tests/db/99k_mfa_reforzada.sql`: política, aal1/aal2, alumna con factor propio, vigencia, un solo uso, falla sin consumo, exentos, becas, configuración, apagado.
- `scripts/recorrido-mfa.mjs` (CI): visitante, alumna, segunda alumna, admin sin factor, activación real con TOTP, reingreso, operaciones sensibles en el panel con y sin código, un solo uso y sesión antigua por la API, celular y escritorio, recuperación, ausencia de secretos en registros y auditoría.
- `tests/unit/mfa-csp.test.ts`: reglas puras y presencia de la verificación en cada acción sensible.

## Pendiente

- Verificar en el proyecto real que Supabase cifre los secretos TOTP en reposo (en Supabase alojado lo gestiona la plataforma; en local se guardan en `auth.mfa_factors`, fuera de las tablas de la aplicación).
- Límite de intentos de código: hoy lo aplica Supabase Auth (límites de verificación por IP). Evaluar un límite propio por cuenta si se observan abusos.
- Duración máxima de sesión del panel (*time-box* de sesiones de Supabase, plan Pro): decidir con el hosting.
