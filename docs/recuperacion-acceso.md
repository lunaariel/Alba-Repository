# Recuperación de acceso de la administradora

Fase 6A (02/11/2026). **Procedimiento preparado y probado en local y CI. La elección operativa queda pendiente antes del lanzamiento.**

## Principio

Perder el teléfono no puede dejar el panel abierto a quien solo controla el correo. Por eso **no existe recuperación por correo** del segundo factor, ni autoservicio, ni un atajo activado para las pruebas.

## Prevención (recomendada, sin costo)

1. **Factor de respaldo**: al activar el segundo factor, registrar también un segundo dispositivo (tablet, teléfono viejo o gestor de contraseñas con TOTP) y guardarlo en un lugar seguro. Supabase admite varios factores por cuenta; la pantalla de Configuración › Seguridad lo ofrece.
2. Con la política encendida, la aplicación impide quitar el único factor.

## Si se perdieron todos los factores

Procedimiento con **dos personas** y **otra vía de identidad**:

1. La administradora avisa por un canal acordado de antemano (no por un correo nuevo).
2. Una segunda persona de confianza, con acceso de dueño a la base (por ejemplo, el responsable técnico), **verifica la identidad** por otra vía: videollamada con documento, llamada a un número registrado previamente o presencialmente. Registra cómo lo verificó.
3. Si hay sospecha de que también conocen la contraseña: restablecer la contraseña primero.
4. Ejecuta, con su nombre como responsable:

   ```bash
   psql "$URL_BASE" -v ON_ERROR_STOP=1 -v correo="'maestra@…'" -v confirmacion="'maestra@…'" \
        -v responsable="'Nombre de quien lo ejecuta'" -v motivo="'Pérdida del teléfono; identidad verificada por …'" \
        -f scripts/recuperar-mfa.sql
   ```

   Exige el correo dos veces, responsable y un motivo de 20 caracteres o más. Quita los factores, **cierra todas las sesiones** de esa cuenta y deja el registro `segundo_factor_recuperacion` en la auditoría. No cambia la contraseña ni el rol.
5. En el siguiente ingreso, con la política encendida, la administradora **debe activar un factor nuevo** antes de entrar al panel.

Probado en `scripts/recorrido-mfa.mjs`: sin confirmación exacta no quita nada; con ella quita factores y sesiones, la sesión anterior deja de entrar y el próximo ingreso exige activar un factor nuevo.

## Alternativas evaluadas (decisión pendiente)

| Opción | Estado | Comentario |
| --- | --- | --- |
| A. Factor de respaldo en un segundo dispositivo | **Implementada** | Sin costo; depende de que la administradora lo registre y lo guarde |
| B. Script con dos personas y verificación de identidad (arriba) | **Implementada** | Requiere designar a la segunda persona y el canal de verificación |
| C. Códigos de recuperación de Supabase Auth | **No activada** | En `@supabase/auth-js` 2.118 están marcados como *experimentales* (`mfa.recoveryCodes`, requiere habilitarlos expresamente). No se usa una función experimental para la cuenta más sensible; reevaluar cuando sea estable |
| D. Segundo factor por SMS | Descartada | Más débil (SIM swapping) y con costo por mensaje |
| E. Llaves de seguridad (WebAuthn) | Futuro | Supabase la ofrece; requiere comprar llaves |

**Decisión que falta (titular):** quién es la segunda persona con acceso de dueño, qué canal de verificación se usa y dónde se guarda el factor de respaldo.

## Producción

En el proyecto real, el script se ejecuta con la conexión de dueño de la base (Supabase › Database › Connection string). Alternativa equivalente: el panel de Supabase permite quitar factores de un usuario y cerrar sus sesiones; en ese caso, registrar manualmente la acción en la auditoría. **Nada de esto está autorizado hoy**: no se tocaron cuentas ni credenciales reales.
