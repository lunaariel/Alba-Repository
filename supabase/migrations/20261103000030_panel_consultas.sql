-- Consultas del panel para la maestra (jornada del 03/11/2026). SOLO entornos locales o de prueba.
-- Solo lectura, sin reglas nuevas: alumnos con el estado de cada acceso (vigente, vence pronto, vencido,
-- programado, sin vencimiento) calculado igual que el campus y los avisos. Exige es_admin() (con la política de
-- segundo factor encendida, aal2). El correo sale de auth.users, por eso es una función del servidor de la base.

create or replace function public.panel_alumnos(p_busqueda text default null, p_filtro text default 'todos')
returns table (perfil_id uuid, nombre text, correo text, creado_en timestamptz, cursos jsonb)
language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(btrim(coalesce(p_busqueda, '')), '');
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_filtro not in ('todos', 'vigentes', 'vencen_pronto', 'vencidos', 'programados') then raise exception 'filtro_invalido' using errcode = 'P0001'; end if;
  return query
  with accesos as (
    select a.perfil_id, a.id, c.titulo, c.id as curso_id,
           public.acceso_cubierto(a.id) as vigente,
           public.fin_cobertura_continua(a.id) as fin,
           public.proximo_inicio_acceso(a.id) as proximo,
           a.vence_en
      from public.accesos_curso a join public.cursos c on c.id = a.curso_id
     where a.estado = 'activo'
  ), con_estado as (
    select x.*, case
             when x.vigente and x.fin = 'infinity' then 'sin_vencimiento'
             when x.vigente and x.fin <= now() + interval '30 days' then 'vence_pronto'
             when x.vigente then 'vigente'
             when x.proximo is not null then 'programado'
             else 'vencido' end as estado
      from accesos x
  )
  select p.id, p.nombre_completo, u.email::text, p.creado_en,
         coalesce((select jsonb_agg(jsonb_build_object('curso', e.titulo, 'curso_id', e.curso_id, 'estado', e.estado,
                     'fin', case when e.fin = 'infinity' then null else coalesce(e.fin, e.vence_en) end, 'proximo_inicio', e.proximo)
                   order by e.titulo) from con_estado e where e.perfil_id = p.id), '[]'::jsonb)
    from public.perfiles p join auth.users u on u.id = p.id
   where not exists (select 1 from public.roles_usuario r where r.perfil_id = p.id and r.rol = 'admin')
     and (v_q is null or p.nombre_completo ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%')
     and (p_filtro = 'todos' or exists (select 1 from con_estado e where e.perfil_id = p.id and e.estado =
            case p_filtro when 'vigentes' then 'vigente' when 'vencen_pronto' then 'vence_pronto' when 'vencidos' then 'vencido' else 'programado' end)
          or (p_filtro = 'vigentes' and exists (select 1 from con_estado e where e.perfil_id = p.id and e.estado in ('sin_vencimiento', 'vence_pronto'))))
   order by p.nombre_completo
   limit 500;
end; $$;
revoke execute on function public.panel_alumnos(text, text) from public, anon;
grant execute on function public.panel_alumnos(text, text) to authenticated;

-- Fin de la cobertura continua de cada curso de la propia persona (el campus lo muestra como «acceso hasta»; antes
-- mostraba el fin del último período aunque hubiera un intervalo sin acceso). null: sin vencimiento.
create or replace function public.mis_fines_cobertura()
returns table (curso_id uuid, fin timestamptz) language sql stable security definer set search_path = public as $$
  select a.curso_id, nullif(public.fin_cobertura_continua(a.id), 'infinity')
    from public.accesos_curso a where a.perfil_id = auth.uid() and a.estado = 'activo' and public.acceso_cubierto(a.id)
$$;
revoke execute on function public.mis_fines_cobertura() from public, anon;
grant execute on function public.mis_fines_cobertura() to authenticated;
