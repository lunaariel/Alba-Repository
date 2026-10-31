-- Albor · 0015 · Ajustes del versionado académico (decisiones de la titular del 30/10/2026)
-- 1) Materiales complementarios: no cambian el programa; se asocian a las versiones que elija la admin.
-- 2) Cambios menores vs sustanciales: una lección o un módulo que está en una versión publicada solo
--    admite correcciones menores declaradas y registradas; lo sustancial va por una lección de reemplazo
--    en el borrador y una versión nueva.
-- 3) Objetivos y requisitos del curso quedan fijados en cada versión.
-- Solo cambia estructura y funciones; no modifica avances, intentos ni certificados.

-- ============================================================ 1. Materiales complementarios
alter table public.recursos_leccion add column complementario boolean not null default false;

create table public.version_complementos (
  version_id uuid not null references public.versiones_curso (id) on delete cascade,
  recurso_id uuid not null references public.recursos_leccion (id) on delete cascade,
  asociado_por uuid,
  asociado_en timestamptz not null default now(),
  primary key (version_id, recurso_id)
);
alter table public.version_complementos enable row level security;
create policy version_complementos_admin on public.version_complementos for select to authenticated using (public.es_admin());

-- Un material que ya forma parte de una versión (requisito del programa) no puede pasar a complementario
-- ni al revés: sería un cambio silencioso de requisitos.
create or replace function public.proteger_tipo_material()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.complementario is distinct from old.complementario then
    if exists (select 1 from public.version_materiales where recurso_id = old.id) then
      raise exception 'material_tipo_fijo' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.version_complementos where recurso_id = old.id) then
      raise exception 'material_tipo_fijo' using errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;
create trigger recursos_tipo_fijo before update of complementario on public.recursos_leccion
  for each row execute function public.proteger_tipo_material();

-- El alumno ve un material si es parte de su versión o si es un complemento asociado a ella.
create or replace function public.recurso_visible_alumno(p_recurso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.version_materiales vm join public.recursos_leccion r on r.id = vm.recurso_id
                  join public.versiones_curso v on v.id = vm.version_id
                 where vm.recurso_id = p_recurso and not r.bloqueado
                   and vm.version_id = public.version_de(auth.uid(), v.curso_id))
      or exists (select 1 from public.version_complementos vc join public.recursos_leccion r on r.id = vc.recurso_id
                  join public.versiones_curso v on v.id = vc.version_id
                 where vc.recurso_id = p_recurso and not r.bloqueado
                   and vc.version_id = public.version_de(auth.uid(), v.curso_id));
$$;

-- La admin decide a qué versiones se asocia un complemento (el conjunto completo, de una vez).
create or replace function public.asociar_complemento(p_recurso uuid, p_versiones uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_r public.recursos_leccion%rowtype; v_curso uuid; v_antes int[]; v_despues int[];
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select * into v_r from public.recursos_leccion where id = p_recurso for update;
  if v_r.id is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  if not v_r.complementario then raise exception 'material_no_complementario' using errcode = 'P0001'; end if;
  select m.curso_id into v_curso from public.lecciones l join public.modulos m on m.id = l.modulo_id where l.id = v_r.leccion_id;
  p_versiones := coalesce(p_versiones, '{}');
  -- Solo versiones del mismo curso que incluyen la lección del material.
  if exists (select 1 from unnest(p_versiones) x
              where not exists (select 1 from public.version_lecciones vl join public.versiones_curso v on v.id = vl.version_id
                                 where vl.version_id = x and vl.leccion_id = v_r.leccion_id and v.curso_id = v_curso)) then
    raise exception 'version_sin_leccion' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(v.numero order by v.numero), '{}') into v_antes
    from public.version_complementos vc join public.versiones_curso v on v.id = vc.version_id where vc.recurso_id = p_recurso;
  delete from public.version_complementos where recurso_id = p_recurso and version_id <> all (p_versiones);
  insert into public.version_complementos (version_id, recurso_id, asociado_por)
  select x, p_recurso, auth.uid() from unnest(p_versiones) x on conflict do nothing;
  select coalesce(array_agg(v.numero order by v.numero), '{}') into v_despues
    from public.version_complementos vc join public.versiones_curso v on v.id = vc.version_id where vc.recurso_id = p_recurso;
  if v_antes is distinct from v_despues then
    insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
    values (auth.uid(), 'complemento_asociado', 'recursos_leccion', p_recurso::text,
            jsonb_build_object('titulo', v_r.titulo, 'versiones', v_antes),
            jsonb_build_object('titulo', v_r.titulo, 'versiones', v_despues));
  end if;
  return cardinality(v_despues);
end; $$;
revoke execute on function public.asociar_complemento(uuid, uuid[]) from public, anon;
grant execute on function public.asociar_complemento(uuid, uuid[]) to authenticated;

