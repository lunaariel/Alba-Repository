-- Modalidad de evaluación configurable por curso (decisión de la maestra, Jornada autónoma 01/11/2026).
--
-- · Sumativa (la que existía): lecciones completas + evaluación final aprobada. Valores predeterminados
--   para evaluaciones nuevas: 70 % y 2 intentos (antes: sin límite). Las existentes conservan los suyos.
-- · Formativa: acompaña el aprendizaje sin nota numérica obligatoria. La maestra elige los requisitos de
--   finalización: lecciones completas (siempre), actividades formativas respondidas y/o validación docente.
--   Si el curso entrega certificado, necesita al menos uno de esos dos criterios además de las lecciones:
--   nunca se certifica por abrir páginas o marcar lecciones.
--
-- Todo queda fijado en cada versión publicada. Cambiar la modalidad o los requisitos rige desde la próxima
-- versión; las versiones, intentos y certificados anteriores no se tocan.
-- SOLO entornos locales o de prueba: no autorizada en producción.

-- ============================================================ 1. Configuración (borrador) y versión
alter table public.evaluaciones
  add column modalidad text not null default 'sumativa' check (modalidad in ('sumativa','formativa')),
  add column requiere_actividades boolean not null default false,
  add column requiere_validacion boolean not null default false,
  add column con_certificado boolean not null default true,
  alter column intentos_permitidos set default 2;

-- Agregar columnas con valor por defecto no dispara los disparadores de fila: las versiones existentes
-- quedan como «sumativa con certificado», que es exactamente lo que fueron.
alter table public.versiones_curso
  add column modalidad text not null default 'sumativa' check (modalidad in ('sumativa','formativa')),
  add column requiere_actividades boolean not null default false,
  add column requiere_validacion boolean not null default false,
  add column con_certificado boolean not null default true;

-- Coherencia de la configuración: la sumativa no usa los requisitos formativos.
alter table public.evaluaciones add constraint evaluacion_modalidad_coherente
  check (modalidad = 'formativa' or (not requiere_actividades and not requiere_validacion and con_certificado));
alter table public.versiones_curso add constraint version_modalidad_coherente
  check (modalidad = 'formativa' or (not requiere_actividades and not requiere_validacion and con_certificado));

-- ============================================================ 2. Actividades formativas y validación docente
-- Un envío de actividades formativas se guarda como intento marcado «formativo». No aprueba nada
-- (aprobado = false siempre) y nunca cuenta como aprobación de una evaluación sumativa.
alter table public.intentos_evaluacion
  add column formativo boolean not null default false,
  add column completo boolean;
alter table public.intentos_evaluacion add constraint intento_formativo_no_aprueba check (not formativo or not aprobado);

create table public.validaciones_formativas (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete restrict,
  curso_id uuid not null references public.cursos (id) on delete restrict,
  version_id uuid not null references public.versiones_curso (id) on delete restrict,
  nota text not null check (char_length(btrim(nota)) between 10 and 1000),
  validada_por uuid not null,
  validada_en timestamptz not null default now(),
  anulada_en timestamptz,
  anulada_por uuid,
  motivo_anulacion text
);
create unique index validacion_formativa_vigente on public.validaciones_formativas (perfil_id, curso_id, version_id) where anulada_en is null;
alter table public.validaciones_formativas enable row level security;
create policy validaciones_lee on public.validaciones_formativas for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());

-- Los certificados de la modalidad formativa pueden no tener intento asociado.
alter table public.certificados alter column intento_id drop not null;
alter table public.certificados add column modalidad text not null default 'sumativa' check (modalidad in ('sumativa','formativa'));

