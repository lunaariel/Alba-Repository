-- Reversión de 20261102000027_recuperacion_dos_personas. SOLO entornos locales o de prueba.
-- Se niega si hay recuperaciones registradas (se perdería su registro; la auditoría se conserva igual).
do $$ begin
  if exists (select 1 from public.recuperaciones_mfa) then raise exception 'reversion_imposible: hay recuperaciones registradas'; end if;
end $$;
drop function public.cancelar_recuperacion_mfa(uuid, text);
drop function public.aprobar_recuperacion_mfa(uuid, text);
drop function public.solicitar_recuperacion_mfa(text, text, text);
drop function public.miembro_directo(text);
drop table public.recuperaciones_mfa;
revoke usage on schema public from albor_recuperacion_tecnico, albor_recuperacion_aprobador;
-- Los roles albor_recuperacion_* son del servidor (no de esta base) y se conservan: sin las funciones no dan
-- ningún permiso. Sus miembros los retira quien los designó (scripts/recuperacion-designar.sql).