-- ============================================================ 2. Objetivos y requisitos por versión
alter table public.versiones_curso add column objetivos text[] not null default '{}', add column requisitos text;
-- Las versiones existentes reciben los objetivos y requisitos vigentes al migrar (hasta hoy no se
-- versionaban, así que son los mismos que veían sus alumnos). Es el único ajuste a versiones ya
-- publicadas: completa una columna nueva; la inmutabilidad se reactiva en la misma transacción.
alter table public.versiones_curso disable trigger versiones_inmutables;
update public.versiones_curso v set objetivos = coalesce(c.objetivos, '{}'), requisitos = c.requisitos
  from public.cursos c where c.id = v.curso_id;
alter table public.versiones_curso enable trigger versiones_inmutables;

-- crear_version: los complementos no son requisitos (no entran en version_materiales); los de la
-- versión vigente se mantienen en la nueva para las lecciones que siguen; se fijan objetivos y requisitos.
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

-- ============================================================ 3. Cambios menores y sustanciales
-- Parecido entre dos textos (proporción de palabras compartidas, 0 a 1). Sirve de guarda objetiva:
-- una "corrección menor" no puede reemplazar la mayor parte del texto.
create or replace function public.similitud_texto(a text, b text)
returns numeric language sql immutable as $$
  with pa as (select distinct w from regexp_split_to_table(lower(coalesce(a, '')), '[^[:alnum:]áéíóúüñ]+') w where w <> ''),
       pb as (select distinct w from regexp_split_to_table(lower(coalesce(b, '')), '[^[:alnum:]áéíóúüñ]+') w where w <> '')
  select case when (select count(*) from (select w from pa union select w from pb) u) = 0 then 1
              else round((select count(*) from (select w from pa intersect select w from pb) i)::numeric
                         / (select count(*) from (select w from pa union select w from pb) u), 3) end;
$$;

-- Una lección o un módulo de una versión publicada no se edita directamente.
create or replace function public.proteger_contenido_publicado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('albor.correccion_menor', true), '') = 'si' then return new; end if;
  if tg_table_name = 'lecciones' then
    if (new.titulo, new.descripcion, new.duracion_minutos, new.video_id, new.modulo_id)
       is distinct from (old.titulo, old.descripcion, old.duracion_minutos, old.video_id, old.modulo_id)
       and exists (select 1 from public.version_lecciones where leccion_id = old.id) then
      raise exception 'leccion_publicada' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'modulos' then
    if new.titulo is distinct from old.titulo
       and exists (select 1 from public.version_lecciones where modulo_id = old.id) then
      raise exception 'modulo_publicado' using errcode = 'P0001';
    end if;
  end if;
  return new;
end; $$;
create trigger lecciones_publicadas before update on public.lecciones
  for each row execute function public.proteger_contenido_publicado();
create trigger modulos_publicados before update on public.modulos
  for each row execute function public.proteger_contenido_publicado();

create or replace function public.validar_correccion(p_tipo text, p_motivo text)
returns void language plpgsql immutable as $$
begin
  if p_tipo is null or p_tipo not in ('ortografia','redaccion','formato','accesibilidad','enlace','video_mejorado','calidad_audio_video') then
    raise exception 'tipo_correccion_invalido' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'motivo_requerido' using errcode = 'P0001'; end if;
end; $$;

-- Texto: solo se acepta como menor si conserva la mayor parte de las palabras.
create or replace function public.texto_menor(p_antes text, p_despues text)
returns boolean language sql immutable as $$
  select p_antes is not distinct from p_despues
      or (nullif(btrim(coalesce(p_antes, '')), '') is not null and nullif(btrim(coalesce(p_despues, '')), '') is not null
          and public.similitud_texto(p_antes, p_despues) >= 0.5);
$$;

create or replace function public.corregir_leccion_publicada(
  p_leccion uuid, p_titulo text, p_descripcion text, p_duracion int, p_video text, p_tipo text, p_motivo text
) returns void language plpgsql security definer set search_path = public as $$
declare v_l public.lecciones%rowtype; v_video_cambia boolean; v_dur_cambia boolean;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  perform public.validar_correccion(p_tipo, p_motivo);
  select * into v_l from public.lecciones where id = p_leccion for update;
  if v_l.id is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  p_titulo := btrim(coalesce(p_titulo, ''));
  p_descripcion := nullif(btrim(coalesce(p_descripcion, '')), '');
  if char_length(p_titulo) < 2 then raise exception 'titulo_vacio' using errcode = 'P0001'; end if;
  v_video_cambia := p_video is distinct from v_l.video_id;
  v_dur_cambia := p_duracion is distinct from v_l.duracion_minutos;
  if (v_video_cambia or v_dur_cambia) and p_tipo not in ('video_mejorado', 'calidad_audio_video') then
    raise exception 'correccion_no_permitida' using errcode = 'P0001';
  end if;
  if v_video_cambia and p_video is null then raise exception 'correccion_no_permitida' using errcode = 'P0001'; end if;
  if not public.texto_menor(v_l.titulo, p_titulo) or not public.texto_menor(v_l.descripcion, p_descripcion) then
    raise exception 'cambio_sustancial' using errcode = 'P0001';
  end if;
  perform set_config('albor.correccion_menor', 'si', true);
  update public.lecciones set titulo = p_titulo, descripcion = p_descripcion, duracion_minutos = p_duracion, video_id = p_video
   where id = p_leccion;
  perform set_config('albor.correccion_menor', '', true);
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (auth.uid(), 'correccion_menor', 'lecciones', p_leccion::text,
          jsonb_build_object('titulo', v_l.titulo, 'descripcion', v_l.descripcion, 'duracion_minutos', v_l.duracion_minutos),
          jsonb_build_object('titulo', p_titulo, 'descripcion', p_descripcion, 'duracion_minutos', p_duracion,
                             'video_cambiado', v_video_cambia, 'tipo', p_tipo, 'motivo', btrim(p_motivo)));
