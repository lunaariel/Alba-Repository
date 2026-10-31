-- Albor · 0014 · Versionado académico (aprobado por la titular el 30/10/2026)
-- Cada acceso queda atado a una versión publicada e inmutable del programa: lecciones exigidas y su
-- orden, preguntas, respuestas correctas, puntaje mínimo e intentos. La maestra edita un borrador;
-- publicar crea la versión siguiente. El contenido (lecciones, videos, PDF, preguntas) se comparte
-- por referencia. Ver docs/preservacion-academica.md. Reversión: supabase/rollback/…_versionado_down.sql.

-- ============================================================ 0. Respaldo verificable previo
-- Copia exacta de lo que la migración no debe alterar; conciliar_versionado() la compara.
create schema if not exists respaldo_0014;
revoke all on schema respaldo_0014 from public, anon, authenticated;
create table respaldo_0014.accesos_curso       as select * from public.accesos_curso;
create table respaldo_0014.progreso_leccion    as select * from public.progreso_leccion;
create table respaldo_0014.intentos_evaluacion as select * from public.intentos_evaluacion;
create table respaldo_0014.respuestas_intento  as select * from public.respuestas_intento;
create table respaldo_0014.certificados        as select * from public.certificados;
create table respaldo_0014.pendientes_previos as
  select a.perfil_id, a.curso_id,
         (select count(*) from public.lecciones l join public.modulos m on m.id = l.modulo_id
           where m.curso_id = a.curso_id and not l.retirada and not m.retirado
             and not exists (select 1 from public.progreso_leccion p
                              where p.leccion_id = l.id and p.perfil_id = a.perfil_id and p.completada_en is not null))::int as pendientes
    from public.accesos_curso a where a.estado = 'activo';

-- ============================================================ 1. Tablas
create table public.versiones_curso (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.cursos (id) on delete cascade,
  numero int not null check (numero > 0),
  puntaje_minimo int not null check (puntaje_minimo between 0 and 100),
  intentos_permitidos int check (intentos_permitidos is null or intentos_permitidos > 0),
  mensaje_aprobado text not null,
  mensaje_desaprobado text not null,
  resumen text,
  publicada_por uuid,
  publicada_en timestamptz not null default now(),
  unique (curso_id, numero)
);

create table public.version_lecciones (
  version_id uuid not null references public.versiones_curso (id) on delete cascade,
  -- Diferibles: al eliminar un curso entero (sin historial), las listas se borran en la misma cascada.
  leccion_id uuid not null references public.lecciones (id) deferrable initially deferred,
  modulo_id uuid not null references public.modulos (id) deferrable initially deferred,
  modulo_orden int not null,
  orden int not null,
  primary key (version_id, leccion_id)
);
create index version_lecciones_leccion_idx on public.version_lecciones (leccion_id);

create table public.version_materiales (
  version_id uuid not null references public.versiones_curso (id) on delete cascade,
  recurso_id uuid not null references public.recursos_leccion (id) deferrable initially deferred,
  primary key (version_id, recurso_id)
);
create index version_materiales_recurso_idx on public.version_materiales (recurso_id);

create table public.version_preguntas (
  version_id uuid not null references public.versiones_curso (id) on delete cascade,
  pregunta_id uuid not null references public.preguntas (id) deferrable initially deferred,
  orden int not null,
  primary key (version_id, pregunta_id)
);
create index version_preguntas_pregunta_idx on public.version_preguntas (pregunta_id);

alter table public.cursos add column version_vigente_id uuid references public.versiones_curso (id);
alter table public.accesos_curso add column version_id uuid references public.versiones_curso (id);
alter table public.intentos_evaluacion
  add column version_id uuid references public.versiones_curso (id),
  add column puntaje_revisado int check (puntaje_revisado between 0 and 100),
  add column aprobado_revisado boolean,
  add column revisado_en timestamptz;
alter table public.certificados add column version_id uuid references public.versiones_curso (id);

-- Retiro del borrador para materiales, y bloqueo excepcional (seguridad o retiro legal).
alter table public.recursos_leccion add column retirado boolean not null default false;
alter table public.lecciones add column bloqueada boolean not null default false,
  add column bloqueo_motivo text, add column bloqueada_en timestamptz;
alter table public.recursos_leccion add column bloqueado boolean not null default false,
  add column bloqueo_motivo text, add column bloqueado_en timestamptz;
alter table public.preguntas add column bloqueada boolean not null default false,
  add column bloqueo_motivo text, add column bloqueada_en timestamptz;
grant select (bloqueada) on public.lecciones to anon, authenticated;

-- Cambio voluntario de versión: quién, cuándo, de cuál a cuál y con qué confirmación.
create table public.cambios_version (
  id uuid primary key default gen_random_uuid(),
  acceso_id uuid not null references public.accesos_curso (id) on delete restrict,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  curso_id uuid not null references public.cursos (id) on delete restrict,
  version_anterior uuid not null references public.versiones_curso (id),
  version_nueva uuid not null references public.versiones_curso (id),
  confirmacion text not null,
  creado_en timestamptz not null default now()
);

