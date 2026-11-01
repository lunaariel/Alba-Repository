-- Albor · 0025 · Períodos futuros y reembolsos parciales (decisiones A y B de la titular, 01/11/2026)
--
-- A. Si se revoca un período que tiene una renovación posterior ya concedida, la renovación conserva sus
--    fechas originales: no se adelanta, no se crean períodos y no se toca nada más. El intervalo sin período
--    queda sin acceso y el período siguiente se activa al llegar su fecha. Para eso, el acceso vigente se
--    decide por cobertura: hay acceso si un período activo cubre el momento (acceso_cubierto), no por el
--    último vencimiento. accesos_curso.vence_en sigue siendo el fin del último período activo («hasta cuándo»).
-- B. Todo reembolso parcial requiere revisión administrativa: se registra el importe (reembolsos), se conserva
--    el importe original del pago, se actualiza una incidencia pendiente y el acceso no cambia. La admin puede
--    registrar su resolución por escrito; esa resolución no modifica accesos (no hay política aprobada).
-- SOLO entornos locales o de prueba: no autorizada en producción.

-- ============================================================ 1. Cobertura
create or replace function public.acceso_cubierto(p_acceso uuid, p_momento timestamptz default now())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_acceso is not null and exists (
    select 1 from public.periodos_acceso p join public.accesos_curso a on a.id = p.acceso_id
     where p.acceso_id = p_acceso and a.estado = 'activo' and p.estado = 'activo'
       and p.inicia_en <= p_momento and (p.vence_en is null or p.vence_en > p_momento)), false);
$$;

