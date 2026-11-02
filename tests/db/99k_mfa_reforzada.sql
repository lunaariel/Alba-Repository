-- Fase 6A (0026): política de segundo factor de la administradora, verificación reforzada de un solo uso,
-- límite de envíos formativos (D8), envíos formativos fuera de la API de la alumna (D9) y baja de admin en
-- cascada (D12). Los tokens se imitan con request.jwt.claims, como los fija PostgREST tras verificar la firma.
begin;

create or replace function pruebas.token(p_sub uuid, p_aal text, p_totp_hace interval, p_sesion text default 'sesion-1', p_rol text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_sub, 'role', p_rol, 'aal', p_aal, 'session_id', p_sesion,
    'amr', case when p_totp_hace is null then jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now() - interval '2 hours')::bigint))
                else jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now() - p_totp_hace)::bigint),
                                       jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now() - interval '2 hours')::bigint)) end)::text, true);
end; $$;
grant execute on function pruebas.token(uuid, text, interval, text, text) to authenticated, anon, service_role;

create or replace function pruebas.sin_token() returns void language sql as $$
  select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
$$;
grant execute on function pruebas.sin_token() to authenticated, anon, service_role;

-- ------------------------------------------------------------ 1. La política nace apagada y no cambia nada
select pruebas.afirmar((select not mfa_admin_obligatorio and reforzada_minutos = 5 from public.politica_seguridad), 'La política nace apagada, con 5 minutos');
select pruebas.token('adadadad-0000-0000-0000-000000000003', 'aal1', null);
select pruebas.afirmar(public.es_admin(), 'Política apagada: la admin con contraseña sigue siendo admin (nadie pierde el acceso)');
update public.cursos set precio_centavos = 4800 where id = 'c0000000-0000-0000-0000-000000000001';
select pruebas.afirmar((select precio_centavos from public.cursos where id = 'c0000000-0000-0000-0000-000000000001') = 4800,
  'Política apagada: un cambio de precio no pide verificación reforzada');
select pruebas.sin_token();

-- ------------------------------------------------------------ 2. Cambiar la política: solo por script, con responsable
do $$ declare fallo text;
begin
  begin update public.politica_seguridad set mfa_admin_obligatorio = true; fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'responsable_requerido', 'Sin responsable no se cambia la política: ' || fallo);
  perform set_config('request.jwt.claim.sub', 'adadadad-0000-0000-0000-000000000003', true);
  perform set_config('albor.responsable', 'Prueba', true);
  begin update public.politica_seguridad set mfa_admin_obligatorio = true; fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'solo_por_script', 'Desde una sesión no se cambia la política: ' || fallo);
  perform set_config('request.jwt.claim.sub', '', true);
  begin delete from public.politica_seguridad; fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'auditoria_inmutable', 'La fila de la política no se borra: ' || fallo);
end $$;
select set_config('albor.responsable', 'Responsable de la prueba', true);
update public.politica_seguridad set mfa_admin_obligatorio = true;
select set_config('albor.responsable', '', true);
select pruebas.afirmar((select actualizado_por = 'Responsable de la prueba' from public.politica_seguridad), 'La política registra quién la cambió');
select pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'politica_seguridad_cambiada'
  and despues ->> 'responsable' = 'Responsable de la prueba' and (despues ->> 'mfa_admin_obligatorio')::boolean), 'El cambio de política queda auditado');

-- Las sesiones no leen ni escriben la tabla; leen la política con la función.
set local role authenticated;
select pruebas.token('aaaaaaaa-0000-0000-0000-000000000001', 'aal1', null);
do $$ declare fallo text;
begin
  begin perform 1 from public.politica_seguridad; fallo := 'no falló';
  exception when insufficient_privilege then fallo := 'rechazado'; end;
  perform pruebas.afirmar(fallo = 'rechazado', 'Una sesión no lee la tabla de la política');
  perform pruebas.afirmar((public.politica_seguridad_vigente() ->> 'mfa_admin_obligatorio')::boolean, 'La sesión lee la política vigente con la función');
end $$;
reset role;