-- Revisión favorable de una pregunta mal corregida.
create table public.revisiones_evaluacion (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.versiones_curso (id) on delete restrict,
  pregunta_id uuid not null references public.preguntas (id) on delete restrict,
  opciones_correctas uuid[] not null,
  opciones_clave text not null,           -- identificadores ordenados y unidos, para impedir duplicados
  motivo text not null check (char_length(btrim(motivo)) >= 10),
  estado text not null default 'calculada' check (estado in ('calculada', 'aplicada', 'descartada')),
  impacto jsonb not null default '[]',
  calculada_por uuid not null,
  calculada_en timestamptz not null default now(),
  aplicada_por uuid,
  aplicada_en timestamptz
);
create unique index revision_aplicada_unica on public.revisiones_evaluacion
  (version_id, pregunta_id, opciones_clave) where estado = 'aplicada';

create table public.ajustes_intento (
  revision_id uuid not null references public.revisiones_evaluacion (id) on delete restrict,
  intento_id uuid not null references public.intentos_evaluacion (id) on delete restrict,
  puntaje_original int not null,
  aprobado_original boolean not null,
  puntaje_anterior int not null,          -- el vigente justo antes de esta revisión
  puntaje_corregido int not null,
  aprobado_corregido boolean not null,
  creado_en timestamptz not null default now(),
  primary key (revision_id, intento_id),
  check (puntaje_corregido > puntaje_anterior)
);

