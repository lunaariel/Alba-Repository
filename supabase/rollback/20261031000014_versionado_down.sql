-- Albor · Reversión de 0014 (versionado académico). NO se aplica automáticamente.
-- Condiciones (se verifican abajo y la reversión se cancela si no se cumplen):
--   * ningún curso tiene más de una versión;
--   * nadie cambió de versión ni hay revisiones favorables aplicadas;
--   * no hay dos certificados de la misma persona para el mismo curso.
-- Pasada cualquiera de esas condiciones, el esquema anterior ya no puede representar los datos
-- (por ejemplo, dos certificados del mismo curso) y la reversión requiere un procedimiento propio.
-- Probada en tests/db/migracion_0014.sh: los datos académicos quedan idénticos al respaldo previo.
begin;

do $$ begin
  if exists (select 1 from public.versiones_curso group by curso_id having count(*) > 1) then
    raise exception 'reversion_imposible: hay cursos con más de una versión';
  end if;
  if exists (select 1 from public.cambios_version) or exists (select 1 from public.revisiones_evaluacion where estado = 'aplicada') then
    raise exception 'reversion_imposible: hay cambios de versión o revisiones aplicadas';
  end if;
  if exists (select 1 from public.certificados group by perfil_id, curso_id having count(*) > 1) then
    raise exception 'reversion_imposible: hay más de un certificado por persona y curso';
  end if;
end $$;

-- Políticas y funciones de 0014 → las de 0013 (copiadas literalmente de las migraciones anteriores).
drop policy modulos_lee on public.modulos;
drop policy modulos_alumno on public.modulos;
drop policy lecciones_lee on public.lecciones;
drop policy lecciones_alumno on public.lecciones;
drop policy recursos_alumno on public.recursos_leccion;
drop policy preguntas_alumno on public.preguntas;
drop policy opciones_alumno on public.opciones;


create policy modulos_lee on public.modulos for select to anon, authenticated
  using ((not retirado and public.curso_publicado(curso_id)) or public.es_admin());

create policy modulos_alumno on public.modulos for select to authenticated
  using (not retirado and public.tiene_acceso(curso_id));

create policy lecciones_lee on public.lecciones for select to anon, authenticated
  using ((not retirada and public.modulo_vigente(modulo_id)
          and public.curso_publicado((select curso_id from public.modulos where id = modulo_id)))
         or public.es_admin());

create policy lecciones_alumno on public.lecciones for select to authenticated
  using (not retirada and public.modulo_vigente(modulo_id) and public.tiene_acceso(public.curso_de_leccion(id)));

create policy preguntas_alumno on public.preguntas for select to authenticated
  using (not retirada and exists (select 1 from public.evaluaciones e where e.id = evaluacion_id
                 and public.tiene_acceso(e.curso_id) and public.lecciones_pendientes(e.curso_id) = 0));

create policy opciones_alumno on public.opciones for select to authenticated
  using (exists (select 1 from public.preguntas p join public.evaluaciones e on e.id = p.evaluacion_id
                 where p.id = pregunta_id and not p.retirada
                   and public.tiene_acceso(e.curso_id) and public.lecciones_pendientes(e.curso_id) = 0));

create policy recursos_alumno on public.recursos_leccion for select to authenticated
  using (public.tiene_acceso(public.curso_de_leccion(leccion_id)));


drop trigger cursos_versionar on public.cursos;
drop trigger accesos_version on public.accesos_curso;
drop trigger preguntas_publicadas on public.preguntas;
drop trigger opciones_publicadas on public.opciones;
drop trigger recursos_proteger on public.recursos_leccion;
drop trigger recursos_auditar_retiro on public.recursos_leccion;