-- ============================================================ 3. Equivalencia y estado de finalización
-- Dos versiones con la misma evaluación: misma modalidad, mismas preguntas y mismo mínimo.
create or replace function public.evaluaciones_equivalentes(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_a = p_b or (
    (select modalidad from public.versiones_curso where id = p_a) = 'sumativa'
    and (select modalidad from public.versiones_curso where id = p_b) = 'sumativa'
    and (select puntaje_minimo from public.versiones_curso where id = p_a) = (select puntaje_minimo from public.versiones_curso where id = p_b)
    and not exists (
      (select pregunta_id from public.version_preguntas where version_id = p_a)
      except (select pregunta_id from public.version_preguntas where version_id = p_b))
    and not exists (
      (select pregunta_id from public.version_preguntas where version_id = p_b)
      except (select pregunta_id from public.version_preguntas where version_id = p_a)));
$$;

-- Estado de finalización de una persona en su versión. Lo usan el campus, el panel y la emisión del
-- certificado: una sola regla. Distingue requisitos cumplidos (finalizado) de elegibilidad para certificado.
create or replace function public.estado_finalizacion_de(p_perfil uuid, p_curso uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.versiones_curso%rowtype;
  v_pend int; v_act boolean := false; v_val boolean := false; v_aprob boolean := false; v_fin boolean;
begin
  select * into v from public.versiones_curso where id = public.version_de(p_perfil, p_curso);
  if v.id is null then return null; end if;
  select count(*) into v_pend from public.lecciones_de_version(v.id) l(id)
   where not exists (select 1 from public.progreso_leccion p where p.leccion_id = l.id and p.perfil_id = p_perfil and p.completada_en is not null);
  if v.modalidad = 'sumativa' then
    v_aprob := exists (select 1 from public.intentos_evaluacion i join public.evaluaciones e on e.id = i.evaluacion_id
                        where e.curso_id = p_curso and i.perfil_id = p_perfil and not i.formativo
                          and (i.aprobado or coalesce(i.aprobado_revisado, false))
                          and public.evaluaciones_equivalentes(i.version_id, v.id));
    v_fin := v_pend = 0 and v_aprob;
  else
    v_act := exists (select 1 from public.intentos_evaluacion i where i.perfil_id = p_perfil and i.version_id = v.id and i.formativo and i.completo);
    v_val := exists (select 1 from public.validaciones_formativas f where f.perfil_id = p_perfil and f.version_id = v.id and f.anulada_en is null);
    v_fin := v_pend = 0 and (not v.requiere_actividades or v_act) and (not v.requiere_validacion or v_val);
  end if;
  return jsonb_build_object(
    'version_id', v.id, 'version', v.numero, 'modalidad', v.modalidad,
    'lecciones_pendientes', v_pend,
    'requiere_actividades', v.requiere_actividades, 'actividades_completas', v_act,
    'requiere_validacion', v.requiere_validacion, 'validada', v_val,
    'evaluacion_aprobada', v_aprob,
    'con_certificado', v.con_certificado,
    'finalizado', v_fin,
    -- Elegible: requisitos cumplidos, el curso certifica y hay al menos un criterio más allá de las lecciones.
    'elegible_certificado', v_fin and v.con_certificado
       and (v.modalidad = 'sumativa' or v.requiere_actividades or v.requiere_validacion));
end; $$;
revoke execute on function public.estado_finalizacion_de(uuid, uuid) from public, anon, authenticated;

-- Para el campus: solo la propia persona.
create or replace function public.mi_finalizacion(p_curso uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.estado_finalizacion_de(auth.uid(), p_curso) where auth.uid() is not null;
$$;
revoke execute on function public.mi_finalizacion(uuid) from public, anon;
grant execute on function public.mi_finalizacion(uuid) to authenticated;

-- ============================================================ 4. Evaluación sumativa: solo en versiones sumativas
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
  if v_version.modalidad <> 'sumativa' then raise exception 'modalidad_formativa' using errcode = 'P0001'; end if;

  select count(*) into v_pendientes from public.lecciones_de_version(v_version.id) v(id)
   where not exists (select 1 from public.progreso_leccion p
                      where p.leccion_id = v.id and p.perfil_id = p_perfil and p.completada_en is not null);
  if v_pendientes > 0 then raise exception 'lecciones_pendientes: %', v_pendientes using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtext(p_perfil::text || p_evaluacion::text));
  select count(*) into v_usados from public.intentos_evaluacion
   where perfil_id = p_perfil and evaluacion_id = p_evaluacion and version_id = v_version.id and not formativo;
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

-- ============================================================ 5. Actividades formativas
-- Sin nota: devuelve si el envío está completo (todas las preguntas respondidas) y los temas a repasar.
-- No revela qué opción es correcta. Sin límite de envíos. Solo el servidor (como corregir_evaluacion).
create or replace function public.registrar_actividad_formativa(p_perfil uuid, p_evaluacion uuid, p_respuestas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_curso uuid; v_version public.versiones_curso%rowtype; v_intento uuid; v_numero int;
  v_pregunta record; v_elegidas uuid[]; v_ok boolean; v_total int := 0; v_respondidas int := 0; v_correctas int := 0;
  v_temas text[] := '{}'; v_completo boolean;
begin
  select curso_id into v_curso from public.evaluaciones where id = p_evaluacion;
  if v_curso is null then raise exception 'evaluacion_inexistente' using errcode = 'P0001'; end if;
  select * into v_version from public.versiones_curso where id = public.version_de(p_perfil, v_curso);
  if v_version.id is null then raise exception 'sin_acceso' using errcode = 'P0001'; end if;
  if v_version.modalidad <> 'formativa' then raise exception 'modalidad_sumativa' using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtext(p_perfil::text || p_evaluacion::text));
  select coalesce(max(numero), 0) + 1 into v_numero from public.intentos_evaluacion where perfil_id = p_perfil and evaluacion_id = p_evaluacion;
  insert into public.intentos_evaluacion (perfil_id, evaluacion_id, numero, puntaje, aprobado, version_id, formativo)
  values (p_perfil, p_evaluacion, v_numero, 0, false, v_version.id, true) returning id into v_intento;

  for v_pregunta in select p.id, p.tema from public.version_preguntas vp join public.preguntas p on p.id = vp.pregunta_id
                     where vp.version_id = v_version.id and not p.bloqueada order by vp.orden loop
    v_total := v_total + 1;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_elegidas
      from jsonb_array_elements_text(coalesce(p_respuestas -> v_pregunta.id::text, '[]'::jsonb)) as x
     where (case when x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then x::uuid end)
           in (select id from public.opciones where pregunta_id = v_pregunta.id);
    if cardinality(v_elegidas) > 0 then v_respondidas := v_respondidas + 1; end if;
    v_ok := cardinality(v_elegidas) > 0 and public.eleccion_correcta(v_version.id, v_pregunta.id, v_elegidas);
    if v_ok then v_correctas := v_correctas + 1;
    elsif v_pregunta.tema is not null and not (btrim(v_pregunta.tema) = any (v_temas)) then v_temas := array_append(v_temas, btrim(v_pregunta.tema));
    end if;
    insert into public.respuestas_intento (intento_id, pregunta_id, opciones_elegidas, correcta) values (v_intento, v_pregunta.id, v_elegidas, v_ok);
  end loop;
  if v_total = 0 then raise exception 'evaluacion_sin_preguntas' using errcode = 'P0001'; end if;
  v_completo := v_respondidas = v_total;
  -- El puntaje queda para el seguimiento de la maestra; al alumno no se le muestra como nota.
  update public.intentos_evaluacion set puntaje = round(100.0 * v_correctas / v_total), completo = v_completo where id = v_intento;
  return jsonb_build_object('completo', v_completo, 'respondidas', v_respondidas, 'total', v_total, 'temas_a_reforzar', to_jsonb(v_temas));
end; $$;
revoke execute on function public.registrar_actividad_formativa(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_actividad_formativa(uuid, uuid, jsonb) to service_role;

-- La maestra valida la finalización (seguimiento docente). Requiere nota; queda registrada.
create or replace function public.validar_finalizacion(p_perfil uuid, p_curso uuid, p_nota text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_version public.versiones_curso%rowtype; v_id uuid;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_nota, ''))) < 10 then raise exception 'nota_requerida' using errcode = 'P0001'; end if;
  select * into v_version from public.versiones_curso where id = public.version_de(p_perfil, p_curso);
  if v_version.id is null then raise exception 'sin_acceso' using errcode = 'P0001'; end if;
  if v_version.modalidad <> 'formativa' or not v_version.requiere_validacion then raise exception 'validacion_no_corresponde' using errcode = 'P0001'; end if;
  if exists (select 1 from public.validaciones_formativas where perfil_id = p_perfil and version_id = v_version.id and anulada_en is null) then
    raise exception 'ya_validada' using errcode = 'P0001';
  end if;
  insert into public.validaciones_formativas (perfil_id, curso_id, version_id, nota, validada_por)
  values (p_perfil, p_curso, v_version.id, btrim(p_nota), auth.uid()) returning id into v_id;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), 'finalizacion_validada', 'validaciones_formativas', v_id::text,
          jsonb_build_object('perfil', p_perfil, 'curso', p_curso, 'version', v_version.numero, 'nota', btrim(p_nota)));
  return v_id;
