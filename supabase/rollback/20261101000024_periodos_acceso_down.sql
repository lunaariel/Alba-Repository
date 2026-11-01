-- Reversión de 20261101000024_periodos_acceso. SOLO entornos locales o de prueba.
-- Se niega si ya se usaron los períodos (renovaciones, becas, revocaciones, reintentos, órdenes
-- desactualizadas o reembolsos parciales): revertir perdería derechos y su historial. Sin ese uso,
-- restaura exactamente el estado anterior (los accesos nunca se modificaron) y devuelve a «pendiente»
-- las órdenes antiguas que la migración había clasificado.
do $$
begin
  if exists (select 1 from public.periodos_acceso where not historico or (estado = 'revocado' and revocado_motivo <> 'Acceso revocado antes de los períodos'))
     or exists (select 1 from public.incidencias where tipo in ('pago_sin_condiciones','otorgamiento_fallido','compra_con_acceso_vigente','reembolso_parcial','revisar_periodos'))
     or exists (select 1 from public.auditoria where accion in ('orden_desactualizada','periodo_otorgado','periodo_revocado','acceso_reactivado','otorgamiento_reintentado','reembolso_parcial'))
     or exists (select 1 from public.incidencias i join public.ordenes o on o.id = i.orden_id
                 join public.ordenes p on p.perfil_id is not distinct from o.perfil_id and p.clave_producto = o.clave_producto and p.estado = 'pendiente'
                where i.tipo = 'orden_sin_condiciones') then
    raise exception 'reversion_imposible: ya se usaron los períodos de acceso o hay órdenes nuevas' using errcode = 'P0001';
  end if;
end $$;

-- Órdenes antiguas clasificadas por la migración: vuelven a su estado anterior.
update public.ordenes set estado = 'pendiente'
 where estado = 'vencida' and id in (select orden_id from public.incidencias where tipo = 'orden_sin_condiciones');
delete from public.incidencias where tipo = 'orden_sin_condiciones';
alter table public.incidencias drop constraint if exists incidencias_tipo_check;
alter table public.incidencias add constraint incidencias_tipo_check
  check (tipo in ('pago_sin_cupo','reembolso_por_cancelacion','reembolso_por_reprogramacion'));

drop trigger accesos_periodo_inicial on public.accesos_curso;
drop trigger configuracion_auditar_talleres on public.configuracion_academia;
drop function public.conciliar_periodos();
drop function public.oferta_curso(uuid);
drop function public.buscar_perfil_por_correo(text);
drop function public.otorgar_beca(uuid, uuid, timestamptz, timestamptz, boolean, text, text);
drop function public.revocar_beca(uuid, text);
drop function public.reintentar_otorgamiento(uuid, text);
drop function public.reintentar_otorgamiento_orden(uuid, text);
drop function public.revocar_periodos_orden(uuid, text, text);
drop function public.otorgar_compra_curso(uuid, text);
drop function public.revocar_periodo_interno(uuid, text, uuid);
drop function public.agregar_periodo(uuid, uuid, text, uuid, timestamptz, timestamptz, int, boolean, jsonb, int, text, text, uuid);
drop function public.recalcular_vencimiento_acceso(uuid);
drop function public.crear_periodo_inicial();
drop table public.periodos_acceso;
drop function public.proteger_periodo();
drop function public.completar_periodo();

