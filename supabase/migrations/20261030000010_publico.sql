-- Albor · 0010 · Lecturas públicas
-- Lugares ocupados de un taller, sin exponer quién se inscribió.

create or replace function public.lugares_ocupados(p_taller uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when exists (
           select 1 from public.talleres where id = p_taller and estado in ('publicado','cancelado','finalizado'))
    then (
      (select count(*) from public.inscripciones_taller where taller_id = p_taller and estado = 'confirmada')
      + (select count(*) from public.reservas_cupo where taller_id = p_taller and liberada_en is null and vence_en > now())
    )::int
    else null
  end;
$$;

grant execute on function public.lugares_ocupados(uuid) to anon, authenticated;

-- Cuántos materiales tiene un curso publicado y si tiene evaluación, sin exponer su contenido.
create or replace function public.resumen_publico_curso(p_curso uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.curso_publicado(p_curso) then jsonb_build_object(
    'materiales', (select count(*) from public.recursos_leccion r
                    join public.lecciones l on l.id = r.leccion_id
                    join public.modulos m on m.id = l.modulo_id where m.curso_id = p_curso),
    'evaluacion', exists (select 1 from public.evaluaciones where curso_id = p_curso))
  else null end;
$$;

grant execute on function public.resumen_publico_curso(uuid) to anon, authenticated;
