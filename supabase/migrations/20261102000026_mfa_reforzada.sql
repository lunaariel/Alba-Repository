-- Fase 6A: segundo factor de la administradora y verificación reforzada. SOLO entornos locales o de prueba:
-- no autorizada en producción.
--
-- 1. Política de seguridad (fila única). Nace APAGADA: ninguna cuenta existente cambia su acceso al aplicar esta
--    migración. Se enciende solo por script del servidor con responsable identificado (scripts/politica-mfa.sql),
--    después de que la administradora registró su segundo factor. Apagarla es igual de simple: no hay bloqueos
--    irreversibles.
-- 2. Con la política encendida, es_admin() exige además que el token de la sesión tenga nivel aal2 (segundo factor
--    verificado por Supabase Auth). El token lo firma Auth y lo verifica PostgREST: la base no confía en el
--    navegador. Así, RLS y todas las funciones del panel rechazan una sesión de admin sin segundo factor, aunque
--    alguien llame a la API directamente sin pasar por la aplicación.
-- 3. Verificación reforzada: las operaciones de mayor impacto exigen, además, que el segundo factor se haya
--    verificado hace pocos minutos en ESA sesión (claim amr de Auth). Cada verificación sirve para UNA sola
--    operación (una transacción): queda consumida en verificaciones_reforzadas y en la auditoría. No se guarda
--    ningún código ni secreto: solo el identificador de la sesión y el instante de la verificación.
-- 4. D8: límite de frecuencia de los envíos formativos (por persona y minuto, en la base).
-- 5. D9: la alumna deja de leer por la API sus envíos formativos (con el puntaje interno).
-- 6. D12: la baja de un rol admin en cascada (al eliminar el usuario) queda admitida y auditada como tal.

-- ============================================================ 1. Política de seguridad
create table public.politica_seguridad (
  id boolean primary key default true check (id),
  mfa_admin_obligatorio boolean not null default false,
  reforzada_minutos integer not null default 5 check (reforzada_minutos between 1 and 15),
  actualizado_en timestamptz not null default now(),
  actualizado_por text
);
insert into public.politica_seguridad (id) values (true);
alter table public.politica_seguridad enable row level security;
-- Sin políticas: ningún cliente la lee ni la cambia directamente. Se lee con politica_seguridad_vigente().
revoke all on public.politica_seguridad from anon, authenticated;

create or replace function public.politica_seguridad_vigente()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('mfa_admin_obligatorio', mfa_admin_obligatorio, 'reforzada_minutos', reforzada_minutos)
    from public.politica_seguridad where id
$$;
revoke execute on function public.politica_seguridad_vigente() from public, anon;
grant execute on function public.politica_seguridad_vigente() to authenticated, service_role;

-- Cambiar la política: solo un script del servidor (sin sesión) con responsable; queda auditado.
create or replace function public.auditar_politica_seguridad()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_responsable text := btrim(coalesce(current_setting('albor.responsable', true), ''));
begin
  if auth.uid() is not null then raise exception 'solo_por_script' using errcode = '42501'; end if;
  if char_length(v_responsable) < 3 then
    raise exception 'responsable_requerido' using errcode = 'P0001',
      hint = 'Ejecute el script con -v responsable="''Nombre o correo de quien lo hace''"';
  end if;
  new.actualizado_en := now();
  new.actualizado_por := v_responsable;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (null, 'politica_seguridad_cambiada', 'politica_seguridad', 'unica',
          jsonb_build_object('mfa_admin_obligatorio', old.mfa_admin_obligatorio, 'reforzada_minutos', old.reforzada_minutos),
          jsonb_build_object('mfa_admin_obligatorio', new.mfa_admin_obligatorio, 'reforzada_minutos', new.reforzada_minutos,
                             'responsable', v_responsable));
  return new;
end; $$;
create trigger politica_seguridad_auditada before update on public.politica_seguridad
  for each row execute function public.auditar_politica_seguridad();
create trigger politica_seguridad_sin_borrar before delete on public.politica_seguridad
  for each row execute function public.bloquear_cambios_auditoria();