-- Definición anterior (20261030000008_operaciones.sql).
create or replace function public.crear_orden(
  p_perfil uuid, p_tipo text, p_producto uuid, p_cupon text default null,
  p_minutos_reserva int default 15
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_clave text := p_tipo || ':' || p_producto;
  v_orden uuid;
  v_precio int;
  v_titulo text;
  v_cupon public.cupones%rowtype;
  v_descuento int := 0;
  v_taller public.talleres%rowtype;
  v_ocupados int;
begin
  if p_tipo not in ('curso','taller') then raise exception 'tipo_invalido' using errcode = 'P0001'; end if;

  -- Reutiliza la orden pendiente existente (doble clic, recarga de página),
  -- salvo que sea de un taller y su reserva ya no esté vigente: esa orden vence.
  select id into v_orden from public.ordenes
   where perfil_id = p_perfil and clave_producto = v_clave and estado = 'pendiente'
   for update;
  if v_orden is not null then
    if p_tipo = 'curso' or exists (select 1 from public.reservas_cupo
                                    where orden_id = v_orden and liberada_en is null and vence_en > now()) then
      return v_orden;
    end if;
    update public.reservas_cupo set liberada_en = now() where orden_id = v_orden and liberada_en is null;
    update public.ordenes set estado = 'vencida' where id = v_orden;
    v_orden := null;
  end if;

  if p_tipo = 'curso' then
    select precio_centavos, titulo into v_precio, v_titulo from public.cursos
     where id = p_producto and estado = 'publicado';
    if not found then raise exception 'curso_no_disponible' using errcode = 'P0001'; end if;
    if exists (select 1 from public.accesos_curso where perfil_id = p_perfil and curso_id = p_producto and estado = 'activo') then
      raise exception 'ya_tiene_acceso' using errcode = 'P0001';
    end if;
  else
    select * into v_taller from public.talleres where id = p_producto for update;   -- bloqueo del cupo
    if not found or v_taller.estado <> 'publicado' or v_taller.inicia_en <= now() then
      raise exception 'taller_no_disponible' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.inscripciones_taller where perfil_id = p_perfil and taller_id = p_producto and estado = 'confirmada') then
      raise exception 'ya_inscripto' using errcode = 'P0001';
    end if;
    if v_taller.cupo is not null then
      select (select count(*) from public.inscripciones_taller where taller_id = p_producto and estado = 'confirmada')
           + (select count(*) from public.reservas_cupo where taller_id = p_producto and liberada_en is null and vence_en > now())
        into v_ocupados;
      if v_ocupados >= v_taller.cupo then raise exception 'sin_cupo' using errcode = 'P0001'; end if;
    end if;
    v_precio := v_taller.precio_centavos;
    v_titulo := v_taller.titulo;
  end if;

  if p_cupon is not null then
    select * into v_cupon from public.cupones where codigo = upper(btrim(p_cupon)) for update;
    if not found or not v_cupon.activo
       or (v_cupon.vigente_desde is not null and now() < v_cupon.vigente_desde)
       or (v_cupon.vigente_hasta is not null and now() > v_cupon.vigente_hasta)
       or (v_cupon.usos_maximos is not null and v_cupon.usos >= v_cupon.usos_maximos) then
      raise exception 'cupon_invalido' using errcode = 'P0001';
    end if;
    v_descuento := least(v_precio, case v_cupon.tipo when 'porcentaje' then (v_precio * v_cupon.valor) / 100 else v_cupon.valor end);
  end if;

  insert into public.ordenes (perfil_id, cupon_id, subtotal_centavos, descuento_centavos, total_centavos, clave_producto)
  values (p_perfil, v_cupon.id, v_precio, v_descuento, v_precio - v_descuento, v_clave)
  returning id into v_orden;

  insert into public.items_orden (orden_id, curso_id, taller_id, descripcion, precio_centavos)
  values (v_orden,
          case when p_tipo = 'curso' then p_producto end,
          case when p_tipo = 'taller' then p_producto end,
          v_titulo, v_precio);

  if p_tipo = 'taller' then
    insert into public.reservas_cupo (taller_id, perfil_id, orden_id, vence_en)
    values (p_producto, p_perfil, v_orden, now() + make_interval(mins => p_minutos_reserva));
  end if;

  return v_orden;
end; $$;

-- Definición anterior (20261031000016_talleres_gestion.sql).
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