end; $$;
revoke execute on function public.validar_finalizacion(uuid, uuid, text) from public, anon;
grant execute on function public.validar_finalizacion(uuid, uuid, text) to authenticated;

-- Anular una validación por error: solo si todavía no se emitió el certificado de esa versión.
create or replace function public.anular_validacion(p_validacion uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.validaciones_formativas%rowtype;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'motivo_requerido' using errcode = 'P0001'; end if;
  select * into v from public.validaciones_formativas where id = p_validacion and anulada_en is null for update;
  if v.id is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  if exists (select 1 from public.certificados where perfil_id = v.perfil_id and curso_id = v.curso_id and version_id = v.version_id) then
    raise exception 'certificado_emitido' using errcode = 'P0001';
  end if;
  update public.validaciones_formativas set anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = btrim(p_motivo) where id = v.id;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (auth.uid(), 'validacion_anulada', 'validaciones_formativas', v.id::text, jsonb_build_object('nota', v.nota), jsonb_build_object('motivo', btrim(p_motivo)));
end; $$;
revoke execute on function public.anular_validacion(uuid, text) from public, anon;
grant execute on function public.anular_validacion(uuid, text) to authenticated;

-- ============================================================ 6. Certificado según la modalidad de la versión
create or replace function public.emitir_certificado(p_perfil uuid, p_curso uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_estado jsonb := public.estado_finalizacion_de(p_perfil, p_curso);
  v_version uuid;
  v_cert uuid;
  v_intento uuid;
  v_modalidad text;
begin
  if v_estado is null then raise exception 'sin_acceso' using errcode = 'P0001'; end if;
  v_version := (v_estado ->> 'version_id')::uuid;
  v_modalidad := v_estado ->> 'modalidad';
  select id into v_cert from public.certificados where perfil_id = p_perfil and curso_id = p_curso and version_id = v_version;
  if v_cert is not null then return v_cert; end if;

  if (v_estado ->> 'lecciones_pendientes')::int > 0 then
    raise exception 'lecciones_pendientes: %', v_estado ->> 'lecciones_pendientes' using errcode = 'P0001';
  end if;
  if not (v_estado ->> 'con_certificado')::boolean then raise exception 'curso_sin_certificado' using errcode = 'P0001'; end if;
  if v_modalidad = 'sumativa' then
    if not (v_estado ->> 'evaluacion_aprobada')::boolean then raise exception 'evaluacion_no_aprobada' using errcode = 'P0001'; end if;
    select i.id into v_intento from public.intentos_evaluacion i
      join public.evaluaciones e on e.id = i.evaluacion_id
     where e.curso_id = p_curso and i.perfil_id = p_perfil and not i.formativo and (i.aprobado or coalesce(i.aprobado_revisado, false))
       and public.evaluaciones_equivalentes(i.version_id, v_version)
     order by i.entregado_en desc limit 1;
  else
    if (v_estado ->> 'requiere_actividades')::boolean and not (v_estado ->> 'actividades_completas')::boolean then
      raise exception 'actividades_pendientes' using errcode = 'P0001';
    end if;
    if (v_estado ->> 'requiere_validacion')::boolean and not (v_estado ->> 'validada')::boolean then
      raise exception 'validacion_pendiente' using errcode = 'P0001';
    end if;
    if not (v_estado ->> 'elegible_certificado')::boolean then raise exception 'sin_criterios_certificacion' using errcode = 'P0001'; end if;
    select i.id into v_intento from public.intentos_evaluacion i
     where i.perfil_id = p_perfil and i.version_id = v_version and i.formativo and i.completo
     order by i.entregado_en desc limit 1;
  end if;

  insert into public.certificados (perfil_id, curso_id, intento_id, nombre_en_certificado, titulo_curso, version_id, modalidad)
  select p_perfil, p_curso, v_intento, pf.nombre_completo, c.titulo, v_version, v_modalidad
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

-- ============================================================ 7. Evaluación de la versión del alumno (campus)
create or replace function public.mi_evaluacion(p_curso uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when v.id is null then null else jsonb_build_object(
    'evaluacion_id', (select id from public.evaluaciones where curso_id = p_curso),
    'version', v.numero, 'version_id', v.id, 'publicada_en', v.publicada_en,
    'modalidad', v.modalidad, 'requiere_actividades', v.requiere_actividades,
    'puntaje_minimo', v.puntaje_minimo, 'intentos_permitidos', v.intentos_permitidos,
    'preguntas', (select count(*) from public.version_preguntas vp join public.preguntas p on p.id = vp.pregunta_id
                   where vp.version_id = v.id and not p.bloqueada),
    'intentos', coalesce((select jsonb_agg(jsonb_build_object('numero', i.numero, 'puntaje', greatest(i.puntaje, coalesce(i.puntaje_revisado, 0)),
                          'aprobado', i.aprobado or coalesce(i.aprobado_revisado, false), 'revisado', i.puntaje_revisado is not null,
                          'entregado_en', i.entregado_en) order by i.numero)
                   from public.intentos_evaluacion i
                   join public.evaluaciones e on e.id = i.evaluacion_id
                  where e.curso_id = p_curso and i.perfil_id = auth.uid() and i.version_id = v.id and not i.formativo), '[]'),
    'envios_formativos', (select count(*) from public.intentos_evaluacion i where i.perfil_id = auth.uid() and i.version_id = v.id and i.formativo),
    'aprobado_equivalente', exists (select 1 from public.intentos_evaluacion i join public.evaluaciones e on e.id = i.evaluacion_id
                  where e.curso_id = p_curso and i.perfil_id = auth.uid() and not i.formativo and (i.aprobado or coalesce(i.aprobado_revisado, false))
                    and public.evaluaciones_equivalentes(i.version_id, v.id)))
  end
  from (select * from public.versiones_curso where id = public.mi_version(p_curso)) v
  right join (select 1) uno on true;
$$;
grant execute on function public.mi_evaluacion(uuid) to authenticated;

-- ============================================================ 8. Publicación: requisitos según la modalidad
create or replace function public.faltantes_publicacion(p_curso uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare f text[] := '{}'; v_eval public.evaluaciones%rowtype; v_necesita_preguntas boolean;
begin
  select * into v_eval from public.evaluaciones where curso_id = p_curso;
  if (select precio_centavos from public.cursos where id = p_curso) <= 0 then f := array_append(f, 'precio'); end if;
  if not exists (select 1 from public.lecciones_vigentes_de(p_curso) v(id) join public.lecciones l on l.id = v.id where not l.bloqueada) then
    f := array_append(f, 'lecciones');
  end if;
  -- Sumativa (o sin configurar): evaluación con preguntas. Formativa: preguntas solo si exige actividades.
  v_necesita_preguntas := coalesce(v_eval.modalidad, 'sumativa') = 'sumativa' or v_eval.requiere_actividades;
  if v_necesita_preguntas then
    if not exists (select 1 from public.preguntas p where p.evaluacion_id = v_eval.id and not p.retirada and not p.bloqueada) then
      f := array_append(f, case when coalesce(v_eval.modalidad, 'sumativa') = 'sumativa' then 'evaluacion' else 'actividades' end);
    elsif exists (select 1 from public.preguntas p where p.evaluacion_id = v_eval.id and not p.retirada and not p.bloqueada
                     and not exists (select 1 from public.opciones o where o.pregunta_id = p.id and o.es_correcta)) then
      f := array_append(f, 'respuesta_correcta');
    end if;
  end if;
  -- Formativa con certificado: hace falta un criterio además de las lecciones.
  if v_eval.modalidad = 'formativa' and v_eval.con_certificado and not v_eval.requiere_actividades and not v_eval.requiere_validacion then
    f := array_append(f, 'criterios_certificacion');
  end if;
  return f;
end; $$;
revoke execute on function public.faltantes_publicacion(uuid) from public, anon;

-- ============================================================ 9. Crear versión: fija también la modalidad
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
                                      objetivos, requisitos, modalidad, requiere_actividades, requiere_validacion, con_certificado)
  values (p_curso, v_numero, coalesce(v_eval.puntaje_minimo, 70),
          case when v_eval.id is null then 2 else v_eval.intentos_permitidos end,
          coalesce(v_eval.mensaje_aprobado, 'Aprobó la evaluación.'), coalesce(v_eval.mensaje_desaprobado, 'Todavía no alcanzó el puntaje mínimo.'),
          nullif(btrim(coalesce(p_resumen, '')), ''), p_autor, coalesce(v_curso.objetivos, '{}'), v_curso.requisitos,
          coalesce(v_eval.modalidad, 'sumativa'), coalesce(v_eval.requiere_actividades, false), coalesce(v_eval.requiere_validacion, false),
          coalesce(v_eval.con_certificado, true))
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
  -- Las preguntas entran en la versión si la modalidad las usa.
  if v_eval.id is not null and (v_eval.modalidad = 'sumativa' or v_eval.requiere_actividades) then
    insert into public.version_preguntas (version_id, pregunta_id, orden)
    select v_id, p.id, p.orden from public.preguntas p
     where p.evaluacion_id = v_eval.id and not p.retirada and not p.bloqueada;
  end if;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (p_autor, 'version_publicada', 'versiones_curso', v_id::text, jsonb_build_object(
    'curso', p_curso, 'numero', v_numero, 'resumen', p_resumen,
    'lecciones', (select count(*) from public.version_lecciones where version_id = v_id),
    'preguntas', (select count(*) from public.version_preguntas where version_id = v_id),
    'modalidad', coalesce(v_eval.modalidad, 'sumativa'),
    'puntaje_minimo', coalesce(v_eval.puntaje_minimo, 70), 'intentos_permitidos', v_eval.intentos_permitidos));
  return v_id;
end; $$;
revoke execute on function public.crear_version(uuid, text, uuid) from public, anon, authenticated;

-- ============================================================ 10. Seguimiento para el panel
-- Estado de finalización de cada alumno de un curso (solo admin).
create or replace function public.seguimiento_curso(p_curso uuid)
returns table (perfil_id uuid, nombre text, version int, estado jsonb, envios_formativos int, ultimo_envio timestamptz,
               validacion_id uuid, tiene_certificado boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return query
  select a.perfil_id, pf.nombre_completo, v.numero, public.estado_finalizacion_de(a.perfil_id, p_curso),
         (select count(*)::int from public.intentos_evaluacion i where i.perfil_id = a.perfil_id and i.version_id = a.version_id and i.formativo),
         (select max(i.entregado_en) from public.intentos_evaluacion i where i.perfil_id = a.perfil_id and i.version_id = a.version_id and i.formativo),
         (select f.id from public.validaciones_formativas f where f.perfil_id = a.perfil_id and f.version_id = a.version_id and f.anulada_en is null),
         exists (select 1 from public.certificados c where c.perfil_id = a.perfil_id and c.curso_id = p_curso and c.version_id = a.version_id)
    from public.accesos_curso a
    join public.perfiles pf on pf.id = a.perfil_id
    join public.versiones_curso v on v.id = a.version_id
   where a.curso_id = p_curso and a.estado = 'activo'
   order by v.numero, pf.nombre_completo;
end; $$;
revoke execute on function public.seguimiento_curso(uuid) from public, anon;
grant execute on function public.seguimiento_curso(uuid) to authenticated;

-- ============================================================ 11. Auditoría y protección de respuestas
drop trigger evaluaciones_auditar on public.evaluaciones;
create trigger evaluaciones_auditar after update on public.evaluaciones
  for each row execute function public.auditar_cambio('evaluacion',
    '{curso_id,puntaje_minimo,intentos_permitidos,modalidad,requiere_actividades,requiere_validacion,con_certificado}');

-- Defecto previo corregido: el alumno podía leer por la API qué respuestas suyas fueron correctas,
-- lo que anulaba el criterio de informar solo «temas a reforzar». La columna deja de ser legible.
revoke select on public.respuestas_intento from anon, authenticated;
grant select (id, intento_id, pregunta_id, opciones_elegidas) on public.respuestas_intento to authenticated;

-- ============================================================ 12. Cambio de versión: también informa la modalidad
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
    'requisitos', jsonb_build_object(
      'antes', jsonb_build_object('modalidad', v_act.modalidad, 'requiere_actividades', v_act.requiere_actividades,
                                  'requiere_validacion', v_act.requiere_validacion, 'con_certificado', v_act.con_certificado),
      'despues', jsonb_build_object('modalidad', v_nueva.modalidad, 'requiere_actividades', v_nueva.requiere_actividades,
                                    'requiere_validacion', v_nueva.requiere_validacion, 'con_certificado', v_nueva.con_certificado)),
    'tiene_certificado', exists (select 1 from public.certificados where perfil_id = v_uid and curso_id = p_curso and version_id = v_act.id));
end; $$;
grant execute on function public.vista_cambio_version(uuid) to authenticated;