-- ============================================================ 2. Nivel de la sesión y rol admin
-- Claims del token de la solicitud (PostgREST los fija después de verificar la firma). Sin token: vacío.
create or replace function public.claims_sesion()
returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
revoke execute on function public.claims_sesion() from public, anon, authenticated;

create or replace function public.mfa_admin_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select mfa_admin_obligatorio from public.politica_seguridad where id), false)
$$;
revoke execute on function public.mfa_admin_activo() from public, anon, authenticated;

-- Rol admin sin mirar el segundo factor: lo usa la aplicación para decidir a quién pedirle el segundo factor
-- al ingresar. Solo dice algo de la propia persona; no da ningún permiso.
create or replace function public.tiene_rol_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.roles_usuario where perfil_id = auth.uid() and rol = 'admin')
$$;
revoke execute on function public.tiene_rol_admin() from public, anon;
grant execute on function public.tiene_rol_admin() to authenticated;

-- es_admin(): rol admin y, con la política encendida, token con segundo factor (aal2).
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.roles_usuario where perfil_id = auth.uid() and rol = 'admin')
     and (not public.mfa_admin_activo() or coalesce(public.claims_sesion() ->> 'aal', '') = 'aal2')
$$;

-- ============================================================ 3. Verificación reforzada
create table public.verificaciones_reforzadas (
  id bigint generated always as identity primary key,
  perfil_id uuid not null,
  sesion_id text not null,
  verificado_en timestamptz not null,
  accion text not null,
  transaccion bigint not null,
  usada_en timestamptz not null default now(),
  unique (sesion_id, verificado_en)
);
alter table public.verificaciones_reforzadas enable row level security;
create policy verificaciones_admin_lee on public.verificaciones_reforzadas for select to authenticated using (public.es_admin());
revoke insert, update, delete on public.verificaciones_reforzadas from anon, authenticated;
create trigger verificaciones_inmutables before update or delete on public.verificaciones_reforzadas
  for each row execute function public.bloquear_cambios_auditoria();

