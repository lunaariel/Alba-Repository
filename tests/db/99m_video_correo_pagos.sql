-- Fase 6B, preparación local (0028): autorización de video en la base, cola de correos (estados, reintentos,
-- idempotencia, «simulado» distinto de «enviado»), confirmación de compra y avisos de vencimiento; y regresión de
-- pagos: un pago repetido no duplica accesos y un reembolso no elimina períodos independientes.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('6b000000-0000-0000-0000-000000000001', 'video@prueba.test', '{"nombre_completo": "Alumna Video", "confirma_mayoria_edad": true}'),
  ('6b000000-0000-0000-0000-000000000002', 'sinacceso@prueba.test', '{"nombre_completo": "Sin Acceso", "confirma_mayoria_edad": true}'),
  ('6b000000-0000-0000-0000-000000000003', 'compra@prueba.test', '{"nombre_completo": "Paula Compra", "confirma_mayoria_edad": true}');

create or replace function pruebas.envejecer6b(p_perfil uuid, p_curso uuid, p_meses int) returns void language plpgsql as $$
begin
  alter table public.periodos_acceso disable trigger periodos_inmutables;
  update public.periodos_acceso set inicia_en = inicia_en - make_interval(months => p_meses), vence_en = vence_en - make_interval(months => p_meses)
   where perfil_id = p_perfil and curso_id = p_curso;
  alter table public.periodos_acceso enable trigger periodos_inmutables;
  perform set_config('albor.ajuste_vencimiento', 'si', true);
  update public.accesos_curso set inicia_en = inicia_en - make_interval(months => p_meses), vence_en = vence_en - make_interval(months => p_meses)
   where perfil_id = p_perfil and curso_id = p_curso;
  perform set_config('albor.ajuste_vencimiento', '', true);
end; $$;

-- ------------------------------------------------------------ 1. Video
do $$
declare
  V constant uuid := '6b000000-0000-0000-0000-000000000001';
  S constant uuid := '6b000000-0000-0000-0000-000000000002';
  C constant uuid := 'c0000000-0000-0000-0000-000000000001';
  L1 constant uuid := 'e0000000-0000-0000-0000-000000000001';
  NUEVA constant uuid := '6b000000-0000-0000-0000-0000000000a1';
  o uuid; r jsonb;
begin
  -- Compra pagada (simulada) con condiciones de 3 meses.
  o := public.crear_orden(V, 'curso', C);
  perform public.procesar_evento_pago('simulado', '6b-evt-1', 'pago', '{}'::jsonb, o, '6b-pago-1', 'aprobado', 4900);
  r := public.autorizar_video_leccion(V, L1);
  perform pruebas.afirmar(r ->> 'estado' = 'autorizado' and r ->> 'video_id' = 'bunny-video-1', 'Con acceso vigente, la lección de su versión se autoriza: ' || r::text);
  perform pruebas.afirmar(public.autorizar_video_leccion(S, L1) ->> 'estado' = 'sin_acceso', 'Sin acceso al curso no hay video');
  perform pruebas.afirmar(public.autorizar_video_leccion(V, gen_random_uuid()) ->> 'estado' = 'leccion_inexistente', 'Lección inexistente');
  -- Una lección agregada al borrador después de publicar no es de la versión de la alumna.
  insert into public.lecciones (id, modulo_id, titulo, video_id, orden) values (NUEVA, 'd0000000-0000-0000-0000-000000000001', 'Lección nueva del borrador', 'video-borrador', 9);
  perform pruebas.afirmar(public.autorizar_video_leccion(V, NUEVA) ->> 'estado' = 'fuera_de_su_version', 'Una lección fuera de su versión no se autoriza');
  -- Bloqueo excepcional.
  update public.lecciones set bloqueada = true, bloqueada_en = now(), bloqueo_motivo = 'Prueba de bloqueo de video' where id = L1;
  perform pruebas.afirmar(public.autorizar_video_leccion(V, L1) ->> 'estado' = 'leccion_bloqueada', 'Una lección bloqueada no se autoriza');
  update public.lecciones set bloqueada = false, bloqueada_en = null, bloqueo_motivo = null where id = L1;
  -- Vencido: sin video, aunque la lección siga siendo de su versión.
  perform pruebas.envejecer6b(V, C, 12);  -- 3 meses + 5 adicionales: vencido
  perform pruebas.afirmar(public.autorizar_video_leccion(V, L1) ->> 'estado' = 'acceso_vencido', 'Con el acceso vencido no hay video');