-- ------------------------------------------------------------ 3. Con la política encendida: aal2 obligatorio
select pruebas.token('adadadad-0000-0000-0000-000000000003', 'aal1', null);
select pruebas.afirmar(not public.es_admin(), 'Admin sin segundo factor (aal1): no es admin para la base');
select pruebas.afirmar(public.tiene_rol_admin(), 'tiene_rol_admin la identifica para pedirle el segundo factor');
select pruebas.token('adadadad-0000-0000-0000-000000000003', 'aal2', interval '2 hours');
select pruebas.afirmar(public.es_admin(), 'Admin con segundo factor (aal2): es admin');
select pruebas.token('aaaaaaaa-0000-0000-0000-000000000001', 'aal2', interval '1 minute');
select pruebas.afirmar(not public.es_admin() and not public.tiene_rol_admin(), 'Una alumna con segundo factor propio no se vuelve admin');
-- Token sin claims (solo sub, como un script viejo): no alcanza.
select pruebas.sin_token();
select set_config('request.jwt.claim.sub', 'adadadad-0000-0000-0000-000000000003', true);
select pruebas.afirmar(not public.es_admin(), 'Sin nivel en el token, la política encendida no reconoce a la admin');
select pruebas.sin_token();

-- RLS con la sesión real: la admin aal1 no ve ni cambia lo que solo ve la admin.
set local role authenticated;
select pruebas.token('adadadad-0000-0000-0000-000000000003', 'aal1', null);
select pruebas.afirmar((select count(*) from public.auditoria) = 0, 'Admin aal1: no lee la auditoría');
update public.cursos set titulo = 'Cambio indebido' where id = 'c0000000-0000-0000-0000-000000000001';
reset role;
select pruebas.afirmar((select titulo from public.cursos where id = 'c0000000-0000-0000-0000-000000000001') = 'Montessori en casa',
  'Admin aal1: su cambio no llega a la base');

-- ------------------------------------------------------------ 4. Verificación reforzada
set local role authenticated;
-- 4a. aal2 con el segundo factor verificado hace 2 horas: cambios rutinarios sí, sensibles no.
select pruebas.token('adadadad-0000-0000-0000-000000000003', 'aal2', interval '2 hours');
update public.cursos set titulo = 'Montessori en casa (editado)' where id = 'c0000000-0000-0000-0000-000000000001';
do $$ declare fallo text;
begin
  perform pruebas.afirmar((select titulo from public.cursos where id = 'c0000000-0000-0000-0000-000000000001') = 'Montessori en casa (editado)',
    'Un cambio rutinario (título) no pide verificación reforzada');
  begin update public.cursos set precio_centavos = 9900 where id = 'c0000000-0000-0000-0000-000000000001'; fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'verificacion_reforzada_requerida', 'Sesión antigua: cambiar el precio pide verificar de nuevo: ' || fallo);
  begin update public.cursos set estado = 'archivado' where id = 'c0000000-0000-0000-0000-000000000001'; fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'verificacion_reforzada_requerida', 'Sesión antigua: retirar un curso pide verificar: ' || fallo);
  begin update public.talleres set precio_centavos = 1 where id = '7a000000-0000-0000-0000-000000000001'; fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'verificacion_reforzada_requerida', 'Sesión antigua: precio de taller pide verificar: ' || fallo);
  begin insert into public.cupones (codigo, tipo, valor) values ('INDEBIDO', 'porcentaje', 100); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'verificacion_reforzada_requerida', 'Sesión antigua: crear un cupón pide verificar: ' || fallo);
end $$;
reset role;
select pruebas.afirmar((select precio_centavos || estado from public.cursos where id = 'c0000000-0000-0000-0000-000000000001') = '4800publicado',
  'Los rechazos no cambiaron precio ni estado');
select pruebas.afirmar(not exists (select 1 from public.cupones where codigo = 'INDEBIDO'), 'El cupón rechazado no existe');

-- 4b. Verificado hace 6 minutos (vigencia 5): tampoco alcanza.
set local role authenticated;
select pruebas.token('adadadad-0000-0000-0000-000000000003', 'aal2', interval '6 minutes');
do $$ declare fallo text;
begin
  begin update public.cursos set precio_centavos = 9900 where id = 'c0000000-0000-0000-0000-000000000001'; fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'verificacion_reforzada_requerida', 'Verificación de hace 6 minutos: vencida: ' || fallo);
end $$;

-- 4c. Verificado hace 1 minuto: la operación procede, una sola vez.
select pruebas.token('adadadad-0000-0000-0000-000000000003', 'aal2', interval '1 minute', 'sesion-fresca');
update public.cursos set precio_centavos = 5500 where id = 'c0000000-0000-0000-0000-000000000001';
reset role;
select pruebas.afirmar((select precio_centavos from public.cursos where id = 'c0000000-0000-0000-0000-000000000001') = 5500,
  'Con verificación reciente, el cambio de precio procede');