end; $$;
revoke execute on function public.corregir_leccion_publicada(uuid, text, text, int, text, text, text) from public, anon;
grant execute on function public.corregir_leccion_publicada(uuid, text, text, int, text, text, text) to authenticated;

create or replace function public.corregir_modulo_publicado(p_modulo uuid, p_titulo text, p_tipo text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_m public.modulos%rowtype;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  perform public.validar_correccion(p_tipo, p_motivo);
  if p_tipo in ('video_mejorado', 'calidad_audio_video') then raise exception 'correccion_no_permitida' using errcode = 'P0001'; end if;
  select * into v_m from public.modulos where id = p_modulo for update;
  if v_m.id is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  p_titulo := btrim(coalesce(p_titulo, ''));
  if char_length(p_titulo) < 2 then raise exception 'titulo_vacio' using errcode = 'P0001'; end if;
  if not public.texto_menor(v_m.titulo, p_titulo) then raise exception 'cambio_sustancial' using errcode = 'P0001'; end if;
  perform set_config('albor.correccion_menor', 'si', true);
  update public.modulos set titulo = p_titulo where id = p_modulo;
  perform set_config('albor.correccion_menor', '', true);
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (auth.uid(), 'correccion_menor', 'modulos', p_modulo::text, jsonb_build_object('titulo', v_m.titulo),
          jsonb_build_object('titulo', p_titulo, 'tipo', p_tipo, 'motivo', btrim(p_motivo)));
end; $$;
revoke execute on function public.corregir_modulo_publicado(uuid, text, text, text) from public, anon;
grant execute on function public.corregir_modulo_publicado(uuid, text, text, text) to authenticated;

-- Cambio sustancial: copia de la lección en el borrador (mismo lugar), la original sale del borrador
-- y queda intacta en sus versiones. Los PDF del programa se reutilizan (mismo archivo, sin duplicar).
create or replace function public.reemplazar_leccion(p_leccion uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_l public.lecciones%rowtype; v_nueva uuid; v_max int;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select * into v_l from public.lecciones where id = p_leccion for update;
  if v_l.id is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.version_lecciones where leccion_id = p_leccion) then
    raise exception 'leccion_no_publicada' using errcode = 'P0001';
  end if;
  if v_l.retirada then raise exception 'leccion_retirada' using errcode = 'P0001'; end if;
  select coalesce(max(orden), 0) + 1 into v_max from public.lecciones where modulo_id = v_l.modulo_id;
  insert into public.lecciones (modulo_id, titulo, descripcion, duracion_minutos, video_id, orden)
  values (v_l.modulo_id, v_l.titulo, v_l.descripcion, v_l.duracion_minutos, v_l.video_id, v_max)
  returning id into v_nueva;
  -- La copia ocupa el lugar de la original en el borrador (la unicidad de orden es diferida).
  update public.lecciones set retirada = true, orden = v_max + 1 where id = p_leccion;
  update public.lecciones set orden = v_l.orden where id = v_nueva;
  insert into public.recursos_leccion (leccion_id, titulo, ruta_almacenamiento, tipo_mime, tamano_bytes, orden)
  select v_nueva, r.titulo, r.ruta_almacenamiento, r.tipo_mime, r.tamano_bytes, r.orden
    from public.recursos_leccion r where r.leccion_id = p_leccion and not r.retirado and not r.bloqueado and not r.complementario;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (auth.uid(), 'leccion_reemplazada', 'lecciones', v_nueva::text,
          jsonb_build_object('leccion', p_leccion, 'titulo', v_l.titulo), jsonb_build_object('leccion', v_nueva));
  return v_nueva;
end; $$;
revoke execute on function public.reemplazar_leccion(uuid) from public, anon;
grant execute on function public.reemplazar_leccion(uuid) to authenticated;