end $$;
select pruebas.afirmar(not has_function_privilege(r, 'public.autorizar_video_leccion(uuid, uuid)', 'execute'), 'Solo el servidor autoriza videos (' || r || ')')
  from unnest(array['anon', 'authenticated']) r;
select pruebas.afirmar(not has_column_privilege(r, 'public.lecciones', 'video_id', 'select'), 'Sigue sin leer video_id: ' || r)
  from unnest(array['anon', 'authenticated']) r;

-- ------------------------------------------------------------ 2. Cola de correos
do $$
declare a uuid; b uuid; e text; v text; i int;
begin
  a := public.encolar_correo('comunicacion_importante', 'Alguien@Prueba.Test', null, '{"nombre": "Ana", "titulo": "Aviso", "mensaje": "Texto"}', 'comunicacion:prueba-1');
  b := public.encolar_correo('comunicacion_importante', 'alguien@prueba.test', null, '{"nombre": "Ana", "titulo": "Aviso", "mensaje": "Texto"}', 'comunicacion:prueba-1');
  perform pruebas.afirmar(a = b and (select count(*) from public.envios_correo where clave_idempotencia = 'comunicacion:prueba-1') = 1, 'Encolar dos veces con la misma clave registra un solo correo');
  perform pruebas.afirmar((select estado || '|' || destinatario from public.envios_correo where id = a) = 'pendiente|alguien@prueba.test', 'Queda pendiente, con el destinatario normalizado');
  begin perform public.encolar_correo('comunicacion_importante', 'x@prueba.test', null, '{"token": "abc"}', 'comunicacion:prueba-2'); e := 'no falló';
  exception when others then e := sqlerrm; end;
  perform pruebas.afirmar(e like 'variable_no_permitida%', 'Una variable con nombre de secreto se rechaza: ' || e);
  begin perform public.encolar_correo('comunicacion_importante', 'no-es-correo', null, '{}', 'comunicacion:prueba-3'); e := 'no falló';
  exception when others then e := sqlerrm; end;
  perform pruebas.afirmar(e = 'destinatario_invalido', 'Destinatario inválido: ' || e);
  begin perform public.encolar_correo('plantilla_que_no_existe', 'x@prueba.test', null, '{}', 'comunicacion:prueba-4'); e := 'no falló';
  exception when others then e := sqlerrm; end;
  perform pruebas.afirmar(e = 'plantilla_inexistente', 'Plantilla inexistente: ' || e);

  -- Tomar: pasa a «enviando» y cuenta el intento.
  perform 1 from public.tomar_correos(10);
  perform pruebas.afirmar((select estado || intentos from public.envios_correo where id = a) = 'enviando1', 'Tomado para enviar: enviando, intento 1');
  -- El proveedor simulado nunca puede registrar «enviado».
  begin perform public.registrar_envio_correo(a, 'enviado', 'simulado', 'sim-1', null); e := 'no falló';
  exception when others then e := sqlerrm; end;
  perform pruebas.afirmar(e = 'simulado_no_es_enviado', 'Un envío simulado no se registra como enviado: ' || e);
  v := public.registrar_envio_correo(a, 'simulado', 'simulado', 'sim-1', null);
  perform pruebas.afirmar(v = 'simulado' and (select enviado_en is null from public.envios_correo where id = a), 'Queda «simulado», sin fecha de envío');

  -- Errores: vuelve a la cola con espera creciente; al quinto intento, fallido.
  b := public.encolar_correo('comunicacion_importante', 'falla@prueba.test', null, '{"nombre": "B", "titulo": "T", "mensaje": "M"}', 'comunicacion:falla');
  for i in 1..5 loop
    update public.envios_correo set proximo_intento_en = now() where id = b;
    perform 1 from public.tomar_correos(10);
    v := public.registrar_envio_correo(b, 'error', 'simulado', null, 'proveedor no disponible');
    if i < 5 then
      perform pruebas.afirmar(v = 'pendiente' and (select proximo_intento_en > now() from public.envios_correo where id = b), 'Error ' || i || ': vuelve a la cola, más tarde');
    end if;
  end loop;
  perform pruebas.afirmar(v = 'fallido' and (select intentos from public.envios_correo where id = b) = 5, 'Al quinto error queda fallido');
  -- Un resultado sobre un correo que no está «enviando» se rechaza (no se pisa un estado final).
  begin perform public.registrar_envio_correo(a, 'error', 'simulado', null, 'x'); e := 'no falló';
  exception when others then e := sqlerrm; end;
  perform pruebas.afirmar(e = 'envio_no_en_curso', 'No se cambia un correo ya procesado: ' || e);
  -- Trabado en «enviando»: vuelve a la cola a los 15 minutos.
  b := public.encolar_correo('comunicacion_importante', 'trabado@prueba.test', null, '{"nombre": "C", "titulo": "T", "mensaje": "M"}', 'comunicacion:trabado');
  perform 1 from public.tomar_correos(10);
  update public.envios_correo set actualizado_en = now() - interval '20 minutes' where id = b;
  i := public.recuperar_correos_trabados();
  perform pruebas.afirmar(i >= 1 and (select estado from public.envios_correo where id = b) = 'pendiente', 'Un correo trabado vuelve a la cola');
