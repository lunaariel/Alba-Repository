# Recuperación de acceso administrativo

Actualizado al cierre de la Fase 6A (02/11/2026, migración 0027). **Procedimiento implementado y probado en local y en CI. No está habilitado en producción**: faltan las designaciones de la titular (abajo) y la autorización para aplicar las migraciones.

## Decisión aprobada por la titular (02/11/2026)

La recuperación excepcional involucra a **la maestra** (titular y administradora principal), **el responsable técnico** y **una verificación independiente de identidad**. Ninguna persona sola puede desactivar el segundo factor ni apropiarse de la cuenta.

## Estado al 03/11/2026: inactivo hasta la designación

La titular confirmó que **todavía no hay responsable técnico ni aprobador independiente designados**. Por lo tanto:

- el procedimiento de la migración 0027 se conserva, pero **no está habilitado en ningún entorno real**;
- no se asignó el rol a ningún usuario del sistema;
- no se crearon usuarios permanentes de recuperación ni identidades ficticias fuera de las pruebas;
- la titular no puede cumplir sola los dos roles: la base exige dos identidades distintas, y ser dueño de la base no alcanza;
- la aprobación independiente no se reemplaza por una confirmación de correo.

Las simulaciones con identidades ficticias existen **solo** dentro de las pruebas locales y de CI. Sus roles se crean y se borran en cada prueba.

### Pendientes antes de activar

1. Identidad del responsable técnico.
2. Identidad del aprobador independiente.
3. Canal de verificación de identidad de la titular.
4. Procedimiento de custodia de credenciales: decidido en principio (la titular custodia; `docs/infraestructura.md`); falta el gestor de contraseñas y la creación de cuentas reales.
5. Procedimiento de emergencia: qué hacer si la titular no está disponible y quién decide.
6. Prueba supervisada en un entorno de pruebas con las personas designadas, antes de habilitarlo en producción.

## Designaciones pendientes

No se inventan nombres ni canales. Hasta completar esta tabla, el procedimiento está **bloqueado en la base**: nadie es miembro de los roles que permiten solicitarlo o aprobarlo.

| Campo | Valor |
| --- | --- |
| Responsable técnico (persona) | **PENDIENTE de designación por la titular** |
| Usuario de base de datos del responsable técnico | **PENDIENTE** |
| Persona o autoridad independiente que aprueba | **PENDIENTE de designación por la titular** |
| Usuario de base de datos de quien aprueba | **PENDIENTE** |
| Canal confiable previamente acordado para verificar la identidad de la titular | **PENDIENTE** (debe ser distinto del correo de la cuenta) |
| Canal propio de la persona aprobadora para su verificación independiente | **PENDIENTE** |
| Dónde guarda la maestra su factor de respaldo | **PENDIENTE** |

Cada persona necesita su **propio usuario de base de datos** con su propia contraseña. Así la solicitud y la aprobación quedan hechas por dos identidades distintas, y la base lo comprueba.

## Procedimiento

1. **Factor de respaldo primero.** La maestra intenta ingresar con su segundo dispositivo (Configuración › Seguridad permite registrarlo). Si funciona, no hay procedimiento excepcional. Después, quita el factor perdido y registra uno nuevo.
2. **Si perdió todos los factores**, avisa por el canal previamente acordado (nunca solo por correo).
3. **Responsable técnico: verificar y solicitar.** Verifica la identidad de la titular por el canal acordado y registra la solicitud con **su** usuario de base de datos:

   ```bash
   psql "postgresql://USUARIO_TECNICO@HOST/BASE" -v ON_ERROR_STOP=1 \
        -v correo="'…'" -v motivo="'…'" -v canal="'…'" -f scripts/recuperacion-solicitar.sql
   ```

   La solicitud no quita nada. Vence en 24 horas y queda en la auditoría.
4. **Persona o autoridad independiente: verificar y aprobar.** Verifica por su cuenta la identidad de la titular, por su propio canal, y aprueba con **su** usuario de base de datos:

   ```bash
   psql "postgresql://USUARIO_APROBADOR@HOST/BASE" -v ON_ERROR_STOP=1 \
        -v solicitud="'…'" -v verificacion="'…'" -f scripts/recuperacion-aprobar.sql
   ```

5. **Efecto.**
   - Se **invalidan todos los factores** de la cuenta (los comprometidos incluidos).
   - Se **cierran todas sus sesiones**.
   - Queda en la auditoría con las dos personas.
   - No cambia la contraseña ni el rol.
6. **Privilegios.** Con la política de segundo factor encendida, la maestra no entra al panel hasta **registrar factores nuevos**: el principal y, de nuevo, uno de respaldo.
7. **Contraseña.** Si se sospecha que también conocen la contraseña, restablecerla antes del paso 4.

## Controles que la base impone (probados)

| Control | Prueba |
| --- | --- |
| Solo un miembro **directo** del rol `albor_recuperacion_tecnico` solicita; ser dueño o superusuario de la base no alcanza | `99l`, `recorrido-mfa.mjs` |
| Solo un miembro directo de `albor_recuperacion_aprobador` aprueba; el técnico ni siquiera puede ejecutar la aprobación | `99l`, `recorrido-mfa.mjs` |
| Quien solicitó no puede aprobar, aunque después cambie de rol; nadie puede tener los dos roles | `99l` |
| La aprobación exige su propia descripción de verificación | `99l` |
| Una solicitud pendiente por cuenta; vence a las 24 horas | `99l` |
| Solo para cuentas administrativas; otras cuentas no se tocan | `99l` |
| Factores y sesiones de esa cuenta eliminados; auditoría con solicitante y aprobador | `99l`, `recorrido-mfa.mjs` |
| La aplicación, las sesiones y la clave de servicio no pueden ejecutarla | `99l` |
| No se guarda ningún código ni secreto | `recorrido-mfa.mjs` |

## Designar o retirar personas (cuando la titular lo decida)

Lo hace quien tiene acceso de dueño, con autorización de la titular. Queda en la auditoría.

```bash
psql "$URL_BASE" -v ON_ERROR_STOP=1 -v usuario_bd="'…'" -v rol="'albor_recuperacion_tecnico'" \
     -v accion="'designar'" -v responsable="'…'" -f scripts/recuperacion-designar.sql
```

Para la persona aprobadora se usa `rol="'albor_recuperacion_aprobador'"`; para quitar una designación, `accion="'retirar'"`.

## Límite residual

Quien tenga acceso de dueño a la base puede crear usuarios de base de datos y designarlos. Por eso la credencial de dueño del proyecto real **no debe quedar en manos de una sola de las personas del procedimiento**: guardarla bajo control de la titular. Hay que decidirlo al contratar el hosting.

## Alternativas evaluadas

| Opción | Estado |
| --- | --- |
| Códigos de recuperación de Supabase Auth | No activados: son experimentales en `@supabase/auth-js` 2.118 |
| Segundo factor por SMS | Descartado: más débil (SIM swapping) |
| Llaves de seguridad (WebAuthn) | Futuro: requiere comprar llaves |
| Script de recuperación de una sola persona (Fase 6A inicial) | **Eliminado**: reemplazado por este procedimiento |
