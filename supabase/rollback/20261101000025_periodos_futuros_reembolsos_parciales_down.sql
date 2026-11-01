-- Reversión de 20261101000025_periodos_futuros_reembolsos_parciales. SOLO entornos locales o de prueba.
-- Se niega si ya se registraron reembolsos parciales o resoluciones de la admin: revertir perdería ese
-- registro. Sin ese uso, restaura las definiciones de 0024 (y de 0019 para las funciones de acceso).
do $$
begin
  if exists (select 1 from public.reembolsos where id_externo is not null and motivo like 'Reembolso parcial confirmado%')
     or exists (select 1 from public.auditoria where accion = 'reembolso_parcial_resuelto') then
    raise exception 'reversion_imposible: ya hay reembolsos parciales registrados o resueltos' using errcode = 'P0001';
  end if;
end $$;

drop function public.resolver_reembolso_parcial(uuid, text);
drop index public.reembolsos_evento_unico;

create or replace function public.tiene_acceso(p_curso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.accesos_curso
    where perfil_id = auth.uid() and curso_id = p_curso and estado = 'activo' and (vence_en is null or vence_en > now())
  );
$$;

create or replace function public.version_de(p_perfil uuid, p_curso uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select version_id from public.accesos_curso
   where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo' and (vence_en is null or vence_en > now());
$$;

create or replace function public.estado_finalizacion_de(p_perfil uuid, p_curso uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.versiones_curso%rowtype;
  v_pend int; v_act boolean := false; v_val boolean := false; v_aprob boolean := false; v_fin boolean;
  v_vence timestamptz;
begin
  select * into v from public.versiones_curso where id = public.version_historica_de(p_perfil, p_curso);
  if v.id is null then return null; end if;
  select vence_en into v_vence from public.accesos_curso where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo';
  select count(*) into v_pend from public.lecciones_de_version(v.id) l(id)
   where not exists (select 1 from public.progreso_leccion p where p.leccion_id = l.id and p.perfil_id = p_perfil and p.completada_en is not null);
  if v.modalidad = 'sumativa' then
    v_aprob := exists (select 1 from public.intentos_evaluacion i join public.evaluaciones e on e.id = i.evaluacion_id
                        where e.curso_id = p_curso and i.perfil_id = p_perfil and not i.formativo
                          and (i.aprobado or coalesce(i.aprobado_revisado, false))
                          and public.evaluaciones_equivalentes(i.version_id, v.id));
    v_fin := v_pend = 0 and v_aprob;
  else
    v_act := exists (select 1 from public.intentos_evaluacion i where i.perfil_id = p_perfil and i.version_id = v.id and i.formativo and i.completo);
    v_val := exists (select 1 from public.validaciones_formativas f where f.perfil_id = p_perfil and f.version_id = v.id and f.anulada_en is null);
    v_fin := v_pend = 0 and (not v.requiere_actividades or v_act) and (not v.requiere_validacion or v_val);
  end if;
  return jsonb_build_object(
    'version_id', v.id, 'version', v.numero, 'modalidad', v.modalidad,
    'lecciones_pendientes', v_pend,
    'requiere_actividades', v.requiere_actividades, 'actividades_completas', v_act,
    'requiere_validacion', v.requiere_validacion, 'validada', v_val,
    'evaluacion_aprobada', v_aprob,
    'con_certificado', v.con_certificado,
    'finalizado', v_fin,
    'elegible_certificado', v_fin and v.con_certificado
       and (v.modalidad = 'sumativa' or v.requiere_actividades or v.requiere_validacion),
    'vence_en', v_vence, 'vencido', v_vence is not null and v_vence <= now());
end; $$;

drop function public.mis_accesos();
create function public.mis_accesos()
returns table (curso_id uuid, inicia_en timestamptz, vence_en timestamptz, vencido boolean, condiciones jsonb)
language sql stable security definer set search_path = public as $$
  select a.curso_id, a.inicia_en, a.vence_en, a.vence_en is not null and a.vence_en <= now(), a.condiciones
    from public.accesos_curso a where a.perfil_id = auth.uid() and a.estado = 'activo';
$$;

drop function public.seguimiento_curso(uuid);
create function public.seguimiento_curso(p_curso uuid)
returns table (perfil_id uuid, nombre text, version int, estado jsonb, envios_formativos int, ultimo_envio timestamptz,
               validacion_id uuid, tiene_certificado boolean, inicia_en timestamptz, vence_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return query
  select a.perfil_id, pf.nombre_completo, v.numero, public.estado_finalizacion_de(a.perfil_id, p_curso),
         (select count(*)::int from public.intentos_evaluacion i where i.perfil_id = a.perfil_id and i.version_id = a.version_id and i.formativo),
         (select max(i.entregado_en) from public.intentos_evaluacion i where i.perfil_id = a.perfil_id and i.version_id = a.version_id and i.formativo),
         (select f.id from public.validaciones_formativas f where f.perfil_id = a.perfil_id and f.version_id = a.version_id and f.anulada_en is null),
         exists (select 1 from public.certificados c where c.perfil_id = a.perfil_id and c.curso_id = p_curso and c.version_id = a.version_id),
         a.inicia_en, a.vence_en
    from public.accesos_curso a
    join public.perfiles pf on pf.id = a.perfil_id
    join public.versiones_curso v on v.id = a.version_id
   where a.curso_id = p_curso and a.estado = 'activo'
   order by v.numero, pf.nombre_completo;
end; $$;

create or replace function public.cambiar_version(p_perfil uuid, p_curso uuid, p_version_destino uuid, p_confirmacion text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_acceso public.accesos_curso%rowtype; v_act int; v_dest int; v_cambio uuid;
begin
  if char_length(btrim(coalesce(p_confirmacion, ''))) < 10 then raise exception 'confirmacion_requerida' using errcode = 'P0001'; end if;
  select * into v_acceso from public.accesos_curso where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo' for update;
  if v_acceso.id is null then raise exception 'sin_acceso' using errcode = 'P0001'; end if;
  -- Con el acceso vencido no se cambia de versión, aunque la solicitud se arme a mano.
  if v_acceso.vence_en is not null and v_acceso.vence_en <= now() then raise exception 'acceso_vencido' using errcode = 'P0001'; end if;
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

create or replace function public.oferta_curso(p_curso uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_c public.cursos%rowtype; v_a public.accesos_curso%rowtype; v_total int; v_situacion text; v_inicio timestamptz;
begin
  if auth.uid() is null then return null; end if;
  select * into v_c from public.cursos where id = p_curso and estado = 'publicado';
  if v_c.id is null then return null; end if;
  select * into v_a from public.accesos_curso where perfil_id = auth.uid() and curso_id = p_curso and estado = 'activo';
  v_situacion := case
    when v_a.id is not null and (v_a.vence_en is null or v_a.vence_en > now()) then 'vigente'
    when v_a.id is not null or exists (select 1 from public.accesos_curso where perfil_id = auth.uid() and curso_id = p_curso) then 'renovacion'
    else 'nueva' end;
  v_total := v_c.duracion_comercial_meses + public.meses_adicionales_acceso();
  v_inicio := now();
  return jsonb_build_object(
    'disponible', v_c.duracion_comercial_meses is not null and v_situacion <> 'vigente',
    'situacion', v_situacion, 'precio_centavos', v_c.precio_centavos,
    'duracion_meses', v_c.duracion_comercial_meses, 'meses_adicionales', public.meses_adicionales_acceso(), 'total_meses', v_total,
    'vence_si_confirma_hoy', case when v_total is not null then public.calcular_vencimiento(v_inicio, v_total) end,
    'vence_actual', v_a.vence_en);
end; $$;

create or replace function public.revocar_periodos_orden(p_orden uuid, p_motivo text, p_evento text)
returns int language plpgsql security definer set search_path = public as $$
declare v_p public.periodos_acceso%rowtype; v_n int := 0; v_accesos uuid[] := '{}';
begin
  for v_p in select p.* from public.periodos_acceso p join public.items_orden i on i.id = p.item_orden_id
              where i.orden_id = p_orden and p.estado = 'activo' loop
    perform public.revocar_periodo_interno(v_p.id, p_motivo || ' (evento ' || p_evento || ')', null);
    v_accesos := v_accesos || v_p.acceso_id;
    v_n := v_n + 1;
  end loop;
  -- Si quedan períodos posteriores encadenados, el vencimiento derivado puede dar más días de los
  -- comprados en el período siguiente: la admin lo revisa.
  if exists (select 1 from public.periodos_acceso where acceso_id = any (v_accesos) and estado = 'activo' and inicia_en > now()) then
    insert into public.incidencias (tipo, orden_id, perfil_id, detalle)
    select 'revisar_periodos', p_orden, (select perfil_id from public.ordenes where id = p_orden),
           jsonb_build_object('motivo', 'Se revocó un período con otro encadenado después', 'evento', p_evento)
    on conflict do nothing;
  end if;
  return v_n;
end; $$;

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
  v_otorgado text;
  v_revision boolean := false;
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
      -- Otro aviso de un pago ya aprobado no duplica nada. Si el otorgamiento había fallado, se reintenta.
      if exists (select 1 from public.incidencias where orden_id = p_orden and tipo = 'otorgamiento_fallido' and estado <> 'resuelta') then
        v_resultado := case when public.reintentar_otorgamiento_orden(p_orden, 'Reintento automático ante un nuevo aviso de la pasarela')
                            then 'procesado: otorgamiento_recuperado' else 'requiere_revision' end;
      else
        v_resultado := 'ignorado: ya_aprobada';
      end if;
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
          -- Un período por ítem, con las condiciones que la persona aceptó. Si no se puede otorgar,
          -- queda una incidencia (nunca un pago confirmado sin acceso ni aviso).
          v_otorgado := public.otorgar_compra_curso(v_item.id, p_id_evento);
          if v_otorgado in ('sin_condiciones', 'fallido') then v_revision := true; end if;
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
        if v_revision then v_resultado := 'requiere_revision'; end if;
      elsif v_resultado = 'requiere_reembolso' then
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
      if p_estado = 'reembolsado' and p_monto_centavos < v_orden.total_centavos then
        -- Reembolso parcial confirmado: no revoca derechos por sí solo; la admin decide.
        insert into public.incidencias (tipo, orden_id, perfil_id, detalle)
        values ('reembolso_parcial', p_orden, v_orden.perfil_id,
                jsonb_build_object('monto_centavos', p_monto_centavos, 'total_centavos', v_orden.total_centavos, 'evento', p_id_evento))
        on conflict (tipo, orden_id) where orden_id is not null
        do update set estado = 'abierta', detalle = excluded.detalle, actualizado_en = now();
        insert into public.auditoria (accion, entidad, entidad_id, despues)
        values ('reembolso_parcial', 'ordenes', p_orden::text, jsonb_build_object('evento', p_id_evento, 'monto_centavos', p_monto_centavos));
        v_resultado := 'requiere_revision';
      else
        update public.ordenes set estado = case p_estado when 'reembolsado' then 'reembolsada' else 'contracargo' end where id = p_orden;
        -- Solo los derechos de esta compra: otras compras, becas, avances y certificados no se tocan.
        perform public.revocar_periodos_orden(p_orden, case p_estado when 'reembolsado' then 'Reembolso confirmado' else 'Contracargo confirmado' end, p_id_evento);
        update public.inscripciones_taller set estado = 'reembolsada'
         where estado in ('confirmada','reembolso_pendiente') and item_orden_id in (select id from public.items_orden where orden_id = p_orden);
        insert into public.auditoria (accion, entidad, entidad_id, despues)
        values ('orden_' || p_estado, 'ordenes', p_orden::text, jsonb_build_object('evento', p_id_evento));
        v_resultado := 'procesado';
      end if;
    else
      v_resultado := 'ignorado: orden_' || v_orden.estado;
    end if;
  else
    v_resultado := 'ignorado: estado_pendiente';
  end if;

  update public.eventos_pasarela set resultado = v_resultado where id = v_evento;
  return v_resultado;
end; $$;

drop function public.acceso_cubierto(uuid, timestamptz);
drop function public.proximo_inicio_acceso(uuid);

revoke execute on function public.version_de(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.estado_finalizacion_de(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.cambiar_version(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.procesar_evento_pago(text, text, text, jsonb, uuid, text, text, int) from public, anon, authenticated;
revoke execute on function public.revocar_periodos_orden(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cambiar_version(uuid, uuid, uuid, text) to service_role;
grant execute on function public.procesar_evento_pago(text, text, text, jsonb, uuid, text, text, int) to service_role;
revoke execute on function public.mis_accesos() from public, anon;
grant execute on function public.mis_accesos() to authenticated;
revoke execute on function public.seguimiento_curso(uuid) from public, anon;
grant execute on function public.seguimiento_curso(uuid) to authenticated;
revoke execute on function public.oferta_curso(uuid) from public, anon;
grant execute on function public.oferta_curso(uuid) to authenticated;
