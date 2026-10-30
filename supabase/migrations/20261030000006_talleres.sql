-- Albor · 0006 · Talleres en vivo
-- Talleres, reservas temporales de cupo, inscripciones, reuniones y recordatorios.

create table public.talleres (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  titulo text not null,
  descripcion text,
  inicia_en timestamptz not null,
  termina_en timestamptz not null,
  zona_horaria text not null default 'America/Guatemala',   -- zona de referencia para mostrar
  cupo int check (cupo is null or cupo > 0),                -- null = sin límite
  precio_centavos int not null default 0 check (precio_centavos >= 0),
  plataforma text not null default 'zoom' check (plataforma in ('zoom','meet')),
  estado text not null default 'borrador'
    check (estado in ('borrador','publicado','cancelado','finalizado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (termina_en > inicia_en)
);
create index talleres_inicio_idx on public.talleres (inicia_en);
create trigger talleres_actualizado before update on public.talleres
  for each row execute function public.tocar_actualizado_en();

alter table public.items_orden
  add constraint items_taller_fk foreign key (taller_id) references public.talleres (id) on delete restrict;

-- Reserva de cupo mientras el pago está pendiente. Vence sola (15 minutos por defecto).
create table public.reservas_cupo (
  id uuid primary key default gen_random_uuid(),
  taller_id uuid not null references public.talleres (id) on delete cascade,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  orden_id uuid not null unique references public.ordenes (id) on delete cascade,
  vence_en timestamptz not null,
  liberada_en timestamptz,                            -- al vencer, al confirmarse o al cancelarse
  creado_en timestamptz not null default now()
);
create index reservas_vigentes_idx on public.reservas_cupo (taller_id) where liberada_en is null;

create table public.inscripciones_taller (
  id uuid primary key default gen_random_uuid(),
  taller_id uuid not null references public.talleres (id) on delete restrict,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  item_orden_id uuid references public.items_orden (id) on delete restrict,   -- null si el taller es gratuito
  estado text not null default 'confirmada' check (estado in ('confirmada','cancelada','reembolsada')),
  creado_en timestamptz not null default now()
);
create unique index inscripcion_unica_activa on public.inscripciones_taller (taller_id, perfil_id) where estado = 'confirmada';

-- Reunión generada en Zoom o Meet. El enlace de anfitrión nunca lo leen alumnos.
create table public.reuniones (
  id uuid primary key default gen_random_uuid(),
  taller_id uuid not null unique references public.talleres (id) on delete cascade,
  proveedor text not null check (proveedor in ('zoom','meet','manual')),
  id_externo text,
  enlace_participante text not null,
  enlace_anfitrion text,
  estado text not null default 'activa' check (estado in ('activa','error','eliminada')),
  ultimo_error text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create trigger reuniones_actualizado before update on public.reuniones
  for each row execute function public.tocar_actualizado_en();

create table public.recordatorios (
  id uuid primary key default gen_random_uuid(),
  taller_id uuid not null references public.talleres (id) on delete cascade,
  minutos_antes int not null check (minutos_antes between 5 and 20160),   -- de 5 minutos a 14 días
  unique (taller_id, minutos_antes)
);

create table public.envios_recordatorio (
  id uuid primary key default gen_random_uuid(),
  recordatorio_id uuid not null references public.recordatorios (id) on delete cascade,
  inscripcion_id uuid not null references public.inscripciones_taller (id) on delete cascade,
  enviado_en timestamptz not null default now(),
  unique (recordatorio_id, inscripcion_id)            -- un recordatorio nunca se envía dos veces
);

create or replace function public.inscripto_en(p_taller uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.inscripciones_taller
                 where taller_id = p_taller and perfil_id = auth.uid() and estado = 'confirmada');
$$;

-- RLS
alter table public.talleres enable row level security;
alter table public.reservas_cupo enable row level security;
alter table public.inscripciones_taller enable row level security;
alter table public.reuniones enable row level security;
alter table public.recordatorios enable row level security;
alter table public.envios_recordatorio enable row level security;

create policy talleres_lee on public.talleres for select to anon, authenticated
  using (estado in ('publicado','cancelado','finalizado') or public.es_admin());
create policy talleres_admin on public.talleres for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy reservas_lee on public.reservas_cupo for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());
create policy inscripciones_lee on public.inscripciones_taller for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());

create policy reuniones_lee on public.reuniones for select to authenticated
  using (public.inscripto_en(taller_id) or public.es_admin());
-- El enlace de anfitrión no es legible por clientes, ni siquiera inscriptos.
revoke select on public.reuniones from anon, authenticated;
grant select (id, taller_id, proveedor, enlace_participante, estado) on public.reuniones to authenticated;

create policy recordatorios_admin on public.recordatorios for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy envios_rec_admin on public.envios_recordatorio for select to authenticated
  using (public.es_admin());