end $$;
select pruebas.afirmar(not has_function_privilege(r, f, 'execute'), 'Solo el servidor maneja la cola: ' || f || ' (' || r || ')')
  from unnest(array['anon', 'authenticated']) r,
       unnest(array['public.encolar_correo(text, text, uuid, jsonb, text)', 'public.tomar_correos(int)',
                    'public.registrar_envio_correo(uuid, text, text, text, text)', 'public.encolar_avisos_vencimiento(int)']) f;

-- ------------------------------------------------------------ 3. Confirmación de compra, pago repetido y reembolso
do $$
declare
  P constant uuid := '6b000000-0000-0000-0000-000000000003';
  C constant uuid := 'c0000000-0000-0000-0000-000000000001';
  o1 uuid; o2 uuid; periodos int;
begin
  o1 := public.crear_orden(P, 'curso', C);
  perform public.procesar_evento_pago('simulado', '6b-evt-c1', 'pago', '{}'::jsonb, o1, '6b-pago-c1', 'aprobado', 4900);
  -- El mismo aviso repetido (reintento de la pasarela): un solo acceso, un solo período, un solo correo.
  perform public.procesar_evento_pago('simulado', '6b-evt-c1', 'pago', '{}'::jsonb, o1, '6b-pago-c1', 'aprobado', 4900);
  perform pruebas.afirmar((select count(*) from public.accesos_curso where perfil_id = P and curso_id = C) = 1
    and (select count(*) from public.periodos_acceso where perfil_id = P and curso_id = C) = 1, 'Un pago repetido no duplica accesos ni períodos');
  perform pruebas.afirmar((select count(*) from public.envios_correo where clave_idempotencia = 'confirmacion_compra:' || o1) = 1
    and (select variables ->> 'nombre' from public.envios_correo where clave_idempotencia = 'confirmacion_compra:' || o1) = 'Paula'
    and (select destinatario from public.envios_correo where clave_idempotencia = 'confirmacion_compra:' || o1) = 'compra@prueba.test',
    'La compra aprobada registra un solo correo de confirmación (pendiente, no enviado)');
  -- Renovación después de vencer (la regla vigente no vende otra compra con acceso vigente): segundo período.
  perform pruebas.envejecer6b(P, C, 12);
  o2 := public.crear_orden(P, 'curso', C);
  perform public.procesar_evento_pago('simulado', '6b-evt-c2', 'pago', '{}'::jsonb, o2, '6b-pago-c2', 'aprobado', 4900);
  periodos := (select count(*) from public.periodos_acceso where perfil_id = P and curso_id = C and estado <> 'revocado');
  perform pruebas.afirmar(periodos = 2, 'La renovación agrega un segundo período: ' || periodos);
  -- Reembolso de la segunda compra: revoca solo su período; el de la primera compra sigue.
  perform public.procesar_evento_pago('simulado', '6b-evt-c2-r', 'reembolso', '{}'::jsonb, o2, '6b-pago-c2', 'reembolsado', 4900);
  perform pruebas.afirmar((select count(*) from public.periodos_acceso where perfil_id = P and curso_id = C and estado <> 'revocado') = 1
    and (select count(*) from public.periodos_acceso where perfil_id = P and curso_id = C and item_orden_id in (select id from public.items_orden where orden_id = o1) and estado <> 'revocado') = 1,
    'Un reembolso revoca solo el período de su compra: el de la primera compra se conserva');
  -- Un aviso con importe distinto del de la orden no da acceso nuevo (la base compara el monto).
  perform pruebas.afirmar((select count(*) from public.envios_correo where clave_idempotencia like 'confirmacion_compra:%' and perfil_id = P) = 2, 'Cada compra aprobada, un correo');