-- Exige que el segundo factor se haya verificado hace menos de N minutos en esta sesión y que esa verificación
-- no se haya usado en otra operación. Una operación que toca varias filas (una sola transacción) la usa una vez.
-- No aplica a: política apagada, clave de servicio y scripts del servidor (tienen sus propios controles y
-- responsable), ni a quien no es admin (RLS ya le niega estas operaciones).
create or replace function public.exigir_verificacion_reforzada(p_accion text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c jsonb := public.claims_sesion();
  v_minutos int; v_ts bigint; v_instante timestamptz; v_tx bigint := txid_current(); v_sesion text;
begin
  if not public.mfa_admin_activo() then return; end if;
  if coalesce(c ->> 'role', '') <> 'authenticated' then return; end if;
  if not exists (select 1 from public.roles_usuario where perfil_id = auth.uid() and rol = 'admin') then return; end if;

  select reforzada_minutos into v_minutos from public.politica_seguridad where id;
  v_sesion := nullif(c ->> 'session_id', '');
  select max((e ->> 'timestamp')::bigint) into v_ts
    from jsonb_array_elements(case when jsonb_typeof(c -> 'amr') = 'array' then c -> 'amr' else '[]'::jsonb end) e
   where e ->> 'method' in ('totp', 'mfa/totp');
  v_instante := to_timestamp(v_ts);
  if c ->> 'aal' is distinct from 'aal2' or v_sesion is null or v_ts is null
     or v_instante < now() - make_interval(mins => v_minutos) or v_instante > now() + interval '1 minute' then
    raise exception 'verificacion_reforzada_requerida' using errcode = '42501';
  end if;

  insert into public.verificaciones_reforzadas (perfil_id, sesion_id, verificado_en, accion, transaccion)
  values (auth.uid(), v_sesion, v_instante, p_accion, v_tx)
  on conflict (sesion_id, verificado_en) do nothing;
  if found then
    insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
    values (auth.uid(), 'verificacion_reforzada', 'seguridad', p_accion,
            jsonb_build_object('accion', p_accion, 'verificado_en', v_instante, 'vigencia_minutos', v_minutos));
  elsif not exists (select 1 from public.verificaciones_reforzadas
                     where sesion_id = v_sesion and verificado_en = v_instante and transaccion = v_tx) then
    raise exception 'verificacion_reforzada_usada' using errcode = '42501';
  end if;
end; $$;
revoke execute on function public.exigir_verificacion_reforzada(text) from public, anon, authenticated;

create or replace function public.tg_verificacion_reforzada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_verificacion_reforzada(tg_argv[0]);
  return coalesce(new, old);
end; $$;

-- Operaciones protegidas. Los cambios rutinarios (textos, temario en borrador, notas) no la piden.
create trigger reforzada_curso before update on public.cursos for each row
  when (old.precio_centavos is distinct from new.precio_centavos or old.estado is distinct from new.estado
        or old.duracion_comercial_meses is distinct from new.duracion_comercial_meses)
  execute function public.tg_verificacion_reforzada('curso_precio_o_publicacion');
create trigger reforzada_curso_eliminar before delete on public.cursos for each row
  execute function public.tg_verificacion_reforzada('curso_eliminar');
create trigger reforzada_version before insert on public.versiones_curso for each row
  execute function public.tg_verificacion_reforzada('publicar_version');
create trigger reforzada_taller before update on public.talleres for each row
  when (old.precio_centavos is distinct from new.precio_centavos or old.estado is distinct from new.estado)
  execute function public.tg_verificacion_reforzada('taller_precio_o_estado');
create trigger reforzada_taller_eliminar before delete on public.talleres for each row
  execute function public.tg_verificacion_reforzada('taller_eliminar');
create trigger reforzada_grabacion before update on public.grabaciones_taller for each row
  when (old.precio_centavos is distinct from new.precio_centavos or old.a_la_venta is distinct from new.a_la_venta
        or old.acceso_compra_dias is distinct from new.acceso_compra_dias
        or old.acceso_compra_sin_vencimiento is distinct from new.acceso_compra_sin_vencimiento)
  execute function public.tg_verificacion_reforzada('grabacion_condiciones_venta');
create trigger reforzada_cupon before insert or update or delete on public.cupones for each row
  execute function public.tg_verificacion_reforzada('cupones');
create trigger reforzada_revision before update on public.revisiones_evaluacion for each row
  when (old.estado is distinct from new.estado and new.estado = 'aplicada')
  execute function public.tg_verificacion_reforzada('aplicar_revision');
create trigger reforzada_bloqueo_leccion before update on public.lecciones for each row
  when (old.bloqueada is distinct from new.bloqueada)
  execute function public.tg_verificacion_reforzada('bloqueo_excepcional');
create trigger reforzada_bloqueo_material before update on public.recursos_leccion for each row
  when (old.bloqueado is distinct from new.bloqueado)
  execute function public.tg_verificacion_reforzada('bloqueo_excepcional');
create trigger reforzada_bloqueo_pregunta before update on public.preguntas for each row
  when (old.bloqueada is distinct from new.bloqueada)
  execute function public.tg_verificacion_reforzada('bloqueo_excepcional');
create trigger reforzada_anular_validacion before update on public.validaciones_formativas for each row
  when (old.anulada_en is distinct from new.anulada_en)
  execute function public.tg_verificacion_reforzada('anular_validacion');
create trigger reforzada_periodo_alta before insert on public.periodos_acceso for each row
  execute function public.tg_verificacion_reforzada('otorgar_acceso');
create trigger reforzada_periodo_revocar before update on public.periodos_acceso for each row
  when (old.estado is distinct from new.estado or old.revocado_en is distinct from new.revocado_en)
  execute function public.tg_verificacion_reforzada('revocar_acceso');
create trigger reforzada_incidencia before update on public.incidencias for each row
  when (old.estado is distinct from new.estado and new.estado = 'resuelta')
  execute function public.tg_verificacion_reforzada('resolver_incidencia');
create trigger reforzada_configuracion before update on public.configuracion_academia for each row
  when (old.talleres_publicos is distinct from new.talleres_publicos or old.moneda is distinct from new.moneda
        or old.correo_contacto is distinct from new.correo_contacto or old.whatsapp is distinct from new.whatsapp
        or old.zona_horaria is distinct from new.zona_horaria)
  execute function public.tg_verificacion_reforzada('configuracion_sensible');
create trigger reforzada_roles before insert or update on public.roles_usuario for each row
  when (new.rol = 'admin')
  execute function public.tg_verificacion_reforzada('rol_admin');
create trigger reforzada_roles_baja before delete on public.roles_usuario for each row
  when (old.rol = 'admin')
  execute function public.tg_verificacion_reforzada('rol_admin');

-- Eventos del segundo factor en el registro de la academia (además del registro propio de Supabase Auth).
-- Solo cuentas con rol admin y con el token ya en aal2 (el evento ocurrió de verdad en esa sesión).
-- Nunca se guarda un código ni un secreto.
create or replace function public.registrar_evento_segundo_factor(p_evento text)
returns void language plpgsql security definer set search_path = public as $$
declare c jsonb := public.claims_sesion();
begin
  if auth.uid() is null then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_evento not in ('segundo_factor_activado', 'segundo_factor_quitado', 'segundo_factor_verificado') then
    raise exception 'evento_invalido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.roles_usuario where perfil_id = auth.uid() and rol = 'admin') then return; end if;
  if coalesce(c ->> 'aal', '') <> 'aal2' then raise exception 'segundo_factor_requerido' using errcode = '42501'; end if;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), p_evento, 'seguridad', auth.uid()::text, jsonb_build_object('sesion_id', c ->> 'session_id'));