select pruebas.afirmar((select count(*) from public.verificaciones_reforzadas where sesion_id = 'sesion-fresca' and accion = 'curso_precio_o_publicacion') = 1,
  'La verificación quedó consumida (sin códigos: sesión, instante y acción)');
select pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'verificacion_reforzada' and entidad_id = 'curso_precio_o_publicacion'
  and actor_id = 'adadadad-0000-0000-0000-000000000003'), 'El uso de la verificación queda en la auditoría');
select pruebas.afirmar(not exists (select 1 from information_schema.columns where table_name = 'verificaciones_reforzadas'
  and column_name ~ '(codigo|secreto|secret|code|otp)'), 'La tabla no tiene columnas para códigos ni secretos');
-- Misma transacción: la operación que toca varias filas o tablas usa la verificación una sola vez.
set local role authenticated;
select pruebas.token('adadadad-0000-0000-0000-000000000003', 'aal2', interval '1 minute', 'sesion-fresca');
do $$ declare fallo text;
begin
  -- Otra transacción (subtransacción con otro txid no aplica: es la misma transacción de la prueba). Se simula
  -- la reutilización desde otra transacción con un registro previo de otro txid (abajo, 4d).
  update public.cursos set precio_centavos = 5600 where id = 'c0000000-0000-0000-0000-000000000001';
  perform pruebas.afirmar((select precio_centavos from public.cursos where id = 'c0000000-0000-0000-0000-000000000001') = 5600,
    'Dentro de la misma transacción, la verificación cubre la operación completa');
end $$;
reset role;

-- 4d. Reutilizar la verificación en otra transacción: se rechaza.
alter table public.verificaciones_reforzadas disable trigger verificaciones_inmutables;
update public.verificaciones_reforzadas set transaccion = transaccion - 1000 where sesion_id = 'sesion-fresca';  -- simula «otra transacción»
alter table public.verificaciones_reforzadas enable trigger verificaciones_inmutables;
set local role authenticated;
select pruebas.token('adadadad-0000-0000-0000-000000000003', 'aal2', interval '1 minute', 'sesion-fresca');
do $$ declare fallo text;
begin
  begin update public.cursos set precio_centavos = 1 where id = 'c0000000-0000-0000-0000-000000000001'; fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'verificacion_reforzada_usada', 'La misma verificación no sirve para otra operación: ' || fallo);
  -- Otra sesión con el mismo instante no comparte el consumo, pero tiene que tener su propio factor reciente.
  perform pruebas.token('adadadad-0000-0000-0000-000000000003', 'aal2', interval '1 minute', 'otra-sesion');
  update public.talleres set precio_centavos = 2000 where id = '7a000000-0000-0000-0000-000000000001';
end $$;
reset role;
select pruebas.afirmar((select precio_centavos from public.cursos where id = 'c0000000-0000-0000-0000-000000000001') = 5600, 'La reutilización no cambió el precio');
select pruebas.afirmar((select precio_centavos from public.talleres where id = '7a000000-0000-0000-0000-000000000001') = 2000, 'Otra sesión con su verificación sí puede');

-- 4e. Una operación que falla después de verificar no consume la verificación (se deshace con ella).
set local role authenticated;
select pruebas.token('adadadad-0000-0000-0000-000000000003', 'aal2', interval '30 seconds', 'sesion-falla');
do $$ declare fallo text;
begin
  begin
    update public.cursos set precio_centavos = 7700 where id = 'c0000000-0000-0000-0000-000000000001';
    raise exception 'falla_posterior';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'falla_posterior' and (select count(*) from public.verificaciones_reforzadas where sesion_id = 'sesion-falla') = 0,
    'Una operación fallida no deja la verificación consumida');
end $$;
reset role;

-- 4f. Alumna con su propio factor reciente: RLS le niega las operaciones (no cambia nada).
set local role authenticated;
select pruebas.token('aaaaaaaa-0000-0000-0000-000000000001', 'aal2', interval '10 seconds', 'sesion-alumna');
update public.cursos set precio_centavos = 1 where id = 'c0000000-0000-0000-0000-000000000001';
delete from public.cursos where id = 'c0000000-0000-0000-0000-000000000001';
reset role;
select pruebas.afirmar((select precio_centavos from public.cursos where id = 'c0000000-0000-0000-0000-000000000001') = 5600, 'La alumna no cambia precios');
select pruebas.afirmar((select count(*) from public.verificaciones_reforzadas where sesion_id = 'sesion-alumna') = 0, 'La alumna no deja verificaciones');

