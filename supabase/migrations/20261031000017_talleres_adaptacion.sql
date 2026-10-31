-- Albor · 0017 · Adaptación de talleres a las decisiones de la maestra (Entrega 3, 31/10/2026)
-- 1) Reprogramación: respuesta expresa del alumno (pendiente, aceptada, reembolso solicitado o no asiste).
--    El silencio nunca acepta y no libera lugares.
-- 2) Cancelación voluntaria: solo inscripciones gratuitas, hasta 24 horas antes (hora del servidor).
--    Las pagas no se cancelan desde el campus hasta aprobar la política de reembolsos.
-- 3) Cortesías: no hay vía ordinaria para crear nuevas; las existentes se conservan intactas.
-- 4) Enlace de la reunión desde la inscripción confirmada (reemplaza la regla de 24 h antes).
-- 5) Grabaciones: estados, revisión, condiciones de acceso por grabación y derechos (sin video real).
-- 6) Notificaciones: leídas en el campus; aviso específico a quien no respondió una reprogramación.
-- No borra datos. Solo en entornos de prueba.

-- ============================================================ 1. Inscripciones: quién cancela y respuesta a reprogramaciones
alter table public.inscripciones_taller
  add column cancelada_por text check (cancelada_por in ('alumno','academia')),
  add column respuesta_reprogramacion text check (respuesta_reprogramacion in ('pendiente','aceptada','reembolso_solicitado','no_asiste')),
  add column respondida_en timestamptz;
-- Lo cancelado antes de esta migración lo canceló la academia, salvo lo que hizo la propia persona.
update public.inscripciones_taller i set cancelada_por = case
    when exists (select 1 from public.notificaciones n where n.inscripcion_id = i.id and n.tipo = 'inscripcion_cancelada') then 'alumno'
    else 'academia' end
 where estado in ('cancelada','reembolso_pendiente') and cancelada_por is null;

-- Lo que no indique otra cosa (cancelar_taller, por ejemplo) lo cancela la academia.
create or replace function public.marcar_quien_cancela()
returns trigger language plpgsql as $$
begin
  if new.estado in ('cancelada','reembolso_pendiente') and old.estado = 'confirmada' and new.cancelada_por is null then
    new.cancelada_por := 'academia';
  end if;
  return new;
end; $$;
create trigger inscripciones_quien_cancela before update of estado on public.inscripciones_taller
  for each row execute function public.marcar_quien_cancela();

-- Historial de respuestas: cada decisión queda registrada con el texto aceptado.
create table public.respuestas_reprogramacion (
  id uuid primary key default gen_random_uuid(),
  inscripcion_id uuid not null references public.inscripciones_taller (id) on delete restrict,
  reprogramacion_id uuid not null references public.reprogramaciones_taller (id) on delete restrict,
  perfil_id uuid not null references public.perfiles (id) on delete restrict,
  respuesta text not null check (respuesta in ('aceptada','reembolso_solicitado','no_asiste')),
  confirmacion text not null check (char_length(confirmacion) >= 10),
  inicia_antes timestamptz not null,
  inicia_despues timestamptz not null,
  creado_en timestamptz not null default now(),
  unique (inscripcion_id, reprogramacion_id)
);
alter table public.respuestas_reprogramacion enable row level security;
create policy respuestas_lee on public.respuestas_reprogramacion for select to authenticated using (perfil_id = auth.uid() or public.es_admin());

alter table public.incidencias drop constraint if exists incidencias_tipo_check;
alter table public.incidencias add constraint incidencias_tipo_check
  check (tipo in ('pago_sin_cupo','reembolso_por_cancelacion','reembolso_por_reprogramacion'));

alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check
  check (tipo in ('inscripcion_taller','recordatorio_taller','taller_reprogramado','taller_cancelado','inscripcion_cancelada',
                  'reprogramacion_pendiente','grabacion_disponible'));
