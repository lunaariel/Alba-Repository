-- Adaptación de talleres (0017): respuesta a reprogramaciones, cancelación de gratuitas hasta 24 h antes,
-- pagas sin cancelación ordinaria, cortesías históricas intactas y estados y derechos de grabaciones.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000006', 'c6@prueba.test', '{"nombre_completo": "Alumna C", "confirma_mayoria_edad": true}');

do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  B constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  C constant uuid := 'cccccccc-0000-0000-0000-000000000006';
  ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003';
  PAGO constant uuid := '7a000000-0000-0000-0000-000000000001';
  g uuid; h uuid; f uuid; ia uuid; ib uuid; ic uuid; o uuid; r text; grab uuid; vence timestamptz; fallo text; n int;
begin
  -- Talleres: g gratuito a 3 días; h gratuito a 23 horas; pago con un lugar (fixture).
  insert into public.talleres (slug, titulo, descripcion, inicia_en, termina_en, cupo, precio_centavos)
  values ('adap-gratis', 'Gratis', 'Taller gratuito de prueba.', now() + interval '3 days', now() + interval '3 days 1 hour', 3, 0) returning id into g;
  insert into public.talleres (slug, titulo, descripcion, inicia_en, termina_en, cupo, precio_centavos)
  values ('adap-pronto', 'Pronto', 'Taller gratuito de prueba.', now() + interval '23 hours', now() + interval '24 hours', 3, 0) returning id into h;
  update public.talleres set estado = 'publicado' where id in (g, h);
  insert into public.reuniones (taller_id, proveedor, enlace_participante) values (g, 'manual', 'https://reunion.test/adap');
  update public.talleres set cupo = 3 where id = PAGO;

  -- 1. Gratuitas: cancelación hasta 24 horas antes, con la hora del servidor.
  perform set_config('request.jwt.claim.sub', A::text, true);
  ia := public.inscribirme_gratis(h);
  begin
    perform public.cancelar_mi_inscripcion(h);
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'fuera_de_plazo', 'A 23 horas del inicio no se cancela: ' || fallo);
  ia := public.inscribirme_gratis(g);
  perform public.cancelar_mi_inscripcion(g);
  perform pruebas.afirmar((select estado || ':' || cancelada_por from public.inscripciones_taller where id = ia) = 'cancelada:alumno',
    'A 3 días se cancela y queda registrado que canceló la alumna');
  ia := public.inscribirme_gratis(g);

  -- 2. Pagas: sin cancelación ordinaria desde el campus.
  perform set_config('request.jwt.claim.sub', '', true);
  o := public.crear_orden(B, 'taller', PAGO);
  r := public.procesar_evento_pago('simulado', 'adap-evt-b', 'pago', '{}', o, 'adap-pago-b', 'aprobado', 1500);
  perform set_config('request.jwt.claim.sub', B::text, true);
  begin
    perform public.cancelar_mi_inscripcion(PAGO);
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'inscripcion_paga', 'Una inscripción paga no se cancela desde el campus: ' || fallo);
  perform pruebas.afirmar((select estado from public.inscripciones_taller where taller_id = PAGO and perfil_id = B) = 'confirmada', 'La paga sigue confirmada');
  perform set_config('request.jwt.claim.sub', C::text, true);
  ic := public.inscribirme_gratis(g);

  -- 3. Reprogramación: todos quedan pendientes; el lugar no se libera; el silencio no acepta.
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  n := public.reprogramar_taller(g, now() + interval '5 days', now() + interval '5 days 1 hour', 'La maestra tiene un viaje ese día.');
  perform public.reprogramar_taller(PAGO, now() + interval '8 days', now() + interval '8 days 1 hour', 'Cambio de agenda de la academia.');
  perform pruebas.afirmar((select count(*) from public.inscripciones_taller where taller_id = g and estado = 'confirmada' and respuesta_reprogramacion = 'pendiente') = 2,
    'Las dos inscripciones quedan pendientes de respuesta');
  perform pruebas.afirmar(public.ocupados_taller(g) = 2, 'Mientras está pendiente, el lugar no se libera');
  perform pruebas.afirmar(public.procesar_recordatorios(now() + interval '5 days' - interval '23 hours') = 2, 'El proceso registra avisos');
  perform pruebas.afirmar((select count(*) from public.notificaciones where taller_id = g and tipo = 'recordatorio_taller' and para_inicio = now() + interval '5 days') = 0
                          and (select count(*) from public.notificaciones where taller_id = g and tipo = 'reprogramacion_pendiente') = 2,
    'A quien no respondió se le pide respuesta; nunca un recordatorio que dé por confirmada la fecha nueva');
  perform pruebas.afirmar((select respuesta_reprogramacion from public.inscripciones_taller where id = ia) = 'pendiente', 'Sin respuesta, sigue pendiente (no hay aceptación por silencio)');

  -- 4. Nadie responde por otra persona.
  perform set_config('request.jwt.claim.sub', B::text, true);
  begin
    perform public.responder_reprogramacion(g, 'aceptada', 'Acepto la nueva fecha del taller.');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'sin_inscripcion', 'B no puede responder por A: ' || fallo);
  perform pruebas.afirmar((select respuesta_reprogramacion from public.inscripciones_taller where id = ia) = 'pendiente', 'La respuesta de A no cambió');

  -- 5. Respuestas válidas y transiciones incorrectas.
  perform set_config('request.jwt.claim.sub', A::text, true);
  begin
    perform public.responder_reprogramacion(g, 'aceptada', 'corto');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'confirmacion_requerida', 'La aceptación es expresa: ' || fallo);
  begin
    perform public.responder_reprogramacion(g, 'reembolso_solicitado', 'Prefiero el reembolso de mi pago.');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'inscripcion_sin_pago', 'Sin pago no hay reembolso que pedir: ' || fallo);
  r := public.responder_reprogramacion(g, 'aceptada', 'Acepto la nueva fecha del taller.');
  perform pruebas.afirmar((select respuesta_reprogramacion from public.inscripciones_taller where id = ia) = 'aceptada'
                          and exists (select 1 from public.respuestas_reprogramacion where inscripcion_id = ia and respuesta = 'aceptada'
                                        and confirmacion = 'Acepto la nueva fecha del taller.'), 'A acepta y su decisión queda registrada con el texto');
  begin
    perform public.responder_reprogramacion(g, 'aceptada', 'Acepto la nueva fecha del taller.');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'sin_respuesta_pendiente', 'No se responde dos veces: ' || fallo);
  perform pruebas.afirmar((select count(*) from public.notificaciones where inscripcion_id = ia and tipo = 'reprogramacion_pendiente' and estado = 'descartada') = 1,
    'Al responder, el aviso pendiente se descarta');
  perform set_config('request.jwt.claim.sub', C::text, true);
  r := public.responder_reprogramacion(g, 'no_asiste', 'No puedo asistir en la nueva fecha.');
  perform pruebas.afirmar((select estado || ':' || cancelada_por from public.inscripciones_taller where id = ic) = 'cancelada:alumno'
                          and public.ocupados_taller(g) = 1, 'Gratuita que no puede asistir: libera su lugar por decisión propia');
  perform set_config('request.jwt.claim.sub', B::text, true);
  begin
    perform public.responder_reprogramacion(PAGO, 'no_asiste', 'No puedo asistir en la nueva fecha.');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'inscripcion_paga', 'Una paga no se cancela como gratuita: ' || fallo);
  r := public.responder_reprogramacion(PAGO, 'reembolso_solicitado', 'Prefiero el reembolso de mi pago.');
  perform pruebas.afirmar((select estado || ':' || respuesta_reprogramacion from public.inscripciones_taller where taller_id = PAGO and perfil_id = B) = 'reembolso_pendiente:reembolso_solicitado'
                          and exists (select 1 from public.incidencias where tipo = 'reembolso_por_reprogramacion' and perfil_id = B and orden_id = o),
    'Paga: el reembolso solicitado queda como incidencia, sin monto ni devolución');
  perform pruebas.afirmar((select estado from public.ordenes where id = o) = 'aprobada', 'La orden no cambia en silencio: sigue aprobada hasta que se gestione el reembolso');
  perform pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'reprogramacion_respondida' and actor_id = B), 'Cada respuesta queda en la actividad');

  -- 6. Cortesías históricas: intactas; no se crean nuevas.
  alter table public.inscripciones_taller disable trigger inscripciones_cortesias;
  insert into public.inscripciones_taller (taller_id, perfil_id, origen, motivo, creado_en)
  values (g, C, 'cortesia', 'Beca otorgada antes del cambio.', now() - interval '10 days') returning id into ic;
  alter table public.inscripciones_taller enable trigger inscripciones_cortesias;
  begin
    update public.inscripciones_taller set motivo = 'Otro motivo', origen = 'gratuita' where id = ic;
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'cortesia_historica', 'Una cortesía histórica no se transforma: ' || fallo);
  begin
    insert into public.inscripciones_taller (taller_id, perfil_id, origen, motivo) values (h, B, 'cortesia', 'Nueva cortesía');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'cortesia_no_disponible', 'No se crean cortesías nuevas: ' || fallo);
  perform pruebas.afirmar((select origen || ':' || motivo || ':' || estado from public.inscripciones_taller where id = ic) = 'cortesia:Beca otorgada antes del cambio.:confirmada',
    'La cortesía histórica conserva origen, motivo y estado');

  -- 7. Grabaciones: estados con revisión y derechos (taller ya realizado).
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.talleres (slug, titulo, descripcion, inicia_en, termina_en, estado)
  values ('adap-realizado', 'Realizado', 'Taller ya realizado.', now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 'finalizado') returning id into f;
  insert into public.inscripciones_taller (taller_id, perfil_id, origen, asistio) values (f, A, 'gratuita', false);
  insert into public.inscripciones_taller (taller_id, perfil_id, origen, estado, cancelada_por) values (f, B, 'gratuita', 'cancelada', 'alumno');
  grab := (select id from public.grabaciones_taller where taller_id = f);
  perform pruebas.afirmar((select estado from public.grabaciones_taller where id = grab) = 'prevista', 'Todo taller nace con su grabación prevista');
  perform pruebas.afirmar((select estado from public.grabaciones_taller where taller_id = g) = 'prevista', 'También los publicados antes');
  perform set_config('request.jwt.claim.sub', A::text, true);
  begin
    perform public.cambiar_estado_grabacion(grab, 'recibida', null);
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'no_autorizado', 'Una alumna no cambia el estado de una grabación: ' || fallo);
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  begin
    perform public.cambiar_estado_grabacion((select id from public.grabaciones_taller where taller_id = g), 'recibida', null);
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'taller_no_realizado', 'Un taller futuro no tiene grabación recibida: ' || fallo);
  begin
    perform public.cambiar_estado_grabacion(grab, 'publicada', null);
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'transicion_invalida', 'No se publica la original de Meet: ' || fallo);
  perform public.cambiar_estado_grabacion(grab, 'recibida', null);
  perform public.cambiar_estado_grabacion(grab, 'en_revision', null);
  begin
    perform public.cambiar_estado_grabacion(grab, 'verificada', null);
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'revision_incompleta', 'Sin la revisión completa (imagen, voces, datos en pantalla, contenido) no se verifica: ' || fallo);
  perform public.cambiar_estado_grabacion(grab, 'en_edicion', null);
  perform public.cambiar_estado_grabacion(grab, 'en_revision', null);
  perform public.guardar_revision_grabacion(grab, true, true, true, true);
  perform public.cambiar_estado_grabacion(grab, 'verificada', null);
  begin
    perform public.cambiar_estado_grabacion(grab, 'publicada', null);
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'condiciones_sin_definir', 'Sin condiciones de acceso definidas no se publica: ' || fallo);
  perform public.guardar_condiciones_grabacion(grab, 30, false, null, false, false, null);
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pruebas.afirmar(not public.tiene_acceso_grabacion(grab), 'Antes de publicar, nadie tiene acceso');
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  perform public.cambiar_estado_grabacion(grab, 'publicada', null);
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pruebas.afirmar(public.tiene_acceso_grabacion(grab), 'A no asistió y conserva el acceso a la grabación');
  perform set_config('request.jwt.claim.sub', B::text, true);
  perform pruebas.afirmar(not public.tiene_acceso_grabacion(grab), 'B canceló su inscripción: sin acceso');
  vence := (select vence_en from public.accesos_grabacion where grabacion_id = grab and perfil_id = A);
  perform pruebas.afirmar(vence between now() + interval '29 days' and now() + interval '31 days', 'El acceso incluido vence según las condiciones de la grabación');
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  perform public.guardar_condiciones_grabacion(grab, 7, false, 60, false, true, 900);
  perform pruebas.afirmar((select vence_en from public.accesos_grabacion where grabacion_id = grab and perfil_id = A) = vence,
    'Cambiar las condiciones no modifica derechos ya otorgados');
  -- Compra posterior (Fase 6, función del servidor): condiciones de compra copiadas; quien ya tiene acceso no compra.
  perform set_config('request.jwt.claim.sub', '', true);
  o := public.crear_orden(C, 'taller', PAGO);
  perform public.otorgar_acceso_compra(C, grab, (select id from public.items_orden where orden_id = o));
  perform pruebas.afirmar((select (condiciones ->> 'dias')::int || ':' || (condiciones ->> 'precio_centavos') from public.accesos_grabacion where grabacion_id = grab and perfil_id = C) = '60:900',
    'La compra guarda las condiciones aceptadas');
  begin
    perform public.otorgar_acceso_compra(A, grab, (select id from public.items_orden where orden_id = o));
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'ya_tiene_acceso', 'Quien tiene el acceso incluido no lo compra de nuevo: ' || fallo);
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  perform public.guardar_condiciones_grabacion(grab, 7, false, 60, false, false, 900);
  perform set_config('request.jwt.claim.sub', C::text, true);
  perform pruebas.afirmar(public.tiene_acceso_grabacion(grab), 'Dejar de venderla no quita el acceso a quien la compró');
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  begin
    perform public.cambiar_estado_grabacion(grab, 'retirada', 'corto');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'motivo_requerido', 'Retirar exige motivo: ' || fallo);
  perform public.cambiar_estado_grabacion(grab, 'retirada', 'Una participante pidió el retiro.');
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pruebas.afirmar(not public.tiene_acceso_grabacion(grab), 'Retirada: nadie la ve');
  perform pruebas.afirmar((select count(*) from public.accesos_grabacion where grabacion_id = grab and revocado_en is null) = 2, 'Pero los derechos se conservan');
  update public.accesos_grabacion set vence_en = now() - interval '1 minute' where grabacion_id = grab and perfil_id = A;
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  perform public.cambiar_estado_grabacion(grab, 'en_revision', null);
  perform public.guardar_revision_grabacion(grab, true, true, true, true);
  perform public.cambiar_estado_grabacion(grab, 'verificada', null);
  perform public.cambiar_estado_grabacion(grab, 'publicada', null);
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pruebas.afirmar(not public.tiene_acceso_grabacion(grab), 'Un acceso vencido no se renueva al volver a publicar (control en el servidor)');
  perform pruebas.afirmar((select count(*) from public.historial_grabacion where grabacion_id = grab) >= 10, 'Cada cambio de estado queda en el historial');
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  begin
    perform public.cambiar_estado_grabacion((select id from public.grabaciones_taller where taller_id = h), 'no_publicable', 'Motivo suficiente.');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'transicion_invalida', 'Transición incorrecta rechazada: ' || fallo);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- La alumna no lee grabaciones ni su historial; ve el estado de las suyas por mis_grabaciones().
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pruebas.afirmar((select count(*) from public.grabaciones_taller) = 0 and (select count(*) from public.historial_grabacion) = 0,
  'La alumna no lee la tabla de grabaciones ni su historial');
