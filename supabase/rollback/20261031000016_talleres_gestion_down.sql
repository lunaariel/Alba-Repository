-- Reversión de 0016 (gestión de talleres). Ejecutar antes de revertir 0015 y 0014.
-- Se niega si ya hay datos que solo existen con 0016: revertir los perdería.
do $$
begin
  if exists (select 1 from public.talleres where estado = 'archivado') then raise exception 'reversion_imposible: hay talleres archivados'; end if;
  if exists (select 1 from public.inscripciones_taller where estado = 'reembolso_pendiente' or origen = 'cortesia' or asistio is not null) then
    raise exception 'reversion_imposible: hay inscripciones con datos de 0016 (reembolso pendiente, cortesía o asistencia)';
  end if;
  if exists (select 1 from public.ordenes where estado = 'requiere_reembolso') then raise exception 'reversion_imposible: hay órdenes que requieren reembolso'; end if;
  if exists (select 1 from public.incidencias) or exists (select 1 from public.reprogramaciones_taller) or exists (select 1 from public.notificaciones) then
    raise exception 'reversion_imposible: hay incidencias, reprogramaciones o notificaciones registradas';
  end if;
  if exists (select 1 from public.envios_recordatorio group by recordatorio_id, inscripcion_id having count(*) > 1) then
    raise exception 'reversion_imposible: hay recordatorios registrados para más de una fecha';
  end if;
end $$;

drop trigger if exists talleres_validar on public.talleres;
drop trigger if exists talleres_proteger on public.talleres;
drop trigger if exists talleres_recordatorios on public.talleres;
drop trigger if exists inscripciones_auditar on public.inscripciones_taller;
drop trigger if exists recordatorios_auditar on public.recordatorios;
drop trigger if exists reuniones_auditar on public.reuniones;

drop function if exists public.guardar_reunion(uuid, text, text);
drop function if exists public.finalizar_talleres();
drop function if exists public.procesar_recordatorios(timestamptz);
drop function if exists public.anotar_incidencia(uuid, text);
drop function if exists public.cancelar_taller(uuid, text);
drop function if exists public.reprogramar_taller(uuid, timestamptz, timestamptz, text);
drop function if exists public.duplicar_taller(uuid, timestamptz, timestamptz);
drop function if exists public.enlace_taller(uuid);
drop function if exists public.marcar_asistencia(uuid, boolean);
drop function if exists public.inscribir_cortesia(uuid, text, text);
drop function if exists public.cancelar_mi_inscripcion(uuid);
drop function if exists public.inscribirme_gratis(uuid);
drop function if exists public.inscribir_en_taller(uuid, uuid, text, text);
drop function if exists public.registrar_notificacion(uuid, uuid, uuid, text, text, timestamptz, jsonb);
drop function if exists public.recordatorios_por_defecto();
drop function if exists public.proteger_taller();
drop function if exists public.validar_taller();
drop function if exists public.faltantes_taller(public.talleres);

-- Función de pagos de 0008 (sin «requiere reembolso»).
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
  v_cupo int;
  v_ocupados int;
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

  insert into public.pagos (orden_id, proveedor, id_externo, estado, monto_centavos)
  values (p_orden, p_proveedor, p_id_pago_externo, p_estado, p_monto_centavos)
  on conflict (proveedor, id_externo) do update set estado = excluded.estado, monto_centavos = excluded.monto_centavos;

  if p_estado = 'aprobado' then
    if v_orden.estado = 'aprobada' then
      v_resultado := 'ignorado: ya_aprobada';
    elsif v_orden.estado not in ('pendiente','vencida') then
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
          -- Sin una reserva vigente propia, se vuelve a comprobar el cupo antes de inscribir.
          if not exists (select 1 from public.reservas_cupo
                          where orden_id = p_orden and liberada_en is null and vence_en > now()) then
            select cupo into v_cupo from public.talleres where id = v_item.taller_id for update;
            if v_cupo is not null then
              select (select count(*) from public.inscripciones_taller
                       where taller_id = v_item.taller_id and estado = 'confirmada')
                   + (select count(*) from public.reservas_cupo
                       where taller_id = v_item.taller_id and orden_id <> p_orden
                         and liberada_en is null and vence_en > now())
                into v_ocupados;
              if v_ocupados >= v_cupo then
                v_resultado := 'error: sin_cupo_requiere_reembolso';
                continue;
              end if;
            end if;
          end if;
          insert into public.inscripciones_taller (taller_id, perfil_id, item_orden_id)
          values (v_item.taller_id, v_orden.perfil_id, v_item.id)
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
    if v_orden.estado in ('aprobada','reembolsada','contracargo') then
      update public.ordenes set estado = case p_estado when 'reembolsado' then 'reembolsada' else 'contracargo' end where id = p_orden;
      update public.accesos_curso set estado = 'revocado', revocado_en = now()
       where estado = 'activo' and item_orden_id in (select id from public.items_orden where orden_id = p_orden);
      update public.inscripciones_taller set estado = 'reembolsada'
       where estado = 'confirmada' and item_orden_id in (select id from public.items_orden where orden_id = p_orden);
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
drop function if exists public.ocupados_taller(uuid);

drop policy if exists reuniones_admin on public.reuniones;
revoke select on public.reuniones from authenticated;
grant select (id, taller_id, proveedor, enlace_participante, estado) on public.reuniones to authenticated;
drop policy if exists talleres_lee on public.talleres;
create policy talleres_lee on public.talleres for select to anon, authenticated
  using (estado in ('publicado','cancelado','finalizado') or public.es_admin());

drop table if exists public.incidencias;
drop table if exists public.notificaciones;
drop table if exists public.reprogramaciones_taller;

alter table public.envios_recordatorio rename column registrado_en to enviado_en;
alter table public.envios_recordatorio drop constraint if exists envios_recordatorio_unico;
alter table public.envios_recordatorio drop column if exists para_inicio;
alter table public.envios_recordatorio add constraint envios_recordatorio_recordatorio_id_inscripcion_id_key unique (recordatorio_id, inscripcion_id);

alter table public.ordenes drop constraint if exists ordenes_estado_check;
alter table public.ordenes add constraint ordenes_estado_check
  check (estado in ('pendiente','aprobada','rechazada','cancelada','vencida','reembolsada','contracargo'));
alter table public.inscripciones_taller drop column if exists origen, drop column if exists asistio,
  drop column if exists motivo, drop column if exists cancelada_en;
alter table public.inscripciones_taller drop constraint if exists inscripciones_taller_estado_check;
alter table public.inscripciones_taller add constraint inscripciones_taller_estado_check check (estado in ('confirmada','cancelada','reembolsada'));
alter table public.talleres drop column if exists duplicado_de, drop column if exists enlace_visible_horas,
  drop column if exists motivo_cancelacion, drop column if exists cancelado_en, drop column if exists cancelado_por;
alter table public.talleres drop constraint if exists talleres_estado_check;
alter table public.talleres add constraint talleres_estado_check check (estado in ('borrador','publicado','cancelado','finalizado'));