-- ============================================================ 2. Ayudas
create or replace function public.version_de(p_perfil uuid, p_curso uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select version_id from public.accesos_curso where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo';
$$;
revoke execute on function public.version_de(uuid, uuid) from public, anon, authenticated;

create or replace function public.mi_version(p_curso uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select public.version_de(auth.uid(), p_curso);
$$;
grant execute on function public.mi_version(uuid) to authenticated;

create or replace function public.version_vigente_publica(p_curso uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select version_vigente_id from public.cursos where id = p_curso and estado = 'publicado';
$$;

-- Lecciones exigidas por una versión: las de la versión que no fueron bloqueadas.
create or replace function public.lecciones_de_version(p_version uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select vl.leccion_id from public.version_lecciones vl join public.lecciones l on l.id = vl.leccion_id
   where vl.version_id = p_version and not l.bloqueada;
$$;
revoke execute on function public.lecciones_de_version(uuid) from public, anon, authenticated;

create or replace function public.curso_de_pregunta(p_pregunta uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select e.curso_id from public.preguntas p join public.evaluaciones e on e.id = p.evaluacion_id where p.id = p_pregunta;
$$;

-- Dos versiones con la misma evaluación (mismas preguntas y mismo mínimo): la aprobación se reconoce.
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

-- Visibilidad para políticas (security definer: evita recursión de RLS).
create or replace function public.leccion_visible_publica(p_leccion uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.version_lecciones vl join public.lecciones l on l.id = vl.leccion_id
                  join public.versiones_curso v on v.id = vl.version_id
                 where vl.leccion_id = p_leccion and not l.bloqueada
                   and vl.version_id = public.version_vigente_publica(v.curso_id));
$$;
create or replace function public.leccion_visible_alumno(p_leccion uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.version_lecciones vl join public.lecciones l on l.id = vl.leccion_id
                  join public.versiones_curso v on v.id = vl.version_id
                 where vl.leccion_id = p_leccion and not l.bloqueada
                   and vl.version_id = public.version_de(auth.uid(), v.curso_id));
$$;
create or replace function public.modulo_visible_publico(p_modulo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.version_lecciones vl join public.versiones_curso v on v.id = vl.version_id
                 where vl.modulo_id = p_modulo and vl.version_id = public.version_vigente_publica(v.curso_id));
$$;
create or replace function public.modulo_visible_alumno(p_modulo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.version_lecciones vl join public.versiones_curso v on v.id = vl.version_id
                 where vl.modulo_id = p_modulo and vl.version_id = public.version_de(auth.uid(), v.curso_id));
$$;
create or replace function public.recurso_visible_alumno(p_recurso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.version_materiales vm join public.recursos_leccion r on r.id = vm.recurso_id
                  join public.versiones_curso v on v.id = vm.version_id
                 where vm.recurso_id = p_recurso and not r.bloqueado
                   and vm.version_id = public.version_de(auth.uid(), v.curso_id));
$$;

-- ============================================================ 3. Crear y publicar versiones
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

-- Sella el borrador actual como versión siguiente. Uso interno (publicar_version y disparador).
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

-- La admin publica una versión nueva con su sesión. Los alumnos actuales no cambian de versión.
create or replace function public.publicar_version(p_curso uuid, p_resumen text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_falta text[]; v_id uuid;
begin
  if auth.uid() is not null and not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_resumen, ''))) < 5 then raise exception 'resumen_requerido' using errcode = 'P0001'; end if;
  v_falta := public.faltantes_publicacion(p_curso);
  if array_length(v_falta, 1) > 0 then
    raise exception 'curso_incompleto: %', array_to_string(v_falta, ',') using errcode = 'P0001';
  end if;
  v_id := public.crear_version(p_curso, p_resumen, auth.uid());
  update public.cursos set version_vigente_id = v_id,
         estado = case when estado = 'borrador' then 'publicado' else estado end
   where id = p_curso;
  return v_id;
end; $$;
revoke execute on function public.publicar_version(uuid, text) from public, anon;
grant execute on function public.publicar_version(uuid, text) to authenticated, service_role;

-- Publicar por primera vez (estado → publicado sin versión) crea la versión 1.
create or replace function public.versionar_al_publicar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'publicado' and new.version_vigente_id is null then
    new.version_vigente_id := public.crear_version(new.id, 'Primera versión publicada', auth.uid());
  end if;
  return new;
end; $$;
-- El nombre ordena este disparador después de cursos_validar_publicacion (se valida primero).
create trigger cursos_versionar before update of estado on public.cursos
  for each row execute function public.versionar_al_publicar();

-- La validación de publicación usa la misma regla que publicar_version.
create or replace function public.validar_publicacion_curso()
returns trigger language plpgsql security definer set search_path = public as $$
declare faltantes text[];
begin
  if new.estado = 'publicado' and (old.estado is distinct from 'publicado') and new.version_vigente_id is null then
    faltantes := public.faltantes_publicacion(new.id);
    if array_length(faltantes, 1) > 0 then
      raise exception 'curso_incompleto: %', array_to_string(faltantes, ',') using errcode = 'P0001';
    end if;
  end if;
  if new.estado = 'publicado' and (old.estado is distinct from 'publicado') then
    new.publicado_en := coalesce(new.publicado_en, now());
  end if;
  if new.estado = 'borrador' and old.estado is distinct from 'borrador'
     and exists (select 1 from public.accesos_curso where curso_id = new.id) then
    raise exception 'curso_con_alumnos' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ============================================================ 4. Asignación de la versión al recibir acceso
create or replace function public.asignar_version_acceso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.version_id := coalesce(new.version_id, (select version_vigente_id from public.cursos where id = new.curso_id));
    if new.version_id is null then raise exception 'curso_sin_version' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.versiones_curso where id = new.version_id and curso_id = new.curso_id) then
      raise exception 'version_ajena' using errcode = 'P0001';
    end if;
  elsif new.version_id is distinct from old.version_id and coalesce(current_setting('albor.cambio_version', true), '') <> 'si' then
    -- Solo cambiar_version (confirmado por el alumno) puede mover un acceso de versión.
    raise exception 'version_inmutable' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger accesos_version before insert or update of version_id on public.accesos_curso
  for each row execute function public.asignar_version_acceso();

-- ============================================================ 5. Inmutabilidad
create or replace function public.proteger_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then raise exception 'version_inmutable' using errcode = 'P0001'; end if;
  -- Borrar solo en cascada, cuando se elimina el curso entero (posible solo si no tiene historial).
  if tg_table_name = 'versiones_curso' then
    if exists (select 1 from public.cursos where id = old.curso_id) then raise exception 'version_inmutable' using errcode = 'P0001'; end if;
  elsif exists (select 1 from public.versiones_curso where id = old.version_id) then
    raise exception 'version_inmutable' using errcode = 'P0001';
  end if;
  return old;
end; $$;
create trigger versiones_inmutables before update or delete on public.versiones_curso for each row execute function public.proteger_version();
create trigger version_lecciones_inmutables before update or delete on public.version_lecciones for each row execute function public.proteger_version();
create trigger version_materiales_inmutables before update or delete on public.version_materiales for each row execute function public.proteger_version();
create trigger version_preguntas_inmutables before update or delete on public.version_preguntas for each row execute function public.proteger_version();

-- Una pregunta publicada no cambia su texto, tipo ni opciones (sí su retiro del borrador o su bloqueo).
create or replace function public.proteger_pregunta_publicada()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pregunta uuid;
begin
  if tg_table_name = 'preguntas' then
    if exists (select 1 from public.version_preguntas where pregunta_id = old.id)
       and (new.enunciado, new.tipo, new.tema, new.evaluacion_id) is distinct from (old.enunciado, old.tipo, old.tema, old.evaluacion_id) then
      raise exception 'pregunta_publicada' using errcode = 'P0001';
    end if;
    return new;
  end if;
  v_pregunta := coalesce(new.pregunta_id, old.pregunta_id);
  if exists (select 1 from public.version_preguntas where pregunta_id = v_pregunta)
     or (tg_op = 'UPDATE' and exists (select 1 from public.version_preguntas where pregunta_id = old.pregunta_id)) then
    if tg_op in ('INSERT', 'DELETE')
       or (new.texto, new.es_correcta, new.pregunta_id) is distinct from (old.texto, old.es_correcta, old.pregunta_id) then
      raise exception 'pregunta_publicada' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end; $$;
create trigger preguntas_publicadas before update on public.preguntas for each row execute function public.proteger_pregunta_publicada();
create trigger opciones_publicadas before insert or update or delete on public.opciones for each row execute function public.proteger_pregunta_publicada();

-- Mensajes claros antes de que las claves foráneas lo impidan.
create or replace function public.proteger_historial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'lecciones' then
    if exists (select 1 from public.progreso_leccion where leccion_id = old.id) then
      raise exception 'leccion_con_historial' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.version_lecciones vl join public.versiones_curso v on v.id = vl.version_id
                join public.cursos c on c.id = v.curso_id where vl.leccion_id = old.id) then
      raise exception 'leccion_en_version' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'modulos' then
    if exists (select 1 from public.progreso_leccion p join public.lecciones l on l.id = p.leccion_id where l.modulo_id = old.id) then
      raise exception 'modulo_con_historial' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.version_lecciones vl join public.versiones_curso v on v.id = vl.version_id
                join public.cursos c on c.id = v.curso_id where vl.modulo_id = old.id) then
      raise exception 'modulo_en_version' using errcode = 'P0001';
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
  elsif tg_table_name = 'recursos_leccion' then
    if exists (select 1 from public.version_materiales vm join public.versiones_curso v on v.id = vm.version_id
                join public.cursos c on c.id = v.curso_id where vm.recurso_id = old.id) then
      raise exception 'material_en_version' using errcode = 'P0001';
    end if;
  end if;
  return old;