select pruebas.afirmar((select count(*) from public.accesos_grabacion where perfil_id <> 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'Solo ve sus propios accesos');
select pruebas.afirmar((select m.estado from public.mis_grabaciones() m join public.talleres t on t.id = m.taller_id where t.slug = 'adap-realizado') = 'publicada',
  'El campus recibe el estado de la grabación de su taller');
select pruebas.afirmar((select count(*) from public.mis_grabaciones() m join public.talleres t on t.id = m.taller_id where t.slug = 'adap-pronto') = 1
                       and (select m.estado from public.mis_grabaciones() m join public.talleres t on t.id = m.taller_id where t.slug = 'adap-pronto') = 'prevista',
  'Un taller futuro muestra la grabación como prevista');
select pruebas.afirmar(public.marcar_notificaciones_leidas(array(select id from public.notificaciones)) >= 1, 'Marca sus notificaciones como leídas');
reset role;
select pruebas.afirmar((select count(*) from public.notificaciones where leida_en is not null and perfil_id <> 'aaaaaaaa-0000-0000-0000-000000000001') = 0,
  'No marca como leídas las de otras personas');
select pruebas.afirmar((select count(*) from public.notificaciones where leida_en is not null and estado = 'enviada') = 0, 'Leída en el campus no significa correo enviado');

-- Criterio único de «paga»: origen compra (aunque no tenga ítem de orden) no puede «no asistir» ni cancelar.
do $$
declare A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003'; t uuid; fallo text;
begin
  insert into public.talleres (slug, titulo, descripcion, inicia_en, termina_en, precio_centavos, estado)
  values ('adap-compra-sin-item', 'Compra sin ítem', 'Taller pago de prueba.', now() + interval '5 days', now() + interval '5 days 1 hour', 1500, 'borrador') returning id into t;
  update public.talleres set estado = 'publicado' where id = t;
  insert into public.inscripciones_taller (taller_id, perfil_id, origen) values (t, A, 'compra');
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  perform public.reprogramar_taller(t, now() + interval '6 days', now() + interval '6 days 1 hour', 'Motivo suficiente para la prueba.');
  perform set_config('request.jwt.claim.sub', A::text, true);
  begin perform public.responder_reprogramacion(t, 'no_asiste', 'No puedo asistir a la nueva fecha.'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'inscripcion_paga', 'Una inscripción de origen compra no se libera como gratuita: ' || fallo);
  begin perform public.cancelar_mi_inscripcion(t); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'inscripcion_paga', 'Ni se cancela desde el campus: ' || fallo);
  perform public.responder_reprogramacion(t, 'reembolso_solicitado', 'Solicito el reembolso por el cambio.');
  perform pruebas.afirmar((select estado from public.inscripciones_taller where taller_id = t and perfil_id = A) = 'reembolso_pendiente'
    and (select count(*) from public.incidencias where taller_id = t and tipo = 'reembolso_por_reprogramacion') = 1,
    'Puede pedir el reembolso: queda pendiente con incidencia');
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

rollback;