end; $$;
revoke execute on function public.registrar_evento_segundo_factor(text) from public, anon;
grant execute on function public.registrar_evento_segundo_factor(text) to authenticated;

-- ============================================================ 4. D8: límite de envíos formativos
-- Como máximo 10 envíos por persona y minuto (todas las evaluaciones). Una persona que estudia no se acerca a
-- ese número; un script que intenta adivinar respuestas, sí. La función sigue siendo solo del servidor.
create or replace function public.registrar_actividad_formativa(p_perfil uuid, p_evaluacion uuid, p_respuestas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_curso uuid; v_version public.versiones_curso%rowtype; v_intento uuid; v_numero int;
  v_pregunta record; v_elegidas uuid[]; v_ok boolean; v_total int := 0; v_respondidas int := 0; v_correctas int := 0;
  v_temas text[] := '{}'; v_completo boolean;
begin
  select curso_id into v_curso from public.evaluaciones where id = p_evaluacion;
  if v_curso is null then raise exception 'evaluacion_inexistente' using errcode = 'P0001'; end if;
  select * into v_version from public.versiones_curso where id = public.version_de(p_perfil, v_curso);
  if v_version.id is null then raise exception 'sin_acceso' using errcode = 'P0001'; end if;
  if v_version.modalidad <> 'formativa' then raise exception 'modalidad_sumativa' using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtext('formativa:' || p_perfil::text));
  if (select count(*) from public.intentos_evaluacion
       where perfil_id = p_perfil and formativo and entregado_en > now() - interval '1 minute') >= 10 then
    raise exception 'demasiados_envios' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_perfil::text || p_evaluacion::text));
  select coalesce(max(numero), 0) + 1 into v_numero from public.intentos_evaluacion where perfil_id = p_perfil and evaluacion_id = p_evaluacion;
  insert into public.intentos_evaluacion (perfil_id, evaluacion_id, numero, puntaje, aprobado, version_id, formativo)
  values (p_perfil, p_evaluacion, v_numero, 0, false, v_version.id, true) returning id into v_intento;

  for v_pregunta in select p.id, p.tema from public.version_preguntas vp join public.preguntas p on p.id = vp.pregunta_id
                     where vp.version_id = v_version.id and not p.bloqueada order by vp.orden loop
    v_total := v_total + 1;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_elegidas
      from jsonb_array_elements_text(coalesce(p_respuestas -> v_pregunta.id::text, '[]'::jsonb)) as x
     where (case when x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then x::uuid end)
           in (select id from public.opciones where pregunta_id = v_pregunta.id);
    if cardinality(v_elegidas) > 0 then v_respondidas := v_respondidas + 1; end if;
    v_ok := cardinality(v_elegidas) > 0 and public.eleccion_correcta(v_version.id, v_pregunta.id, v_elegidas);
    if v_ok then v_correctas := v_correctas + 1;
    elsif v_pregunta.tema is not null and not (btrim(v_pregunta.tema) = any (v_temas)) then v_temas := array_append(v_temas, btrim(v_pregunta.tema));
    end if;
    insert into public.respuestas_intento (intento_id, pregunta_id, opciones_elegidas, correcta) values (v_intento, v_pregunta.id, v_elegidas, v_ok);
  end loop;
  if v_total = 0 then raise exception 'evaluacion_sin_preguntas' using errcode = 'P0001'; end if;
  v_completo := v_respondidas = v_total;
  -- El puntaje queda para el seguimiento de la maestra; al alumno no se le muestra como nota.
  update public.intentos_evaluacion set puntaje = round(100.0 * v_correctas / v_total), completo = v_completo where id = v_intento;
  return jsonb_build_object('completo', v_completo, 'respondidas', v_respondidas, 'total', v_total, 'temas_a_reforzar', to_jsonb(v_temas));