alter table public.notificaciones drop constraint if exists notificaciones_estado_check;
alter table public.notificaciones add constraint notificaciones_estado_check
  check (estado in ('pendiente','enviada','entregada','fallida','descartada'));
-- El estado de arriba es el del correo; la lectura en el campus es aparte.
alter table public.notificaciones add column leida_en timestamptz;

-- Reprogramar: cada inscripción confirmada queda pendiente de respuesta (aunque hubiera aceptado otra antes).
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
  update public.inscripciones_taller set respuesta_reprogramacion = 'pendiente', respondida_en = null
   where taller_id = p_taller and estado = 'confirmada';
  -- Los recordatorios pendientes de la fecha anterior ya no valen.
  update public.notificaciones set estado = 'descartada', motivo_descarte = 'reprogramado'
   where taller_id = p_taller and tipo in ('recordatorio_taller','reprogramacion_pendiente') and estado = 'pendiente' and para_inicio = v_t.inicia_en;
  for v_i in select id, perfil_id from public.inscripciones_taller where taller_id = p_taller and estado = 'confirmada' loop
    perform public.registrar_notificacion(v_i.perfil_id, p_taller, v_i.id, 'taller_reprogramado',
      'reprogramado:' || v_i.id || ':' || extract(epoch from p_inicio)::bigint, p_inicio,
      jsonb_build_object('inicia_antes', v_t.inicia_en, 'inicia_despues', p_inicio, 'requiere_respuesta', true));
  end loop;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (auth.uid(), 'taller_reprogramado', 'talleres', p_taller::text,
          jsonb_build_object('inicia_en', v_t.inicia_en, 'termina_en', v_t.termina_en),
          jsonb_build_object('inicia_en', p_inicio, 'termina_en', p_fin, 'motivo', btrim(p_motivo), 'inscriptos', v_n));
  return v_n;
end; $$;

-- La persona responde por sí misma (auth.uid()); nadie puede responder por otra.
create or replace function public.responder_reprogramacion(p_taller uuid, p_respuesta text, p_confirmacion text)
returns text language plpgsql security definer set search_path = public as $$
declare v_i public.inscripciones_taller%rowtype; v_r public.reprogramaciones_taller%rowtype; v_orden uuid;
begin
  if auth.uid() is null then raise exception 'sin_sesion' using errcode = '42501'; end if;
  if p_respuesta not in ('aceptada','reembolso_solicitado','no_asiste') then raise exception 'respuesta_invalida' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_confirmacion, ''))) < 10 then raise exception 'confirmacion_requerida' using errcode = 'P0001'; end if;
  select * into v_i from public.inscripciones_taller
   where taller_id = p_taller and perfil_id = auth.uid() and estado = 'confirmada' for update;
  if v_i.id is null then raise exception 'sin_inscripcion' using errcode = 'P0001'; end if;
  if v_i.respuesta_reprogramacion is distinct from 'pendiente' then raise exception 'sin_respuesta_pendiente' using errcode = 'P0001'; end if;
  select * into v_r from public.reprogramaciones_taller where taller_id = p_taller order by creado_en desc limit 1;
  if (select inicia_en from public.talleres where id = p_taller) <= now() then raise exception 'taller_ya_empezo' using errcode = 'P0001'; end if;
  -- Reembolso solo si pagó; quien no pagó y no puede asistir libera su lugar.
  if p_respuesta = 'reembolso_solicitado' and v_i.item_orden_id is null then raise exception 'inscripcion_sin_pago' using errcode = 'P0001'; end if;
  if p_respuesta = 'no_asiste' and v_i.item_orden_id is not null then raise exception 'inscripcion_paga' using errcode = 'P0001'; end if;

  insert into public.respuestas_reprogramacion (inscripcion_id, reprogramacion_id, perfil_id, respuesta, confirmacion, inicia_antes, inicia_despues)
  values (v_i.id, v_r.id, auth.uid(), p_respuesta, btrim(p_confirmacion), v_r.inicia_antes, v_r.inicia_despues);
  if p_respuesta = 'aceptada' then
    update public.inscripciones_taller set respuesta_reprogramacion = 'aceptada', respondida_en = now() where id = v_i.id;
  elsif p_respuesta = 'reembolso_solicitado' then
    -- El reembolso no se calcula ni se ejecuta: queda como incidencia para la academia (Fase 6).
    update public.inscripciones_taller set respuesta_reprogramacion = 'reembolso_solicitado', respondida_en = now(),
           estado = 'reembolso_pendiente', cancelada_por = 'alumno', cancelada_en = now(), motivo = 'Reprogramación: solicitó reembolso'
     where id = v_i.id;
    select orden_id into v_orden from public.items_orden where id = v_i.item_orden_id;
    insert into public.incidencias (tipo, orden_id, taller_id, perfil_id, inscripcion_id, detalle)
    values ('reembolso_por_reprogramacion', v_orden, p_taller, auth.uid(), v_i.id,
            jsonb_build_object('inicia_antes', v_r.inicia_antes, 'inicia_despues', v_r.inicia_despues))
    on conflict do nothing;
  else
    update public.inscripciones_taller set respuesta_reprogramacion = 'no_asiste', respondida_en = now(),
           estado = 'cancelada', cancelada_por = 'alumno', cancelada_en = now(), motivo = 'Reprogramación: no puede asistir'
     where id = v_i.id;
  end if;
  update public.notificaciones set estado = 'descartada', motivo_descarte = 'respondio_reprogramacion'
   where inscripcion_id = v_i.id and tipo = 'reprogramacion_pendiente' and estado = 'pendiente';
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), 'reprogramacion_respondida', 'inscripciones_taller', v_i.id::text,
          jsonb_build_object('respuesta', p_respuesta, 'inicia_antes', v_r.inicia_antes, 'inicia_despues', v_r.inicia_despues));
  return p_respuesta;
