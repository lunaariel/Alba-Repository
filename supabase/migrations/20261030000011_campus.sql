-- Albor · 0011 · Campus del alumno
-- 1) El acceso no vence: quien compró un curso lo sigue viendo aunque se archive.
-- 2) La evaluación final solo se rinde con todas las lecciones completadas.
-- 3) Verificación pública de certificados por código.
-- 4) Buckets privados de materiales (solo si existe el esquema de Storage).

-- 1) Lectura del curso, módulos y lecciones para quien tiene acceso activo.
create policy cursos_alumno on public.cursos for select to authenticated
  using (public.tiene_acceso(id));
create policy modulos_alumno on public.modulos for select to authenticated
  using (public.tiene_acceso(curso_id));
create policy lecciones_alumno on public.lecciones for select to authenticated
  using (public.tiene_acceso(public.curso_de_leccion(id)));

-- El progreso solo se registra en lecciones; el alumno no puede borrar el suyo
-- (no hay política de delete) pero sí desmarcar una lección (completada_en = null).

-- 2) Corrección con la condición de lecciones completas. Misma firma y mismos permisos.
create or replace function public.corregir_evaluacion(p_perfil uuid, p_evaluacion uuid, p_respuestas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_eval public.evaluaciones%rowtype;
  v_numero int;
  v_total int := 0;
  v_correctas int := 0;
  v_pregunta record;
  v_elegidas uuid[];
  v_esperadas uuid[];
  v_ok boolean;
  v_intento uuid;
  v_puntaje int;
  v_aprobado boolean;
  v_pendientes int;
begin
  select * into v_eval from public.evaluaciones where id = p_evaluacion;
  if not found then raise exception 'evaluacion_inexistente' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.accesos_curso where perfil_id = p_perfil and curso_id = v_eval.curso_id and estado = 'activo') then
    raise exception 'sin_acceso' using errcode = 'P0001';
  end if;

  select count(*) into v_pendientes
    from public.lecciones l join public.modulos m on m.id = l.modulo_id
   where m.curso_id = v_eval.curso_id
     and not exists (select 1 from public.progreso_leccion p
                      where p.leccion_id = l.id and p.perfil_id = p_perfil and p.completada_en is not null);
  if v_pendientes > 0 then raise exception 'lecciones_pendientes: %', v_pendientes using errcode = 'P0001'; end if;

  -- Bloqueo por persona y evaluación para numerar intentos sin carreras.
  perform pg_advisory_xact_lock(hashtext(p_perfil::text || p_evaluacion::text));
  select coalesce(max(numero), 0) + 1 into v_numero from public.intentos_evaluacion
   where perfil_id = p_perfil and evaluacion_id = p_evaluacion;
  if v_eval.intentos_permitidos is not null and v_numero > v_eval.intentos_permitidos then
    raise exception 'sin_intentos' using errcode = 'P0001';
  end if;

  insert into public.intentos_evaluacion (perfil_id, evaluacion_id, numero, puntaje, aprobado)
  values (p_perfil, p_evaluacion, v_numero, 0, false) returning id into v_intento;

  for v_pregunta in select id, tipo from public.preguntas where evaluacion_id = p_evaluacion order by orden loop
    v_total := v_total + 1;
    -- Un texto que no es uuid se descarta sin error.
    select coalesce(array_agg(distinct x::uuid), '{}') into v_elegidas
      from jsonb_array_elements_text(coalesce(p_respuestas -> v_pregunta.id::text, '[]'::jsonb)) as x
     where (case when x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then x::uuid end)
           in (select id from public.opciones where pregunta_id = v_pregunta.id);
    select coalesce(array_agg(id), '{}') into v_esperadas from public.opciones
     where pregunta_id = v_pregunta.id and es_correcta;
    v_ok := (v_pregunta.tipo <> 'unica' or cardinality(v_elegidas) = 1)
            and v_elegidas @> v_esperadas and v_esperadas @> v_elegidas;
    if v_ok then v_correctas := v_correctas + 1; end if;
    insert into public.respuestas_intento (intento_id, pregunta_id, opciones_elegidas, correcta)
    values (v_intento, v_pregunta.id, v_elegidas, v_ok);
  end loop;

  if v_total = 0 then raise exception 'evaluacion_sin_preguntas' using errcode = 'P0001'; end if;
  v_puntaje := round(100.0 * v_correctas / v_total);
  v_aprobado := v_puntaje >= v_eval.puntaje_minimo;
  update public.intentos_evaluacion set puntaje = v_puntaje, aprobado = v_aprobado where id = v_intento;

  return jsonb_build_object(
    'intento', v_numero, 'puntaje', v_puntaje, 'aprobado', v_aprobado,
    'mensaje', case when v_aprobado then v_eval.mensaje_aprobado else v_eval.mensaje_desaprobado end,
    'intentos_restantes', case when v_eval.intentos_permitidos is null then null else v_eval.intentos_permitidos - v_numero end);
end; $$;
revoke execute on function public.corregir_evaluacion(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.corregir_evaluacion(uuid, uuid, jsonb) to service_role;

-- La pregunta y sus opciones se ven solo con las lecciones completas, para que nadie
-- adelante la evaluación leyendo las preguntas antes de tiempo. (El servidor igual lo vuelve a verificar.)
create or replace function public.lecciones_pendientes(p_curso uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.lecciones l join public.modulos m on m.id = l.modulo_id
   where m.curso_id = p_curso
     and not exists (select 1 from public.progreso_leccion p
                      where p.leccion_id = l.id and p.perfil_id = auth.uid() and p.completada_en is not null);
$$;
revoke execute on function public.lecciones_pendientes(uuid) from public, anon;
grant execute on function public.lecciones_pendientes(uuid) to authenticated;

drop policy preguntas_alumno on public.preguntas;
create policy preguntas_alumno on public.preguntas for select to authenticated
  using (exists (select 1 from public.evaluaciones e where e.id = evaluacion_id
                 and public.tiene_acceso(e.curso_id) and public.lecciones_pendientes(e.curso_id) = 0));
drop policy opciones_alumno on public.opciones;
create policy opciones_alumno on public.opciones for select to authenticated
  using (exists (select 1 from public.preguntas p join public.evaluaciones e on e.id = p.evaluacion_id
                 where p.id = pregunta_id and public.tiene_acceso(e.curso_id) and public.lecciones_pendientes(e.curso_id) = 0));

-- 3) Verificación pública: solo devuelve lo que figura impreso en el certificado.
create or replace function public.verificar_certificado(p_codigo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nombre', nombre_en_certificado, 'curso', titulo_curso, 'emitido_en', emitido_en, 'codigo', codigo_verificacion)
    from public.certificados
   where codigo_verificacion = upper(btrim(p_codigo))
     and char_length(btrim(p_codigo)) = 12;
$$;
revoke execute on function public.verificar_certificado(text) from public;
grant execute on function public.verificar_certificado(text) to anon, authenticated;

-- 4) Storage: bucket privado de materiales. Solo el servidor firma URLs (vencen en minutos),
-- después de comprobar el acceso. Sin políticas para clientes: nadie lee el bucket directamente.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('materiales', 'materiales', false, 25 * 1024 * 1024, array['application/pdf'])
    on conflict (id) do nothing;
  end if;
end $$;