end; $$;
revoke execute on function public.registrar_actividad_formativa(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_actividad_formativa(uuid, uuid, jsonb) to service_role;

-- ============================================================ 5. D9: envíos formativos fuera de la API de la alumna
-- La alumna sigue leyendo sus intentos sumativos (con su nota). Los formativos, con su puntaje interno, solo los
-- lee la maestra; el campus muestra a la alumna lo que devuelve el servidor (completo y temas a repasar).
drop policy intentos_lee on public.intentos_evaluacion;
create policy intentos_lee on public.intentos_evaluacion for select to authenticated
  using ((perfil_id = auth.uid() and not formativo) or public.es_admin());
drop policy respuestas_lee on public.respuestas_intento;
create policy respuestas_lee on public.respuestas_intento for select to authenticated
  using (exists (select 1 from public.intentos_evaluacion i where i.id = intento_id
                  and ((i.perfil_id = auth.uid() and not i.formativo) or public.es_admin())));

-- ============================================================ 6. D12: baja de admin en cascada
-- Eliminar el usuario (auth.users → perfiles → roles_usuario) borra su rol en cascada. Antes, sin
-- albor.responsable, la eliminación entera fallaba. Ahora se admite y queda auditada como «baja en cascada»
-- con el responsable declarado si lo hay. Un alta, o una baja directa de la fila, siguen exigiendo responsable.
create or replace function public.exigir_responsable_rol()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rol text := coalesce(new.rol, old.rol);
  v_responsable text := btrim(coalesce(current_setting('albor.responsable', true), ''));
  v_cascada boolean := tg_op = 'DELETE' and pg_trigger_depth() > 1
                       and not exists (select 1 from public.perfiles where id = old.perfil_id);
begin
  -- El rol alumno automático de cada registro no requiere responsable.
  if v_rol <> 'admin' then return coalesce(new, old); end if;
  if auth.uid() is null and char_length(v_responsable) < 3 and not v_cascada then
    raise exception 'responsable_requerido' using errcode = 'P0001',
      hint = 'Ejecute el script con -v responsable="''Nombre o correo de quien lo hace''"';
  end if;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), case when tg_op = 'INSERT' then 'rol_admin_responsable_alta' else 'rol_admin_responsable_baja' end, 'roles_usuario',
          coalesce(new.perfil_id, old.perfil_id)::text,
          jsonb_build_object('rol', v_rol, 'perfil_id', coalesce(new.perfil_id, old.perfil_id),
                             'responsable', case when auth.uid() is not null then auth.uid()::text
                                                 when char_length(v_responsable) >= 3 then v_responsable
                                                 else 'sin responsable declarado' end,
                             'via', case when auth.uid() is not null then 'sesion'
                                         when v_cascada then 'baja_en_cascada'
                                         else 'script_servidor' end));
  return coalesce(new, old);
end; $$;