-- 4g. La clave de servicio (webhooks, procesos) y los scripts no la necesitan: tienen sus propios controles.
select pruebas.token(null, null, null, null, 'service_role');
update public.talleres set precio_centavos = 2100 where id = '7a000000-0000-0000-0000-000000000001';
select pruebas.sin_token();
update public.talleres set precio_centavos = 2200 where id = '7a000000-0000-0000-0000-000000000001';
select pruebas.afirmar((select precio_centavos from public.talleres where id = '7a000000-0000-0000-0000-000000000001') = 2200,
  'Clave de servicio y scripts del servidor no piden verificación reforzada');

-- 4h. Becas, revocaciones, roles y configuración sensible también la exigen.
set local role authenticated;
select pruebas.token('adadadad-0000-0000-0000-000000000003', 'aal2', interval '2 hours', 'sesion-vieja');
do $$ declare fallo text;
begin
  begin update public.configuracion_academia set whatsapp = '+50299999999'; fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'verificacion_reforzada_requerida', 'Cambiar el contacto público pide verificar: ' || fallo);
  begin perform public.otorgar_beca('bbbbbbbb-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', null, null, true,
                                    'Beca de prueba con sesión antigua', 'Prueba'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'verificacion_reforzada_requerida', 'Otorgar una beca pide verificar: ' || fallo);
  update public.configuracion_academia set textos = textos || '{"prueba": "x"}'::jsonb;
end $$;
reset role;
select pruebas.afirmar((select whatsapp is distinct from '+50299999999' and textos ->> 'prueba' = 'x' from public.configuracion_academia),
  'El contacto no cambió; los textos (rutina) sí');
select pruebas.afirmar(not exists (select 1 from public.periodos_acceso where perfil_id = 'bbbbbbbb-0000-0000-0000-000000000002'
  and curso_id = 'c0000000-0000-0000-0000-000000000001'), 'La beca rechazada no existe');

-- 4i. Apagar la política (por script, con responsable) devuelve el comportamiento anterior: nada irreversible.
select pruebas.sin_token();
select set_config('albor.responsable', 'Responsable de la prueba', true);
update public.politica_seguridad set mfa_admin_obligatorio = false;
select set_config('albor.responsable', '', true);
select pruebas.token('adadadad-0000-0000-0000-000000000003', 'aal1', null);
select pruebas.afirmar(public.es_admin(), 'Apagada otra vez: la admin vuelve a entrar con contraseña');
select pruebas.sin_token();

-- ------------------------------------------------------------ 5. D8 y D9: envíos formativos
insert into auth.users (id, email, raw_user_meta_data) values
  ('d8000000-0000-0000-0000-000000000001', 'd8@prueba.test', '{"nombre_completo": "Alumna D8", "confirma_mayoria_edad": true}');
do $$
declare
  A constant uuid := 'd8000000-0000-0000-0000-000000000001';
  F constant uuid := '26000000-0000-0000-0000-000000000001';
  EV constant uuid := '26000000-0000-0000-0000-000000000005';
  P1 constant uuid := '26000000-0000-0000-0000-000000000006';
  O1 constant uuid := '26000000-0000-0000-0000-000000000007';
  i int; fallo text;
begin
  insert into public.cursos (id, slug, titulo, precio_centavos) values (F, 'formativo-d8', 'Curso formativo D8', 3000);
  insert into public.modulos (id, curso_id, titulo, orden) values ('26000000-0000-0000-0000-000000000002', F, 'Módulo', 0);
  insert into public.lecciones (id, modulo_id, titulo, orden) values ('26000000-0000-0000-0000-000000000003', '26000000-0000-0000-0000-000000000002', 'L1', 0);
  insert into public.evaluaciones (id, curso_id, modalidad, requiere_actividades) values (EV, F, 'formativa', true);
  insert into public.preguntas (id, evaluacion_id, enunciado, tipo, orden, tema) values (P1, EV, '¿Actividad?', 'unica', 0, 'Rutinas');
  insert into public.opciones (id, pregunta_id, texto, es_correcta, orden) values (O1, P1, 'Sí', true, 0), ('26000000-0000-0000-0000-000000000008', P1, 'No', false, 1);
  update public.cursos set estado = 'publicado' where id = F;
  insert into public.accesos_curso (perfil_id, curso_id, origen, motivo) values (A, F, 'concesion', 'Prueba D8');
  for i in 1..10 loop perform public.registrar_actividad_formativa(A, EV, jsonb_build_object(P1::text, jsonb_build_array(O1))); end loop;
  begin perform public.registrar_actividad_formativa(A, EV, '{}'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'demasiados_envios', 'D8: el envío 11 del mismo minuto se rechaza: ' || fallo);
  perform pruebas.afirmar((select count(*) from public.intentos_evaluacion where perfil_id = A and formativo) = 10, 'D8: quedaron 10 envíos, no 11');
  -- Los envíos de hace más de un minuto no cuentan.
  update public.intentos_evaluacion set entregado_en = now() - interval '2 minutes' where perfil_id = A;
  perform public.registrar_actividad_formativa(A, EV, '{}');
  perform pruebas.afirmar((select count(*) from public.intentos_evaluacion where perfil_id = A and formativo) = 11, 'D8: pasado el minuto, se puede volver a enviar');
