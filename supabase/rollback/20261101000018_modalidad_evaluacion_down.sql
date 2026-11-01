-- Reversión de 20261101000018_modalidad_evaluacion. SOLO entornos locales o de prueba.
-- Se niega si ya hay datos que solo existen con la modalidad configurable (evaluaciones formativas,
-- envíos formativos, validaciones docentes o certificados formativos): revertir perdería información.
do $$
begin
  if exists (select 1 from public.evaluaciones where modalidad <> 'sumativa' or requiere_actividades or requiere_validacion or not con_certificado)
     or exists (select 1 from public.versiones_curso where modalidad <> 'sumativa' or requiere_actividades or requiere_validacion or not con_certificado)
     or exists (select 1 from public.intentos_evaluacion where formativo)
     or exists (select 1 from public.validaciones_formativas)
     or exists (select 1 from public.certificados where modalidad <> 'sumativa' or intento_id is null) then
    raise exception 'reversion_imposible: hay evaluaciones, envíos, validaciones o certificados de la modalidad formativa' using errcode = 'P0001';
  end if;
end $$;

drop function public.seguimiento_curso(uuid);
drop function public.anular_validacion(uuid, text);
drop function public.validar_finalizacion(uuid, uuid, text);
drop function public.registrar_actividad_formativa(uuid, uuid, jsonb);
drop function public.mi_finalizacion(uuid);
drop function public.estado_finalizacion_de(uuid, uuid);

-- Funciones anteriores (0014 y 0015).
create or replace function public.pregunta_visible_alumno(p_pregunta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.version_preguntas vp join public.preguntas p on p.id = vp.pregunta_id
                 where vp.pregunta_id = p_pregunta and not p.bloqueada
                   and vp.version_id = public.version_de(auth.uid(), public.curso_de_pregunta(p_pregunta)))
     and public.lecciones_pendientes(public.curso_de_pregunta(p_pregunta)) = 0;
$$;