end; $$;
create trigger recursos_proteger before delete on public.recursos_leccion for each row execute function public.proteger_historial();

-- ============================================================ 6. Reglas por versión
create or replace function public.lecciones_pendientes(p_curso uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.lecciones_de_version(public.version_de(auth.uid(), p_curso)) v(id)
   where not exists (select 1 from public.progreso_leccion p
                      where p.leccion_id = v.id and p.perfil_id = auth.uid() and p.completada_en is not null);
$$;

-- ¿Es correcta esta elección para la pregunta en esta versión? Clave original o cualquier
-- corrección favorable aplicada (nunca se exige más que la clave original).
create or replace function public.eleccion_correcta(p_version uuid, p_pregunta uuid, p_elegidas uuid[], p_extra uuid[] default null)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_tipo text; v_clave uuid[];
begin
  select tipo into v_tipo from public.preguntas where id = p_pregunta;
  if v_tipo = 'unica' and cardinality(p_elegidas) <> 1 then return false; end if;
  select coalesce(array_agg(id), '{}') into v_clave from public.opciones where pregunta_id = p_pregunta and es_correcta;
  if p_elegidas @> v_clave and v_clave @> p_elegidas then return true; end if;
  if p_extra is not null and p_elegidas @> p_extra and p_extra @> p_elegidas then return true; end if;
  return exists (select 1 from public.revisiones_evaluacion r
                  where r.version_id = p_version and r.pregunta_id = p_pregunta and r.estado = 'aplicada'
                    and p_elegidas @> r.opciones_correctas and r.opciones_correctas @> p_elegidas);
end; $$;
revoke execute on function public.eleccion_correcta(uuid, uuid, uuid[], uuid[]) from public, anon, authenticated;

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

-- Un certificado por alumno, curso y versión.
alter table public.certificados drop constraint certificados_perfil_id_curso_id_key;

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

create or replace function public.resumen_publico_curso(p_curso uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.version_vigente_publica(p_curso) is not null then jsonb_build_object(
    'materiales', (select count(*) from public.version_materiales vm join public.recursos_leccion r on r.id = vm.recurso_id
                    where vm.version_id = public.version_vigente_publica(p_curso) and not r.bloqueado),
    'evaluacion', exists (select 1 from public.version_preguntas vp join public.preguntas p on p.id = vp.pregunta_id
                           where vp.version_id = public.version_vigente_publica(p_curso) and not p.bloqueada))
  else null end;
$$;

create or replace function public.verificar_certificado(p_codigo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nombre', c.nombre_en_certificado, 'curso', c.titulo_curso, 'emitido_en', c.emitido_en,
                            'codigo', c.codigo_verificacion, 'version', v.numero)
    from public.certificados c left join public.versiones_curso v on v.id = c.version_id
   where c.codigo_verificacion = upper(btrim(p_codigo)) and char_length(btrim(p_codigo)) = 12;
$$;

-- ============================================================ 7. Temario por versión (sitio, campus y vista previa)
-- Devuelve el temario de una versión a quien tiene derecho a verla: el público (vigente de un curso
-- publicado), el alumno (la suya) o la admin (cualquiera). Títulos y duración: los actuales
-- (corrección de forma); qué lecciones y en qué orden: los de la versión.
create or replace function public.temario_version(p_version uuid)
returns table (modulo_id uuid, modulo_titulo text, modulo_orden int, leccion_id uuid, leccion_titulo text, duracion_minutos int, orden int)
language sql stable security definer set search_path = public as $$
  select m.id, m.titulo, vl.modulo_orden, l.id, l.titulo, l.duracion_minutos, vl.orden
    from public.version_lecciones vl
    join public.versiones_curso v on v.id = vl.version_id
    join public.lecciones l on l.id = vl.leccion_id
    join public.modulos m on m.id = vl.modulo_id
   where vl.version_id = p_version and not l.bloqueada
     and (public.es_admin() or p_version = public.version_vigente_publica(v.curso_id) or p_version = public.version_de(auth.uid(), v.curso_id))
   order by vl.modulo_orden, vl.orden;
$$;
grant execute on function public.temario_version(uuid) to anon, authenticated;

-- Orden de las preguntas en la versión del alumno (el borrador puede reordenarlas).
create or replace function public.orden_preguntas_mi_version(p_curso uuid)
returns table (pregunta_id uuid, orden int) language sql stable security definer set search_path = public as $$
  select vp.pregunta_id, vp.orden from public.version_preguntas vp where vp.version_id = public.mi_version(p_curso);
$$;
grant execute on function public.orden_preguntas_mi_version(uuid) to authenticated;

-- Evaluación de la versión del alumno: criterios e intentos de esa versión.
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

-- ============================================================ 8. Cambio voluntario de versión
-- Lo que cambiaría para el alumno si pasa a la versión vigente (null si ya está en ella).
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

-- El alumno confirma el cambio. Solo hacia la versión vigente y más nueva; nada se borra.
create or replace function public.cambiar_version(p_perfil uuid, p_curso uuid, p_version_destino uuid, p_confirmacion text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_acceso public.accesos_curso%rowtype; v_act int; v_dest int; v_cambio uuid;
begin
  if char_length(btrim(coalesce(p_confirmacion, ''))) < 10 then raise exception 'confirmacion_requerida' using errcode = 'P0001'; end if;
  select * into v_acceso from public.accesos_curso where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo' for update;
  if v_acceso.id is null then raise exception 'sin_acceso' using errcode = 'P0001'; end if;
  if p_version_destino is distinct from (select version_vigente_id from public.cursos where id = p_curso) then
    raise exception 'version_no_vigente' using errcode = 'P0001';
  end if;
  select numero into v_act from public.versiones_curso where id = v_acceso.version_id;
  select numero into v_dest from public.versiones_curso where id = p_version_destino;
  if v_dest <= v_act then raise exception 'version_no_mas_nueva' using errcode = 'P0001'; end if;

  insert into public.cambios_version (acceso_id, perfil_id, curso_id, version_anterior, version_nueva, confirmacion)
  values (v_acceso.id, p_perfil, p_curso, v_acceso.version_id, p_version_destino, btrim(p_confirmacion))
  returning id into v_cambio;
  perform set_config('albor.cambio_version', 'si', true);
  update public.accesos_curso set version_id = p_version_destino where id = v_acceso.id;
  perform set_config('albor.cambio_version', '', true);
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (p_perfil, 'version_cambiada_por_alumno', 'accesos_curso', v_acceso.id::text,
          jsonb_build_object('version', v_acceso.version_id, 'numero', v_act),
          jsonb_build_object('version', p_version_destino, 'numero', v_dest, 'cambio', v_cambio));
  return v_cambio;
end; $$;
revoke execute on function public.cambiar_version(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cambiar_version(uuid, uuid, uuid, text) to service_role;

-- ============================================================ 9. Revisión favorable
create or replace function public.puntaje_con_revisiones(p_intento uuid, p_pregunta uuid default null, p_extra uuid[] default null)
returns int language sql stable security definer set search_path = public as $$
  select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where
           r.correcta or public.eleccion_correcta(i.version_id, r.pregunta_id, r.opciones_elegidas,
                                                   case when r.pregunta_id = p_pregunta then p_extra end)) / count(*))::int end
    from public.respuestas_intento r join public.intentos_evaluacion i on i.id = r.intento_id
   where r.intento_id = p_intento;
$$;
revoke execute on function public.puntaje_con_revisiones(uuid, uuid, uuid[]) from public, anon, authenticated;

-- Paso 1: calcula a quién beneficia, sin cambiar ningún resultado.
create or replace function public.calcular_revision(p_version uuid, p_pregunta uuid, p_opciones uuid[], p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_tipo text; v_id uuid; v_impacto jsonb; v_minimo int;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'motivo_requerido' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.version_preguntas where version_id = p_version and pregunta_id = p_pregunta) then
    raise exception 'pregunta_fuera_de_version' using errcode = 'P0001';
  end if;
  select tipo into v_tipo from public.preguntas where id = p_pregunta;
  p_opciones := (select coalesce(array_agg(distinct x order by x), '{}') from unnest(p_opciones) x);
  if cardinality(p_opciones) = 0 or (v_tipo = 'unica' and cardinality(p_opciones) <> 1) then raise exception 'opciones_invalidas' using errcode = 'P0001'; end if;
  if exists (select 1 from unnest(p_opciones) x where x not in (select id from public.opciones where pregunta_id = p_pregunta)) then
    raise exception 'opciones_invalidas' using errcode = 'P0001';
  end if;
  if public.eleccion_correcta(p_version, p_pregunta, p_opciones) then raise exception 'ya_es_correcta' using errcode = 'P0001'; end if;
  select puntaje_minimo into v_minimo from public.versiones_curso where id = p_version;

  select coalesce(jsonb_agg(jsonb_build_object(
           'intento', t.id, 'perfil', t.perfil_id, 'nombre', t.nombre, 'numero', t.numero,
           'puntaje_original', t.puntaje, 'puntaje_vigente', t.vigente, 'puntaje_corregido', t.nuevo,
           'aprobado_antes', t.aprobado_vigente, 'aprobado_despues', t.nuevo >= v_minimo) order by t.nombre, t.numero), '[]')
    into v_impacto
    from (select i.id, i.perfil_id, pf.nombre_completo as nombre, i.numero, i.puntaje,
                 greatest(i.puntaje, coalesce(i.puntaje_revisado, 0)) as vigente,
                 i.aprobado or coalesce(i.aprobado_revisado, false) as aprobado_vigente,
                 public.puntaje_con_revisiones(i.id, p_pregunta, p_opciones) as nuevo
            from public.intentos_evaluacion i join public.perfiles pf on pf.id = i.perfil_id
           where i.version_id = p_version
             and exists (select 1 from public.respuestas_intento r where r.intento_id = i.id and r.pregunta_id = p_pregunta)) t
   where t.nuevo > t.vigente;

  insert into public.revisiones_evaluacion (version_id, pregunta_id, opciones_correctas, opciones_clave, motivo, impacto, calculada_por)
  values (p_version, p_pregunta, p_opciones, array_to_string(p_opciones, ','), btrim(p_motivo), v_impacto, auth.uid())
  returning id into v_id;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), 'revision_calculada', 'revisiones_evaluacion', v_id::text,
          jsonb_build_object('version', p_version, 'pregunta', p_pregunta, 'opciones', p_opciones, 'motivo', btrim(p_motivo),
                             'beneficiados', jsonb_array_length(v_impacto)));
  return v_id;