end $$;

set local role authenticated;
select pruebas.token('d8000000-0000-0000-0000-000000000001', 'aal1', null);
select pruebas.afirmar((select count(*) from public.intentos_evaluacion where perfil_id = 'd8000000-0000-0000-0000-000000000001') = 0,
  'D9: la alumna no lee por la API sus envíos formativos ni su puntaje interno');
select pruebas.afirmar((select count(*) from public.respuestas_intento r join public.intentos_evaluacion i on i.id = r.intento_id) = 0,
  'D9: tampoco las respuestas de esos envíos');
reset role;
-- Los intentos sumativos propios siguen visibles (la nota es suya).
do $$ declare r jsonb;
begin
  select jsonb_object_agg(p.id, jsonb_build_array(o.id)) into r from public.preguntas p join public.opciones o on o.pregunta_id = p.id and o.es_correcta
   where p.evaluacion_id = 'f0000000-0000-0000-0000-000000000001';
  insert into public.accesos_curso (perfil_id, curso_id, origen, motivo)
  select 'd8000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'concesion', 'Prueba D9'
   where not exists (select 1 from public.accesos_curso where perfil_id = 'd8000000-0000-0000-0000-000000000001' and curso_id = 'c0000000-0000-0000-0000-000000000001');
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en)
  select 'd8000000-0000-0000-0000-000000000001', l.id, now() from public.lecciones l join public.modulos m on m.id = l.modulo_id
   where m.curso_id = 'c0000000-0000-0000-0000-000000000001';
  perform public.corregir_evaluacion('d8000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', r);
end $$;
set local role authenticated;
select pruebas.token('d8000000-0000-0000-0000-000000000001', 'aal1', null);
select pruebas.afirmar((select count(*) from public.intentos_evaluacion where not formativo) = 1, 'D9: la alumna sigue leyendo su intento sumativo');
select pruebas.token('adadadad-0000-0000-0000-000000000003', 'aal1', null);
select pruebas.afirmar((select count(*) from public.intentos_evaluacion where perfil_id = 'd8000000-0000-0000-0000-000000000001' and formativo) = 11,
  'D9: la maestra sigue viendo los envíos formativos para el seguimiento');
reset role;
select pruebas.sin_token();

-- ------------------------------------------------------------ 6. D12: baja de admin en cascada
insert into auth.users (id, email, raw_user_meta_data) values
  ('d1200000-0000-0000-0000-000000000001', 'd12@prueba.test', '{"nombre_completo": "Admin D12", "confirma_mayoria_edad": true}');
select set_config('albor.responsable', 'Alta para la prueba D12', true);
insert into public.roles_usuario (perfil_id, rol) values ('d1200000-0000-0000-0000-000000000001', 'admin');
select set_config('albor.responsable', '', true);
do $$ declare fallo text;
begin
  begin delete from public.roles_usuario where perfil_id = 'd1200000-0000-0000-0000-000000000001' and rol = 'admin'; fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'responsable_requerido', 'D12: quitar el rol directamente sigue exigiendo responsable: ' || fallo);
end $$;
delete from auth.users where id = 'd1200000-0000-0000-0000-000000000001';
select pruebas.afirmar(not exists (select 1 from public.roles_usuario where perfil_id = 'd1200000-0000-0000-0000-000000000001'),
  'D12: eliminar el usuario borra su rol en cascada sin fallar');
select pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'rol_admin_responsable_baja'
  and entidad_id = 'd1200000-0000-0000-0000-000000000001' and despues ->> 'via' = 'baja_en_cascada'), 'D12: la baja en cascada queda auditada como tal');

rollback;
