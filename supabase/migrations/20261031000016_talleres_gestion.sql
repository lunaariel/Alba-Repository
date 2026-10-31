-- Albor · 0016 · Gestión de talleres y eventos (Fase 5, entrega 3)
-- Panel de talleres, inscripción gratuita, cortesía, asistencia, duplicar, reprogramar, cancelar,
-- enlace visible desde N horas antes (24 por defecto), recordatorios idempotentes ante reprogramaciones,
-- notificaciones registradas (sin proveedor de correo: quedan pendientes) e incidencias de pago.
-- Corrige el pago confirmado con la reserva vencida y sin lugar: la orden pasa a «requiere reembolso».
-- No borra datos: solo agrega columnas, tablas, estados y funciones.

-- ============================================================ 1. Estructura
alter table public.talleres drop constraint if exists talleres_estado_check;
alter table public.talleres add constraint talleres_estado_check
  check (estado in ('borrador','publicado','cancelado','finalizado','archivado'));
alter table public.talleres
  add column duplicado_de uuid references public.talleres (id) on delete set null,
  add column enlace_visible_horas int not null default 24 check (enlace_visible_horas between 0 and 168),
  add column motivo_cancelacion text,
  add column cancelado_en timestamptz,
  add column cancelado_por uuid;

alter table public.inscripciones_taller drop constraint if exists inscripciones_taller_estado_check;
alter table public.inscripciones_taller add constraint inscripciones_taller_estado_check
  check (estado in ('confirmada','cancelada','reembolsada','reembolso_pendiente'));
alter table public.inscripciones_taller
  add column origen text not null default 'compra' check (origen in ('compra','gratuita','cortesia')),
  add column asistio boolean,
  add column motivo text,
  add column cancelada_en timestamptz;
update public.inscripciones_taller set origen = 'gratuita' where item_orden_id is null;

alter table public.ordenes drop constraint if exists ordenes_estado_check;
alter table public.ordenes add constraint ordenes_estado_check
  check (estado in ('pendiente','aprobada','rechazada','cancelada','vencida','reembolsada','contracargo','requiere_reembolso'));

-- Reprogramaciones: cada cambio de fecha con inscriptos, con su motivo y responsable.
create table public.reprogramaciones_taller (
  id uuid primary key default gen_random_uuid(),
  taller_id uuid not null references public.talleres (id) on delete restrict,
  inicia_antes timestamptz not null, termina_antes timestamptz not null,
  inicia_despues timestamptz not null, termina_despues timestamptz not null,
  inscriptos int not null,
  motivo text not null check (char_length(btrim(motivo)) >= 10),
  responsable uuid,
  creado_en timestamptz not null default now()
);

-- Recordatorios: un envío por recordatorio, inscripción y fecha de inicio. Una reprogramación
-- permite recordar la fecha nueva sin repetir los de la anterior.
alter table public.envios_recordatorio add column para_inicio timestamptz;
update public.envios_recordatorio e set para_inicio = t.inicia_en
  from public.recordatorios r join public.talleres t on t.id = r.taller_id where r.id = e.recordatorio_id;
alter table public.envios_recordatorio alter column para_inicio set not null;
alter table public.envios_recordatorio drop constraint if exists envios_recordatorio_recordatorio_id_inscripcion_id_key;
alter table public.envios_recordatorio add constraint envios_recordatorio_unico unique (recordatorio_id, inscripcion_id, para_inicio);
-- No hay proveedor de correo: el envío es un registro interno, no un correo enviado.
alter table public.envios_recordatorio rename column enviado_en to registrado_en;

-- Notificaciones: se registran con clave única. Sin proveedor de correo quedan «pendiente»;
-- «enviada» solo la marcará el proveedor real (Fase 6).
create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  taller_id uuid references public.talleres (id) on delete cascade,
  inscripcion_id uuid references public.inscripciones_taller (id) on delete cascade,
  tipo text not null check (tipo in ('inscripcion_taller','recordatorio_taller','taller_reprogramado','taller_cancelado','inscripcion_cancelada')),
  clave text not null unique,
  para_inicio timestamptz,
  estado text not null default 'pendiente' check (estado in ('pendiente','enviada','fallida','descartada')),
  motivo_descarte text,
  detalle jsonb not null default '{}',
  proveedor text,
  creado_en timestamptz not null default now(),
  enviada_en timestamptz
);
create index notificaciones_pendientes_idx on public.notificaciones (estado, creado_en);

-- Incidencias que la administradora debe atender (pagos sin lugar, reembolsos por cancelación).
create table public.incidencias (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('pago_sin_cupo','reembolso_por_cancelacion')),
  estado text not null default 'abierta' check (estado in ('abierta','en_revision','resuelta')),
  orden_id uuid references public.ordenes (id) on delete restrict,
  taller_id uuid references public.talleres (id) on delete restrict,
  perfil_id uuid references public.perfiles (id) on delete set null,
  inscripcion_id uuid references public.inscripciones_taller (id) on delete restrict,
  detalle jsonb not null default '{}',
  nota text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index incidencia_unica on public.incidencias (tipo, orden_id) where orden_id is not null;