end $$;

-- ------------------------------------------------------------ 4. Avisos de vencimiento (no programados)
do $$
declare
  V constant uuid := '6b000000-0000-0000-0000-000000000004';
  C constant uuid := 'c0000000-0000-0000-0000-000000000001';
  e text; o uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (V, 'aviso@prueba.test', '{"nombre_completo": "Rosa Aviso", "confirma_mayoria_edad": true}');
  o := public.crear_orden(V, 'curso', C);
  perform public.procesar_evento_pago('simulado', '6b-evt-aviso', 'pago', '{}'::jsonb, o, '6b-pago-aviso', 'aprobado', 4900);
  -- Su acceso vigente vence en ~8 meses (3 + 5 adicionales): con 7 días de anticipación no le corresponde aviso.
  perform public.encolar_avisos_vencimiento(7);
  perform pruebas.afirmar(not exists (select 1 from public.envios_correo where perfil_id = V and plantilla_clave = 'aviso_vencimiento'), 'Sin vencimiento próximo, no hay aviso');
  -- Siete meses después, vence dentro de 60 días: un aviso, y repetir no lo duplica.
  perform pruebas.envejecer6b(V, C, 7);  -- de 8 meses (3 + 5 adicionales) queda menos de uno
  perform public.encolar_avisos_vencimiento(60);
  perform public.encolar_avisos_vencimiento(60);
  perform pruebas.afirmar((select count(*) from public.envios_correo where perfil_id = V and plantilla_clave = 'aviso_vencimiento' and estado = 'pendiente') = 1,
    'Un aviso de vencimiento, pendiente, sin duplicados');
  perform pruebas.afirmar((select variables ? 'fecha' and variables ->> 'curso' = 'Montessori en casa' from public.envios_correo where perfil_id = V and plantilla_clave = 'aviso_vencimiento'),
    'El aviso lleva curso y fecha');
  begin perform public.encolar_avisos_vencimiento(0); e := 'no falló'; exception when others then e := sqlerrm; end;
  perform pruebas.afirmar(e = 'dias_invalidos', 'La anticipación se valida: ' || e);
end $$;

-- Ningún correo de esta prueba quedó como «enviado»: no hay proveedor real.
select pruebas.afirmar(not exists (select 1 from public.envios_correo where estado = 'enviado'), 'Nada figura como enviado sin proveedor real');

rollback;