end; $$;
revoke execute on function public.calcular_revision(uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.calcular_revision(uuid, uuid, uuid[], text) to authenticated;

-- Paso 2: segunda confirmación diferenciada ("CORREGIR <n>"). Idempotente. Solo sube resultados.
create or replace function public.aplicar_revision(p_revision uuid, p_confirmacion text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rev public.revisiones_evaluacion%rowtype; v_min int; v_i record; v_nuevo int; v_n int := 0; v_esperada text;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select * into v_rev from public.revisiones_evaluacion where id = p_revision for update;
  if v_rev.id is null then raise exception 'revision_inexistente' using errcode = 'P0001'; end if;
  if v_rev.estado = 'aplicada' then
    return jsonb_build_object('estado', 'ya_aplicada', 'ajustados', (select count(*) from public.ajustes_intento where revision_id = p_revision));
  end if;
  if v_rev.estado <> 'calculada' then raise exception 'revision_descartada' using errcode = 'P0001'; end if;
  v_esperada := 'CORREGIR ' || jsonb_array_length(v_rev.impacto);
  if upper(btrim(coalesce(p_confirmacion, ''))) <> v_esperada then raise exception 'confirmacion_incorrecta' using errcode = 'P0001'; end if;
  select puntaje_minimo into v_min from public.versiones_curso where id = v_rev.version_id;

  -- La clave corregida queda vigente para esta versión (intentos futuros incluidos).
  update public.revisiones_evaluacion set estado = 'aplicada', aplicada_por = auth.uid(), aplicada_en = now() where id = p_revision;

  for v_i in select i.* from public.intentos_evaluacion i
              where i.version_id = v_rev.version_id
                and exists (select 1 from public.respuestas_intento r where r.intento_id = i.id and r.pregunta_id = v_rev.pregunta_id)
              for update loop
    v_nuevo := public.puntaje_con_revisiones(v_i.id);
    if v_nuevo > greatest(v_i.puntaje, coalesce(v_i.puntaje_revisado, 0)) then
      insert into public.ajustes_intento (revision_id, intento_id, puntaje_original, aprobado_original, puntaje_anterior, puntaje_corregido, aprobado_corregido)
      values (p_revision, v_i.id, v_i.puntaje, v_i.aprobado, greatest(v_i.puntaje, coalesce(v_i.puntaje_revisado, 0)), v_nuevo, v_nuevo >= v_min)
      on conflict do nothing;
      update public.intentos_evaluacion
         set puntaje_revisado = v_nuevo, aprobado_revisado = (v_nuevo >= v_min) or coalesce(aprobado_revisado, false) or aprobado,
             revisado_en = now()
       where id = v_i.id;
      v_n := v_n + 1;
    end if;
  end loop;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), 'revision_favorable_aplicada', 'revisiones_evaluacion', p_revision::text,
          jsonb_build_object('version', v_rev.version_id, 'pregunta', v_rev.pregunta_id, 'opciones', v_rev.opciones_correctas,
                             'motivo', v_rev.motivo, 'ajustados', v_n));
  return jsonb_build_object('estado', 'aplicada', 'ajustados', v_n);