alter table public.reprogramaciones_taller enable row level security;
alter table public.notificaciones enable row level security;
alter table public.incidencias enable row level security;
create policy reprogramaciones_admin on public.reprogramaciones_taller for select to authenticated using (public.es_admin());
create policy notificaciones_lee on public.notificaciones for select to authenticated using (perfil_id = auth.uid() or public.es_admin());
create policy incidencias_admin on public.incidencias for select to authenticated using (public.es_admin());

-- Quien está o estuvo inscripto sigue viendo su taller aunque se archive.
drop policy talleres_lee on public.talleres;
create policy talleres_lee on public.talleres for select to anon, authenticated
  using (estado in ('publicado','cancelado','finalizado') or public.es_admin()
         or exists (select 1 from public.inscripciones_taller i where i.taller_id = talleres.id and i.perfil_id = auth.uid()));

-- El enlace de participante deja de leerse directo: lo entrega enlace_taller() con la regla de horario.
revoke select on public.reuniones from authenticated;
grant select (id, taller_id, proveedor, estado) on public.reuniones to authenticated;
create policy reuniones_admin on public.reuniones for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Actividad: inscripciones, recordatorios configurados y reuniones.
create trigger inscripciones_auditar after insert or update on public.inscripciones_taller
  for each row execute function public.auditar_cambio('inscripcion', '{taller_id,perfil_id,estado,origen,asistio}');
create trigger recordatorios_auditar after insert or delete on public.recordatorios
  for each row execute function public.auditar_cambio('recordatorio', '{taller_id,minutos_antes}');
create trigger reuniones_auditar after insert or update on public.reuniones
  for each row execute function public.auditar_cambio('reunion', '{taller_id,proveedor,estado}');

-- ============================================================ 2. Reglas sobre la tabla de talleres
create or replace function public.ocupados_taller(p_taller uuid)
returns int language sql stable security definer set search_path = public as $$
  select ((select count(*) from public.inscripciones_taller where taller_id = p_taller and estado = 'confirmada')
        + (select count(*) from public.reservas_cupo where taller_id = p_taller and liberada_en is null and vence_en > now()))::int;
$$;
revoke execute on function public.ocupados_taller(uuid) from public, anon;

create or replace function public.faltantes_taller(t public.talleres)
returns text[] language plpgsql stable set search_path = public as $$
declare f text[] := '{}';
begin
  if char_length(btrim(coalesce(t.titulo, ''))) < 3 then f := array_append(f, 'titulo'); end if;
  if char_length(btrim(coalesce(t.descripcion, ''))) < 10 then f := array_append(f, 'descripcion'); end if;
  if t.inicia_en <= now() then f := array_append(f, 'fecha_pasada'); end if;
  if t.termina_en <= t.inicia_en or t.termina_en - t.inicia_en > interval '12 hours' then f := array_append(f, 'duracion'); end if;
  return f;
end; $$;