create or replace function public.vista_cambio_version(p_curso uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_act public.versiones_curso%rowtype; v_nueva public.versiones_curso%rowtype; v_uid uuid := auth.uid();
begin
  select * into v_act from public.versiones_curso where id = public.version_de(v_uid, p_curso);
  select * into v_nueva from public.versiones_curso where id = (select version_vigente_id from public.cursos where id = p_curso);
  if v_act.id is null or v_nueva.id is null or v_nueva.numero <= v_act.numero then return null; end if;
  return jsonb_build_object(
    'actual', jsonb_build_object('id', v_act.id, 'numero', v_act.numero, 'publicada_en', v_act.publicada_en),
    'nueva', jsonb_build_object('id', v_nueva.id, 'numero', v_nueva.numero, 'publicada_en', v_nueva.publicada_en, 'resumen', v_nueva.resumen),
    'lecciones_nuevas', coalesce((select jsonb_agg(l.titulo order by vl.modulo_orden, vl.orden) from public.version_lecciones vl
        join public.lecciones l on l.id = vl.leccion_id where vl.version_id = v_nueva.id and not l.bloqueada
         and vl.leccion_id not in (select leccion_id from public.version_lecciones where version_id = v_act.id)), '[]'),
    'lecciones_quitadas', coalesce((select jsonb_agg(l.titulo order by vl.modulo_orden, vl.orden) from public.version_lecciones vl
        join public.lecciones l on l.id = vl.leccion_id where vl.version_id = v_act.id and not l.bloqueada
         and vl.leccion_id not in (select leccion_id from public.version_lecciones where version_id = v_nueva.id)), '[]'),
    'pendientes_despues', (select count(*) from public.lecciones_de_version(v_nueva.id) v(id)
        where not exists (select 1 from public.progreso_leccion p where p.leccion_id = v.id and p.perfil_id = v_uid and p.completada_en is not null)),
    'completadas_conservadas', (select count(*) from public.lecciones_de_version(v_nueva.id) v(id)
        where exists (select 1 from public.progreso_leccion p where p.leccion_id = v.id and p.perfil_id = v_uid and p.completada_en is not null)),
    'puntaje_minimo', jsonb_build_object('antes', v_act.puntaje_minimo, 'despues', v_nueva.puntaje_minimo),
    'intentos_permitidos', jsonb_build_object('antes', v_act.intentos_permitidos, 'despues', v_nueva.intentos_permitidos),
    'evaluacion_igual', public.evaluaciones_equivalentes(v_act.id, v_nueva.id),
    'tiene_certificado', exists (select 1 from public.certificados where perfil_id = v_uid and curso_id = p_curso and version_id = v_act.id));
end; $$;
grant execute on function public.vista_cambio_version(uuid) to authenticated;

create or replace function public.evaluaciones_equivalentes(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_a = p_b or (
    (select puntaje_minimo from public.versiones_curso where id = p_a) = (select puntaje_minimo from public.versiones_curso where id = p_b)
    and not exists (
      (select pregunta_id from public.version_preguntas where version_id = p_a)
      except (select pregunta_id from public.version_preguntas where version_id = p_b))
    and not exists (
      (select pregunta_id from public.version_preguntas where version_id = p_b)
      except (select pregunta_id from public.version_preguntas where version_id = p_a)));
$$;

create or replace function public.corregir_evaluacion(p_perfil uuid, p_evaluacion uuid, p_respuestas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_curso uuid;
  v_version public.versiones_curso%rowtype;
  v_numero int;
  v_usados int;
  v_total int := 0;
  v_correctas int := 0;
  v_pregunta record;
  v_elegidas uuid[];
  v_ok boolean;
  v_intento uuid;
  v_puntaje int;
  v_aprobado boolean;
  v_pendientes int;
  v_temas text[] := '{}';
begin
  select curso_id into v_curso from public.evaluaciones where id = p_evaluacion;
  if v_curso is null then raise exception 'evaluacion_inexistente' using errcode = 'P0001'; end if;
  select * into v_version from public.versiones_curso where id = public.version_de(p_perfil, v_curso);
  if v_version.id is null then raise exception 'sin_acceso' using errcode = 'P0001'; end if;

  select count(*) into v_pendientes from public.lecciones_de_version(v_version.id) v(id)
   where not exists (select 1 from public.progreso_leccion p
                      where p.leccion_id = v.id and p.perfil_id = p_perfil and p.completada_en is not null);
  if v_pendientes > 0 then raise exception 'lecciones_pendientes: %', v_pendientes using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtext(p_perfil::text || p_evaluacion::text));
  select count(*) into v_usados from public.intentos_evaluacion
   where perfil_id = p_perfil and evaluacion_id = p_evaluacion and version_id = v_version.id;
  if v_version.intentos_permitidos is not null and v_usados >= v_version.intentos_permitidos then
    raise exception 'sin_intentos' using errcode = 'P0001';
  end if;
  select coalesce(max(numero), 0) + 1 into v_numero from public.intentos_evaluacion
   where perfil_id = p_perfil and evaluacion_id = p_evaluacion;

  insert into public.intentos_evaluacion (perfil_id, evaluacion_id, numero, puntaje, aprobado, version_id)
  values (p_perfil, p_evaluacion, v_numero, 0, false, v_version.id) returning id into v_intento;

  for v_pregunta in select p.id, p.tema from public.version_preguntas vp join public.preguntas p on p.id = vp.pregunta_id
                     where vp.version_id = v_version.id and not p.bloqueada order by vp.orden loop
    v_total := v_total + 1;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_elegidas
      from jsonb_array_elements_text(coalesce(p_respuestas -> v_pregunta.id::text, '[]'::jsonb)) as x
     where (case when x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then x::uuid end)
           in (select id from public.opciones where pregunta_id = v_pregunta.id);
    v_ok := public.eleccion_correcta(v_version.id, v_pregunta.id, v_elegidas);
    if v_ok then
      v_correctas := v_correctas + 1;
    elsif v_pregunta.tema is not null and not (btrim(v_pregunta.tema) = any (v_temas)) then
      v_temas := array_append(v_temas, btrim(v_pregunta.tema));
    end if;
    insert into public.respuestas_intento (intento_id, pregunta_id, opciones_elegidas, correcta)
    values (v_intento, v_pregunta.id, v_elegidas, v_ok);
  end loop;

  if v_total = 0 then raise exception 'evaluacion_sin_preguntas' using errcode = 'P0001'; end if;
  v_puntaje := round(100.0 * v_correctas / v_total);
  v_aprobado := v_puntaje >= v_version.puntaje_minimo;
  update public.intentos_evaluacion set puntaje = v_puntaje, aprobado = v_aprobado where id = v_intento;

  return jsonb_build_object(
    'intento', v_numero, 'puntaje', v_puntaje, 'aprobado', v_aprobado,
    'mensaje', case when v_aprobado then v_version.mensaje_aprobado else v_version.mensaje_desaprobado end,
    'intentos_restantes', case when v_version.intentos_permitidos is null then null else v_version.intentos_permitidos - v_usados - 1 end,
    'temas_a_reforzar', to_jsonb(v_temas));
end; $$;
revoke execute on function public.corregir_evaluacion(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.corregir_evaluacion(uuid, uuid, jsonb) to service_role;

create or replace function public.emitir_certificado(p_perfil uuid, p_curso uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_version uuid := public.version_de(p_perfil, p_curso);
  v_cert uuid;
  v_intento uuid;
  v_pendientes int;
begin
  if v_version is null then raise exception 'sin_acceso' using errcode = 'P0001'; end if;
  select id into v_cert from public.certificados where perfil_id = p_perfil and curso_id = p_curso and version_id = v_version;
  if v_cert is not null then return v_cert; end if;

  select count(*) into v_pendientes from public.lecciones_de_version(v_version) v(id)
   where not exists (select 1 from public.progreso_leccion p
                      where p.leccion_id = v.id and p.perfil_id = p_perfil and p.completada_en is not null);
  if v_pendientes > 0 then raise exception 'lecciones_pendientes: %', v_pendientes using errcode = 'P0001'; end if;

  -- Aprobado en esta versión, o en otra con la misma evaluación. Vale la aprobación original o la revisada.
  select i.id into v_intento from public.intentos_evaluacion i
    join public.evaluaciones e on e.id = i.evaluacion_id
   where e.curso_id = p_curso and i.perfil_id = p_perfil and (i.aprobado or coalesce(i.aprobado_revisado, false))
     and public.evaluaciones_equivalentes(i.version_id, v_version)
   order by i.entregado_en desc limit 1;
  if v_intento is null then raise exception 'evaluacion_no_aprobada' using errcode = 'P0001'; end if;

  insert into public.certificados (perfil_id, curso_id, intento_id, nombre_en_certificado, titulo_curso, version_id)
  select p_perfil, p_curso, v_intento, pf.nombre_completo, c.titulo, v_version
    from public.perfiles pf, public.cursos c where pf.id = p_perfil and c.id = p_curso
  on conflict (perfil_id, curso_id, version_id) do nothing
  returning id into v_cert;
  if v_cert is null then
    select id into v_cert from public.certificados where perfil_id = p_perfil and curso_id = p_curso and version_id = v_version;
  end if;
  return v_cert;
end; $$;
revoke execute on function public.emitir_certificado(uuid, uuid) from public, anon, authenticated;
grant execute on function public.emitir_certificado(uuid, uuid) to service_role;

create or replace function public.mi_evaluacion(p_curso uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when v.id is null then null else jsonb_build_object(
    'evaluacion_id', (select id from public.evaluaciones where curso_id = p_curso),
    'version', v.numero, 'version_id', v.id, 'publicada_en', v.publicada_en,
    'puntaje_minimo', v.puntaje_minimo, 'intentos_permitidos', v.intentos_permitidos,
    'preguntas', (select count(*) from public.version_preguntas vp join public.preguntas p on p.id = vp.pregunta_id
                   where vp.version_id = v.id and not p.bloqueada),
    'intentos', coalesce((select jsonb_agg(jsonb_build_object('numero', i.numero, 'puntaje', greatest(i.puntaje, coalesce(i.puntaje_revisado, 0)),
                          'aprobado', i.aprobado or coalesce(i.aprobado_revisado, false), 'revisado', i.puntaje_revisado is not null,
                          'entregado_en', i.entregado_en) order by i.numero)
                   from public.intentos_evaluacion i
                   join public.evaluaciones e on e.id = i.evaluacion_id
                  where e.curso_id = p_curso and i.perfil_id = auth.uid() and i.version_id = v.id), '[]'),
    'aprobado_equivalente', exists (select 1 from public.intentos_evaluacion i join public.evaluaciones e on e.id = i.evaluacion_id
                  where e.curso_id = p_curso and i.perfil_id = auth.uid() and (i.aprobado or coalesce(i.aprobado_revisado, false))
                    and public.evaluaciones_equivalentes(i.version_id, v.id)))
  end
  from (select * from public.versiones_curso where id = public.mi_version(p_curso)) v
  right join (select 1) uno on true;
$$;
grant execute on function public.mi_evaluacion(uuid) to authenticated;

create or replace function public.faltantes_publicacion(p_curso uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare f text[] := '{}';
begin
  if (select precio_centavos from public.cursos where id = p_curso) <= 0 then f := array_append(f, 'precio'); end if;
  if not exists (select 1 from public.lecciones_vigentes_de(p_curso) v(id) join public.lecciones l on l.id = v.id where not l.bloqueada) then
    f := array_append(f, 'lecciones');
  end if;
  if not exists (select 1 from public.evaluaciones e join public.preguntas p on p.evaluacion_id = e.id
                  where e.curso_id = p_curso and not p.retirada and not p.bloqueada) then
    f := array_append(f, 'evaluacion');
  elsif exists (select 1 from public.evaluaciones e join public.preguntas p on p.evaluacion_id = e.id
                 where e.curso_id = p_curso and not p.retirada and not p.bloqueada
                   and not exists (select 1 from public.opciones o where o.pregunta_id = p.id and o.es_correcta)) then
    f := array_append(f, 'respuesta_correcta');
  end if;
  return f;
end; $$;
revoke execute on function public.faltantes_publicacion(uuid) from public, anon;

create or replace function public.crear_version(p_curso uuid, p_resumen text, p_autor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_numero int; v_eval public.evaluaciones%rowtype; v_anterior uuid; v_curso public.cursos%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('version:' || p_curso::text));
  select coalesce(max(numero), 0) + 1 into v_numero from public.versiones_curso where curso_id = p_curso;
  select * into v_eval from public.evaluaciones where curso_id = p_curso;
  select * into v_curso from public.cursos where id = p_curso;
  v_anterior := v_curso.version_vigente_id;
  insert into public.versiones_curso (curso_id, numero, puntaje_minimo, intentos_permitidos, mensaje_aprobado, mensaje_desaprobado, resumen, publicada_por,
                                      objetivos, requisitos)
  values (p_curso, v_numero, coalesce(v_eval.puntaje_minimo, 70), v_eval.intentos_permitidos,
          coalesce(v_eval.mensaje_aprobado, 'Aprobó la evaluación.'), coalesce(v_eval.mensaje_desaprobado, 'Todavía no alcanzó el puntaje mínimo.'),
          nullif(btrim(coalesce(p_resumen, '')), ''), p_autor, coalesce(v_curso.objetivos, '{}'), v_curso.requisitos)
  returning id into v_id;
  insert into public.version_lecciones (version_id, leccion_id, modulo_id, modulo_orden, orden)
  select v_id, l.id, m.id, m.orden, l.orden
    from public.lecciones l join public.modulos m on m.id = l.modulo_id
   where m.curso_id = p_curso and not l.retirada and not m.retirado and not l.bloqueada;
  insert into public.version_materiales (version_id, recurso_id)
  select v_id, r.id from public.recursos_leccion r
   where r.leccion_id in (select leccion_id from public.version_lecciones where version_id = v_id)
     and not r.retirado and not r.bloqueado and not r.complementario;
  if v_anterior is not null then
    insert into public.version_complementos (version_id, recurso_id, asociado_por)
    select v_id, vc.recurso_id, p_autor from public.version_complementos vc join public.recursos_leccion r on r.id = vc.recurso_id
     where vc.version_id = v_anterior
       and r.leccion_id in (select leccion_id from public.version_lecciones where version_id = v_id);
  end if;
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

drop trigger evaluaciones_auditar on public.evaluaciones;
create trigger evaluaciones_auditar after update on public.evaluaciones
  for each row execute function public.auditar_cambio('evaluacion', '{curso_id,puntaje_minimo,intentos_permitidos}');
revoke select on public.respuestas_intento from authenticated;
grant select on public.respuestas_intento to authenticated;

drop table public.validaciones_formativas;
alter table public.certificados drop column modalidad;
alter table public.certificados alter column intento_id set not null;
alter table public.intentos_evaluacion drop constraint intento_formativo_no_aprueba, drop column formativo, drop column completo;
alter table public.versiones_curso drop constraint version_modalidad_coherente,
  drop column modalidad, drop column requiere_actividades, drop column requiere_validacion, drop column con_certificado;
alter table public.evaluaciones drop constraint evaluacion_modalidad_coherente,
  drop column modalidad, drop column requiere_actividades, drop column requiere_validacion, drop column con_certificado,
  alter column intentos_permitidos drop default;
