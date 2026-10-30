-- Albor · 0005 · Comercio
-- Órdenes, pagos, eventos de pasarela, reembolsos, cupones y documentos fiscales.
-- Importes en centavos de USD. Nunca se guardan datos de tarjetas.

create table public.cupones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo = upper(btrim(codigo)) and codigo ~ '^[A-Z0-9_-]{3,32}$'),
  tipo text not null check (tipo in ('porcentaje','monto')),
  valor int not null check (valor > 0),
  vigente_desde timestamptz,
  vigente_hasta timestamptz,
  usos_maximos int check (usos_maximos is null or usos_maximos > 0),
  usos int not null default 0 check (usos >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  check (tipo <> 'porcentaje' or valor <= 100)
);

create table public.ordenes (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid references public.perfiles (id) on delete set null,   -- se desvincula si la persona borra su cuenta
  cupon_id uuid references public.cupones (id),
  subtotal_centavos int not null check (subtotal_centavos >= 0),
  descuento_centavos int not null default 0 check (descuento_centavos >= 0),
  total_centavos int not null check (total_centavos >= 0),
  moneda text not null default 'USD' check (moneda = 'USD'),
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aprobada','rechazada','cancelada','vencida','reembolsada','contracargo')),
  -- Evita dos órdenes pendientes para el mismo producto: clave del producto (curso:<id> o taller:<id>).
  clave_producto text not null,
  aprobada_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (total_centavos = subtotal_centavos - descuento_centavos)
);
create unique index ordenes_una_pendiente on public.ordenes (perfil_id, clave_producto) where estado = 'pendiente';
create index ordenes_perfil_idx on public.ordenes (perfil_id);
create index ordenes_estado_idx on public.ordenes (estado);
create trigger ordenes_actualizado before update on public.ordenes
  for each row execute function public.tocar_actualizado_en();

create table public.items_orden (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes (id) on delete restrict,
  curso_id uuid references public.cursos (id) on delete restrict,
  taller_id uuid,                                    -- FK en 0006 (talleres)
  descripcion text not null,                         -- congelada al crear la orden
  precio_centavos int not null check (precio_centavos >= 0),
  check ((curso_id is not null) <> (taller_id is not null))
);
create index items_orden_orden_idx on public.items_orden (orden_id);

alter table public.accesos_curso
  add constraint accesos_item_orden_fk foreign key (item_orden_id) references public.items_orden (id) on delete restrict;

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes (id) on delete restrict,
  proveedor text not null,                           -- 'simulado', y el definitivo en la Fase 6
  id_externo text not null,
  estado text not null check (estado in ('pendiente','aprobado','rechazado','cancelado','reembolsado','contracargo')),
  monto_centavos int not null check (monto_centavos >= 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (proveedor, id_externo)
);
create index pagos_orden_idx on public.pagos (orden_id);
create trigger pagos_actualizado before update on public.pagos
  for each row execute function public.tocar_actualizado_en();

-- Cada notificación de la pasarela se guarda una sola vez: un reintento se reconoce y se ignora.
create table public.eventos_pasarela (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  id_evento text not null,
  tipo text not null,
  cuerpo jsonb not null,
  resultado text,                                    -- 'procesado', 'ignorado: <motivo>', 'error: <detalle>'
  recibido_en timestamptz not null default now(),
  unique (proveedor, id_evento)
);

create table public.reembolsos (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references public.pagos (id) on delete restrict,
  monto_centavos int not null check (monto_centavos > 0),
  motivo text not null,
  estado text not null default 'solicitado' check (estado in ('solicitado','completado','fallido')),
  iniciado_por uuid references public.perfiles (id) on delete set null,
  id_externo text,
  creado_en timestamptz not null default now()
);

-- El reembolso no puede superar lo pagado.
create or replace function public.validar_monto_reembolso()
returns trigger language plpgsql as $$
declare v_pagado int; v_previos int;
begin
  select monto_centavos into v_pagado from public.pagos where id = new.pago_id;
  select coalesce(sum(monto_centavos), 0) into v_previos from public.reembolsos
    where pago_id = new.pago_id and estado <> 'fallido' and id <> new.id;
  if v_previos + new.monto_centavos > v_pagado then
    raise exception 'reembolso_excede_pago' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger reembolsos_validar before insert or update on public.reembolsos
  for each row execute function public.validar_monto_reembolso();

create table public.documentos_fiscales (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes (id) on delete restrict,
  tipo text not null check (tipo in ('recibo','factura_fel')),   -- un recibo NO es factura fiscal
  estado text not null default 'pendiente' check (estado in ('pendiente','emitido','fallido','anulado')),
  serie text,
  numero text,
  certificador text,                                 -- certificador FEL, cuando exista
  archivo_ruta text,
  intentos int not null default 0,
  ultimo_error text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (orden_id, tipo)
);
create trigger documentos_actualizado before update on public.documentos_fiscales
  for each row execute function public.tocar_actualizado_en();

-- RLS: alumnos leen solo lo suyo; nadie escribe desde el navegador (lo hace el servidor).
alter table public.cupones enable row level security;
alter table public.ordenes enable row level security;
alter table public.items_orden enable row level security;
alter table public.pagos enable row level security;
alter table public.eventos_pasarela enable row level security;
alter table public.reembolsos enable row level security;
alter table public.documentos_fiscales enable row level security;

create policy cupones_admin on public.cupones for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy ordenes_lee on public.ordenes for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());
create policy items_lee on public.items_orden for select to authenticated
  using (exists (select 1 from public.ordenes o where o.id = orden_id and (o.perfil_id = auth.uid() or public.es_admin())));
create policy pagos_lee on public.pagos for select to authenticated
  using (exists (select 1 from public.ordenes o where o.id = orden_id and (o.perfil_id = auth.uid() or public.es_admin())));
create policy eventos_admin_lee on public.eventos_pasarela for select to authenticated
  using (public.es_admin());
create policy reembolsos_lee on public.reembolsos for select to authenticated
  using (public.es_admin() or exists (
    select 1 from public.pagos p join public.ordenes o on o.id = p.orden_id
    where p.id = pago_id and o.perfil_id = auth.uid()));
create policy documentos_lee on public.documentos_fiscales for select to authenticated
  using (exists (select 1 from public.ordenes o where o.id = orden_id and (o.perfil_id = auth.uid() or public.es_admin())));
