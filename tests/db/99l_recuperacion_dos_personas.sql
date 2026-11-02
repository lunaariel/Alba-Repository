-- Recuperación administrativa con dos personas (0027): nadie la ejecuta solo, ni siendo superusuario; quien
-- solicita no aprueba; quien aprueba no puede ser técnico; vence; quita factores y sesiones solo de esa cuenta;
-- queda auditada. Cada «persona» es un usuario de base de datos distinto (SET SESSION AUTHORIZATION).
begin;

create role prueba_tecnico login;
create role prueba_aprobador login;
create role prueba_ambos login;
create role prueba_cambia login;
grant albor_recuperacion_tecnico to prueba_tecnico, prueba_ambos, prueba_cambia;
grant albor_recuperacion_aprobador to prueba_aprobador, prueba_ambos;

insert into auth.mfa_factors (user_id, factor_type, status) values
  ('adadadad-0000-0000-0000-000000000003', 'totp', 'verified'), ('adadadad-0000-0000-0000-000000000003', 'totp', 'verified'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'totp', 'verified');
insert into auth.sessions (user_id) values ('adadadad-0000-0000-0000-000000000003'), ('adadadad-0000-0000-0000-000000000003'), ('aaaaaaaa-0000-0000-0000-000000000001');

-- Ejecuta una llamada como otra identidad y guarda el resultado (o el error) en prueba.<clave>.
create or replace function pruebas.como(p_rol text, p_clave text, p_sql text) returns void language plpgsql as $$
declare v text;
begin
  execute format('set session authorization %I', p_rol);
  begin execute p_sql into v; v := coalesce(v, 'ok');
  exception when others then v := sqlerrm; end;
  reset session authorization;
  perform set_config('prueba.' || p_clave, v, true);
end; $$;
create or replace function pruebas.r(p_clave text) returns text language sql as $$ select current_setting('prueba.' || p_clave, true) $$;

-- 1. Un superusuario sin designación no puede solicitar ni aprobar (no alcanza con tener acceso total).
do $$ declare f text;
begin
  begin perform public.solicitar_recuperacion_mfa('maestra@prueba.test', 'Pérdida del teléfono y del respaldo.', 'Videollamada acordada'); f := 'no falló';
  exception when others then f := sqlerrm; end;
  perform pruebas.afirmar(f like 'no_autorizado%', 'Superusuario sin designación no solicita: ' || f);
end $$;

-- 2. El técnico solo solicita para cuentas admin.
select pruebas.como('prueba_tecnico', 's0', $q$select public.solicitar_recuperacion_mfa('a@prueba.test', 'Pérdida del teléfono y del respaldo.', 'Canal acordado previamente')::text$q$);
select pruebas.afirmar(pruebas.r('s0') like 'no_es_admin%', 'No se usa para cuentas de alumnas: ' || pruebas.r('s0'));
select pruebas.como('prueba_tecnico', 's1', $q$select public.solicitar_recuperacion_mfa('maestra@prueba.test', 'Pérdida del teléfono y del respaldo.', 'Llamada al número registrado')::text$q$);
select pruebas.afirmar(pruebas.r('s1') ~ '^[0-9a-f-]{36}$', 'El técnico registra la solicitud: ' || pruebas.r('s1'));
select pruebas.afirmar((select count(*) from auth.mfa_factors where user_id = 'adadadad-0000-0000-0000-000000000003') = 2, 'Solicitar no quita nada');
select pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'recuperacion_mfa_solicitada' and despues ->> 'solicitada_por' = 'prueba_tecnico'),
  'La solicitud queda auditada con quien la hizo');

-- 3. El técnico no puede aprobar (ni siquiera tiene permiso de ejecución).
select pruebas.como('prueba_tecnico', 'a1', format($q$select public.aprobar_recuperacion_mfa('%s', 'Verifiqué por videollamada.')::text$q$, pruebas.r('s1')));
select pruebas.afirmar(pruebas.r('a1') like 'permission denied%', 'El técnico no aprueba su propia solicitud: ' || pruebas.r('a1'));

-- 4. Quien tiene los dos roles no puede aprobar.
select pruebas.como('prueba_ambos', 'a2', format($q$select public.aprobar_recuperacion_mfa('%s', 'Verifiqué por videollamada.')::text$q$, pruebas.r('s1')));
select pruebas.afirmar(pruebas.r('a2') like 'roles_incompatibles%', 'Con los dos roles no se aprueba: ' || pruebas.r('a2'));

-- 5. La aprobación exige su propia verificación.
select pruebas.como('prueba_aprobador', 'a3', format($q$select public.aprobar_recuperacion_mfa('%s', 'corto')::text$q$, pruebas.r('s1')));
select pruebas.afirmar(pruebas.r('a3') like 'verificacion_requerida%', 'Sin verificación propia no se aprueba: ' || pruebas.r('a3'));