create or replace function public.validar_taller()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_op text := coalesce(current_setting('albor.operacion_taller', true), ''); v_falta text[]; v_ocupados int;
begin
  if not exists (select 1 from pg_timezone_names where name = new.zona_horaria) then
    raise exception 'zona_invalida' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if new.estado not in ('borrador') and v_op <> 'servidor' and auth.uid() is not null then
      raise exception 'taller_nace_borrador' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Publicar: datos completos y fecha futura.
  if new.estado = 'publicado' and old.estado is distinct from 'publicado' then
    if old.estado not in ('borrador') then raise exception 'transicion_invalida' using errcode = 'P0001'; end if;
    v_falta := public.faltantes_taller(new);
    if array_length(v_falta, 1) > 0 then
      raise exception 'taller_incompleto: %', array_to_string(v_falta, ',') using errcode = 'P0001';
    end if;
  end if;
  -- Cancelar solo por cancelar_taller (con motivo); finalizar solo por el proceso del servidor.
  if new.estado = 'cancelado' and old.estado <> 'cancelado' and v_op <> 'cancelar' then
    raise exception 'usar_cancelar_taller' using errcode = 'P0001';
  end if;
  if new.estado = 'finalizado' and old.estado <> 'finalizado' and v_op <> 'servidor' and auth.uid() is not null then
    raise exception 'transicion_invalida' using errcode = 'P0001';
  end if;
  if old.estado = 'cancelado' and new.estado not in ('cancelado','archivado') then raise exception 'transicion_invalida' using errcode = 'P0001'; end if;
  if old.estado = 'archivado' and new.estado <> 'archivado' then raise exception 'transicion_invalida' using errcode = 'P0001'; end if;
  -- Archivar: solo lo que ya terminó, se canceló o nunca se publicó.
  if new.estado = 'archivado' and old.estado <> 'archivado'
     and not (old.estado in ('cancelado','finalizado','borrador') or old.termina_en < now()) then
    raise exception 'archivar_taller_vigente' using errcode = 'P0001';
  end if;
  -- Volver a borrador: solo sin inscripciones, reservas ni órdenes.
  if new.estado = 'borrador' and old.estado <> 'borrador'
     and (exists (select 1 from public.inscripciones_taller where taller_id = old.id)
          or exists (select 1 from public.items_orden where taller_id = old.id)) then
    raise exception 'taller_con_inscriptos' using errcode = 'P0001';
  end if;
  -- Lo cancelado o archivado no cambia de fecha, cupo ni precio.
  if old.estado in ('cancelado','archivado','finalizado')
     and (new.inicia_en, new.termina_en, new.cupo, new.precio_centavos) is distinct from (old.inicia_en, old.termina_en, old.cupo, old.precio_centavos) then
    raise exception 'taller_cerrado' using errcode = 'P0001';
  end if;
  -- Con inscriptos o reservas, la fecha solo cambia por reprogramar_taller (motivo, aviso, recordatorios).
  if (new.inicia_en, new.termina_en) is distinct from (old.inicia_en, old.termina_en) and v_op <> 'reprogramar'
     and (exists (select 1 from public.inscripciones_taller where taller_id = old.id and estado = 'confirmada')
          or exists (select 1 from public.reservas_cupo where taller_id = old.id and liberada_en is null and vence_en > now())) then
    raise exception 'usar_reprogramar' using errcode = 'P0001';
  end if;
  if new.estado = 'publicado' and old.estado = 'publicado' and (new.inicia_en, new.termina_en) is distinct from (old.inicia_en, old.termina_en) then
    v_falta := public.faltantes_taller(new);
    if 'fecha_pasada' = any (v_falta) or 'duracion' = any (v_falta) then
      raise exception 'taller_incompleto: %', array_to_string(v_falta, ',') using errcode = 'P0001';
    end if;
  end if;
  -- El cupo nunca baja de los lugares ocupados.
  if new.cupo is not null and new.cupo is distinct from old.cupo then
    v_ocupados := public.ocupados_taller(old.id);
    if new.cupo < v_ocupados then raise exception 'cupo_menor_que_ocupados: %', v_ocupados using errcode = 'P0001'; end if;
  end if;
  return new;
end; $$;
create trigger talleres_validar before insert or update on public.talleres
  for each row execute function public.validar_taller();

-- Un taller con inscripciones, reservas u órdenes no se elimina: se cancela o se archiva.
create or replace function public.proteger_taller()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.inscripciones_taller where taller_id = old.id)
     or exists (select 1 from public.reservas_cupo where taller_id = old.id)
     or exists (select 1 from public.items_orden where taller_id = old.id) then
    raise exception 'taller_con_historial' using errcode = 'P0001';
  end if;
  return old;
end; $$;
create trigger talleres_proteger before delete on public.talleres
  for each row execute function public.proteger_taller();

-- Recordatorios por defecto: 24 horas y 1 hora antes.
create or replace function public.recordatorios_por_defecto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('albor.operacion_taller', true), '') <> 'duplicar' then
    insert into public.recordatorios (taller_id, minutos_antes) values (new.id, 1440), (new.id, 60) on conflict do nothing;
  end if;
  return new;
end; $$;
create trigger talleres_recordatorios after insert on public.talleres
  for each row execute function public.recordatorios_por_defecto();

-- ============================================================ 3. Inscripciones
create or replace function public.registrar_notificacion(
  p_perfil uuid, p_taller uuid, p_inscripcion uuid, p_tipo text, p_clave text, p_para_inicio timestamptz default null, p_detalle jsonb default '{}'
) returns void language sql security definer set search_path = public as $$
  insert into public.notificaciones (perfil_id, taller_id, inscripcion_id, tipo, clave, para_inicio, detalle)
  values (p_perfil, p_taller, p_inscripcion, p_tipo, p_clave, p_para_inicio, p_detalle)
  on conflict (clave) do nothing;
