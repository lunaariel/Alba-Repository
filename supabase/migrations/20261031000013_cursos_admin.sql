-- Albor · 0013 · Gestión de cursos y evaluaciones (Fase 5, entrega 2)
-- Reglas de preservación del historial académico (docs/preservacion-academica.md):
-- lo que tiene historial se retira, no se borra, y lo retirado deja de contar hacia adelante.
-- Reversión: ver el bloque comentado al final.

-- 1) Retiro y temas
alter table public.modulos   add column retirado boolean not null default false;
alter table public.lecciones add column retirada boolean not null default false;
alter table public.preguntas add column retirada boolean not null default false,
                             add column tema text check (tema is null or char_length(btrim(tema)) between 2 and 80);

create or replace function public.modulo_vigente(p_modulo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.modulos where id = p_modulo and not retirado);
$$;

-- Lecciones vigentes de un curso (módulo y lección sin retirar).
create or replace function public.lecciones_vigentes_de(p_curso uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select l.id from public.lecciones l join public.modulos m on m.id = l.modulo_id
   where m.curso_id = p_curso and not l.retirada and not m.retirado;
$$;
revoke execute on function public.lecciones_vigentes_de(uuid) from public, anon, authenticated;

-- 2) Lo retirado no se ve fuera del panel (sitio y campus leen con estas políticas).
drop policy modulos_lee on public.modulos;
create policy modulos_lee on public.modulos for select to anon, authenticated
  using ((not retirado and public.curso_publicado(curso_id)) or public.es_admin());
drop policy modulos_alumno on public.modulos;
create policy modulos_alumno on public.modulos for select to authenticated
  using (not retirado and public.tiene_acceso(curso_id));

drop policy lecciones_lee on public.lecciones;
create policy lecciones_lee on public.lecciones for select to anon, authenticated
  using ((not retirada and public.modulo_vigente(modulo_id)
          and public.curso_publicado((select curso_id from public.modulos where id = modulo_id)))
         or public.es_admin());
drop policy lecciones_alumno on public.lecciones;
create policy lecciones_alumno on public.lecciones for select to authenticated
  using (not retirada and public.modulo_vigente(modulo_id) and public.tiene_acceso(public.curso_de_leccion(id)));

-- La columna nueva también es legible (la lista de columnas legibles es explícita desde 0003).
grant select (retirada) on public.lecciones to anon, authenticated;

drop policy preguntas_alumno on public.preguntas;
create policy preguntas_alumno on public.preguntas for select to authenticated
  using (not retirada and exists (select 1 from public.evaluaciones e where e.id = evaluacion_id
                 and public.tiene_acceso(e.curso_id) and public.lecciones_pendientes(e.curso_id) = 0));
drop policy opciones_alumno on public.opciones;
create policy opciones_alumno on public.opciones for select to authenticated
  using (exists (select 1 from public.preguntas p join public.evaluaciones e on e.id = p.evaluacion_id
                 where p.id = pregunta_id and not p.retirada
                   and public.tiene_acceso(e.curso_id) and public.lecciones_pendientes(e.curso_id) = 0));

