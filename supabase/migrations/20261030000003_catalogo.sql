-- Albor · 0003 · Catálogo
-- Cursos, módulos, lecciones, materiales y evaluación final.

create table public.cursos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = public.normalizar(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  titulo text not null check (char_length(btrim(titulo)) between 3 and 140),
  resumen text,
  descripcion text,
  publico text[] not null default '{}' check (publico <@ array['familias','docentes','cuidadores']),
  edad_desde_meses int check (edad_desde_meses between 0 and 72),
  edad_hasta_meses int check (edad_hasta_meses between 0 and 72),
  duracion_minutos int check (duracion_minutos > 0),
  objetivos text[] not null default '{}',
  requisitos text,
  precio_centavos int not null default 0 check (precio_centavos >= 0),
  video_presentacion_id text,                       -- biblioteca pública de Bunny
  portada_ruta text,
  estado text not null default 'borrador' check (estado in ('borrador','publicado','archivado')),
  publicado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (edad_desde_meses is null or edad_hasta_meses is null or edad_desde_meses <= edad_hasta_meses)
);
create index cursos_estado_idx on public.cursos (estado);
create trigger cursos_actualizado before update on public.cursos
  for each row execute function public.tocar_actualizado_en();

create table public.modulos (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.cursos (id) on delete cascade,
  titulo text not null,
  orden int not null check (orden >= 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (curso_id, orden) deferrable initially deferred
);
create trigger modulos_actualizado before update on public.modulos
  for each row execute function public.tocar_actualizado_en();

create table public.lecciones (
  id uuid primary key default gen_random_uuid(),
  modulo_id uuid not null references public.modulos (id) on delete cascade,
  titulo text not null,
  descripcion text,
  duracion_minutos int check (duracion_minutos > 0),
  video_id text,                                    -- biblioteca privada de Bunny; solo lo lee el servidor
  orden int not null check (orden >= 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (modulo_id, orden) deferrable initially deferred
);
create trigger lecciones_actualizado before update on public.lecciones
  for each row execute function public.tocar_actualizado_en();

create table public.recursos_leccion (
  id uuid primary key default gen_random_uuid(),
  leccion_id uuid not null references public.lecciones (id) on delete cascade,
  titulo text not null,
  ruta_almacenamiento text not null,                -- bucket privado; se entrega con URL firmada
  tipo_mime text not null check (tipo_mime = 'application/pdf'),
  tamano_bytes int not null check (tamano_bytes > 0 and tamano_bytes <= 25 * 1024 * 1024),
  orden int not null default 0,
  creado_en timestamptz not null default now()
);

create table public.evaluaciones (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null unique references public.cursos (id) on delete cascade,
  puntaje_minimo int not null default 70 check (puntaje_minimo between 0 and 100),
  intentos_permitidos int check (intentos_permitidos is null or intentos_permitidos > 0),  -- null = sin límite
  mensaje_aprobado text not null default 'Aprobó la evaluación.',
  mensaje_desaprobado text not null default 'Todavía no alcanzó el puntaje mínimo.',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger evaluaciones_actualizado before update on public.evaluaciones
  for each row execute function public.tocar_actualizado_en();

create table public.preguntas (
  id uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null references public.evaluaciones (id) on delete cascade,
  enunciado text not null,
  tipo text not null check (tipo in ('unica','multiple')),
  orden int not null check (orden >= 0),
  unique (evaluacion_id, orden) deferrable initially deferred
);

create table public.opciones (
  id uuid primary key default gen_random_uuid(),
  pregunta_id uuid not null references public.preguntas (id) on delete cascade,
  texto text not null,
  es_correcta boolean not null default false,       -- nunca llega al navegador
  orden int not null check (orden >= 0),
  unique (pregunta_id, orden) deferrable initially deferred
);

create index modulos_curso_idx on public.modulos (curso_id);
create index lecciones_modulo_idx on public.lecciones (modulo_id);
create index recursos_leccion_idx on public.recursos_leccion (leccion_id);
create index preguntas_eval_idx on public.preguntas (evaluacion_id);
create index opciones_pregunta_idx on public.opciones (pregunta_id);

-- ¿El curso está publicado? (atajo para políticas)
create or replace function public.curso_publicado(p_curso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cursos where id = p_curso and estado = 'publicado');
$$;

-- Un curso solo se publica si tiene precio, al menos una lección, evaluación con preguntas
-- y cada pregunta con al menos una opción correcta.
create or replace function public.validar_publicacion_curso()
returns trigger language plpgsql as $$
declare
  faltantes text[] := '{}';
begin
  if new.estado = 'publicado' and (old.estado is distinct from 'publicado') then
    if new.precio_centavos <= 0 then faltantes := array_append(faltantes, 'precio'); end if;
    if not exists (select 1 from public.lecciones l join public.modulos m on m.id = l.modulo_id where m.curso_id = new.id) then
      faltantes := array_append(faltantes, 'lecciones');
    end if;
    if not exists (select 1 from public.evaluaciones e join public.preguntas p on p.evaluacion_id = e.id where e.curso_id = new.id) then
      faltantes := array_append(faltantes, 'evaluacion');
    elsif exists (
      select 1 from public.evaluaciones e join public.preguntas p on p.evaluacion_id = e.id
      where e.curso_id = new.id
        and not exists (select 1 from public.opciones o where o.pregunta_id = p.id and o.es_correcta)
    ) then
      faltantes := array_append(faltantes, 'respuesta_correcta');
    end if;
    if array_length(faltantes, 1) > 0 then
      raise exception 'curso_incompleto: %', array_to_string(faltantes, ',') using errcode = 'P0001';
    end if;
    new.publicado_en := coalesce(new.publicado_en, now());
  end if;
  return new;
end;
$$;
create trigger cursos_validar_publicacion before insert or update of estado on public.cursos
  for each row execute function public.validar_publicacion_curso();

-- RLS
alter table public.cursos enable row level security;
alter table public.modulos enable row level security;
alter table public.lecciones enable row level security;
alter table public.recursos_leccion enable row level security;
alter table public.evaluaciones enable row level security;
alter table public.preguntas enable row level security;
alter table public.opciones enable row level security;

create policy cursos_lee on public.cursos for select to anon, authenticated
  using (estado = 'publicado' or public.es_admin());
create policy cursos_admin on public.cursos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy modulos_lee on public.modulos for select to anon, authenticated
  using (public.curso_publicado(curso_id) or public.es_admin());
create policy modulos_admin on public.modulos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy lecciones_lee on public.lecciones for select to anon, authenticated
  using (public.curso_publicado((select curso_id from public.modulos where id = modulo_id)) or public.es_admin());
create policy lecciones_admin on public.lecciones for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy evaluaciones_admin on public.evaluaciones for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy preguntas_admin on public.preguntas for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy opciones_admin on public.opciones for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy recursos_admin on public.recursos_leccion for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
-- Las políticas de lectura para alumnos de evaluaciones, preguntas, opciones y recursos
-- se definen en 0004, porque dependen de accesos_curso.

-- Columnas que nunca leen los clientes: el id del video privado y la respuesta correcta.
-- El servidor (service_role) las usa para firmar URLs y para corregir.
revoke select on public.lecciones from anon, authenticated;
grant select (id, modulo_id, titulo, descripcion, duracion_minutos, orden, creado_en, actualizado_en)
  on public.lecciones to anon, authenticated;
revoke select on public.opciones from anon, authenticated;
grant select (id, pregunta_id, texto, orden) on public.opciones to anon, authenticated;