$$;
revoke execute on function public.registrar_notificacion(uuid, uuid, uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;

-- Inscripción con bloqueo de la fila del taller: dos pedidos por el último lugar se atienden en orden.
create or replace function public.inscribir_en_taller(p_perfil uuid, p_taller uuid, p_origen text, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_t public.talleres%rowtype; v_id uuid;
begin
  select * into v_t from public.talleres where id = p_taller for update;
  if v_t.id is null or v_t.estado <> 'publicado' or v_t.inicia_en <= now() then
    raise exception 'taller_no_disponible' using errcode = 'P0001';
  end if;
  if p_origen = 'gratuita' and v_t.precio_centavos > 0 then raise exception 'taller_pago' using errcode = 'P0001'; end if;
  if exists (select 1 from public.inscripciones_taller where taller_id = p_taller and perfil_id = p_perfil and estado = 'confirmada') then
    raise exception 'ya_inscripto' using errcode = 'P0001';
  end if;
  if v_t.cupo is not null and public.ocupados_taller(p_taller) >= v_t.cupo then raise exception 'sin_cupo' using errcode = 'P0001'; end if;
  insert into public.inscripciones_taller (taller_id, perfil_id, origen, motivo)
  values (p_taller, p_perfil, p_origen, p_motivo) returning id into v_id;
  perform public.registrar_notificacion(p_perfil, p_taller, v_id, 'inscripcion_taller', 'inscripcion:' || v_id);
  return v_id;
end; $$;
revoke execute on function public.inscribir_en_taller(uuid, uuid, text, text) from public, anon, authenticated;

-- La alumna se inscribe a un taller gratuito con su propia sesión.
create or replace function public.inscribirme_gratis(p_taller uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sin_sesion' using errcode = '42501'; end if;
  return public.inscribir_en_taller(auth.uid(), p_taller, 'gratuita');
end; $$;
revoke execute on function public.inscribirme_gratis(uuid) from public, anon;
grant execute on function public.inscribirme_gratis(uuid) to authenticated;

-- Cancelar la propia inscripción: solo gratuitas o de cortesía, hasta el inicio. Las pagas siguen la
-- política de reembolsos (Fase 6). Libera el lugar.
create or replace function public.cancelar_mi_inscripcion(p_taller uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.talleres%rowtype; v_i public.inscripciones_taller%rowtype;
begin
  if auth.uid() is null then raise exception 'sin_sesion' using errcode = '42501'; end if;
  select * into v_t from public.talleres where id = p_taller for update;
  select * into v_i from public.inscripciones_taller where taller_id = p_taller and perfil_id = auth.uid() and estado = 'confirmada' for update;
  if v_i.id is null then raise exception 'sin_inscripcion' using errcode = 'P0001'; end if;
  if v_i.origen = 'compra' then raise exception 'inscripcion_paga' using errcode = 'P0001'; end if;
  if v_t.inicia_en <= now() then raise exception 'taller_ya_empezo' using errcode = 'P0001'; end if;
  update public.inscripciones_taller set estado = 'cancelada', cancelada_en = now() where id = v_i.id;
  update public.notificaciones set estado = 'descartada', motivo_descarte = 'inscripcion_cancelada'
   where inscripcion_id = v_i.id and estado = 'pendiente' and tipo = 'recordatorio_taller';
  perform public.registrar_notificacion(auth.uid(), p_taller, v_i.id, 'inscripcion_cancelada', 'cancelada:' || v_i.id);
end; $$;
revoke execute on function public.cancelar_mi_inscripcion(uuid) from public, anon;
grant execute on function public.cancelar_mi_inscripcion(uuid) to authenticated;

-- Cortesía: la admin inscribe a una persona registrada, con motivo. Respeta el cupo.
create or replace function public.inscribir_cortesia(p_taller uuid, p_correo text, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_perfil uuid; v_id uuid;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'motivo_requerido' using errcode = 'P0001'; end if;
  select id into v_perfil from auth.users where lower(email) = lower(btrim(p_correo));
  if v_perfil is null then raise exception 'persona_no_registrada' using errcode = 'P0001'; end if;
  v_id := public.inscribir_en_taller(v_perfil, p_taller, 'cortesia', btrim(p_motivo));
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), 'inscripcion_cortesia', 'talleres', p_taller::text, jsonb_build_object('inscripcion', v_id, 'motivo', btrim(p_motivo)));
  return v_id;
end; $$;
revoke execute on function public.inscribir_cortesia(uuid, text, text) from public, anon;
grant execute on function public.inscribir_cortesia(uuid, text, text) to authenticated;

create or replace function public.marcar_asistencia(p_inscripcion uuid, p_asistio boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_inicio timestamptz;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select t.inicia_en into v_inicio from public.inscripciones_taller i join public.talleres t on t.id = i.taller_id
   where i.id = p_inscripcion and i.estado = 'confirmada';
  if v_inicio is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  if v_inicio > now() then raise exception 'taller_no_empezo' using errcode = 'P0001'; end if;
  update public.inscripciones_taller set asistio = p_asistio where id = p_inscripcion;
end; $$;
revoke execute on function public.marcar_asistencia(uuid, boolean) from public, anon;
grant execute on function public.marcar_asistencia(uuid, boolean) to authenticated;

-- El enlace de participante: solo con inscripción confirmada, taller publicado y desde N horas antes.
create or replace function public.enlace_taller(p_taller uuid)
returns text language sql stable security definer set search_path = public as $$
  select r.enlace_participante from public.reuniones r join public.talleres t on t.id = r.taller_id
   where r.taller_id = p_taller and r.estado = 'activa' and t.estado = 'publicado'
     and now() >= t.inicia_en - make_interval(hours => t.enlace_visible_horas) and now() < t.termina_en
     and exists (select 1 from public.inscripciones_taller i where i.taller_id = p_taller and i.perfil_id = auth.uid() and i.estado = 'confirmada');
$$;
revoke execute on function public.enlace_taller(uuid) from public, anon;
grant execute on function public.enlace_taller(uuid) to authenticated;

-- Enlace cargado a mano por la admin (adaptador manual). El de anfitrión nunca es legible por clientes.
create or replace function public.guardar_reunion(p_taller uuid, p_participante text, p_anfitrion text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if coalesce(p_participante, '') !~ '^https://[^[:space:]]{4,}$' or char_length(p_participante) > 500
     or (nullif(p_anfitrion, '') is not null and (p_anfitrion !~ '^https://[^[:space:]]{4,}$' or char_length(p_anfitrion) > 500)) then
    raise exception 'enlace_invalido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.talleres where id = p_taller and estado in ('borrador','publicado')) then
    raise exception 'taller_cerrado' using errcode = 'P0001';
  end if;
  insert into public.reuniones (taller_id, proveedor, enlace_participante, enlace_anfitrion, estado)
  values (p_taller, 'manual', p_participante, nullif(p_anfitrion, ''), 'activa')
  on conflict (taller_id) do update set proveedor = 'manual', enlace_participante = excluded.enlace_participante,
    enlace_anfitrion = excluded.enlace_anfitrion, estado = 'activa', ultimo_error = null;
end; $$;
revoke execute on function public.guardar_reunion(uuid, text, text) from public, anon;
grant execute on function public.guardar_reunion(uuid, text, text) to authenticated;

-- ============================================================ 4. Duplicar, reprogramar, cancelar
create or replace function public.duplicar_taller(p_taller uuid, p_inicio timestamptz, p_fin timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_t public.talleres%rowtype; v_id uuid; v_slug text; v_n int := 1;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select * into v_t from public.talleres where id = p_taller;
  if v_t.id is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  if p_inicio is null or p_fin is null or p_inicio <= now() or p_fin <= p_inicio then raise exception 'fecha_invalida' using errcode = 'P0001'; end if;
  v_slug := left(regexp_replace(v_t.slug, '-copia(-[0-9]+)?$', ''), 50) || '-copia';
  while exists (select 1 from public.talleres where slug = v_slug || case when v_n = 1 then '' else '-' || v_n end) loop v_n := v_n + 1; end loop;
  v_slug := v_slug || case when v_n = 1 then '' else '-' || v_n end;
  perform set_config('albor.operacion_taller', 'duplicar', true);
  insert into public.talleres (slug, titulo, descripcion, inicia_en, termina_en, zona_horaria, cupo, precio_centavos, plataforma,
                               estado, duplicado_de, enlace_visible_horas)
  values (v_slug, v_t.titulo, v_t.descripcion, p_inicio, p_fin, v_t.zona_horaria, v_t.cupo, v_t.precio_centavos, v_t.plataforma,
          'borrador', v_t.id, v_t.enlace_visible_horas)
  returning id into v_id;
  insert into public.recordatorios (taller_id, minutos_antes) select v_id, minutos_antes from public.recordatorios where taller_id = p_taller;
  perform set_config('albor.operacion_taller', '', true);
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), 'taller_duplicado', 'talleres', v_id::text, jsonb_build_object('origen', p_taller, 'titulo', v_t.titulo));
  return v_id;
end; $$;
revoke execute on function public.duplicar_taller(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.duplicar_taller(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.reprogramar_taller(p_taller uuid, p_inicio timestamptz, p_fin timestamptz, p_motivo text)
returns int language plpgsql security definer set search_path = public as $$
declare v_t public.talleres%rowtype; v_n int; v_i record;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select * into v_t from public.talleres where id = p_taller for update;
  if v_t.id is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  if v_t.estado <> 'publicado' then raise exception 'taller_no_publicado' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'motivo_requerido' using errcode = 'P0001'; end if;
  if p_inicio is null or p_fin is null or p_inicio <= now() or p_fin <= p_inicio then raise exception 'fecha_invalida' using errcode = 'P0001'; end if;
  if (p_inicio, p_fin) = (v_t.inicia_en, v_t.termina_en) then raise exception 'sin_cambios' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.inscripciones_taller where taller_id = p_taller and estado = 'confirmada';
  perform set_config('albor.operacion_taller', 'reprogramar', true);
  update public.talleres set inicia_en = p_inicio, termina_en = p_fin where id = p_taller;
  perform set_config('albor.operacion_taller', '', true);
  insert into public.reprogramaciones_taller (taller_id, inicia_antes, termina_antes, inicia_despues, termina_despues, inscriptos, motivo, responsable)
  values (p_taller, v_t.inicia_en, v_t.termina_en, p_inicio, p_fin, v_n, btrim(p_motivo), auth.uid());
  -- Los recordatorios pendientes de la fecha anterior no se envían; los nuevos se calculan con la fecha nueva.
  update public.notificaciones set estado = 'descartada', motivo_descarte = 'reprogramado'
   where taller_id = p_taller and tipo = 'recordatorio_taller' and estado = 'pendiente' and para_inicio = v_t.inicia_en;
  for v_i in select id, perfil_id from public.inscripciones_taller where taller_id = p_taller and estado = 'confirmada' loop
    perform public.registrar_notificacion(v_i.perfil_id, p_taller, v_i.id, 'taller_reprogramado',
      'reprogramado:' || v_i.id || ':' || extract(epoch from p_inicio)::bigint, p_inicio,
      jsonb_build_object('inicia_antes', v_t.inicia_en, 'inicia_despues', p_inicio));
  end loop;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (auth.uid(), 'taller_reprogramado', 'talleres', p_taller::text,
          jsonb_build_object('inicia_en', v_t.inicia_en, 'termina_en', v_t.termina_en),
          jsonb_build_object('inicia_en', p_inicio, 'termina_en', p_fin, 'motivo', btrim(p_motivo), 'inscriptos', v_n));
  return v_n;
end; $$;
revoke execute on function public.reprogramar_taller(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.reprogramar_taller(uuid, timestamptz, timestamptz, text) to authenticated;

-- Cancelar: todo o nada. Reservas liberadas y órdenes pendientes canceladas; inscripciones pagas en
-- «reembolso pendiente» (con incidencia), gratuitas y de cortesía canceladas; avisos registrados.
create or replace function public.cancelar_taller(p_taller uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t public.talleres%rowtype; v_i record; v_pagas int := 0; v_otras int := 0; v_reservas int;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select * into v_t from public.talleres where id = p_taller for update;
  if v_t.id is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  if v_t.estado not in ('publicado','borrador') then raise exception 'transicion_invalida' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'motivo_requerido' using errcode = 'P0001'; end if;
  perform set_config('albor.operacion_taller', 'cancelar', true);
  update public.talleres set estado = 'cancelado', motivo_cancelacion = btrim(p_motivo), cancelado_en = now(), cancelado_por = auth.uid()
   where id = p_taller;
  perform set_config('albor.operacion_taller', '', true);
  with liberadas as (
    update public.reservas_cupo set liberada_en = now() where taller_id = p_taller and liberada_en is null returning orden_id
  )
  update public.ordenes o set estado = 'cancelada' from liberadas l where o.id = l.orden_id and o.estado = 'pendiente';
  get diagnostics v_reservas = row_count;
  for v_i in select i.*, it.orden_id from public.inscripciones_taller i left join public.items_orden it on it.id = i.item_orden_id
              where i.taller_id = p_taller and i.estado = 'confirmada' for update of i loop
    if v_i.item_orden_id is not null then
      update public.inscripciones_taller set estado = 'reembolso_pendiente', cancelada_en = now() where id = v_i.id;
      insert into public.incidencias (tipo, orden_id, taller_id, perfil_id, inscripcion_id, detalle)
      values ('reembolso_por_cancelacion', v_i.orden_id, p_taller, v_i.perfil_id, v_i.id, jsonb_build_object('motivo', btrim(p_motivo)))
      on conflict do nothing;
      v_pagas := v_pagas + 1;
    else
      update public.inscripciones_taller set estado = 'cancelada', cancelada_en = now() where id = v_i.id;
      v_otras := v_otras + 1;
    end if;
    perform public.registrar_notificacion(v_i.perfil_id, p_taller, v_i.id, 'taller_cancelado', 'cancelado:' || v_i.id, null,
      jsonb_build_object('motivo', btrim(p_motivo)));
  end loop;
  update public.notificaciones set estado = 'descartada', motivo_descarte = 'taller_cancelado'
   where taller_id = p_taller and tipo = 'recordatorio_taller' and estado = 'pendiente';
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), 'taller_cancelado', 'talleres', p_taller::text,
          jsonb_build_object('motivo', btrim(p_motivo), 'reembolsos_pendientes', v_pagas, 'inscripciones_canceladas', v_otras, 'reservas_liberadas', v_reservas));
  return jsonb_build_object('reembolsos_pendientes', v_pagas, 'inscripciones_canceladas', v_otras, 'reservas_liberadas', v_reservas);
end; $$;
revoke execute on function public.cancelar_taller(uuid, text) from public, anon;
grant execute on function public.cancelar_taller(uuid, text) to authenticated;

create or replace function public.anotar_incidencia(p_incidencia uuid, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_nota, ''))) < 5 then raise exception 'nota_requerida' using errcode = 'P0001'; end if;
  -- Ninguna incidencia de pago se da por resuelta sin la confirmación del reembolso por la pasarela (Fase 6).
  update public.incidencias set nota = btrim(p_nota), estado = 'en_revision', actualizado_en = now() where id = p_incidencia;
  if not found then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), 'incidencia_anotada', 'incidencias', p_incidencia::text, jsonb_build_object('nota', btrim(p_nota)));
end; $$;
revoke execute on function public.anotar_incidencia(uuid, text) from public, anon;
grant execute on function public.anotar_incidencia(uuid, text) to authenticated;

-- ============================================================ 5. Procesos programados (servidor)
-- Recordatorios vencidos: uno por recordatorio, inscripción y fecha de inicio. Correr dos veces, o en
-- paralelo, no duplica (clave única). Sin enlace activo o con el taller empezado, no se recuerda.
create or replace function public.procesar_recordatorios(p_ahora timestamptz default now())
returns int language plpgsql security definer set search_path = public as $$
declare v record; v_envio uuid; v_n int := 0;
begin
  for v in select rec.id as rec_id, rec.minutos_antes, i.id as insc_id, i.perfil_id, t.id as taller_id, t.inicia_en
             from public.recordatorios rec join public.talleres t on t.id = rec.taller_id
             join public.inscripciones_taller i on i.taller_id = t.id and i.estado = 'confirmada'
            where t.estado = 'publicado' and t.inicia_en > p_ahora
              and t.inicia_en - make_interval(mins => rec.minutos_antes) <= p_ahora
              and exists (select 1 from public.reuniones r where r.taller_id = t.id and r.estado = 'activa') loop
    insert into public.envios_recordatorio (recordatorio_id, inscripcion_id, para_inicio)
    values (v.rec_id, v.insc_id, v.inicia_en) on conflict do nothing returning id into v_envio;
    if v_envio is not null then
      perform public.registrar_notificacion(v.perfil_id, v.taller_id, v.insc_id, 'recordatorio_taller',
        'recordatorio:' || v.rec_id || ':' || v.insc_id || ':' || extract(epoch from v.inicia_en)::bigint, v.inicia_en,
        jsonb_build_object('minutos_antes', v.minutos_antes));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end; $$;
revoke execute on function public.procesar_recordatorios(timestamptz) from public, anon, authenticated;
grant execute on function public.procesar_recordatorios(timestamptz) to service_role;

create or replace function public.finalizar_talleres()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform set_config('albor.operacion_taller', 'servidor', true);
  update public.talleres set estado = 'finalizado' where estado = 'publicado' and termina_en < now();
  get diagnostics v_n = row_count;
  perform set_config('albor.operacion_taller', '', true);
  return v_n;
end; $$;
revoke execute on function public.finalizar_talleres() from public, anon, authenticated;
grant execute on function public.finalizar_talleres() to service_role;

-- ============================================================ 6. Pago confirmado sin lugar
-- Igual que 0008, salvo el caso del taller: si el pago llega sin reserva vigente y ya no hay lugar
-- (o el taller se canceló o empezó), se registra el pago, NO se inscribe, la orden pasa a
-- «requiere reembolso» y se abre una incidencia para la administradora.
create or replace function public.procesar_evento_pago(
  p_proveedor text, p_id_evento text, p_tipo text, p_cuerpo jsonb,
  p_orden uuid, p_id_pago_externo text, p_estado text, p_monto_centavos int
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_evento uuid;
  v_orden public.ordenes%rowtype;
  v_item public.items_orden%rowtype;
  v_resultado text;
  v_taller public.talleres%rowtype;
  v_sin_lugar text;
  v_tiene_taller boolean;
begin
  insert into public.eventos_pasarela (proveedor, id_evento, tipo, cuerpo)
  values (p_proveedor, p_id_evento, p_tipo, p_cuerpo)
  on conflict (proveedor, id_evento) do nothing
  returning id into v_evento;
  if v_evento is null then return 'duplicado'; end if;

  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    update public.eventos_pasarela set resultado = 'error: orden_inexistente' where id = v_evento;
    return 'error: orden_inexistente';
  end if;
  v_tiene_taller := exists (select 1 from public.items_orden where orden_id = p_orden and taller_id is not null);

  insert into public.pagos (orden_id, proveedor, id_externo, estado, monto_centavos)
  values (p_orden, p_proveedor, p_id_pago_externo, p_estado, p_monto_centavos)
  on conflict (proveedor, id_externo) do update set estado = excluded.estado, monto_centavos = excluded.monto_centavos;

  if p_estado = 'aprobado' then
    if v_orden.estado = 'aprobada' then
      v_resultado := 'ignorado: ya_aprobada';
    elsif v_orden.estado = 'requiere_reembolso' then
      v_resultado := 'ignorado: requiere_reembolso';
    elsif not (v_orden.estado in ('pendiente','vencida') or (v_orden.estado = 'cancelada' and v_tiene_taller)) then
      v_resultado := 'ignorado: orden_' || v_orden.estado;
    elsif p_monto_centavos <> v_orden.total_centavos then
      v_resultado := 'error: monto_no_coincide';
    else
      v_resultado := 'procesado';
      for v_item in select * from public.items_orden where orden_id = p_orden loop
        if v_item.curso_id is not null then
          insert into public.accesos_curso (perfil_id, curso_id, origen, item_orden_id)
          values (v_orden.perfil_id, v_item.curso_id, 'compra', v_item.id)
          on conflict (perfil_id, curso_id) where estado = 'activo' do nothing;
        else
          select * into v_taller from public.talleres where id = v_item.taller_id for update;
          v_sin_lugar := null;
          if v_taller.estado <> 'publicado' then
            v_sin_lugar := 'taller_' || v_taller.estado;
          elsif v_taller.inicia_en <= now() then
            v_sin_lugar := 'taller_empezado';
          elsif v_orden.estado = 'cancelada' then
            v_sin_lugar := 'orden_cancelada';
          elsif not exists (select 1 from public.reservas_cupo where orden_id = p_orden and liberada_en is null and vence_en > now()) then
            -- Sin una reserva vigente propia, se vuelve a comprobar el cupo antes de inscribir.
            if v_taller.cupo is not null and public.ocupados_taller(v_item.taller_id) >= v_taller.cupo then
              v_sin_lugar := 'sin_cupo';
            end if;
          end if;
          if v_sin_lugar is not null then
            v_resultado := 'requiere_reembolso';
            update public.reservas_cupo set liberada_en = now() where orden_id = p_orden and liberada_en is null;
            insert into public.incidencias (tipo, orden_id, taller_id, perfil_id, detalle)
            values ('pago_sin_cupo', p_orden, v_item.taller_id, v_orden.perfil_id,
                    jsonb_build_object('motivo', v_sin_lugar, 'monto_centavos', p_monto_centavos, 'proveedor', p_proveedor,
                                       'pago_externo', p_id_pago_externo, 'evento', p_id_evento, 'estado_orden_previo', v_orden.estado))
            on conflict do nothing;
            continue;
          end if;
          insert into public.inscripciones_taller (taller_id, perfil_id, item_orden_id, origen)
          values (v_item.taller_id, v_orden.perfil_id, v_item.id, 'compra')
          on conflict (taller_id, perfil_id) where estado = 'confirmada' do nothing;
          update public.reservas_cupo set liberada_en = now() where orden_id = p_orden and liberada_en is null;
        end if;
      end loop;
      if v_resultado = 'procesado' then
        update public.ordenes set estado = 'aprobada', aprobada_en = now() where id = p_orden;
        if v_orden.cupon_id is not null then
          update public.cupones set usos = usos + 1 where id = v_orden.cupon_id;
        end if;
        insert into public.documentos_fiscales (orden_id, tipo) values (p_orden, 'recibo')
        on conflict (orden_id, tipo) do nothing;
        perform public.registrar_notificacion(v_orden.perfil_id, i.taller_id, i.id, 'inscripcion_taller', 'inscripcion:' || i.id)
           from public.inscripciones_taller i join public.items_orden it on it.id = i.item_orden_id where it.orden_id = p_orden;
      elsif v_resultado = 'requiere_reembolso' then
        -- El pago queda registrado (tabla pagos); el reembolso se gestiona en la Fase 6 y solo se
        -- declara hecho cuando la pasarela lo confirme.
        update public.ordenes set estado = 'requiere_reembolso' where id = p_orden;
        insert into public.auditoria (accion, entidad, entidad_id, despues)
        values ('pago_requiere_reembolso', 'ordenes', p_orden::text,
                jsonb_build_object('evento', p_id_evento, 'monto_centavos', p_monto_centavos, 'estado_previo', v_orden.estado));
      end if;
    end if;

  elsif p_estado in ('rechazado','cancelado') then
    if v_orden.estado = 'pendiente' then
      update public.ordenes set estado = case p_estado when 'rechazado' then 'rechazada' else 'cancelada' end where id = p_orden;
      update public.reservas_cupo set liberada_en = now() where orden_id = p_orden and liberada_en is null;
      v_resultado := 'procesado';
    else
      v_resultado := 'ignorado: orden_' || v_orden.estado;
    end if;

  elsif p_estado in ('reembolsado','contracargo') then
    if v_orden.estado in ('aprobada','reembolsada','contracargo','requiere_reembolso') then
      update public.ordenes set estado = case p_estado when 'reembolsado' then 'reembolsada' else 'contracargo' end where id = p_orden;
      update public.accesos_curso set estado = 'revocado', revocado_en = now()
       where estado = 'activo' and item_orden_id in (select id from public.items_orden where orden_id = p_orden);
      update public.inscripciones_taller set estado = 'reembolsada'
       where estado in ('confirmada','reembolso_pendiente') and item_orden_id in (select id from public.items_orden where orden_id = p_orden);
      insert into public.auditoria (accion, entidad, entidad_id, despues)
      values ('orden_' || p_estado, 'ordenes', p_orden::text, jsonb_build_object('evento', p_id_evento));
      v_resultado := 'procesado';
    else
      v_resultado := 'ignorado: orden_' || v_orden.estado;
    end if;
  else
    v_resultado := 'ignorado: estado_pendiente';
  end if;

  update public.eventos_pasarela set resultado = v_resultado where id = v_evento;
  return v_resultado;
end; $$;
revoke execute on function public.procesar_evento_pago(text, text, text, jsonb, uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.procesar_evento_pago(text, text, text, jsonb, uuid, text, text, int) to service_role;

-- crear_orden también usa ocupados_taller (misma regla de lugares) — sin cambios de comportamiento.