end; $$;
revoke execute on function public.aplicar_revision(uuid, text) from public, anon;
grant execute on function public.aplicar_revision(uuid, text) to authenticated;

-- ============================================================ 10. Bloqueo excepcional
create or replace function public.bloquear_contenido(p_tabla text, p_id uuid, p_bloquear boolean, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'motivo_requerido' using errcode = 'P0001'; end if;
  if p_tabla = 'lecciones' then
    update public.lecciones set bloqueada = p_bloquear, bloqueo_motivo = btrim(p_motivo), bloqueada_en = case when p_bloquear then now() end where id = p_id;
  elsif p_tabla = 'recursos_leccion' then
    update public.recursos_leccion set bloqueado = p_bloquear, bloqueo_motivo = btrim(p_motivo), bloqueado_en = case when p_bloquear then now() end where id = p_id;
  elsif p_tabla = 'preguntas' then
    update public.preguntas set bloqueada = p_bloquear, bloqueo_motivo = btrim(p_motivo), bloqueada_en = case when p_bloquear then now() end where id = p_id;
  else
    raise exception 'tabla_invalida' using errcode = 'P0001';
  end if;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), case when p_bloquear then 'contenido_bloqueado' else 'contenido_desbloqueado' end, p_tabla, p_id::text,
          jsonb_build_object('motivo', btrim(p_motivo)));