-- 6. Quien solicitó no puede aprobar aunque después cambie de rol.
select pruebas.como('prueba_cambia', 's2', $q$select public.solicitar_recuperacion_mfa('maestra@prueba.test', 'Segundo intento de la misma recuperación.', 'Canal acordado previamente')::text$q$);
select pruebas.afirmar(pruebas.r('s2') like '%recuperacion_pendiente_unica%' or pruebas.r('s2') like 'duplicate key%', 'Una sola solicitud pendiente por cuenta: ' || pruebas.r('s2'));
update public.recuperaciones_mfa set solicitada_por = 'prueba_cambia' where id = pruebas.r('s1')::uuid;
revoke albor_recuperacion_tecnico from prueba_cambia;
grant albor_recuperacion_aprobador to prueba_cambia;
select pruebas.como('prueba_cambia', 'a4', format($q$select public.aprobar_recuperacion_mfa('%s', 'Verifiqué por videollamada con documento.')::text$q$, pruebas.r('s1')));
select pruebas.afirmar(pruebas.r('a4') like 'misma_persona%', 'Quien solicitó no aprueba: ' || pruebas.r('a4'));
update public.recuperaciones_mfa set solicitada_por = 'prueba_tecnico' where id = pruebas.r('s1')::uuid;

-- 7. Vencida a las 24 horas.
update public.recuperaciones_mfa set vence_en = now() - interval '1 minute' where id = pruebas.r('s1')::uuid;
select pruebas.como('prueba_aprobador', 'a5', format($q$select public.aprobar_recuperacion_mfa('%s', 'Verifiqué por videollamada con documento.')::text$q$, pruebas.r('s1')));
select pruebas.afirmar(pruebas.r('a5') like 'recuperacion_vencida%', 'Una solicitud vencida no se aprueba: ' || pruebas.r('a5'));
update public.recuperaciones_mfa set vence_en = now() + interval '1 hour' where id = pruebas.r('s1')::uuid;
select pruebas.afirmar((select count(*) from auth.mfa_factors where user_id = 'adadadad-0000-0000-0000-000000000003') = 2, 'Ningún rechazo quitó factores');

-- 8. Aprobación válida por la persona independiente: quita factores y sesiones solo de esa cuenta.
select pruebas.como('prueba_aprobador', 'a6', format($q$select public.aprobar_recuperacion_mfa('%s', 'Verifiqué por videollamada con documento, canal independiente.')::text$q$, pruebas.r('s1')));
select pruebas.afirmar(pruebas.r('a6')::jsonb = '{"factores_quitados": 2, "sesiones_cerradas": 2}'::jsonb, 'Se quitan factores y sesiones: ' || pruebas.r('a6'));
select pruebas.afirmar((select count(*) from auth.mfa_factors where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1
  and (select count(*) from auth.sessions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1, 'Otras cuentas no se tocan');
select pruebas.afirmar((select estado || aprobada_por from public.recuperaciones_mfa where id = pruebas.r('s1')::uuid) = 'ejecutadaprueba_aprobador', 'Queda ejecutada y con quién aprobó');
select pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'recuperacion_mfa_ejecutada'
  and despues ->> 'solicitada_por' = 'prueba_tecnico' and despues ->> 'aprobada_por' = 'prueba_aprobador'), 'La ejecución queda auditada con las dos personas');
select pruebas.afirmar(exists (select 1 from public.roles_usuario where perfil_id = 'adadadad-0000-0000-0000-000000000003' and rol = 'admin'),
  'El rol no cambia: la titular recupera privilegios recién al registrar factores nuevos (política encendida)');
select pruebas.como('prueba_aprobador', 'a7', format($q$select public.aprobar_recuperacion_mfa('%s', 'Verifiqué por videollamada con documento.')::text$q$, pruebas.r('s1')));
select pruebas.afirmar(pruebas.r('a7') like 'recuperacion_no_pendiente%', 'No se aprueba dos veces: ' || pruebas.r('a7'));

-- 9. Ni las sesiones de la aplicación ni la clave de servicio pueden usarlo.
select pruebas.afirmar(not has_function_privilege(r, 'public.aprobar_recuperacion_mfa(uuid, text)', 'execute')
  and not has_function_privilege(r, 'public.solicitar_recuperacion_mfa(text, text, text)', 'execute'), 'Sin ejecución para ' || r)
  from unnest(array['anon', 'authenticated', 'service_role']) r;
select pruebas.afirmar((select count(*) from pg_auth_members m join pg_roles r on r.oid = m.roleid
  where r.rolname in ('albor_recuperacion_tecnico', 'albor_recuperacion_aprobador') and m.member not in
  (select oid from pg_roles where rolname like 'prueba\_%')) = 0, 'Fuera de la prueba, nadie está designado (pendiente de la titular)');

rollback;
