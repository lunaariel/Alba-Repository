-- Albor · 0002 · Identidad
-- Perfiles (1 a 1 con auth.users), roles y configuración de la academia.

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre_completo text not null check (char_length(btrim(nombre_completo)) between 2 and 120),
  pais text check (pais is null or char_length(pais) = 2),            -- ISO 3166-1 alfa-2
  zona_horaria text not null default 'America/Guatemala',
  confirma_mayoria_edad boolean not null check (confirma_mayoria_edad),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger perfiles_actualizado before update on public.perfiles
  for each row execute function public.tocar_actualizado_en();

create table public.roles_usuario (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  rol text not null check (rol in ('alumno', 'admin')),
  creado_en timestamptz not null default now(),
  unique (perfil_id, rol)
);

-- ¿La persona que hace la solicitud es admin? Se lee siempre de la tabla, nunca del token.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.roles_usuario
    where perfil_id = auth.uid() and rol = 'admin'
  );
$$;

-- Configuración de marca y negocio: una sola fila (id = true).
create table public.configuracion_academia (
  id boolean primary key default true check (id),
  nombre text not null default 'Albor',
  correo_contacto text,
  whatsapp text,
  moneda text not null default 'USD' check (moneda = 'USD'),
  zona_horaria text not null default 'America/Guatemala',
  textos jsonb not null default '{}'::jsonb,       -- textos institucionales editables
  actualizado_en timestamptz not null default now()
);
create trigger configuracion_actualizado before update on public.configuracion_academia
  for each row execute function public.tocar_actualizado_en();
insert into public.configuracion_academia (id) values (true);

-- RLS
alter table public.perfiles enable row level security;
alter table public.roles_usuario enable row level security;
alter table public.configuracion_academia enable row level security;

create policy perfiles_propio_lee on public.perfiles
  for select to authenticated using (id = auth.uid() or public.es_admin());
create policy perfiles_propio_crea on public.perfiles
  for insert to authenticated with check (id = auth.uid());
create policy perfiles_propio_edita on public.perfiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Los roles solo se leen (cada uno el suyo; admin todos). Escribe únicamente el servidor.
create policy roles_lee on public.roles_usuario
  for select to authenticated using (perfil_id = auth.uid() or public.es_admin());

create policy configuracion_lee on public.configuracion_academia
  for select to anon, authenticated using (true);
create policy configuracion_admin_edita on public.configuracion_academia
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

-- Toda cuenta nueva recibe el rol alumno.
create or replace function public.asignar_rol_alumno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.roles_usuario (perfil_id, rol) values (new.id, 'alumno')
  on conflict do nothing;
  return new;
end;
$$;
create trigger perfiles_rol_alumno after insert on public.perfiles
  for each row execute function public.asignar_rol_alumno();