-- Definición anterior (20261030000008_operaciones.sql).
create or replace function public.conceder_acceso(p_admin uuid, p_perfil uuid, p_curso uuid, p_motivo text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_acceso uuid;
begin
  if not exists (select 1 from public.roles_usuario where perfil_id = p_admin and rol = 'admin') then
    raise exception 'no_autorizado' using errcode = 'P0001';
  end if;
  insert into public.accesos_curso (perfil_id, curso_id, origen, motivo)
  values (p_perfil, p_curso, 'concesion', p_motivo)
  returning id into v_acceso;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (p_admin, 'acceso_concedido', 'accesos_curso', v_acceso::text,
          jsonb_build_object('perfil', p_perfil, 'curso', p_curso, 'motivo', p_motivo));
  return v_acceso;
end; $$;

-- Definición anterior (20261031000014_versionado.sql).
create or replace function public.cambiar_version(p_perfil uuid, p_curso uuid, p_version_destino uuid, p_confirmacion text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_acceso public.accesos_curso%rowtype; v_act int; v_dest int; v_cambio uuid;
begin
  if char_length(btrim(coalesce(p_confirmacion, ''))) < 10 then raise exception 'confirmacion_requerida' using errcode = 'P0001'; end if;
  select * into v_acceso from public.accesos_curso where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo' for update;
  if v_acceso.id is null then raise exception 'sin_acceso' using errcode = 'P0001'; end if;
  if p_version_destino is distinct from (select version_vigente_id from public.cursos where id = p_curso) then
    raise exception 'version_no_vigente' using errcode = 'P0001';
  end if;
  select numero into v_act from public.versiones_curso where id = v_acceso.version_id;
  select numero into v_dest from public.versiones_curso where id = p_version_destino;
  if v_dest <= v_act then raise exception 'version_no_mas_nueva' using errcode = 'P0001'; end if;

  insert into public.cambios_version (acceso_id, perfil_id, curso_id, version_anterior, version_nueva, confirmacion)
  values (v_acceso.id, p_perfil, p_curso, v_acceso.version_id, p_version_destino, btrim(p_confirmacion))
  returning id into v_cambio;
  perform set_config('albor.cambio_version', 'si', true);
  update public.accesos_curso set version_id = p_version_destino where id = v_acceso.id;
  perform set_config('albor.cambio_version', '', true);
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (p_perfil, 'version_cambiada_por_alumno', 'accesos_curso', v_acceso.id::text,
          jsonb_build_object('version', v_acceso.version_id, 'numero', v_act),
          jsonb_build_object('version', p_version_destino, 'numero', v_dest, 'cambio', v_cambio));
  return v_cambio;
end; $$;

-- Definición anterior (20261101000019_vencimientos_cursos.sql).
create or replace function public.fijar_vencimiento_acceso()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cond jsonb;
begin
  new.inicia_en := coalesce(new.inicia_en, now());
  if new.origen = 'compra' then
    select condiciones_acceso into v_cond from public.items_orden where id = new.item_orden_id;
    if v_cond ? 'total_meses' then
      new.condiciones := v_cond;
      new.vence_en := public.calcular_vencimiento(new.inicia_en, (v_cond ->> 'total_meses')::int);
    else
      -- Ítem anterior a esta migración (sin condiciones copiadas): no se inventa un vencimiento.
      new.condiciones := jsonb_build_object('regla', 'compra_sin_condiciones');
      new.vence_en := null;
    end if;
  else
    new.condiciones := jsonb_build_object('regla', 'concesion_sin_vencimiento');
    new.vence_en := null;
  end if;
  return new;
end; $$;

-- Definición anterior (20261031000016_talleres_gestion.sql).
create or replace function public.inscribirme_gratis(p_taller uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sin_sesion' using errcode = '42501'; end if;
  return public.inscribir_en_taller(auth.uid(), p_taller, 'gratuita');
end; $$;

drop function public.talleres_publicos();
alter table public.configuracion_academia drop column talleres_publicos;

revoke execute on function public.crear_orden(uuid, text, uuid, text, int) from public, anon, authenticated;
revoke execute on function public.procesar_evento_pago(text, text, text, jsonb, uuid, text, text, int) from public, anon, authenticated;
revoke execute on function public.conceder_acceso(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.cambiar_version(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.crear_orden(uuid, text, uuid, text, int) to service_role;
grant execute on function public.procesar_evento_pago(text, text, text, jsonb, uuid, text, text, int) to service_role;
grant execute on function public.conceder_acceso(uuid, uuid, uuid, text) to service_role;
grant execute on function public.cambiar_version(uuid, uuid, uuid, text) to service_role;
revoke execute on function public.inscribirme_gratis(uuid) from public, anon;
grant execute on function public.inscribirme_gratis(uuid) to authenticated;