create or replace function public.lecciones_pendientes(p_curso uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.lecciones_vigentes_de(p_curso) v(id)
   where not exists (select 1 from public.progreso_leccion p
                      where p.leccion_id = v.id and p.perfil_id = auth.uid() and p.completada_en is not null);
$$;

create or replace function public.validar_publicacion_curso()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  faltantes text[] := '{}';
begin
  if new.estado = 'publicado' and (old.estado is distinct from 'publicado') then
    if new.precio_centavos <= 0 then faltantes := array_append(faltantes, 'precio'); end if;
    if not exists (select 1 from public.lecciones_vigentes_de(new.id)) then
      faltantes := array_append(faltantes, 'lecciones');
    end if;
    if not exists (select 1 from public.evaluaciones e join public.preguntas p on p.evaluacion_id = e.id
                    where e.curso_id = new.id and not p.retirada) then
      faltantes := array_append(faltantes, 'evaluacion');
    elsif exists (
      select 1 from public.evaluaciones e join public.preguntas p on p.evaluacion_id = e.id
      where e.curso_id = new.id and not p.retirada
        and not exists (select 1 from public.opciones o where o.pregunta_id = p.id and o.es_correcta)
    ) then
      faltantes := array_append(faltantes, 'respuesta_correcta');
    end if;
    if array_length(faltantes, 1) > 0 then
      raise exception 'curso_incompleto: %', array_to_string(faltantes, ',') using errcode = 'P0001';
    end if;
    new.publicado_en := coalesce(new.publicado_en, now());
  end if;
  -- Un curso que alguien compró (o recibió) no vuelve a borrador: se archiva.
  if new.estado = 'borrador' and old.estado is distinct from 'borrador'
     and exists (select 1 from public.accesos_curso where curso_id = new.id) then
    raise exception 'curso_con_alumnos' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.emitir_certificado(p_perfil uuid, p_curso uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cert uuid;
  v_intento uuid;
  v_pendientes int;
begin
  select id into v_cert from public.certificados where perfil_id = p_perfil and curso_id = p_curso;
  if v_cert is not null then return v_cert; end if;

  if not exists (select 1 from public.accesos_curso where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo') then
    raise exception 'sin_acceso' using errcode = 'P0001';
  end if;
  select count(*) into v_pendientes from public.lecciones_vigentes_de(p_curso) v(id)
   where not exists (select 1 from public.progreso_leccion p
                      where p.leccion_id = v.id and p.perfil_id = p_perfil and p.completada_en is not null);
  if v_pendientes > 0 then raise exception 'lecciones_pendientes: %', v_pendientes using errcode = 'P0001'; end if;

  select i.id into v_intento from public.intentos_evaluacion i
    join public.evaluaciones e on e.id = i.evaluacion_id
   where e.curso_id = p_curso and i.perfil_id = p_perfil and i.aprobado
   order by i.entregado_en desc limit 1;
  if v_intento is null then raise exception 'evaluacion_no_aprobada' using errcode = 'P0001'; end if;

  insert into public.certificados (perfil_id, curso_id, intento_id, nombre_en_certificado, titulo_curso)
  select p_perfil, p_curso, v_intento, pf.nombre_completo, c.titulo
    from public.perfiles pf, public.cursos c where pf.id = p_perfil and c.id = p_curso
  on conflict (perfil_id, curso_id) do nothing
  returning id into v_cert;
  if v_cert is null then
    select id into v_cert from public.certificados where perfil_id = p_perfil and curso_id = p_curso;
  end if;
  return v_cert;
end; $$;

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
  v_temas text[] := '{}';
begin
  select * into v_eval from public.evaluaciones where id = p_evaluacion;
  if not found then raise exception 'evaluacion_inexistente' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.accesos_curso where perfil_id = p_perfil and curso_id = v_eval.curso_id and estado = 'activo') then
    raise exception 'sin_acceso' using errcode = 'P0001';
  end if;

  select count(*) into v_pendientes from public.lecciones_vigentes_de(v_eval.curso_id) v(id)
   where not exists (select 1 from public.progreso_leccion p
                      where p.leccion_id = v.id and p.perfil_id = p_perfil and p.completada_en is not null);
  if v_pendientes > 0 then raise exception 'lecciones_pendientes: %', v_pendientes using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtext(p_perfil::text || p_evaluacion::text));
  select coalesce(max(numero), 0) + 1 into v_numero from public.intentos_evaluacion
   where perfil_id = p_perfil and evaluacion_id = p_evaluacion;
  if v_eval.intentos_permitidos is not null and v_numero > v_eval.intentos_permitidos then
    raise exception 'sin_intentos' using errcode = 'P0001';
  end if;

  insert into public.intentos_evaluacion (perfil_id, evaluacion_id, numero, puntaje, aprobado)
  values (p_perfil, p_evaluacion, v_numero, 0, false) returning id into v_intento;

  for v_pregunta in select id, tipo, tema from public.preguntas
                     where evaluacion_id = p_evaluacion and not retirada order by orden loop
    v_total := v_total + 1;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_elegidas
      from jsonb_array_elements_text(coalesce(p_respuestas -> v_pregunta.id::text, '[]'::jsonb)) as x
     where (case when x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then x::uuid end)
           in (select id from public.opciones where pregunta_id = v_pregunta.id);
    select coalesce(array_agg(id), '{}') into v_esperadas from public.opciones
     where pregunta_id = v_pregunta.id and es_correcta;
    v_ok := (v_pregunta.tipo <> 'unica' or cardinality(v_elegidas) = 1)
            and v_elegidas @> v_esperadas and v_esperadas @> v_elegidas;
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
  v_aprobado := v_puntaje >= v_eval.puntaje_minimo;
  update public.intentos_evaluacion set puntaje = v_puntaje, aprobado = v_aprobado where id = v_intento;

  return jsonb_build_object(
    'intento', v_numero, 'puntaje', v_puntaje, 'aprobado', v_aprobado,
    'mensaje', case when v_aprobado then v_eval.mensaje_aprobado else v_eval.mensaje_desaprobado end,
    'intentos_restantes', case when v_eval.intentos_permitidos is null then null else v_eval.intentos_permitidos - v_numero end,
    'temas_a_reforzar', to_jsonb(v_temas));
end; $$;

create or replace function public.resumen_publico_curso(p_curso uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.curso_publicado(p_curso) then jsonb_build_object(
    'materiales', (select count(*) from public.recursos_leccion r where r.leccion_id in (select public.lecciones_vigentes_de(p_curso))),
    'evaluacion', exists (select 1 from public.evaluaciones e join public.preguntas p on p.evaluacion_id = e.id
                          where e.curso_id = p_curso and not p.retirada))
  else null end;
$$;

create or replace function public.guardar_pregunta(
  p_evaluacion uuid, p_pregunta uuid, p_enunciado text, p_tipo text, p_tema text, p_opciones jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := p_pregunta;
  v_correctas int;
  v_n int;
  v_op jsonb;
  v_i int := 0;
  v_ids uuid[];
begin
  if char_length(btrim(coalesce(p_enunciado, ''))) not between 3 and 1000 then raise exception 'enunciado_invalido' using errcode = 'P0001'; end if;
  if p_tipo not in ('unica', 'multiple') then raise exception 'tipo_invalido' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_opciones) <> 'array' or jsonb_array_length(p_opciones) not between 2 and 10 then
    raise exception 'opciones_cantidad' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_opciones) o where char_length(btrim(coalesce(o ->> 'texto', ''))) not between 1 and 300) then
    raise exception 'opcion_vacia' using errcode = 'P0001';
  end if;
  select count(*) into v_correctas from jsonb_array_elements(p_opciones) o where (o ->> 'es_correcta')::boolean;
  if v_correctas = 0 then raise exception 'sin_correcta' using errcode = 'P0001'; end if;
  if p_tipo = 'unica' and v_correctas <> 1 then raise exception 'unica_una_correcta' using errcode = 'P0001'; end if;

  if v_id is null then
    insert into public.preguntas (evaluacion_id, enunciado, tipo, tema, orden)
    values (p_evaluacion, btrim(p_enunciado), p_tipo, nullif(btrim(coalesce(p_tema, '')), ''),
            coalesce((select max(orden) + 1 from public.preguntas where evaluacion_id = p_evaluacion), 0))
    returning id into v_id;
  else
    update public.preguntas set enunciado = btrim(p_enunciado), tipo = p_tipo, tema = nullif(btrim(coalesce(p_tema, '')), '')
     where id = v_id and evaluacion_id = p_evaluacion;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  end if;

  select coalesce(array_agg((o ->> 'id')::uuid), '{}') into v_ids
    from jsonb_array_elements(p_opciones) o where coalesce(o ->> 'id', '') <> '';
  -- Las opciones que ya no están se eliminan (bloqueado si la pregunta tiene respuestas).
  delete from public.opciones where pregunta_id = v_id and not (id = any (v_ids));
  -- Orden provisorio fuera de rango para evitar choques al reordenar.
  update public.opciones set orden = orden + 1000 where pregunta_id = v_id;
  for v_op in select * from jsonb_array_elements(p_opciones) loop
    if coalesce(v_op ->> 'id', '') <> '' then
      update public.opciones set texto = btrim(v_op ->> 'texto'), es_correcta = (v_op ->> 'es_correcta')::boolean, orden = v_i
       where id = (v_op ->> 'id')::uuid and pregunta_id = v_id;
      get diagnostics v_n = row_count;
      if v_n <> 1 then raise exception 'opcion_ajena' using errcode = 'P0001'; end if;
    else
      insert into public.opciones (pregunta_id, texto, es_correcta, orden)
      values (v_id, btrim(v_op ->> 'texto'), (v_op ->> 'es_correcta')::boolean, v_i);
    end if;
    v_i := v_i + 1;
  end loop;
  return v_id;
