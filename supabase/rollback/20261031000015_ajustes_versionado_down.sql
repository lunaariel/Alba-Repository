-- Reversión de 0015 (ajustes del versionado). Ejecutar ANTES de revertir 0014.
-- Se niega si ya hay complementos asociados o lecciones reemplazadas: revertir perdería esa información.
do $$
begin
  if exists (select 1 from public.version_complementos) then
    raise exception 'reversion_imposible: hay materiales complementarios asociados a versiones';
  end if;
  if exists (select 1 from public.auditoria where accion in ('leccion_reemplazada','correccion_menor')) then
    raise exception 'reversion_imposible: ya hay correcciones menores o lecciones reemplazadas registradas';
  end if;
end $$;

drop trigger if exists lecciones_publicadas on public.lecciones;
drop trigger if exists modulos_publicados on public.modulos;
drop trigger if exists recursos_tipo_fijo on public.recursos_leccion;
drop function if exists public.reemplazar_leccion(uuid);
drop function if exists public.corregir_modulo_publicado(uuid, text, text, text);
drop function if exists public.corregir_leccion_publicada(uuid, text, text, int, text, text, text);
drop function if exists public.texto_menor(text, text);
drop function if exists public.validar_correccion(text, text);
drop function if exists public.proteger_contenido_publicado();
drop function if exists public.similitud_texto(text, text);
drop function if exists public.asociar_complemento(uuid, uuid[]);
drop function if exists public.proteger_tipo_material();

create or replace function public.crear_version(p_curso uuid, p_resumen text, p_autor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_numero int; v_eval public.evaluaciones%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('version:' || p_curso::text));
  select coalesce(max(numero), 0) + 1 into v_numero from public.versiones_curso where curso_id = p_curso;
  select * into v_eval from public.evaluaciones where curso_id = p_curso;
  insert into public.versiones_curso (curso_id, numero, puntaje_minimo, intentos_permitidos, mensaje_aprobado, mensaje_desaprobado, resumen, publicada_por)
  values (p_curso, v_numero, coalesce(v_eval.puntaje_minimo, 70), v_eval.intentos_permitidos,
          coalesce(v_eval.mensaje_aprobado, 'Aprobó la evaluación.'), coalesce(v_eval.mensaje_desaprobado, 'Todavía no alcanzó el puntaje mínimo.'),
          nullif(btrim(coalesce(p_resumen, '')), ''), p_autor)
  returning id into v_id;
  insert into public.version_lecciones (version_id, leccion_id, modulo_id, modulo_orden, orden)
  select v_id, l.id, m.id, m.orden, l.orden
    from public.lecciones l join public.modulos m on m.id = l.modulo_id
   where m.curso_id = p_curso and not l.retirada and not m.retirado and not l.bloqueada;
  insert into public.version_materiales (version_id, recurso_id)
  select v_id, r.id from public.recursos_leccion r
   where r.leccion_id in (select leccion_id from public.version_lecciones where version_id = v_id)
     and not r.retirado and not r.bloqueado;
  if v_eval.id is not null then
    insert into public.version_preguntas (version_id, pregunta_id, orden)
    select v_id, p.id, p.orden from public.preguntas p
     where p.evaluacion_id = v_eval.id and not p.retirada and not p.bloqueada;
  end if;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (p_autor, 'version_publicada', 'versiones_curso', v_id::text, jsonb_build_object(
    'curso', p_curso, 'numero', v_numero, 'resumen', p_resumen,
    'lecciones', (select count(*) from public.version_lecciones where version_id = v_id),
    'preguntas', (select count(*) from public.version_preguntas where version_id = v_id),
    'puntaje_minimo', coalesce(v_eval.puntaje_minimo, 70), 'intentos_permitidos', v_eval.intentos_permitidos));
  return v_id;
end; $$;
revoke execute on function public.crear_version(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.recurso_visible_alumno(p_recurso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.version_materiales vm join public.recursos_leccion r on r.id = vm.recurso_id
                  join public.versiones_curso v on v.id = vm.version_id
                 where vm.recurso_id = p_recurso and not r.bloqueado
                   and vm.version_id = public.version_de(auth.uid(), v.curso_id));
$$;

drop table if exists public.version_complementos;
alter table public.versiones_curso drop column if exists objetivos, drop column if exists requisitos;
alter table public.recursos_leccion drop column if exists complementario;
