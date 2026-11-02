-- Enciende o apaga la política de segundo factor de la administradora (migración 0026). Queda auditado.
-- SOLO por una persona con acceso de dueño a la base, identificada como responsable.
--   psql "$URL_BASE" -v ON_ERROR_STOP=1 -v activa=true  -v minutos=5 -v responsable="'Nombre de quien lo ejecuta'" -f scripts/politica-mfa.sql
--   psql "$URL_BASE" -v ON_ERROR_STOP=1 -v activa=false -v minutos=5 -v responsable="'Nombre de quien lo ejecuta'" -f scripts/politica-mfa.sql
-- Antes de encenderla en un entorno real: la administradora registró su factor principal y uno de respaldo
-- (docs/mfa.md). Encenderla sin eso la obliga a activarlo en el próximo ingreso; no la bloquea para siempre,
-- y apagarla devuelve el comportamiento anterior.
begin;
select set_config('albor.responsable', btrim(:responsable), true);
update public.politica_seguridad set mfa_admin_obligatorio = :activa, reforzada_minutos = :minutos where id;
select mfa_admin_obligatorio, reforzada_minutos, actualizado_por, actualizado_en from public.politica_seguridad;
commit;