end; $$;
revoke execute on function public.responder_reprogramacion(uuid, text, text) from public, anon;
grant execute on function public.responder_reprogramacion(uuid, text, text) to authenticated;

-- ============================================================ 2. Cancelación voluntaria
create or replace function public.cancelar_mi_inscripcion(p_taller uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.talleres%rowtype; v_i public.inscripciones_taller%rowtype;
begin
  if auth.uid() is null then raise exception 'sin_sesion' using errcode = '42501'; end if;
  select * into v_t from public.talleres where id = p_taller for update;
  select * into v_i from public.inscripciones_taller where taller_id = p_taller and perfil_id = auth.uid() and estado = 'confirmada' for update;
  if v_i.id is null then raise exception 'sin_inscripcion' using errcode = 'P0001'; end if;
  -- Pagas: no hay cancelación ordinaria hasta aprobar la política de reembolsos; se contacta a la academia.
  if v_i.origen = 'compra' or v_i.item_orden_id is not null then raise exception 'inscripcion_paga' using errcode = 'P0001'; end if;
  if v_t.inicia_en - interval '24 hours' <= now() then raise exception 'fuera_de_plazo' using errcode = 'P0001'; end if;
  update public.inscripciones_taller set estado = 'cancelada', cancelada_en = now(), cancelada_por = 'alumno' where id = v_i.id;
  update public.notificaciones set estado = 'descartada', motivo_descarte = 'inscripcion_cancelada'
   where inscripcion_id = v_i.id and estado = 'pendiente' and tipo in ('recordatorio_taller','reprogramacion_pendiente');
  perform public.registrar_notificacion(auth.uid(), p_taller, v_i.id, 'inscripcion_cancelada', 'cancelada:' || v_i.id);
end; $$;
revoke execute on function public.cancelar_mi_inscripcion(uuid) from public, anon;
grant execute on function public.cancelar_mi_inscripcion(uuid) to authenticated;

-- ============================================================ 3. Cortesías: sin vía ordinaria nueva
-- Las inscripciones de cortesía existentes no se tocan. La función deja de estar disponible para
-- cualquier sesión (incluida la admin): las invitaciones futuras serán cupones (Fase 6).
revoke execute on function public.inscribir_cortesia(uuid, text, text) from authenticated;
create or replace function public.proteger_cortesias()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.origen = 'cortesia' then raise exception 'cortesia_no_disponible' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and old.origen = 'cortesia' and (new.origen, new.perfil_id, new.taller_id, new.motivo, new.creado_en)
     is distinct from (old.origen, old.perfil_id, old.taller_id, old.motivo, old.creado_en) then
    raise exception 'cortesia_historica' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger inscripciones_cortesias before insert or update on public.inscripciones_taller
  for each row execute function public.proteger_cortesias();

-- ============================================================ 4. Enlace desde la inscripción confirmada
create or replace function public.enlace_taller(p_taller uuid)
returns text language sql stable security definer set search_path = public as $$
  select r.enlace_participante from public.reuniones r join public.talleres t on t.id = r.taller_id
   where r.taller_id = p_taller and r.estado = 'activa' and t.estado = 'publicado' and now() < t.termina_en
     and exists (select 1 from public.inscripciones_taller i where i.taller_id = p_taller and i.perfil_id = auth.uid() and i.estado = 'confirmada');
$$;

-- Recordatorios: a quien no respondió la reprogramación se le pide que responda; nunca se le
-- envía un recordatorio que dé por confirmada su asistencia a la fecha nueva.
create or replace function public.procesar_recordatorios(p_ahora timestamptz default now())
returns int language plpgsql security definer set search_path = public as $$
declare v record; v_envio uuid; v_n int := 0; v_tipo text;
begin
  for v in select rec.id as rec_id, rec.minutos_antes, i.id as insc_id, i.perfil_id, i.respuesta_reprogramacion, t.id as taller_id, t.inicia_en
             from public.recordatorios rec join public.talleres t on t.id = rec.taller_id
             join public.inscripciones_taller i on i.taller_id = t.id and i.estado = 'confirmada'
            where t.estado = 'publicado' and t.inicia_en > p_ahora
              and t.inicia_en - make_interval(mins => rec.minutos_antes) <= p_ahora
              and exists (select 1 from public.reuniones r where r.taller_id = t.id and r.estado = 'activa') loop
    insert into public.envios_recordatorio (recordatorio_id, inscripcion_id, para_inicio)
    values (v.rec_id, v.insc_id, v.inicia_en) on conflict do nothing returning id into v_envio;
    if v_envio is not null then
      v_tipo := case when v.respuesta_reprogramacion = 'pendiente' then 'reprogramacion_pendiente' else 'recordatorio_taller' end;
      perform public.registrar_notificacion(v.perfil_id, v.taller_id, v.insc_id, v_tipo,
        v_tipo || ':' || v.rec_id || ':' || v.insc_id || ':' || extract(epoch from v.inicia_en)::bigint, v.inicia_en,
        jsonb_build_object('minutos_antes', v.minutos_antes));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end; $$;
revoke execute on function public.procesar_recordatorios(timestamptz) from public, anon, authenticated;
grant execute on function public.procesar_recordatorios(timestamptz) to service_role;

-- Notificaciones leídas en el campus (solo las propias).
create or replace function public.marcar_notificaciones_leidas(p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if auth.uid() is null then raise exception 'sin_sesion' using errcode = '42501'; end if;
  update public.notificaciones set leida_en = now() where id = any (p_ids) and perfil_id = auth.uid() and leida_en is null;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
revoke execute on function public.marcar_notificaciones_leidas(uuid[]) from public, anon;
grant execute on function public.marcar_notificaciones_leidas(uuid[]) to authenticated;

-- ============================================================ 5. Grabaciones (modelo y estados; sin video real)
create table public.grabaciones_taller (
  id uuid primary key default gen_random_uuid(),
  taller_id uuid not null unique references public.talleres (id) on delete cascade,
  estado text not null default 'prevista' check (estado in
    ('prevista','recibida','en_revision','en_edicion','verificada','publicada','no_publicable','fallida','faltante','retirada','no_corresponde')),
  -- Revisión de la versión comercializable: solo la maestra y sus materiales.
  sin_imagen_participantes boolean not null default false,
  sin_voces_participantes boolean not null default false,
  sin_datos_en_pantalla boolean not null default false,
  contenido_verificado boolean not null default false,
  -- Condiciones de acceso de esta grabación (las define la maestra; null = sin definir).
  acceso_incluido_dias int check (acceso_incluido_dias is null or acceso_incluido_dias between 1 and 3650),
  acceso_incluido_sin_vencimiento boolean not null default false,
  acceso_compra_dias int check (acceso_compra_dias is null or acceso_compra_dias between 1 and 3650),
  acceso_compra_sin_vencimiento boolean not null default false,
  a_la_venta boolean not null default false,
  precio_centavos int check (precio_centavos is null or precio_centavos > 0),
  referencia_video text,              -- Fase 6: id en el alojamiento privado; nunca un enlace público
  publicada_en timestamptz,
  actualizado_en timestamptz not null default now(),
  check (not (acceso_incluido_sin_vencimiento and acceso_incluido_dias is not null)),
  check (not (acceso_compra_sin_vencimiento and acceso_compra_dias is not null))
);
create trigger grabaciones_actualizado before update on public.grabaciones_taller for each row execute function public.tocar_actualizado_en();

create table public.historial_grabacion (
  id uuid primary key default gen_random_uuid(),
  grabacion_id uuid not null references public.grabaciones_taller (id) on delete cascade,
  estado_antes text not null, estado_despues text not null,
  motivo text, responsable uuid, creado_en timestamptz not null default now()
);

-- Derechos: incluido por la inscripción (asista o no) o por compra posterior (Fase 6). Las condiciones
-- se copian al otorgar: editar la grabación después no cambia derechos ya otorgados.
create table public.accesos_grabacion (
  id uuid primary key default gen_random_uuid(),
  grabacion_id uuid not null references public.grabaciones_taller (id) on delete restrict,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  origen text not null check (origen in ('inscripcion','compra')),
  inscripcion_id uuid references public.inscripciones_taller (id) on delete restrict,
  item_orden_id uuid references public.items_orden (id) on delete restrict,
  condiciones jsonb not null,
  vence_en timestamptz,
  otorgado_en timestamptz not null default now(),
  revocado_en timestamptz,
  motivo_revocacion text,
  check ((origen = 'inscripcion') = (inscripcion_id is not null)),
  check ((origen = 'compra') = (item_orden_id is not null))
);
create unique index acceso_grabacion_vigente on public.accesos_grabacion (grabacion_id, perfil_id, origen) where revocado_en is null;

alter table public.grabaciones_taller enable row level security;
alter table public.historial_grabacion enable row level security;
alter table public.accesos_grabacion enable row level security;
create policy grabaciones_admin on public.grabaciones_taller for select to authenticated using (public.es_admin());
create policy historial_grabacion_admin on public.historial_grabacion for select to authenticated using (public.es_admin());
create policy accesos_grabacion_lee on public.accesos_grabacion for select to authenticated using (perfil_id = auth.uid() or public.es_admin());

create trigger accesos_grabacion_auditar after insert or update on public.accesos_grabacion
  for each row execute function public.auditar_cambio('acceso_grabacion', '{grabacion_id,perfil_id,origen,vence_en,revocado_en}');
create trigger grabaciones_auditar after update on public.grabaciones_taller
  for each row execute function public.auditar_cambio('grabacion', '{estado,acceso_incluido_dias,acceso_incluido_sin_vencimiento,acceso_compra_dias,acceso_compra_sin_vencimiento,a_la_venta,precio_centavos}');

-- Todo taller está destinado a grabarse: cada uno tiene su fila de grabación.
create or replace function public.crear_grabacion_prevista()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.grabaciones_taller (taller_id) values (new.id) on conflict do nothing;
  return new;
end; $$;
create trigger talleres_grabacion after insert on public.talleres for each row execute function public.crear_grabacion_prevista();
insert into public.grabaciones_taller (taller_id, estado)
select id, case when estado = 'cancelado' then 'no_corresponde' else 'prevista' end from public.talleres on conflict do nothing;

-- Un taller cancelado no tendrá grabación.
create or replace function public.grabacion_por_cancelacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'cancelado' and old.estado <> 'cancelado' then
    update public.grabaciones_taller set estado = 'no_corresponde' where taller_id = new.id and estado = 'prevista';
  end if;
  return new;
end; $$;
create trigger talleres_grabacion_cancelada after update of estado on public.talleres for each row execute function public.grabacion_por_cancelacion();

-- Transiciones permitidas (la base las exige; el panel solo ofrece estas).
create or replace function public.transicion_grabacion_valida(p_de text, p_a text)
returns boolean language sql immutable as $$
  select (p_de, p_a) in (
    ('prevista','recibida'), ('prevista','fallida'), ('prevista','faltante'),
    ('fallida','recibida'), ('faltante','recibida'),
    ('recibida','en_revision'),
    ('en_revision','en_edicion'), ('en_revision','verificada'), ('en_revision','no_publicable'),
    ('en_edicion','en_revision'), ('en_edicion','no_publicable'),
    ('verificada','publicada'), ('verificada','en_edicion'), ('verificada','no_publicable'),
    ('no_publicable','en_edicion'),
    ('publicada','retirada'), ('retirada','en_revision'));
$$;

create or replace function public.cambiar_estado_grabacion(p_grabacion uuid, p_estado text, p_motivo text)
returns text language plpgsql security definer set search_path = public as $$
declare v_g public.grabaciones_taller%rowtype; v_t public.talleres%rowtype; v_n int := 0;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select * into v_g from public.grabaciones_taller where id = p_grabacion for update;
  if v_g.id is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  select * into v_t from public.talleres where id = v_g.taller_id;
  if not public.transicion_grabacion_valida(v_g.estado, p_estado) then raise exception 'transicion_invalida' using errcode = 'P0001'; end if;
  if p_estado in ('recibida','fallida','faltante') and v_t.inicia_en > now() then raise exception 'taller_no_realizado' using errcode = 'P0001'; end if;
  if p_estado in ('no_publicable','retirada','fallida','faltante') and char_length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'motivo_requerido' using errcode = 'P0001';
  end if;
  if p_estado = 'verificada' and not (v_g.sin_imagen_participantes and v_g.sin_voces_participantes and v_g.sin_datos_en_pantalla and v_g.contenido_verificado) then
    raise exception 'revision_incompleta' using errcode = 'P0001';
  end if;
  if p_estado = 'publicada' then
    if v_g.acceso_incluido_dias is null and not v_g.acceso_incluido_sin_vencimiento then raise exception 'condiciones_sin_definir' using errcode = 'P0001'; end if;
  end if;
  -- Volver a revisión o edición obliga a revisar de nuevo.
  if p_estado in ('en_edicion','en_revision') then
    update public.grabaciones_taller set sin_imagen_participantes = false, sin_voces_participantes = false,
           sin_datos_en_pantalla = false, contenido_verificado = false where id = p_grabacion;
  end if;
  update public.grabaciones_taller set estado = p_estado,
         publicada_en = case when p_estado = 'publicada' then coalesce(publicada_en, now()) else publicada_en end
   where id = p_grabacion;
  insert into public.historial_grabacion (grabacion_id, estado_antes, estado_despues, motivo, responsable)
  values (p_grabacion, v_g.estado, p_estado, nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid());
  if p_estado = 'publicada' then
    -- Derecho incluido: inscripciones confirmadas del taller (asistieran o no). Cancelaciones y reembolsos no.
    insert into public.accesos_grabacion (grabacion_id, perfil_id, origen, inscripcion_id, condiciones, vence_en)
    select p_grabacion, i.perfil_id, 'inscripcion', i.id,
           jsonb_build_object('dias', v_g.acceso_incluido_dias, 'sin_vencimiento', v_g.acceso_incluido_sin_vencimiento, 'otorgado_por', 'inscripcion'),
           case when v_g.acceso_incluido_sin_vencimiento then null else now() + make_interval(days => v_g.acceso_incluido_dias) end
      from public.inscripciones_taller i
     where i.taller_id = v_g.taller_id and i.estado = 'confirmada'
    on conflict do nothing;
    get diagnostics v_n = row_count;
    insert into public.notificaciones (perfil_id, taller_id, tipo, clave, detalle)
    select a.perfil_id, v_g.taller_id, 'grabacion_disponible', 'grabacion:' || p_grabacion || ':' || a.perfil_id, '{}'::jsonb
      from public.accesos_grabacion a where a.grabacion_id = p_grabacion and a.revocado_en is null
    on conflict (clave) do nothing;
  end if;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (auth.uid(), 'grabacion_estado', 'grabaciones_taller', p_grabacion::text, jsonb_build_object('estado', v_g.estado),
          jsonb_build_object('estado', p_estado, 'motivo', p_motivo, 'accesos_otorgados', v_n));
  return p_estado;
end; $$;
revoke execute on function public.cambiar_estado_grabacion(uuid, text, text) from public, anon;
grant execute on function public.cambiar_estado_grabacion(uuid, text, text) to authenticated;

-- Revisión y condiciones. Cambiar las condiciones no toca los derechos ya otorgados.
create or replace function public.guardar_revision_grabacion(
  p_grabacion uuid, p_sin_imagen boolean, p_sin_voces boolean, p_sin_datos boolean, p_contenido boolean
) returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select estado into v_estado from public.grabaciones_taller where id = p_grabacion for update;
  if v_estado is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  if v_estado not in ('en_revision') then raise exception 'revision_fuera_de_estado' using errcode = 'P0001'; end if;
  update public.grabaciones_taller set sin_imagen_participantes = p_sin_imagen, sin_voces_participantes = p_sin_voces,
         sin_datos_en_pantalla = p_sin_datos, contenido_verificado = p_contenido where id = p_grabacion;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), 'grabacion_revisada', 'grabaciones_taller', p_grabacion::text,
          jsonb_build_object('sin_imagen', p_sin_imagen, 'sin_voces', p_sin_voces, 'sin_datos', p_sin_datos, 'contenido', p_contenido));
