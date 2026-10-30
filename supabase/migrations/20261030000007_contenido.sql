-- Albor · 0007 · Contenido y operación
-- Artículos, correos, consentimientos, contacto y auditoría.

create table public.articulos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  titulo text not null,
  resumen text,
  cuerpo_markdown text not null default '',
  categoria text,
  autor_id uuid references public.perfiles (id) on delete set null,
  estado text not null default 'borrador' check (estado in ('borrador','publicado')),
  publicado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index articulos_publicados_idx on public.articulos (publicado_en desc) where estado = 'publicado';
create trigger articulos_actualizado before update on public.articulos
  for each row execute function public.tocar_actualizado_en();

create table public.plantillas_correo (
  clave text primary key check (clave ~ '^[a-z_]+$'),     -- p. ej. confirmacion_compra
  asunto text not null,
  cuerpo text not null,
  actualizado_en timestamptz not null default now()
);
create trigger plantillas_actualizado before update on public.plantillas_correo
  for each row execute function public.tocar_actualizado_en();

create table public.envios_correo (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid references public.perfiles (id) on delete set null,
  plantilla_clave text not null references public.plantillas_correo (clave),
  destinatario text not null,
  clave_idempotencia text not null unique,           -- p. ej. confirmacion_compra:<orden_id>
  estado text not null default 'pendiente' check (estado in ('pendiente','enviado','fallido')),
  id_externo text,
  error text,
  creado_en timestamptz not null default now()
);

-- Consentimiento para correos promocionales: historial que solo crece.
create table public.consentimientos (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  tipo text not null check (tipo in ('promocional')),
  otorgado boolean not null,
  origen text not null,                              -- 'registro', 'cuenta', 'enlace_baja'
  creado_en timestamptz not null default now()
);
create index consentimientos_perfil_idx on public.consentimientos (perfil_id, tipo, creado_en desc);

create table public.mensajes_contacto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 2 and 120),
  correo text not null check (correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  mensaje text not null check (char_length(mensaje) between 5 and 5000),
  ip_hash text,                                      -- hash, no la IP, para limitar abuso
  leido boolean not null default false,
  creado_en timestamptz not null default now()
);

-- Auditoría: solo inserción. Ni el admin puede editar o borrar.
create table public.auditoria (
  id bigint generated always as identity primary key,
  actor_id uuid,
  accion text not null,
  entidad text not null,
  entidad_id text,
  antes jsonb,
  despues jsonb,
  creado_en timestamptz not null default now()
);
create index auditoria_entidad_idx on public.auditoria (entidad, entidad_id);

create or replace function public.bloquear_cambios_auditoria()
returns trigger language plpgsql as $$
begin
  raise exception 'auditoria_inmutable' using errcode = 'P0001';
end; $$;
create trigger auditoria_inmutable before update or delete on public.auditoria
  for each row execute function public.bloquear_cambios_auditoria();

-- Cambios de precio, estado y publicación de cursos quedan auditados automáticamente.
create or replace function public.auditar_curso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.precio_centavos is distinct from old.precio_centavos or new.estado is distinct from old.estado then
    insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
    values (auth.uid(), 'curso_actualizado', 'cursos', new.id::text,
            jsonb_build_object('precio_centavos', old.precio_centavos, 'estado', old.estado),
            jsonb_build_object('precio_centavos', new.precio_centavos, 'estado', new.estado));
  end if;
  return new;
end; $$;
create trigger cursos_auditar after update on public.cursos
  for each row execute function public.auditar_curso();

-- RLS
alter table public.articulos enable row level security;
alter table public.plantillas_correo enable row level security;
alter table public.envios_correo enable row level security;
alter table public.consentimientos enable row level security;
alter table public.mensajes_contacto enable row level security;
alter table public.auditoria enable row level security;

create policy articulos_lee on public.articulos for select to anon, authenticated
  using (estado = 'publicado' or public.es_admin());
create policy articulos_admin on public.articulos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy plantillas_admin on public.plantillas_correo for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy envios_correo_admin on public.envios_correo for select to authenticated
  using (public.es_admin());
create policy consentimientos_lee on public.consentimientos for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());
create policy consentimientos_crea on public.consentimientos for insert to authenticated
  with check (perfil_id = auth.uid());
create policy contacto_admin on public.mensajes_contacto for select to authenticated
  using (public.es_admin());
create policy contacto_admin_edita on public.mensajes_contacto for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy auditoria_admin_lee on public.auditoria for select to authenticated
  using (public.es_admin());
