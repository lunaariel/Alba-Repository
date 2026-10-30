-- Albor · 0004 · Aprendizaje
-- Accesos, progreso, intentos de evaluación y certificados.

create table public.accesos_curso (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  curso_id uuid not null references public.cursos (id) on delete restrict,
  origen text not null check (origen in ('compra','concesion')),
  item_orden_id uuid,                                -- FK en 0005 (comercio)
  motivo text,                                       -- obligatorio en concesiones
  estado text not null default 'activo' check (estado in ('activo','revocado')),
  revocado_en timestamptz,
  creado_en timestamptz not null default now(),
  check (origen <> 'compra' or item_orden_id is not null),
  check (origen <> 'concesion' or char_length(btrim(coalesce(motivo, ''))) >= 5)
);
-- Un solo acceso activo por persona y curso.
create unique index accesos_unico_activo on public.accesos_curso (perfil_id, curso_id) where estado = 'activo';
create index accesos_curso_idx on public.accesos_curso (curso_id);

create or replace function public.tiene_acceso(p_curso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.accesos_curso
    where perfil_id = auth.uid() and curso_id = p_curso and estado = 'activo'
  );
$$;

create or replace function public.curso_de_leccion(p_leccion uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select m.curso_id from public.lecciones l join public.modulos m on m.id = l.modulo_id where l.id = p_leccion;
$$;

create table public.progreso_leccion (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  leccion_id uuid not null references public.lecciones (id) on delete cascade,
  completada_en timestamptz,                         -- solo por acción explícita del alumno
  ultima_visita_en timestamptz not null default now(),
  unique (perfil_id, leccion_id)
);
create index progreso_perfil_idx on public.progreso_leccion (perfil_id);

create table public.intentos_evaluacion (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  evaluacion_id uuid not null references public.evaluaciones (id) on delete restrict,
  numero int not null check (numero > 0),
  puntaje int not null check (puntaje between 0 and 100),
  aprobado boolean not null,
  entregado_en timestamptz not null default now(),
  unique (perfil_id, evaluacion_id, numero)
);

create table public.respuestas_intento (
  id uuid primary key default gen_random_uuid(),
  intento_id uuid not null references public.intentos_evaluacion (id) on delete cascade,
  pregunta_id uuid not null references public.preguntas (id) on delete restrict,
  opciones_elegidas uuid[] not null,
  correcta boolean not null,
  unique (intento_id, pregunta_id)
);

create table public.certificados (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete restrict,
  curso_id uuid not null references public.cursos (id) on delete restrict,
  intento_id uuid not null references public.intentos_evaluacion (id) on delete restrict,
  codigo_verificacion text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  nombre_en_certificado text not null,               -- congelado al emitir
  titulo_curso text not null,                        -- congelado al emitir
  emitido_en timestamptz not null default now(),
  archivo_ruta text,                                 -- el PDF se puede regenerar sin crear otro certificado
  unique (perfil_id, curso_id)
);

-- Lecturas de catálogo para alumnos con acceso
create policy evaluaciones_alumno on public.evaluaciones for select to authenticated
  using (public.tiene_acceso(curso_id));
create policy preguntas_alumno on public.preguntas for select to authenticated
  using (public.tiene_acceso((select curso_id from public.evaluaciones where id = evaluacion_id)));
create policy opciones_alumno on public.opciones for select to authenticated
  using (public.tiene_acceso((select e.curso_id from public.preguntas p join public.evaluaciones e on e.id = p.evaluacion_id where p.id = pregunta_id)));
create policy recursos_alumno on public.recursos_leccion for select to authenticated
  using (public.tiene_acceso(public.curso_de_leccion(leccion_id)));

-- RLS
alter table public.accesos_curso enable row level security;
alter table public.progreso_leccion enable row level security;
alter table public.intentos_evaluacion enable row level security;
alter table public.respuestas_intento enable row level security;
alter table public.certificados enable row level security;

-- Accesos, intentos y certificados: cada quien lee los suyos; escribe solo el servidor.
create policy accesos_lee on public.accesos_curso for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());
create policy intentos_lee on public.intentos_evaluacion for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());
create policy respuestas_lee on public.respuestas_intento for select to authenticated
  using (exists (select 1 from public.intentos_evaluacion i where i.id = intento_id and (i.perfil_id = auth.uid() or public.es_admin())));
create policy certificados_lee on public.certificados for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());

-- Progreso: el alumno lo registra él mismo, solo en cursos a los que tiene acceso.
create policy progreso_lee on public.progreso_leccion for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());
create policy progreso_crea on public.progreso_leccion for insert to authenticated
  with check (perfil_id = auth.uid() and public.tiene_acceso(public.curso_de_leccion(leccion_id)));
create policy progreso_edita on public.progreso_leccion for update to authenticated
  using (perfil_id = auth.uid())
  with check (perfil_id = auth.uid() and public.tiene_acceso(public.curso_de_leccion(leccion_id)));