end; $$;

create or replace function public.proteger_historial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'lecciones' then
    if exists (select 1 from public.progreso_leccion where leccion_id = old.id) then
      raise exception 'leccion_con_historial' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'modulos' then
    if exists (select 1 from public.progreso_leccion p join public.lecciones l on l.id = p.leccion_id where l.modulo_id = old.id) then
      raise exception 'modulo_con_historial' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'preguntas' then
    if exists (select 1 from public.respuestas_intento where pregunta_id = old.id) then
      raise exception 'pregunta_con_historial' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'opciones' then
    if exists (select 1 from public.respuestas_intento where pregunta_id = old.pregunta_id) then
      raise exception 'opcion_con_historial' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'cursos' then
    if exists (select 1 from public.accesos_curso where curso_id = old.id)
       or exists (select 1 from public.items_orden where curso_id = old.id)
       or exists (select 1 from public.certificados where curso_id = old.id) then
      raise exception 'curso_con_historial' using errcode = 'P0001';
    end if;
  end if;
  return old;
end; $$;

revoke execute on function public.corregir_evaluacion(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.corregir_evaluacion(uuid, uuid, jsonb) to service_role;
revoke execute on function public.emitir_certificado(uuid, uuid) from public, anon, authenticated;
grant execute on function public.emitir_certificado(uuid, uuid) to service_role;

create or replace function public.verificar_certificado(p_codigo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nombre', nombre_en_certificado, 'curso', titulo_curso, 'emitido_en', emitido_en, 'codigo', codigo_verificacion)
    from public.certificados
   where codigo_verificacion = upper(btrim(p_codigo))
     and char_length(btrim(p_codigo)) = 12;
$$;


-- Certificados: un solo certificado por persona y curso, como antes.
alter table public.certificados drop constraint certificados_perfil_curso_version_key;
alter table public.certificados add constraint certificados_perfil_id_curso_id_key unique (perfil_id, curso_id);


drop table public.ajustes_intento;
drop table public.revisiones_evaluacion;
drop table public.cambios_version;
alter table public.cursos drop column version_vigente_id;
alter table public.accesos_curso drop column version_id;
alter table public.intentos_evaluacion drop column version_id, drop column puntaje_revisado, drop column aprobado_revisado, drop column revisado_en;
alter table public.certificados drop column version_id;
alter table public.version_preguntas disable trigger version_preguntas_inmutables;
alter table public.version_materiales disable trigger version_materiales_inmutables;
alter table public.version_lecciones disable trigger version_lecciones_inmutables;
alter table public.versiones_curso disable trigger versiones_inmutables;
drop table public.version_preguntas;
drop table public.version_materiales;
drop table public.version_lecciones;
drop table public.versiones_curso;
drop function public.proteger_version();
drop function public.conciliar_versionado();
drop function public.bloquear_contenido(text, uuid, boolean, text);
drop function public.aplicar_revision(uuid, text);
drop function public.calcular_revision(uuid, uuid, uuid[], text);
drop function public.puntaje_con_revisiones(uuid, uuid, uuid[]);
drop function public.cambiar_version(uuid, uuid, uuid, text);
drop function public.vista_cambio_version(uuid);
drop function public.mi_evaluacion(uuid);
drop function public.temario_version(uuid);
drop function public.orden_preguntas_mi_version(uuid);
drop function public.eleccion_correcta(uuid, uuid, uuid[], uuid[]);
drop function public.pregunta_visible_alumno(uuid);
drop function public.proteger_pregunta_publicada();
drop function public.asignar_version_acceso();
drop function public.versionar_al_publicar();
drop function public.publicar_version(uuid, text);
drop function public.crear_version(uuid, text, uuid);
drop function public.faltantes_publicacion(uuid);
drop function public.recurso_visible_alumno(uuid);
drop function public.modulo_visible_alumno(uuid);
drop function public.modulo_visible_publico(uuid);
drop function public.leccion_visible_alumno(uuid);
drop function public.leccion_visible_publica(uuid);
drop function public.evaluaciones_equivalentes(uuid, uuid);
drop function public.curso_de_pregunta(uuid);
drop function public.lecciones_de_version(uuid);
drop function public.version_vigente_publica(uuid);
drop function public.mi_version(uuid);
drop function public.version_de(uuid, uuid);
alter table public.recursos_leccion drop column retirado, drop column bloqueado, drop column bloqueo_motivo, drop column bloqueado_en;
alter table public.lecciones drop column bloqueada, drop column bloqueo_motivo, drop column bloqueada_en;
alter table public.preguntas drop column bloqueada, drop column bloqueo_motivo, drop column bloqueada_en;
-- El esquema respaldo_0014 se conserva hasta confirmar la reversión; luego: drop schema respaldo_0014 cascade;

commit;
