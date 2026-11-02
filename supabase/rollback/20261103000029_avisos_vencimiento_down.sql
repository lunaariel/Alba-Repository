-- Reversión de 20261103000029_avisos_vencimiento. SOLO entornos locales o de prueba.
-- Se niega si hay avisos cancelados o avisos con el formato nuevo (se perdería su registro).
do $$ begin
  if exists (select 1 from public.envios_correo where estado = 'cancelado' or (plantilla_clave = 'aviso_vencimiento' and variables ? 'umbral')) then
    raise exception 'reversion_imposible: hay avisos de vencimiento registrados con 0029';
  end if;
end $$;
drop function public.encolar_avisos_vencimiento(timestamptz);
drop function public.umbral_aviso_vencimiento(int);
drop function public.fin_cobertura_continua(uuid, timestamptz);
alter table public.envios_correo drop constraint envios_correo_estado_check;
alter table public.envios_correo add constraint envios_correo_estado_check
  check (estado in ('creado', 'pendiente', 'enviando', 'enviado', 'simulado', 'fallido'));
update public.plantillas_correo
   set asunto = 'Su acceso a «{{curso}}» vence el {{fecha}}',
       cuerpo = 'Hola, {{nombre}}. Su acceso a «{{curso}}» vence el {{fecha}}. Sus certificados y su avance se conservan.'
 where clave = 'aviso_vencimiento';
-- Definición de 0028 (con anticipación por parámetro).
create or replace function public.encolar_avisos_vencimiento(p_dias int)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if p_dias is null or p_dias < 1 or p_dias > 60 then raise exception 'dias_invalidos' using errcode = 'P0001'; end if;
  for r in select a.id, a.perfil_id, a.vence_en, c.titulo, u.email, p.nombre_completo
             from public.accesos_curso a join public.cursos c on c.id = a.curso_id
             join auth.users u on u.id = a.perfil_id join public.perfiles p on p.id = a.perfil_id
            where a.estado = 'activo' and a.vence_en is not null and a.vence_en > now() and a.vence_en <= now() + make_interval(days => p_dias)
              and public.proximo_inicio_acceso(a.id) is null loop
    perform public.encolar_correo('aviso_vencimiento', r.email, r.perfil_id,
      jsonb_build_object('nombre', split_part(coalesce(r.nombre_completo, ''), ' ', 1), 'curso', r.titulo,
                         'fecha', to_char(r.vence_en at time zone 'America/Guatemala', 'DD/MM/YYYY')),
      'aviso_vencimiento:' || r.id || ':' || to_char(r.vence_en, 'YYYY-MM-DD'));
    n := n + 1;
  end loop;
  return n;
end; $$;
revoke execute on function public.encolar_avisos_vencimiento(int) from public, anon, authenticated;
grant execute on function public.encolar_avisos_vencimiento(int) to service_role;
