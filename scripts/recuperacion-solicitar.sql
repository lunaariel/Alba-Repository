-- Paso 1 de la recuperación administrativa (docs/recuperacion-acceso.md). Lo ejecuta el responsable técnico,
-- conectado con SU usuario de base de datos, después de verificar la identidad de la titular por el canal
-- previamente acordado. Antes, la titular intentó usar su factor de respaldo.
--   psql "postgresql://SU_USUARIO@HOST/BASE" -v ON_ERROR_STOP=1 -v correo="'…'" -v motivo="'…'" -v canal="'…'" -f scripts/recuperacion-solicitar.sql
-- Devuelve el identificador de la solicitud, que se entrega a la persona aprobadora. Vence en 24 horas.
select public.solicitar_recuperacion_mfa(:correo, :motivo, :canal) as solicitud;