end; $$;
revoke execute on function public.guardar_revision_grabacion(uuid, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.guardar_revision_grabacion(uuid, boolean, boolean, boolean, boolean) to authenticated;

create or replace function public.guardar_condiciones_grabacion(
  p_grabacion uuid, p_incluido_dias int, p_incluido_sin_venc boolean, p_compra_dias int, p_compra_sin_venc boolean,
  p_a_la_venta boolean, p_precio int
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_a_la_venta and (p_precio is null or (p_compra_dias is null and not p_compra_sin_venc)) then
    raise exception 'venta_sin_condiciones' using errcode = 'P0001';
  end if;
  update public.grabaciones_taller set
    acceso_incluido_dias = case when p_incluido_sin_venc then null else p_incluido_dias end, acceso_incluido_sin_vencimiento = p_incluido_sin_venc,
    acceso_compra_dias = case when p_compra_sin_venc then null else p_compra_dias end, acceso_compra_sin_vencimiento = p_compra_sin_venc,
    a_la_venta = p_a_la_venta, precio_centavos = p_precio
   where id = p_grabacion;
  if not found then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
end; $$;
revoke execute on function public.guardar_condiciones_grabacion(uuid, int, boolean, int, boolean, boolean, int) from public, anon;
grant execute on function public.guardar_condiciones_grabacion(uuid, int, boolean, int, boolean, boolean, int) to authenticated;

-- Fase 6: el pago aprobado de una compra de la grabación otorga el acceso con las condiciones de compra
-- vigentes en ese momento. Solo el servidor. Quien ya tiene el derecho incluido no lo compra.
create or replace function public.otorgar_acceso_compra(p_perfil uuid, p_grabacion uuid, p_item_orden uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_g public.grabaciones_taller%rowtype; v_id uuid;
begin
  select * into v_g from public.grabaciones_taller where id = p_grabacion for update;
  if v_g.id is null or not v_g.a_la_venta or v_g.estado <> 'publicada' then raise exception 'grabacion_no_disponible' using errcode = 'P0001'; end if;
  if exists (select 1 from public.accesos_grabacion where grabacion_id = p_grabacion and perfil_id = p_perfil and revocado_en is null
              and (vence_en is null or vence_en > now())) then
    raise exception 'ya_tiene_acceso' using errcode = 'P0001';
  end if;
  insert into public.accesos_grabacion (grabacion_id, perfil_id, origen, item_orden_id, condiciones, vence_en)
  values (p_grabacion, p_perfil, 'compra', p_item_orden,
          jsonb_build_object('dias', v_g.acceso_compra_dias, 'sin_vencimiento', v_g.acceso_compra_sin_vencimiento,
                             'precio_centavos', v_g.precio_centavos, 'otorgado_por', 'compra'),
          case when v_g.acceso_compra_sin_vencimiento then null else now() + make_interval(days => v_g.acceso_compra_dias) end)
  returning id into v_id;
  return v_id;
end; $$;
revoke execute on function public.otorgar_acceso_compra(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.otorgar_acceso_compra(uuid, uuid, uuid) to service_role;

-- El acceso se decide en el servidor: grabación publicada + derecho vigente (no revocado, no vencido).
create or replace function public.tiene_acceso_grabacion(p_grabacion uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.grabaciones_taller g join public.accesos_grabacion a on a.grabacion_id = g.id
                  where g.id = p_grabacion and g.estado = 'publicada' and a.perfil_id = auth.uid()
                    and a.revocado_en is null and (a.vence_en is null or a.vence_en > now()));
$$;
revoke execute on function public.tiene_acceso_grabacion(uuid) from public, anon;
grant execute on function public.tiene_acceso_grabacion(uuid) to authenticated;

-- Lo que el campus muestra de la grabación de cada taller propio (sin datos internos).
create or replace function public.mis_grabaciones()
returns table (taller_id uuid, estado text, acceso boolean, vence_en timestamptz)
language sql stable security definer set search_path = public as $$
  select g.taller_id,
         case when g.estado = 'publicada' then 'publicada'
              when g.estado in ('prevista') then 'prevista'
              when g.estado in ('fallida','faltante','no_publicable') then 'no_disponible'
              when g.estado = 'retirada' then 'retirada'
              when g.estado = 'no_corresponde' then 'no_corresponde'
              else 'en_preparacion' end,
         public.tiene_acceso_grabacion(g.id),
         (select max(a.vence_en) from public.accesos_grabacion a where a.grabacion_id = g.id and a.perfil_id = auth.uid() and a.revocado_en is null)
    from public.grabaciones_taller g
   where exists (select 1 from public.inscripciones_taller i where i.taller_id = g.taller_id and i.perfil_id = auth.uid());
$$;
revoke execute on function public.mis_grabaciones() from public, anon;
grant execute on function public.mis_grabaciones() to authenticated;