-- Inicio del próximo período activo que todavía no empezó (derechos futuros), o nulo.
create or replace function public.proximo_inicio_acceso(p_acceso uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select min(inicia_en) from public.periodos_acceso where acceso_id = p_acceso and estado = 'activo' and inicia_en > now();
$$;

create or replace function public.tiene_acceso(p_curso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.accesos_curso a
    where a.perfil_id = auth.uid() and a.curso_id = p_curso and a.estado = 'activo' and public.acceso_cubierto(a.id)
  );
$$;

create or replace function public.version_de(p_perfil uuid, p_curso uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select a.version_id from public.accesos_curso a
   where a.perfil_id = p_perfil and a.curso_id = p_curso and a.estado = 'activo' and public.acceso_cubierto(a.id);
$$;

create or replace function public.estado_finalizacion_de(p_perfil uuid, p_curso uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.versiones_curso%rowtype;
  v_pend int; v_act boolean := false; v_val boolean := false; v_aprob boolean := false; v_fin boolean;
  v_vence timestamptz; v_acceso uuid; v_cubierto boolean; v_proximo timestamptz;
begin
  select * into v from public.versiones_curso where id = public.version_historica_de(p_perfil, p_curso);
  if v.id is null then return null; end if;
  select id, vence_en into v_acceso, v_vence from public.accesos_curso where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo';
  v_cubierto := public.acceso_cubierto(v_acceso);
  v_proximo := public.proximo_inicio_acceso(v_acceso);
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
    -- «vencido» = sin acceso en este momento (también en un intervalo antes de un período futuro).
    'vence_en', v_vence, 'vencido', not v_cubierto, 'proximo_inicio', v_proximo);
end; $$;

drop function public.mis_accesos();
create function public.mis_accesos()
returns table (curso_id uuid, inicia_en timestamptz, vence_en timestamptz, vencido boolean, condiciones jsonb,
               vigente boolean, proximo_inicio timestamptz)
language sql stable security definer set search_path = public as $$
  select a.curso_id, a.inicia_en, a.vence_en, not public.acceso_cubierto(a.id), a.condiciones,
         public.acceso_cubierto(a.id), public.proximo_inicio_acceso(a.id)
    from public.accesos_curso a where a.perfil_id = auth.uid() and a.estado = 'activo';
$$;

drop function public.seguimiento_curso(uuid);
create function public.seguimiento_curso(p_curso uuid)
returns table (perfil_id uuid, nombre text, version int, estado jsonb, envios_formativos int, ultimo_envio timestamptz,
               validacion_id uuid, tiene_certificado boolean, inicia_en timestamptz, vence_en timestamptz,
               vigente boolean, proximo_inicio timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return query
  select a.perfil_id, pf.nombre_completo, v.numero, public.estado_finalizacion_de(a.perfil_id, p_curso),
         (select count(*)::int from public.intentos_evaluacion i where i.perfil_id = a.perfil_id and i.version_id = a.version_id and i.formativo),
         (select max(i.entregado_en) from public.intentos_evaluacion i where i.perfil_id = a.perfil_id and i.version_id = a.version_id and i.formativo),
         (select f.id from public.validaciones_formativas f where f.perfil_id = a.perfil_id and f.version_id = a.version_id and f.anulada_en is null),
         exists (select 1 from public.certificados c where c.perfil_id = a.perfil_id and c.curso_id = p_curso and c.version_id = a.version_id),
         a.inicia_en, a.vence_en, public.acceso_cubierto(a.id), public.proximo_inicio_acceso(a.id)
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
  -- Sin un período que cubra este momento (vencido o en un intervalo sin cobertura) no hay cambio de versión.
  if not public.acceso_cubierto(v_acceso.id) then raise exception 'acceso_vencido' using errcode = 'P0001'; end if;
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
    when v_a.id is not null and public.acceso_cubierto(v_a.id) then 'vigente'
    -- Derecho futuro ya concedido (por ejemplo, una renovación después de un período revocado).
    when v_a.id is not null and (v_a.vence_en is null or v_a.vence_en > now()) then 'programado'
    when v_a.id is not null or exists (select 1 from public.accesos_curso where perfil_id = auth.uid() and curso_id = p_curso) then 'renovacion'
    else 'nueva' end;
  v_total := v_c.duracion_comercial_meses + public.meses_adicionales_acceso();
  v_inicio := now();
  return jsonb_build_object(
    'disponible', v_c.duracion_comercial_meses is not null and v_situacion not in ('vigente', 'programado'),
    'situacion', v_situacion, 'precio_centavos', v_c.precio_centavos,
    'duracion_meses', v_c.duracion_comercial_meses, 'meses_adicionales', public.meses_adicionales_acceso(), 'total_meses', v_total,
    'vence_si_confirma_hoy', case when v_total is not null then public.calcular_vencimiento(v_inicio, v_total) end,
    'vence_actual', v_a.vence_en, 'proximo_inicio', public.proximo_inicio_acceso(v_a.id));
end; $$;

-- ============================================================ 2. Revocación sin adelantar renovaciones (A)
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
  -- Decisión A (01/11/2026): los períodos posteriores conservan sus fechas originales; no se adelantan ni
  -- se crean períodos nuevos. El acceso se decide por cobertura (acceso_cubierto), así que un intervalo sin
  -- período queda sin acceso y el siguiente se activa en su fecha.
  return v_n;
end; $$;

-- ============================================================ 3. Reembolsos parciales (B)
-- El mismo aviso de la pasarela no registra dos reembolsos.
create unique index reembolsos_evento_unico on public.reembolsos (pago_id, id_externo) where id_externo is not null;

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
  v_parcial boolean;
  v_pago uuid;
  v_previos int;
  v_original int;
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

  -- Un reembolso parcial confirmado (importe menor que el total de la orden) no cambia el pago: el pago
  -- conserva su estado e importe original y el reembolso se registra aparte (decisión B, 01/11/2026).
  -- Un reembolso total o un contracargo cambian el estado, pero nunca el importe pagado.
  v_parcial := p_estado = 'reembolsado' and p_monto_centavos < v_orden.total_centavos;
  insert into public.pagos (orden_id, proveedor, id_externo, estado, monto_centavos)
  values (p_orden, p_proveedor, p_id_pago_externo, p_estado, p_monto_centavos)
  on conflict (proveedor, id_externo) do update
    set estado = case when v_parcial then pagos.estado else excluded.estado end,
        monto_centavos = case when excluded.estado in ('reembolsado', 'contracargo') then pagos.monto_centavos else excluded.monto_centavos end
  returning id into v_pago;

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
      if v_parcial then
        -- Reembolso parcial: se registra el importe, se conserva el original y el acceso no cambia. La
        -- incidencia queda pendiente de revisión administrativa; nada la cierra sola.
        v_original := (select monto_centavos from public.pagos where id = v_pago);
        v_previos := coalesce((select sum(monto_centavos) from public.reembolsos where pago_id = v_pago and estado = 'completado'), 0);
        if v_previos + p_monto_centavos <= v_original then
          insert into public.reembolsos (pago_id, monto_centavos, motivo, estado, id_externo)
          values (v_pago, p_monto_centavos, 'Reembolso parcial confirmado por la pasarela (evento ' || p_id_evento || ')', 'completado', p_id_evento);
        end if;
        insert into public.incidencias (tipo, orden_id, perfil_id, detalle)
        values ('reembolso_parcial', p_orden, v_orden.perfil_id,
                jsonb_build_object('pago', v_pago, 'importe_original_centavos', v_original, 'total_orden_centavos', v_orden.total_centavos,
                                   'ultimo_reembolso_centavos', p_monto_centavos,
                                   'reembolsado_centavos', v_previos + case when v_previos + p_monto_centavos <= v_original then p_monto_centavos else 0 end,
                                   'excede_lo_pagado', v_previos + p_monto_centavos > v_original,
                                   'items', (select jsonb_agg(id) from public.items_orden where orden_id = p_orden),
                                   'evento', p_id_evento, 'requiere_revision_administrativa', true))
        on conflict (tipo, orden_id) where orden_id is not null
        do update set estado = 'abierta', detalle = excluded.detalle, actualizado_en = now();
        insert into public.auditoria (accion, entidad, entidad_id, despues)
        values ('reembolso_parcial', 'ordenes', p_orden::text,
                jsonb_build_object('evento', p_id_evento, 'monto_centavos', p_monto_centavos, 'importe_original_centavos', v_original));
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

-- La admin registra por escrito cómo resolvió un reembolso parcial. No modifica accesos, períodos, compras ni
-- certificados: si correspondiera un cambio, se hace por los caminos existentes (reembolso total confirmado
-- por la pasarela o beca), cuando haya una política aprobada.
create or replace function public.resolver_reembolso_parcial(p_incidencia uuid, p_resolucion text)
returns void language plpgsql security definer set search_path = public as $$
declare v_i public.incidencias%rowtype;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_resolucion, ''))) < 20 then raise exception 'resolucion_requerida' using errcode = 'P0001'; end if;
  select * into v_i from public.incidencias where id = p_incidencia for update;
  if v_i.id is null or v_i.tipo <> 'reembolso_parcial' then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  if v_i.estado = 'resuelta' then raise exception 'incidencia_resuelta' using errcode = 'P0001'; end if;
  update public.incidencias set estado = 'resuelta', nota = btrim(p_resolucion), actualizado_en = now() where id = p_incidencia;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (auth.uid(), 'reembolso_parcial_resuelto', 'incidencias', p_incidencia::text,
          jsonb_build_object('estado', v_i.estado, 'detalle', v_i.detalle), jsonb_build_object('estado', 'resuelta', 'resolucion', btrim(p_resolucion)));
end; $$;

-- ============================================================ 4. Permisos
revoke execute on function public.acceso_cubierto(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.proximo_inicio_acceso(uuid) from public, anon, authenticated;
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
revoke execute on function public.resolver_reembolso_parcial(uuid, text) from public, anon;
grant execute on function public.resolver_reembolso_parcial(uuid, text) to authenticated;
