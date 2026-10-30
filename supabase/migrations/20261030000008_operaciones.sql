-- Albor · 0008 · Operaciones del servidor
-- Funciones que concentran las reglas críticas. Solo las ejecuta el servidor (service_role);
-- el navegador nunca puede llamarlas.

-- Crea (o reutiliza) una orden pendiente para un curso o un taller.
-- Para talleres con cupo, reserva un lugar con bloqueo de fila: dos compras simultáneas
-- del último lugar no pueden ganar ambas.
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

-- Procesa una notificación de la pasarela. Idempotente: el mismo evento dos veces
-- devuelve 'duplicado' y no cambia nada. El acceso se concede exactamente una vez.
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

-- Libera reservas vencidas y marca sus órdenes como vencidas. La llama una tarea programada.
create or replace function public.vencer_reservas()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  with vencidas as (
    update public.reservas_cupo set liberada_en = now()
     where liberada_en is null and vence_en <= now()
    returning orden_id
  )
  update public.ordenes o set estado = 'vencida'
    from vencidas v where o.id = v.orden_id and o.estado = 'pendiente';
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

-- Corrige una evaluación en el servidor. Las respuestas llegan como
-- {"<pregunta_id>": ["<opcion_id>", ...]}.
create or replace function public.corregir_evaluacion(p_perfil uuid, p_evaluacion uuid, p_respuestas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_eval public.evaluaciones%rowtype;
  v_numero int;
  v_total int := 0;
  v_correctas int := 0;
  v_pregunta record;
  v_elegidas uuid[];
  v_esperadas uuid[];
  v_ok boolean;
  v_intento uuid;
  v_puntaje int;
  v_aprobado boolean;
begin
  select * into v_eval from public.evaluaciones where id = p_evaluacion;
  if not found then raise exception 'evaluacion_inexistente' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.accesos_curso where perfil_id = p_perfil and curso_id = v_eval.curso_id and estado = 'activo') then
    raise exception 'sin_acceso' using errcode = 'P0001';
  end if;

  -- Bloqueo por persona y evaluación para numerar intentos sin carreras.
  perform pg_advisory_xact_lock(hashtext(p_perfil::text || p_evaluacion::text));
  select coalesce(max(numero), 0) + 1 into v_numero from public.intentos_evaluacion
   where perfil_id = p_perfil and evaluacion_id = p_evaluacion;
  if v_eval.intentos_permitidos is not null and v_numero > v_eval.intentos_permitidos then
    raise exception 'sin_intentos' using errcode = 'P0001';
  end if;

  insert into public.intentos_evaluacion (perfil_id, evaluacion_id, numero, puntaje, aprobado)
  values (p_perfil, p_evaluacion, v_numero, 0, false) returning id into v_intento;

  for v_pregunta in select id, tipo from public.preguntas where evaluacion_id = p_evaluacion order by orden loop
    v_total := v_total + 1;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_elegidas
      from jsonb_array_elements_text(coalesce(p_respuestas -> v_pregunta.id::text, '[]'::jsonb)) as x
     where x::uuid in (select id from public.opciones where pregunta_id = v_pregunta.id);
    select coalesce(array_agg(id), '{}') into v_esperadas from public.opciones
     where pregunta_id = v_pregunta.id and es_correcta;
    v_ok := (v_pregunta.tipo <> 'unica' or cardinality(v_elegidas) = 1)
            and v_elegidas @> v_esperadas and v_esperadas @> v_elegidas;
    if v_ok then v_correctas := v_correctas + 1; end if;
    insert into public.respuestas_intento (intento_id, pregunta_id, opciones_elegidas, correcta)
    values (v_intento, v_pregunta.id, v_elegidas, v_ok);
  end loop;

  if v_total = 0 then raise exception 'evaluacion_sin_preguntas' using errcode = 'P0001'; end if;
  v_puntaje := round(100.0 * v_correctas / v_total);
  v_aprobado := v_puntaje >= v_eval.puntaje_minimo;
  update public.intentos_evaluacion set puntaje = v_puntaje, aprobado = v_aprobado where id = v_intento;

  return jsonb_build_object(
    'intento', v_numero, 'puntaje', v_puntaje, 'aprobado', v_aprobado,
    'mensaje', case when v_aprobado then v_eval.mensaje_aprobado else v_eval.mensaje_desaprobado end,
    'intentos_restantes', case when v_eval.intentos_permitidos is null then null else v_eval.intentos_permitidos - v_numero end);
end; $$;

-- Emite el certificado si se cumplen las tres condiciones. Si ya existe, devuelve el mismo.
create or replace function public.emitir_certificado(p_perfil uuid, p_curso uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cert uuid;
  v_intento uuid;
  v_pendientes int;
begin
  select id into v_cert from public.certificados where perfil_id = p_perfil and curso_id = p_curso;
  if v_cert is not null then return v_cert; end if;

  if not exists (select 1 from public.accesos_curso where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo') then
    raise exception 'sin_acceso' using errcode = 'P0001';
  end if;
  select count(*) into v_pendientes
    from public.lecciones l join public.modulos m on m.id = l.modulo_id
   where m.curso_id = p_curso
     and not exists (select 1 from public.progreso_leccion p
                      where p.leccion_id = l.id and p.perfil_id = p_perfil and p.completada_en is not null);
  if v_pendientes > 0 then raise exception 'lecciones_pendientes: %', v_pendientes using errcode = 'P0001'; end if;

  select i.id into v_intento from public.intentos_evaluacion i
    join public.evaluaciones e on e.id = i.evaluacion_id
   where e.curso_id = p_curso and i.perfil_id = p_perfil and i.aprobado
   order by i.entregado_en desc limit 1;
  if v_intento is null then raise exception 'evaluacion_no_aprobada' using errcode = 'P0001'; end if;

  insert into public.certificados (perfil_id, curso_id, intento_id, nombre_en_certificado, titulo_curso)
  select p_perfil, p_curso, v_intento, pf.nombre_completo, c.titulo
    from public.perfiles pf, public.cursos c where pf.id = p_perfil and c.id = p_curso
  on conflict (perfil_id, curso_id) do nothing
  returning id into v_cert;
  if v_cert is null then
    select id into v_cert from public.certificados where perfil_id = p_perfil and curso_id = p_curso;
  end if;
  return v_cert;
end; $$;

-- Acceso excepcional (beca, cortesía) concedido por la administradora, con motivo y auditoría.
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

-- Ninguna de estas funciones es invocable desde el navegador.
revoke execute on function public.crear_orden(uuid, text, uuid, text, int) from public, anon, authenticated;
revoke execute on function public.procesar_evento_pago(text, text, text, jsonb, uuid, text, text, int) from public, anon, authenticated;
revoke execute on function public.vencer_reservas() from public, anon, authenticated;
revoke execute on function public.corregir_evaluacion(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.emitir_certificado(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.conceder_acceso(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.crear_orden(uuid, text, uuid, text, int) to service_role;
grant execute on function public.procesar_evento_pago(text, text, text, jsonb, uuid, text, text, int) to service_role;
grant execute on function public.vencer_reservas() to service_role;
grant execute on function public.corregir_evaluacion(uuid, uuid, jsonb) to service_role;
grant execute on function public.emitir_certificado(uuid, uuid) to service_role;
grant execute on function public.conceder_acceso(uuid, uuid, uuid, text) to service_role;
