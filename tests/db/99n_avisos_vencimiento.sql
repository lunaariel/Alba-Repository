-- Avisos de vencimiento (0029): umbrales de 30, 7 y 1 día en días calendario de Guatemala, sobre la cobertura
-- continua; renovaciones encadenadas, revocaciones con intervalo, accesos sin vencimiento, idempotencia y
-- cancelación de avisos que dejaron de corresponder. Se simula «hoy» con el parámetro p_momento.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('29000000-0000-0000-0000-000000000001', 'x29@prueba.test', '{"nombre_completo": "Xiomara Prueba", "confirma_mayoria_edad": true}'),
  ('29000000-0000-0000-0000-000000000002', 'y29@prueba.test', '{"nombre_completo": "Yolanda Prueba", "confirma_mayoria_edad": true}'),
  ('29000000-0000-0000-0000-000000000003', 'z29@prueba.test', '{"nombre_completo": "Zoila Prueba", "confirma_mayoria_edad": true}'),
  ('29000000-0000-0000-0000-000000000004', 'w29@prueba.test', '{"nombre_completo": "Wendy Prueba", "confirma_mayoria_edad": true}');

create or replace function pruebas.avisos(p_perfil uuid) returns text language sql as $$
  select coalesce(string_agg((variables ->> 'umbral') || ':' || estado, ',' order by creado_en, (variables ->> 'umbral')::int desc), '')
    from public.envios_correo where perfil_id = p_perfil and plantilla_clave = 'aviso_vencimiento'
$$;

do $$
declare
  X constant uuid := '29000000-0000-0000-0000-000000000001';
  Y constant uuid := '29000000-0000-0000-0000-000000000002';
  Z constant uuid := '29000000-0000-0000-0000-000000000003';
  W constant uuid := '29000000-0000-0000-0000-000000000004';
  C constant uuid := 'c0000000-0000-0000-0000-000000000001';
  FIN constant timestamptz := date_trunc('day', now() at time zone 'America/Guatemala') at time zone 'America/Guatemala' + interval '40 days' - interval '1 second';
  ax uuid; ay uuid; p2 uuid; r jsonb; f timestamptz; e text;
