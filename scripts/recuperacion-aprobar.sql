-- Paso 2 de la recuperación administrativa. Lo ejecuta la persona o autoridad independiente, conectada con SU
-- usuario de base de datos (distinto del de quien solicitó), después de verificar por su cuenta la identidad de
-- la titular. Quita todos los segundos factores de la cuenta y cierra todas sus sesiones; con la política
-- encendida, la titular deberá registrar factores nuevos antes de volver al panel.
--   psql "postgresql://SU_USUARIO@HOST/BASE" -v ON_ERROR_STOP=1 -v solicitud="'uuid'" -v verificacion="'…'" -f scripts/recuperacion-aprobar.sql
select public.aprobar_recuperacion_mfa(:solicitud::uuid, :verificacion) as resultado;