end; $$;
revoke execute on function public.bloquear_contenido(text, uuid, boolean, text) from public, anon;
grant execute on function public.bloquear_contenido(text, uuid, boolean, text) to authenticated;

-- Guardar una pregunta publicada crea una nueva (copia) que la reemplaza en el borrador.
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
  v_orden int;
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

  -- Pregunta ya publicada en alguna versión: no se toca; se crea su reemplazo en el borrador.
  if v_id is not null and exists (select 1 from public.version_preguntas where pregunta_id = v_id) then
    select orden into v_orden from public.preguntas where id = v_id and evaluacion_id = p_evaluacion;
    if v_orden is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
    update public.preguntas set orden = (select max(orden) + 1 from public.preguntas where evaluacion_id = p_evaluacion) where id = v_id;
    insert into public.preguntas (evaluacion_id, enunciado, tipo, tema, orden)
    values (p_evaluacion, btrim(p_enunciado), p_tipo, nullif(btrim(coalesce(p_tema, '')), ''), v_orden)
    returning id into v_id;
    insert into public.opciones (pregunta_id, texto, es_correcta, orden)
    select v_id, btrim(o ->> 'texto'), (o ->> 'es_correcta')::boolean, (row_number() over ()) - 1
      from jsonb_array_elements(p_opciones) o;
    update public.preguntas set retirada = true where id = p_pregunta;
    return v_id;
  end if;

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
  delete from public.opciones where pregunta_id = v_id and not (id = any (v_ids));
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

-- ============================================================ 11. Políticas por versión
drop policy modulos_lee on public.modulos;
create policy modulos_lee on public.modulos for select to anon, authenticated
  using (public.modulo_visible_publico(id) or public.es_admin());
drop policy modulos_alumno on public.modulos;
create policy modulos_alumno on public.modulos for select to authenticated
  using (public.modulo_visible_alumno(id));

drop policy lecciones_lee on public.lecciones;
create policy lecciones_lee on public.lecciones for select to anon, authenticated
  using (public.leccion_visible_publica(id) or public.es_admin());
drop policy lecciones_alumno on public.lecciones;
create policy lecciones_alumno on public.lecciones for select to authenticated
  using (public.leccion_visible_alumno(id));

drop policy recursos_alumno on public.recursos_leccion;
create policy recursos_alumno on public.recursos_leccion for select to authenticated
  using (public.recurso_visible_alumno(id));

create or replace function public.pregunta_visible_alumno(p_pregunta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.version_preguntas vp join public.preguntas p on p.id = vp.pregunta_id
                 where vp.pregunta_id = p_pregunta and not p.bloqueada
                   and vp.version_id = public.version_de(auth.uid(), public.curso_de_pregunta(p_pregunta)))
     and public.lecciones_pendientes(public.curso_de_pregunta(p_pregunta)) = 0;
$$;
drop policy preguntas_alumno on public.preguntas;
create policy preguntas_alumno on public.preguntas for select to authenticated
  using (public.pregunta_visible_alumno(id));
drop policy opciones_alumno on public.opciones;
create policy opciones_alumno on public.opciones for select to authenticated
  using (public.pregunta_visible_alumno(pregunta_id));

alter table public.versiones_curso enable row level security;
alter table public.version_lecciones enable row level security;
alter table public.version_materiales enable row level security;
alter table public.version_preguntas enable row level security;
alter table public.cambios_version enable row level security;
alter table public.revisiones_evaluacion enable row level security;
alter table public.ajustes_intento enable row level security;

create policy versiones_lee on public.versiones_curso for select to anon, authenticated
  using (public.es_admin() or id = public.version_vigente_publica(curso_id) or id = public.mi_version(curso_id));
create policy version_lecciones_admin on public.version_lecciones for select to authenticated using (public.es_admin());
create policy version_materiales_admin on public.version_materiales for select to authenticated using (public.es_admin());
create policy version_preguntas_admin on public.version_preguntas for select to authenticated using (public.es_admin());
create policy cambios_version_lee on public.cambios_version for select to authenticated using (perfil_id = auth.uid() or public.es_admin());
create policy revisiones_admin on public.revisiones_evaluacion for select to authenticated using (public.es_admin());
create policy ajustes_lee on public.ajustes_intento for select to authenticated
  using (public.es_admin() or exists (select 1 from public.intentos_evaluacion i where i.id = intento_id and i.perfil_id = auth.uid()));