begin
  -- X: beca de hoy hasta el fin del día 40 (hora de Guatemala).
  r := public.agregar_periodo(X, C, 'beca', null, null, FIN, null, false, '{"regla": "beca_con_fin"}'::jsonb, null, 'Beca de prueba de avisos', 'Prueba', null);
  ax := (r ->> 'acceso')::uuid;
  perform pruebas.afirmar(public.fin_cobertura_continua(ax) = FIN, 'Fin de cobertura = fin de la beca');

  perform public.encolar_avisos_vencimiento();
  perform pruebas.afirmar(pruebas.avisos(X) = '', 'A 40 días: ningún aviso');
  perform public.encolar_avisos_vencimiento(FIN - interval '20 days');
  perform public.encolar_avisos_vencimiento(FIN - interval '20 days');
  perform pruebas.afirmar(pruebas.avisos(X) = '30:pendiente', 'A 20 días: aviso de 30, una sola vez: ' || pruebas.avisos(X));
  perform public.encolar_avisos_vencimiento(FIN - interval '5 days');
  perform pruebas.afirmar(pruebas.avisos(X) = '30:cancelado,7:pendiente', 'A 5 días: aviso de 7; el de 30 sin enviar se reemplaza: ' || pruebas.avisos(X));
  -- Simulado: el aviso de 7 sale (simulado), y el de 1 día llega después.
  update public.envios_correo set estado = 'simulado' where perfil_id = X and variables ->> 'umbral' = '7';
  perform public.encolar_avisos_vencimiento(FIN - interval '12 hours');
  perform pruebas.afirmar(pruebas.avisos(X) = '30:cancelado,7:simulado,1:pendiente', 'El último día: aviso de 1 día: ' || pruebas.avisos(X));
  perform pruebas.afirmar((select variables ->> 'fecha' from public.envios_correo where perfil_id = X and variables ->> 'umbral' = '1')
    = to_char((FIN at time zone 'America/Guatemala')::date, 'DD/MM/YYYY'), 'La fecha del aviso es el último día con acceso, en Guatemala');

  -- Renovación encadenada antes de vencer: los avisos pendientes se cancelan y no hay aviso nuevo (cobertura continua).
  r := public.agregar_periodo(X, C, 'beca', null, FIN, FIN + interval '60 days', null, false, '{"regla": "beca_con_fin"}'::jsonb, null, 'Renovación encadenada de prueba', 'Prueba', null);
  perform pruebas.afirmar(public.fin_cobertura_continua(ax) = FIN + interval '60 days', 'La renovación extiende la cobertura continua');
  perform public.encolar_avisos_vencimiento(FIN - interval '12 hours');
  perform pruebas.afirmar(pruebas.avisos(X) = '30:cancelado,7:simulado,1:cancelado', 'Con cobertura continua no se avisa el fin del período anterior: ' || pruebas.avisos(X));
  perform public.encolar_avisos_vencimiento(FIN + interval '40 days');
  perform pruebas.afirmar((select count(*) from public.envios_correo where perfil_id = X and estado = 'pendiente' and variables ->> 'umbral' = '30'
    and (variables ->> 'fin_iso')::timestamptz = FIN + interval '60 days') = 1, 'Se avisa respecto del nuevo fin: ' || pruebas.avisos(X));

  -- Y: tres períodos encadenados; se revoca el del medio (decisión A): queda un intervalo y se avisa el primer fin.
  r := public.agregar_periodo(Y, C, 'beca', null, null, FIN, null, false, '{"regla": "beca_con_fin"}'::jsonb, null, 'Primer período de prueba', 'Prueba', null);
  ay := (r ->> 'acceso')::uuid;
  r := public.agregar_periodo(Y, C, 'beca', null, FIN, FIN + interval '30 days', null, false, '{"regla": "beca_con_fin"}'::jsonb, null, 'Segundo período de prueba', 'Prueba', null);
  p2 := (r ->> 'periodo')::uuid;
  r := public.agregar_periodo(Y, C, 'beca', null, FIN + interval '30 days', FIN + interval '60 days', null, false, '{"regla": "beca_con_fin"}'::jsonb, null, 'Tercer período de prueba', 'Prueba', null);
  perform pruebas.afirmar(public.fin_cobertura_continua(ay) = FIN + interval '60 days', 'Tres períodos encadenados: cobertura hasta el último');
  perform public.encolar_avisos_vencimiento(FIN - interval '5 days');
  perform pruebas.afirmar(pruebas.avisos(Y) = '', 'Con cobertura continua, a 5 días del primer fin no hay aviso');
  perform public.revocar_periodo_interno(p2, 'Revocación de prueba del período intermedio', null);
  perform pruebas.afirmar(public.fin_cobertura_continua(ay) = FIN, 'Revocado el intermedio, la cobertura continua termina en el primer fin');
  perform public.encolar_avisos_vencimiento(FIN - interval '5 days');
  perform pruebas.afirmar(pruebas.avisos(Y) = '7:pendiente', 'Con el intervalo, se avisa el fin real: ' || pruebas.avisos(Y));

  -- Z: sin vencimiento. Nunca hay aviso.
  r := public.agregar_periodo(Z, C, 'beca', null, null, null, null, true, '{"regla": "beca_sin_vencimiento"}'::jsonb, null, 'Beca sin vencimiento de prueba', 'Prueba', null);
  perform pruebas.afirmar(public.fin_cobertura_continua((r ->> 'acceso')::uuid) = 'infinity', 'Sin vencimiento: cobertura infinita');
  perform public.encolar_avisos_vencimiento(now() + interval '10 years');
  perform pruebas.afirmar(pruebas.avisos(Z) = '', 'Un acceso sin vencimiento no recibe avisos');

  -- W: aviso pendiente y luego acceso revocado: el aviso se cancela.
  r := public.agregar_periodo(W, C, 'beca', null, null, FIN, null, false, '{"regla": "beca_con_fin"}'::jsonb, null, 'Beca que se revocará', 'Prueba', null);
  perform public.encolar_avisos_vencimiento(FIN - interval '3 days');
  perform pruebas.afirmar(pruebas.avisos(W) = '7:pendiente', 'Aviso registrado antes de revocar');
  perform public.revocar_periodo_interno((r ->> 'periodo')::uuid, 'Revocación de prueba de la beca', null);
  perform public.encolar_avisos_vencimiento(FIN - interval '3 days');
  perform pruebas.afirmar(pruebas.avisos(W) = '7:cancelado', 'Revocado el acceso, el aviso pendiente se cancela: ' || pruebas.avisos(W));

  -- Vencido: no se avisa después del fin.
  perform public.encolar_avisos_vencimiento(FIN + interval '1 day');
  perform pruebas.afirmar((select count(*) from public.envios_correo where perfil_id = W and estado = 'pendiente') = 0, 'Después del fin no se registran avisos');
end $$;

-- Zona horaria: un fin a las 23:30 de Guatemala (05:30 UTC del día siguiente). A la 01:00 de Guatemala del día
-- anterior faltan 1 día calendario en Guatemala (en UTC serían 2): corresponde el aviso de 1 día.
do $$
declare V uuid := gen_random_uuid(); r jsonb; FIN timestamptz := '2027-03-10 05:30:00+00';
begin
  insert into auth.users (id, email, raw_user_meta_data) values (V, 'tz29@prueba.test', '{"nombre_completo": "Tamara Zona", "confirma_mayoria_edad": true}');
  r := public.agregar_periodo(V, 'c0000000-0000-0000-0000-000000000001', 'beca', null, null, FIN, null, false, '{"regla": "beca_con_fin"}'::jsonb, null, 'Prueba de zona horaria', 'Prueba', null);
  perform public.encolar_avisos_vencimiento('2027-03-08 07:00:00+00');
  perform pruebas.afirmar((select (variables ->> 'umbral') || '|' || (variables ->> 'fecha') from public.envios_correo where perfil_id = V) = '1|09/03/2027',
    'Días calendario de Guatemala: aviso de 1 día para el 09/03/2027: ' || coalesce((select variables::text from public.envios_correo where perfil_id = V), 'ninguno'));
end $$;

select pruebas.afirmar(public.umbral_aviso_vencimiento(d) is not distinct from u, format('umbral(%s) = %s', d, u))
  from (values (31, null::int), (30, 30), (8, 30), (7, 7), (2, 7), (1, 1), (0, 1), (-1, null)) x(d, u);
select pruebas.afirmar(not has_function_privilege(r, 'public.encolar_avisos_vencimiento(timestamptz)', 'execute')
  and not has_function_privilege(r, 'public.fin_cobertura_continua(uuid, timestamptz)', 'execute'), 'Solo el servidor: ' || r)
  from unnest(array['anon', 'authenticated']) r;
select pruebas.afirmar(not exists (select 1 from public.envios_correo where estado = 'enviado'), 'Ningún aviso figura como enviado');

rollback;
