-- Fase 6B, preparación local (03/11/2026). SOLO entornos locales o de prueba: no autorizada en producción.
--
-- 1. Autorización de video en la base: el servidor obtiene el id privado de un video solo a través de
--    autorizar_video_leccion, que comprueba acceso vigente, versión académica de la persona y bloqueo. Hasta
--    ahora lo decidía únicamente la aplicación.
-- 2. Cola de correos transaccionales (envios_correo): estados creado, pendiente, enviando, enviado, simulado y
--    fallido; reintentos con espera creciente; idempotencia por clave. «simulado» nunca cuenta como enviado.
--    No se envía nada: el proveedor real no está contratado. La confirmación de cuenta y la recuperación de
--    contraseña las envía Supabase Auth (requieren su configuración de SMTP), no esta cola.

-- ============================================================ 1. Video
create or replace function public.autorizar_video_leccion(p_perfil uuid, p_leccion uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_curso uuid; v_acceso uuid; v_version uuid; v_leccion public.lecciones%rowtype;
begin
  select * into v_leccion from public.lecciones where id = p_leccion;
  if v_leccion.id is null then return jsonb_build_object('estado', 'leccion_inexistente'); end if;
  select m.curso_id into v_curso from public.modulos m where m.id = v_leccion.modulo_id;
  select id into v_acceso from public.accesos_curso where perfil_id = p_perfil and curso_id = v_curso and estado = 'activo';
  if v_acceso is null then return jsonb_build_object('estado', 'sin_acceso'); end if;
  if not public.acceso_cubierto(v_acceso) then return jsonb_build_object('estado', 'acceso_vencido'); end if;
  if v_leccion.bloqueada then return jsonb_build_object('estado', 'leccion_bloqueada'); end if;
  v_version := public.version_de(p_perfil, v_curso);
  if v_version is null or not exists (select 1 from public.lecciones_de_version(v_version) l(id) where l.id = p_leccion) then
    return jsonb_build_object('estado', 'fuera_de_su_version');
  end if;
  if v_leccion.video_id is null then return jsonb_build_object('estado', 'sin_video'); end if;
  return jsonb_build_object('estado', 'autorizado', 'video_id', v_leccion.video_id);
end; $$;
revoke execute on function public.autorizar_video_leccion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.autorizar_video_leccion(uuid, uuid) to service_role;

-- ============================================================ 2. Correos transaccionales
alter table public.envios_correo drop constraint if exists envios_correo_estado_check;
alter table public.envios_correo
  add column variables jsonb not null default '{}'::jsonb,
  add column intentos int not null default 0,
  add column proximo_intento_en timestamptz not null default now(),
  add column enviado_en timestamptz,
  add column proveedor text,
  add column actualizado_en timestamptz not null default now(),
  add constraint envios_correo_estado_check check (estado in ('creado', 'pendiente', 'enviando', 'enviado', 'simulado', 'fallido'));
create index envios_correo_cola_idx on public.envios_correo (proximo_intento_en) where estado = 'pendiente';

insert into public.plantillas_correo (clave, asunto, cuerpo) values
  ('confirmacion_compra', 'Su compra en Albor', 'Hola, {{nombre}}. Recibimos su pago por «{{curso}}». Ya puede empezar desde Mis cursos.'),
  ('aviso_vencimiento', 'Su acceso a «{{curso}}» vence el {{fecha}}', 'Hola, {{nombre}}. Su acceso a «{{curso}}» vence el {{fecha}}. Sus certificados y su avance se conservan.'),
  ('comunicacion_importante', '{{titulo}}', 'Hola, {{nombre}}. {{mensaje}}')
on conflict (clave) do nothing;

-- Registra un correo en la cola (idempotente por clave). No acepta variables con nombre de secreto.
create or replace function public.encolar_correo(p_plantilla text, p_destinatario text, p_perfil uuid, p_variables jsonb, p_clave text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; k text;
begin
  if not exists (select 1 from public.plantillas_correo where clave = p_plantilla) then raise exception 'plantilla_inexistente' using errcode = 'P0001'; end if;
  if p_destinatario is null or p_destinatario !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'destinatario_invalido' using errcode = 'P0001'; end if;
  if char_length(coalesce(p_clave, '')) < 5 then raise exception 'clave_requerida' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(coalesce(p_variables, '{}'::jsonb)) loop
    if k ~* '(clave|contrasena|password|token|secret|tarjeta|cvv)' then raise exception 'variable_no_permitida: %', k using errcode = 'P0001'; end if;
  end loop;
  insert into public.envios_correo (perfil_id, plantilla_clave, destinatario, clave_idempotencia, variables, estado)
  values (p_perfil, p_plantilla, lower(btrim(p_destinatario)), p_clave, coalesce(p_variables, '{}'::jsonb), 'pendiente')
  on conflict (clave_idempotencia) do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.envios_correo where clave_idempotencia = p_clave; end if;
  return v_id;
end; $$;

-- Toma un lote para enviar. Dos procesos a la vez nunca toman el mismo correo (skip locked).
create or replace function public.tomar_correos(p_limite int)
returns setof public.envios_correo language sql security definer set search_path = public as $$
  update public.envios_correo e set estado = 'enviando', intentos = e.intentos + 1, actualizado_en = now()
   where e.id in (select id from public.envios_correo where estado = 'pendiente' and proximo_intento_en <= now()
                   order by creado_en limit greatest(1, least(p_limite, 100)) for update skip locked)
  returning e.*;
$$;

-- Resultado de un intento. «simulado» queda distinto de «enviado». Un error vuelve a la cola con espera creciente
-- (2, 4, 8, 16 minutos) y queda «fallido» al quinto intento. El texto del error se recorta y nunca debe traer secretos.
create or replace function public.registrar_envio_correo(p_id uuid, p_resultado text, p_proveedor text, p_id_externo text, p_error text)
returns text language plpgsql security definer set search_path = public as $$
declare v public.envios_correo%rowtype; v_estado text;
begin
  select * into v from public.envios_correo where id = p_id for update;
  if v.id is null or v.estado <> 'enviando' then raise exception 'envio_no_en_curso' using errcode = 'P0001'; end if;
  if p_resultado = 'enviado' then
    if p_proveedor is null or p_proveedor = 'simulado' then raise exception 'simulado_no_es_enviado' using errcode = 'P0001'; end if;
    v_estado := 'enviado';
  elsif p_resultado = 'simulado' then v_estado := 'simulado';
  elsif p_resultado = 'error' then v_estado := case when v.intentos >= 5 then 'fallido' else 'pendiente' end;
  else raise exception 'resultado_invalido' using errcode = 'P0001';
  end if;
  update public.envios_correo set estado = v_estado, proveedor = p_proveedor, id_externo = p_id_externo,
         error = case when p_resultado = 'error' then left(coalesce(p_error, 'error'), 300) end,
         enviado_en = case when v_estado = 'enviado' then now() end,
         proximo_intento_en = case when v_estado = 'pendiente' then now() + make_interval(mins => power(2, v.intentos)::int) else proximo_intento_en end,
         actualizado_en = now()
   where id = p_id;
  return v_estado;
end; $$;

-- Un correo que quedó «enviando» porque el proceso se cortó vuelve a la cola después de 15 minutos.
create or replace function public.recuperar_correos_trabados()
returns int language sql security definer set search_path = public as $$
  with r as (update public.envios_correo set estado = 'pendiente', actualizado_en = now()
              where estado = 'enviando' and actualizado_en < now() - interval '15 minutes' returning 1)
  select count(*)::int from r;
$$;

-- Confirmación de compra: se registra en la cola cuando una orden pasa a aprobada. Si algo falla al registrar el
-- correo, el pago no se ve afectado (queda en el registro de actividad para revisarlo).
create or replace function public.correo_confirmacion_compra()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_correo text; v_nombre text; v_items text;
begin
  if new.estado <> 'aprobada' or old.estado = 'aprobada' or new.perfil_id is null then return new; end if;
  select u.email, p.nombre_completo into v_correo, v_nombre from auth.users u join public.perfiles p on p.id = u.id where u.id = new.perfil_id;
  select string_agg(descripcion, ', ' order by descripcion) into v_items from public.items_orden where orden_id = new.id;
  begin
    perform public.encolar_correo('confirmacion_compra', v_correo, new.perfil_id,
      jsonb_build_object('nombre', split_part(coalesce(v_nombre, ''), ' ', 1), 'curso', coalesce(v_items, 'su compra')),
      'confirmacion_compra:' || new.id);
  exception when others then
    insert into public.auditoria (accion, entidad, entidad_id, despues)
    values ('correo_no_registrado', 'ordenes', new.id::text, jsonb_build_object('motivo', sqlerrm));
  end;
  return new;
end; $$;
create trigger ordenes_correo_confirmacion after update of estado on public.ordenes
  for each row execute function public.correo_confirmacion_compra();

-- Avisos de vencimiento: registra un aviso por período que vence dentro de p_dias. NO está programado: la
-- anticipación es una decisión pendiente de la maestra. Idempotente por acceso y fecha de vencimiento.
create or replace function public.encolar_avisos_vencimiento(p_dias int)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if p_dias is null or p_dias < 1 or p_dias > 60 then raise exception 'dias_invalidos' using errcode = 'P0001'; end if;
  for r in select a.id, a.perfil_id, a.vence_en, c.titulo, u.email, p.nombre_completo
             from public.accesos_curso a join public.cursos c on c.id = a.curso_id
             join auth.users u on u.id = a.perfil_id join public.perfiles p on p.id = a.perfil_id
            where a.estado = 'activo' and a.vence_en is not null and a.vence_en > now() and a.vence_en <= now() + make_interval(days => p_dias)
              and public.proximo_inicio_acceso(a.id) is null loop
    perform public.encolar_correo('aviso_vencimiento', r.email, r.perfil_id,
      jsonb_build_object('nombre', split_part(coalesce(r.nombre_completo, ''), ' ', 1), 'curso', r.titulo,
                         'fecha', to_char(r.vence_en at time zone 'America/Guatemala', 'DD/MM/YYYY')),
      'aviso_vencimiento:' || r.id || ':' || to_char(r.vence_en, 'YYYY-MM-DD'));
    n := n + 1;
  end loop;
  return n;
end; $$;

revoke execute on function public.encolar_correo(text, text, uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function public.tomar_correos(int) from public, anon, authenticated;
revoke execute on function public.registrar_envio_correo(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.recuperar_correos_trabados() from public, anon, authenticated;
revoke execute on function public.encolar_avisos_vencimiento(int) from public, anon, authenticated;
grant execute on function public.encolar_correo(text, text, uuid, jsonb, text) to service_role;
grant execute on function public.tomar_correos(int) to service_role;
grant execute on function public.registrar_envio_correo(uuid, text, text, text, text) to service_role;
grant execute on function public.recuperar_correos_trabados() to service_role;
grant execute on function public.encolar_avisos_vencimiento(int) to service_role;