-- Registro de actividad de criterios del borrador y de retiro de materiales.
create trigger recursos_auditar_retiro after update on public.recursos_leccion
  for each row execute function public.auditar_cambio('material', '{leccion_id,titulo,retirado}');

-- ============================================================ 12. Datos existentes
-- Versión 1 de cada curso publicado, archivado o con accesos, con su estado actual (lo vigente).
do $$
declare c record; v uuid;
begin
  for c in select id from public.cursos
            where version_vigente_id is null
              and (estado in ('publicado', 'archivado') or exists (select 1 from public.accesos_curso a where a.curso_id = cursos.id))
  loop
    v := public.crear_version(c.id, 'Versión 1 (estado del curso al introducir el versionado)', null);
    update public.cursos set version_vigente_id = v where id = c.id;
  end loop;
end $$;

-- Asignación: solo se completa la columna nueva; ningún otro dato cambia.
alter table public.accesos_curso disable trigger accesos_version;
update public.accesos_curso a set version_id = c.version_vigente_id from public.cursos c where c.id = a.curso_id and a.version_id is null;
alter table public.accesos_curso enable trigger accesos_version;
update public.intentos_evaluacion i set version_id = c.version_vigente_id
  from public.evaluaciones e join public.cursos c on c.id = e.curso_id
 where e.id = i.evaluacion_id and i.version_id is null;
update public.certificados ce set version_id = c.version_vigente_id from public.cursos c where c.id = ce.curso_id and ce.version_id is null;

alter table public.accesos_curso alter column version_id set not null;
alter table public.intentos_evaluacion alter column version_id set not null;
alter table public.certificados alter column version_id set not null;
alter table public.certificados add constraint certificados_perfil_curso_version_key unique (perfil_id, curso_id, version_id);

-- ============================================================ 13. Conciliación
-- Compara el estado actual con el respaldo tomado al inicio. Todo debe dar cero.
create or replace function public.conciliar_versionado()
returns jsonb language sql stable security definer set search_path = public, respaldo_0014 as $$
  select jsonb_build_object(
    'accesos', jsonb_build_object('antes', (select count(*) from respaldo_0014.accesos_curso), 'despues', (select count(*) from public.accesos_curso)),
    'progreso', jsonb_build_object('antes', (select count(*) from respaldo_0014.progreso_leccion), 'despues', (select count(*) from public.progreso_leccion)),
    'intentos', jsonb_build_object('antes', (select count(*) from respaldo_0014.intentos_evaluacion), 'despues', (select count(*) from public.intentos_evaluacion)),
    'respuestas', jsonb_build_object('antes', (select count(*) from respaldo_0014.respuestas_intento), 'despues', (select count(*) from public.respuestas_intento)),
    'certificados', jsonb_build_object('antes', (select count(*) from respaldo_0014.certificados), 'despues', (select count(*) from public.certificados)),
    'accesos_alterados', (select count(*) from respaldo_0014.accesos_curso r left join public.accesos_curso a on a.id = r.id
        where a.id is null or (a.perfil_id, a.curso_id, a.origen, a.estado, a.item_orden_id) is distinct from (r.perfil_id, r.curso_id, r.origen, r.estado, r.item_orden_id)),
    'accesos_sin_version', (select count(*) from public.accesos_curso where version_id is null),
    'progreso_alterado', (select count(*) from respaldo_0014.progreso_leccion r left join public.progreso_leccion p on p.id = r.id
        where p.id is null or (p.perfil_id, p.leccion_id, p.completada_en) is distinct from (r.perfil_id, r.leccion_id, r.completada_en)),
    'intentos_alterados', (select count(*) from respaldo_0014.intentos_evaluacion r left join public.intentos_evaluacion i on i.id = r.id
        where i.id is null or (i.perfil_id, i.evaluacion_id, i.numero, i.puntaje, i.aprobado, i.entregado_en)
                              is distinct from (r.perfil_id, r.evaluacion_id, r.numero, r.puntaje, r.aprobado, r.entregado_en)),
    'respuestas_alteradas', (select count(*) from respaldo_0014.respuestas_intento r left join public.respuestas_intento x on x.id = r.id
        where x.id is null or (x.opciones_elegidas, x.correcta) is distinct from (r.opciones_elegidas, r.correcta)),
    'certificados_alterados', (select count(*) from respaldo_0014.certificados r left join public.certificados c on c.id = r.id
        where c.id is null or (c.perfil_id, c.curso_id, c.intento_id, c.codigo_verificacion, c.nombre_en_certificado, c.titulo_curso, c.emitido_en)
                              is distinct from (r.perfil_id, r.curso_id, r.intento_id, r.codigo_verificacion, r.nombre_en_certificado, r.titulo_curso, r.emitido_en)),
    'pendientes_distintos', (select count(*) from respaldo_0014.pendientes_previos pp
        where pp.pendientes <> (select count(*) from public.lecciones_de_version(public.version_de(pp.perfil_id, pp.curso_id)) v(id)
                                 where not exists (select 1 from public.progreso_leccion p where p.leccion_id = v.id
                                                    and p.perfil_id = pp.perfil_id and p.completada_en is not null))));
$$;
revoke execute on function public.conciliar_versionado() from public, anon, authenticated;