-- 3) Reglas que usan solo lo vigente
create or replace function public.lecciones_pendientes(p_curso uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.lecciones_vigentes_de(p_curso) v(id)
   where not exists (select 1 from public.progreso_leccion p
                      where p.leccion_id = v.id and p.perfil_id = auth.uid() and p.completada_en is not null);
$$;

create or replace function public.validar_publicacion_curso()
returns trigger language plpgsql as $$
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
revoke execute on function public.emitir_certificado(uuid, uuid) from public, anon, authenticated;
grant execute on function public.emitir_certificado(uuid, uuid) to service_role;

-- Corrección: solo preguntas vigentes; devuelve los temas a reforzar (nunca cuáles se fallaron
-- ni las respuestas). Un tema con una sola pregunta se informa igual; el panel lo advierte.
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
revoke execute on function public.corregir_evaluacion(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.corregir_evaluacion(uuid, uuid, jsonb) to service_role;

create or replace function public.resumen_publico_curso(p_curso uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.curso_publicado(p_curso) then jsonb_build_object(
    'materiales', (select count(*) from public.recursos_leccion r where r.leccion_id in (select public.lecciones_vigentes_de(p_curso))),
    'evaluacion', exists (select 1 from public.evaluaciones e join public.preguntas p on p.evaluacion_id = e.id
                          where e.curso_id = p_curso and not p.retirada))
  else null end;
$$;

-- 4) Bloqueos: lo que tiene historial no se elimina (se retira)
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
create trigger lecciones_proteger before delete on public.lecciones for each row execute function public.proteger_historial();
create trigger modulos_proteger before delete on public.modulos for each row execute function public.proteger_historial();
create trigger preguntas_proteger before delete on public.preguntas for each row execute function public.proteger_historial();
create trigger opciones_proteger before delete on public.opciones for each row execute function public.proteger_historial();
create trigger cursos_proteger before delete on public.cursos for each row execute function public.proteger_historial();

-- Un curso publicado no se queda sin lecciones ni sin preguntas vigentes.
create or replace function public.proteger_curso_publicado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_curso uuid;
begin
  if tg_table_name = 'lecciones' then
    select m.curso_id into v_curso from public.modulos m where m.id = new.modulo_id;
    if new.retirada and not old.retirada and public.curso_publicado(v_curso)
       and not exists (select 1 from public.lecciones_vigentes_de(v_curso) v(id) where v.id <> new.id) then
      raise exception 'ultima_leccion_vigente' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'modulos' then
    if new.retirado and not old.retirado and public.curso_publicado(new.curso_id)
       and not exists (select 1 from public.lecciones l join public.modulos m on m.id = l.modulo_id
                        where m.curso_id = new.curso_id and m.id <> new.id and not m.retirado and not l.retirada) then
      raise exception 'ultima_leccion_vigente' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'preguntas' then
    select e.curso_id into v_curso from public.evaluaciones e where e.id = new.evaluacion_id;
    if new.retirada and not old.retirada and public.curso_publicado(v_curso)
       and not exists (select 1 from public.preguntas p where p.evaluacion_id = new.evaluacion_id and p.id <> new.id and not p.retirada) then
      raise exception 'ultima_pregunta_vigente' using errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;
create trigger lecciones_proteger_publicado before update of retirada on public.lecciones for each row execute function public.proteger_curso_publicado();
create trigger modulos_proteger_publicado before update of retirado on public.modulos for each row execute function public.proteger_curso_publicado();
create trigger preguntas_proteger_publicado before update of retirada on public.preguntas for each row execute function public.proteger_curso_publicado();

-- Una pregunta de un curso publicado no se queda sin respuesta correcta.
create or replace function public.proteger_respuesta_correcta()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pregunta uuid := coalesce(new.pregunta_id, old.pregunta_id); v_curso uuid; v_retirada boolean;
begin
  select e.curso_id, p.retirada into v_curso, v_retirada
    from public.preguntas p join public.evaluaciones e on e.id = p.evaluacion_id where p.id = v_pregunta;
  if v_curso is not null and public.curso_publicado(v_curso) and not v_retirada
     and not exists (select 1 from public.opciones where pregunta_id = v_pregunta and es_correcta) then
    raise exception 'pregunta_sin_correcta' using errcode = 'P0001';
  end if;
  return null;
end; $$;
create constraint trigger opciones_correcta_publicado after update or delete on public.opciones
  deferrable initially deferred for each row execute function public.proteger_respuesta_correcta();

-- 5) Orden: intercambio con el vecino, en una sola transacción (los únicos de orden son diferibles).
-- security invoker: RLS decide (solo la admin puede modificar estas tablas).
create or replace function public.mover_en_orden(p_tabla text, p_id uuid, p_direccion int)
returns void language plpgsql security invoker set search_path = public as $$
declare v_padre text; v_padre_id uuid; v_orden int; v_vecino uuid; v_orden_vecino int; v_n1 int; v_n2 int;
begin
  if p_direccion not in (-1, 1) then raise exception 'direccion_invalida' using errcode = 'P0001'; end if;
  v_padre := case p_tabla when 'modulos' then 'curso_id' when 'lecciones' then 'modulo_id'
                          when 'preguntas' then 'evaluacion_id' when 'opciones' then 'pregunta_id' end;
  if v_padre is null then raise exception 'tabla_invalida' using errcode = 'P0001'; end if;
  execute format('select %I, orden from public.%I where id = $1', v_padre, p_tabla) into v_padre_id, v_orden using p_id;
  if v_padre_id is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  execute format(
    'select id, orden from public.%I where %I = $1 and orden %s $2 order by orden %s limit 1',
    p_tabla, v_padre, case when p_direccion = 1 then '>' else '<' end, case when p_direccion = 1 then 'asc' else 'desc' end)
    into v_vecino, v_orden_vecino using v_padre_id, v_orden;
  if v_vecino is null then return; end if;
  execute format('update public.%I set orden = $1 where id = $2', p_tabla) using v_orden_vecino, p_id;
  get diagnostics v_n1 = row_count;
  execute format('update public.%I set orden = $1 where id = $2', p_tabla) using v_orden, v_vecino;
  get diagnostics v_n2 = row_count;
  if v_n1 <> 1 or v_n2 <> 1 then raise exception 'no_autorizado' using errcode = '42501'; end if;
end; $$;
revoke execute on function public.mover_en_orden(text, uuid, int) from public, anon;
grant execute on function public.mover_en_orden(text, uuid, int) to authenticated;

-- Guardar una pregunta con sus opciones en una sola transacción (crear si p_pregunta es null).
-- security invoker: solo la admin puede (RLS). Valida lo mínimo para que la corrección tenga sentido.
-- p_opciones = [{"id": uuid|null, "texto": text, "es_correcta": bool}, …] en el orden deseado.
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
revoke execute on function public.guardar_pregunta(uuid, uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.guardar_pregunta(uuid, uuid, text, text, text, jsonb) to authenticated;

-- 6) Registro de actividad de retiros, restauraciones y temas
create trigger modulos_auditar_cambio after update on public.modulos
  for each row execute function public.auditar_cambio('modulo', '{curso_id,titulo,retirado}');
create trigger lecciones_auditar_cambio after update on public.lecciones
  for each row execute function public.auditar_cambio('leccion', '{modulo_id,titulo,retirada}');
create trigger preguntas_auditar_cambio after update on public.preguntas
  for each row execute function public.auditar_cambio('pregunta', '{evaluacion_id,enunciado,retirada}');
create trigger lecciones_auditar_alta after insert on public.lecciones
  for each row execute function public.auditar_cambio('leccion', '{modulo_id,titulo}');
create trigger preguntas_auditar_alta after insert on public.preguntas
  for each row execute function public.auditar_cambio('pregunta', '{evaluacion_id,enunciado}');

-- Reversión (manual, solo si no hay datos que dependan de las columnas nuevas):
--   drop function public.mover_en_orden(text, uuid, int); drop function public.guardar_pregunta(…);
--   drop trigger … (los creados arriba) y las funciones proteger_*;
--   restaurar las versiones de 0003/0004/0008/0010/0011 de las funciones y políticas reemplazadas;
--   alter table public.preguntas drop column tema, drop column retirada;
--   alter table public.lecciones drop column retirada; alter table public.modulos drop column retirado;
