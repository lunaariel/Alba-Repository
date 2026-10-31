-- Reversión de 0017 (adaptación de talleres). Ejecutar antes de revertir 0016.
-- Se niega si ya hay datos que solo existen con 0017.
do $$
begin
  if exists (select 1 from public.respuestas_reprogramacion) then raise exception 'reversion_imposible: hay respuestas a reprogramaciones registradas'; end if;
  if exists (select 1 from public.accesos_grabacion) then raise exception 'reversion_imposible: hay derechos de acceso a grabaciones'; end if;
  if exists (select 1 from public.grabaciones_taller where estado not in ('prevista','no_corresponde')
              or acceso_incluido_dias is not null or acceso_compra_dias is not null or acceso_incluido_sin_vencimiento
              or acceso_compra_sin_vencimiento or a_la_venta or precio_centavos is not null) then
    raise exception 'reversion_imposible: hay grabaciones con estado o condiciones cargadas';
  end if;
  if exists (select 1 from public.inscripciones_taller where respuesta_reprogramacion is not null) then
    raise exception 'reversion_imposible: hay inscripciones con respuesta a una reprogramación';
  end if;
  if exists (select 1 from public.incidencias where tipo = 'reembolso_por_reprogramacion') then raise exception 'reversion_imposible: hay incidencias de reprogramación'; end if;
  if exists (select 1 from public.notificaciones where tipo in ('reprogramacion_pendiente','grabacion_disponible') or estado = 'entregada' or leida_en is not null) then
    raise exception 'reversion_imposible: hay notificaciones de tipos o estados de 0017';
  end if;
end $$;

drop trigger if exists inscripciones_quien_cancela on public.inscripciones_taller;
drop trigger if exists inscripciones_cortesias on public.inscripciones_taller;
drop trigger if exists talleres_grabacion on public.talleres;
drop trigger if exists talleres_grabacion_cancelada on public.talleres;
drop function if exists public.mis_grabaciones();
drop function if exists public.tiene_acceso_grabacion(uuid);
drop function if exists public.otorgar_acceso_compra(uuid, uuid, uuid);
drop function if exists public.guardar_condiciones_grabacion(uuid, int, boolean, int, boolean, boolean, int);
drop function if exists public.guardar_revision_grabacion(uuid, boolean, boolean, boolean, boolean);
drop function if exists public.cambiar_estado_grabacion(uuid, text, text);
drop function if exists public.transicion_grabacion_valida(text, text);
drop function if exists public.grabacion_por_cancelacion();
drop function if exists public.crear_grabacion_prevista();
drop function if exists public.marcar_notificaciones_leidas(uuid[]);
drop function if exists public.responder_reprogramacion(uuid, text, text);
drop function if exists public.proteger_cortesias();
drop function if exists public.marcar_quien_cancela();
drop table if exists public.accesos_grabacion;
drop table if exists public.historial_grabacion;
drop table if exists public.grabaciones_taller;
drop table if exists public.respuestas_reprogramacion;

-- Funciones de 0016.
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
create or replace function public.enlace_taller(p_taller uuid)
returns text language sql stable security definer set search_path = public as $$
  select r.enlace_participante from public.reuniones r join public.talleres t on t.id = r.taller_id
   where r.taller_id = p_taller and r.estado = 'activa' and t.estado = 'publicado'
     and now() >= t.inicia_en - make_interval(hours => t.enlace_visible_horas) and now() < t.termina_en
     and exists (select 1 from public.inscripciones_taller i where i.taller_id = p_taller and i.perfil_id = auth.uid() and i.estado = 'confirmada');
$$;
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
grant execute on function public.inscribir_cortesia(uuid, text, text) to authenticated;

alter table public.notificaciones drop column if exists leida_en;
alter table public.notificaciones drop constraint if exists notificaciones_estado_check;
alter table public.notificaciones add constraint notificaciones_estado_check check (estado in ('pendiente','enviada','fallida','descartada'));
alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check
  check (tipo in ('inscripcion_taller','recordatorio_taller','taller_reprogramado','taller_cancelado','inscripcion_cancelada'));
alter table public.incidencias drop constraint if exists incidencias_tipo_check;
alter table public.incidencias add constraint incidencias_tipo_check check (tipo in ('pago_sin_cupo','reembolso_por_cancelacion'));
alter table public.inscripciones_taller drop column if exists cancelada_por, drop column if exists respuesta_reprogramacion, drop column if exists respondida_en;
