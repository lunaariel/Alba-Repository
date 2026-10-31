-- Gestión de talleres (0016): publicación, duplicación, inscripción gratuita, cupos, cancelación de la
-- inscripción, reprogramación, cancelación del taller, recordatorios idempotentes, enlaces, permisos
-- y registro de actividad.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000005', 'c5@prueba.test', '{"nombre_completo": "Alumna C", "confirma_mayoria_edad": true}');

do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  B constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  C constant uuid := 'cccccccc-0000-0000-0000-000000000005';
  ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003';
  g uuid; p uuid; copia uuid; ia uuid; ib uuid; o uuid; r text; n int; j jsonb; inicio timestamptz; fallo text;
begin
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);

  -- 1. Crear y editar: todo taller nace en borrador.
  begin
    insert into public.talleres (slug, titulo, inicia_en, termina_en, estado)
    values ('directo', 'Publicado directo', now() + interval '2 days', now() + interval '2 days 1 hour', 'publicado');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'taller_nace_borrador', 'Un taller no se crea ya publicado: ' || fallo);
  insert into public.talleres (slug, titulo, inicia_en, termina_en, cupo, precio_centavos, zona_horaria)
  values ('gratis', 'Taller gratuito', now() + interval '3 days', now() + interval '3 days 90 minutes', 2, 0, 'America/Guatemala')
  returning id into g;
  perform pruebas.afirmar((select array_agg(minutos_antes order by minutos_antes) from public.recordatorios where taller_id = g) = array[60, 1440],
    'Recordatorios por defecto: 24 horas y 1 hora antes');
  begin
    update public.talleres set zona_horaria = 'Marte/Olympus' where id = g;
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'zona_invalida', 'La zona horaria se valida: ' || fallo);

  -- 3. Publicación incompleta rechazada; 2. publicación válida.
  begin
    update public.talleres set estado = 'publicado' where id = g;
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo like 'taller_incompleto:%descripcion%', 'Sin descripción no se publica: ' || fallo);
  update public.talleres set descripcion = 'Un encuentro para conversar sobre límites.' where id = g;
  update public.talleres set estado = 'publicado' where id = g;
  perform pruebas.afirmar((select estado from public.talleres where id = g) = 'publicado', 'Taller válido publicado');
  insert into public.talleres (slug, titulo, descripcion, inicia_en, termina_en) values
    ('pasado', 'Taller pasado', 'Descripción suficiente.', now() - interval '1 day', now() - interval '23 hours') returning id into p;
  begin
    update public.talleres set estado = 'publicado' where id = p;
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo like 'taller_incompleto:%fecha_pasada%', 'Un taller con fecha pasada no se publica: ' || fallo);

  -- 5. Inscripción gratuita; 6. sin duplicados; 7. último cupo.
  insert into public.reuniones (taller_id, proveedor, enlace_participante) values (g, 'manual', 'https://reunion.test/gratis');
  perform set_config('request.jwt.claim.sub', A::text, true);
  ia := public.inscribirme_gratis(g);
  perform pruebas.afirmar((select origen from public.inscripciones_taller where id = ia) = 'gratuita', 'A se inscribe gratis');
  perform pruebas.afirmar(exists (select 1 from public.notificaciones where inscripcion_id = ia and tipo = 'inscripcion_taller' and estado = 'pendiente'),
    'La confirmación queda registrada como pendiente (no hay proveedor de correo)');
  begin
    perform public.inscribirme_gratis(g);
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'ya_inscripto', 'No hay inscripción duplicada: ' || fallo);
  perform set_config('request.jwt.claim.sub', B::text, true);
  ib := public.inscribirme_gratis(g);
  perform set_config('request.jwt.claim.sub', C::text, true);
  begin
    perform public.inscribirme_gratis(g);
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'sin_cupo', 'Con el cupo completo, C no entra: ' || fallo);
  begin
    perform public.inscribirme_gratis('7a000000-0000-0000-0000-000000000001');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'taller_pago', 'Un taller pago no admite inscripción gratuita: ' || fallo);

  -- 9. Cancelar la propia inscripción libera el lugar.
  perform set_config('request.jwt.claim.sub', B::text, true);
  perform public.cancelar_mi_inscripcion(g);
  perform pruebas.afirmar((select estado from public.inscripciones_taller where id = ib) = 'cancelada', 'B cancela su inscripción gratuita');
  perform set_config('request.jwt.claim.sub', C::text, true);
  perform public.inscribirme_gratis(g);
  perform pruebas.afirmar(public.ocupados_taller(g) = 2, 'El lugar liberado lo toma C');

  -- El cupo no baja de los lugares ocupados.
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  begin
    update public.talleres set cupo = 1 where id = g;
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'cupo_menor_que_ocupados: 2', 'El cupo no baja de los ocupados: ' || fallo);
  update public.talleres set cupo = null where id = g;   -- sin límite: libre

  -- Asistencia: solo después del inicio.
  begin
    perform public.marcar_asistencia(ia, true);
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'taller_no_empezo', 'La asistencia se marca después del inicio: ' || fallo);

  -- 16 y 17. Recordatorios: uno por recordatorio, inscripción y fecha; correr dos veces no duplica.
  inicio := (select inicia_en from public.talleres where id = g);
  n := public.procesar_recordatorios(inicio - interval '23 hours');
  perform pruebas.afirmar(n = 2, 'A 23 horas: el recordatorio de 24 h para A y C → ' || n);
  perform pruebas.afirmar(public.procesar_recordatorios(inicio - interval '23 hours') = 0, 'Correr de nuevo no repite');
  perform pruebas.afirmar(public.procesar_recordatorios(inicio - interval '22 hours') = 0, 'Más tarde tampoco repite el de 24 h');
  perform pruebas.afirmar(public.procesar_recordatorios(inicio - interval '30 minutes') = 2, 'A 30 minutos: el de 1 h');
  perform pruebas.afirmar((select count(*) from public.notificaciones where taller_id = g and tipo = 'recordatorio_taller' and estado = 'pendiente') = 4,
    'Cuatro recordatorios registrados, ninguno marcado como enviado');
  perform pruebas.afirmar(not exists (select 1 from public.notificaciones where estado = 'enviada'), 'Nada figura como correo enviado');

  -- 13. Reprogramar con inscriptos: solo con la función, con motivo; recalcula y no repite.
  begin
    update public.talleres set inicia_en = inicio + interval '2 days', termina_en = inicio + interval '2 days 90 minutes' where id = g;
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'usar_reprogramar', 'Con inscriptos, la fecha no se edita directo: ' || fallo);
  begin
    perform public.reprogramar_taller(g, inicio + interval '2 days', inicio + interval '2 days 90 minutes', 'corto');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'motivo_requerido', 'Reprogramar exige motivo: ' || fallo);
  n := public.reprogramar_taller(g, inicio + interval '2 days', inicio + interval '2 days 90 minutes', 'La maestra tiene un viaje ese día.');
  perform pruebas.afirmar(n = 2, 'Reprogramado con 2 inscriptos');
  perform pruebas.afirmar((select count(*) from public.notificaciones where taller_id = g and tipo = 'recordatorio_taller' and estado = 'descartada'
                             and motivo_descarte = 'reprogramado') = 4, 'Los recordatorios pendientes de la fecha anterior se descartan');
  perform pruebas.afirmar((select count(*) from public.notificaciones where taller_id = g and tipo = 'taller_reprogramado') = 2, 'Aviso de reprogramación registrado para cada inscripto');
  perform pruebas.afirmar(exists (select 1 from public.reprogramaciones_taller where taller_id = g and responsable = ADMIN and inscriptos = 2), 'Reprogramación registrada con responsable');
  perform pruebas.afirmar(public.procesar_recordatorios(inicio - interval '22 hours') = 0, 'Con la fecha nueva, la hora vieja ya no dispara recordatorios');
  n := public.procesar_recordatorios(inicio + interval '2 days' - interval '23 hours');
  perform pruebas.afirmar(n = 2, 'La fecha nueva recibe su recordatorio de 24 h → ' || n);
  perform pruebas.afirmar(public.procesar_recordatorios(inicio + interval '2 days' - interval '23 hours') = 0, 'Una sola vez');

  -- 4. Duplicar: borrador nuevo, sin inscriptos, reunión, pagos ni recordatorios enviados.
  copia := public.duplicar_taller(g, now() + interval '20 days', now() + interval '20 days 90 minutes');
  perform pruebas.afirmar((select estado from public.talleres where id = copia) = 'borrador' and copia <> g
                          and (select duplicado_de from public.talleres where id = copia) = g
                          and (select slug from public.talleres where id = copia) = 'gratis-copia', 'La copia nace en borrador, con id y dirección propios');
  perform pruebas.afirmar(not exists (select 1 from public.inscripciones_taller where taller_id = copia)
                          and not exists (select 1 from public.reuniones where taller_id = copia)
                          and not exists (select 1 from public.items_orden where taller_id = copia)
                          and not exists (select 1 from public.notificaciones where taller_id = copia)
                          and not exists (select 1 from public.envios_recordatorio e join public.recordatorios r on r.id = e.recordatorio_id where r.taller_id = copia),
    'No copia inscriptos, reunión, pagos ni notificaciones');
  perform pruebas.afirmar((select array_agg(minutos_antes order by minutos_antes) from public.recordatorios where taller_id = copia)
                          = (select array_agg(minutos_antes order by minutos_antes) from public.recordatorios where taller_id = g), 'Copia la configuración de recordatorios');
  p := public.duplicar_taller(g, now() + interval '30 days', now() + interval '30 days 1 hour');
  perform pruebas.afirmar((select slug from public.talleres where id = p) = 'gratis-copia-2', 'Una segunda copia recibe otra dirección');

  -- 14. Cancelar con motivo: todo o nada. Inscripción paga → reembolso pendiente; gratuita → cancelada.
  o := public.crear_orden(A, 'taller', '7a000000-0000-0000-0000-000000000001');
  r := public.procesar_evento_pago('simulado', 'gest-evt-a', 'pago', '{}', o, 'gest-pago-a', 'aprobado', 1500);
  perform pruebas.afirmar(r = 'procesado', 'A paga el taller pago: ' || r);
  update public.talleres set cupo = 3 where id = '7a000000-0000-0000-0000-000000000001';
  o := public.crear_orden(B, 'taller', '7a000000-0000-0000-0000-000000000001');   -- reserva pendiente de B
  perform public.inscribir_cortesia('7a000000-0000-0000-0000-000000000001', 'c5@prueba.test', 'Beca para la alumna C.');
  begin
    perform public.cancelar_taller('7a000000-0000-0000-0000-000000000001', 'corto');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'motivo_requerido', 'Cancelar exige motivo: ' || fallo);
  j := public.cancelar_taller('7a000000-0000-0000-0000-000000000001', 'La maestra está enferma ese día.');
  perform pruebas.afirmar((j ->> 'reembolsos_pendientes')::int = 1 and (j ->> 'inscripciones_canceladas')::int = 1, 'Cancelación: ' || j::text);
  perform pruebas.afirmar((select estado from public.inscripciones_taller where perfil_id = A and taller_id = '7a000000-0000-0000-0000-000000000001'
                           order by creado_en desc limit 1) = 'reembolso_pendiente', 'La inscripción paga queda en reembolso pendiente');
  perform pruebas.afirmar(exists (select 1 from public.incidencias where tipo = 'reembolso_por_cancelacion' and perfil_id = A), 'Incidencia de reembolso abierta');
  perform pruebas.afirmar((select estado from public.ordenes where id = o) = 'cancelada'
                          and not exists (select 1 from public.reservas_cupo where orden_id = o and liberada_en is null), 'La reserva pendiente se libera y su orden se cancela');
  perform pruebas.afirmar((select count(*) from public.notificaciones where taller_id = '7a000000-0000-0000-0000-000000000001' and tipo = 'taller_cancelado') = 2,
    'Aviso de cancelación registrado para cada inscripto');
  perform pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'taller_cancelado' and actor_id = ADMIN
                                    and despues ->> 'motivo' = 'La maestra está enferma ese día.'), 'Cancelación registrada con motivo y responsable');
  -- 12. El pago de B llega después de la cancelación: se registra y queda para reembolso, sin inscribir.
  r := public.procesar_evento_pago('simulado', 'gest-evt-b', 'pago', '{}', o, 'gest-pago-b', 'aprobado', 1500);
  perform pruebas.afirmar(r = 'requiere_reembolso' and (select estado from public.ordenes where id = o) = 'requiere_reembolso', 'Pago tras la cancelación → requiere reembolso: ' || r);
  perform pruebas.afirmar(exists (select 1 from public.incidencias where orden_id = o and tipo = 'pago_sin_cupo' and detalle ->> 'motivo' = 'taller_cancelado'),
    'Incidencia con el motivo «taller cancelado»');
  perform pruebas.afirmar(not exists (select 1 from public.inscripciones_taller where perfil_id = B and taller_id = '7a000000-0000-0000-0000-000000000001' and estado = 'confirmada'),
    'B no queda inscripta en un taller cancelado');
  r := public.procesar_evento_pago('simulado', 'gest-evt-b', 'pago', '{}', o, 'gest-pago-b', 'aprobado', 1500);
  perform pruebas.afirmar(r = 'duplicado', 'El mismo aviso de pago dos veces no duplica nada');
  begin
    delete from public.talleres where id = '7a000000-0000-0000-0000-000000000001';
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'taller_con_historial', 'Un taller con inscriptos no se elimina: ' || fallo);
  begin
    update public.talleres set estado = 'publicado' where id = '7a000000-0000-0000-0000-000000000001';
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'transicion_invalida', 'Un taller cancelado no vuelve a publicarse: ' || fallo);
  update public.talleres set estado = 'archivado' where id = '7a000000-0000-0000-0000-000000000001';
  begin
    update public.talleres set estado = 'archivado' where id = g;
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'archivar_taller_vigente', 'Un taller vigente no se archiva: ' || fallo);
  begin
    update public.talleres set estado = 'cancelado' where id = g;
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'usar_cancelar_taller', 'Cancelar exige la función con motivo: ' || fallo);

  -- 18. Una alumna no ejecuta acciones de gestión.
  perform set_config('request.jwt.claim.sub', A::text, true);
  foreach r in array array[
    $q$select public.duplicar_taller('%s', now() + interval '9 days', now() + interval '9 days 1 hour')$q$,
    $q$select public.reprogramar_taller('%s', now() + interval '9 days', now() + interval '9 days 1 hour', 'Motivo suficiente.')$q$,
    $q$select public.cancelar_taller('%s', 'Motivo suficiente.')$q$,
    $q$select public.inscribir_cortesia('%s', 'b@prueba.test', 'Motivo suficiente.')$q$,
    $q$select public.anotar_incidencia('%s', 'Nota suficiente.')$q$
  ] loop
    begin
      execute format(r, g);
      fallo := 'no falló';
    exception when others then fallo := sqlerrm; end;
    perform pruebas.afirmar(fallo in ('no_autorizado', 'no_encontrado'), 'Alumna rechazada: ' || left(r, 40) || ' → ' || fallo);
  end loop;
  begin
    perform public.marcar_asistencia(ia, true);
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'no_autorizado', 'Alumna no marca asistencia: ' || fallo);

  -- 19. Registro de actividad.
  perform pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'taller_reprogramado' and entidad_id = g::text and actor_id = ADMIN)
                          and exists (select 1 from public.auditoria where accion = 'taller_duplicado' and actor_id = ADMIN)
                          and exists (select 1 from public.auditoria where accion = 'inscripcion_cortesia' and actor_id = ADMIN)
                          and exists (select 1 from public.auditoria where accion = 'pago_requiere_reembolso' and entidad_id = o::text)
                          and exists (select 1 from public.auditoria where accion = 'inscripcion_creado' and entidad = 'inscripciones_taller'),
    'Reprogramar, duplicar, cortesía, pago sin lugar e inscripciones quedan registrados');
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- 15. Enlaces: la alumna inscripta solo lo recibe desde N horas antes; tras cancelar, nadie.
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pruebas.afirmar(public.enlace_taller((select id from public.talleres where slug = 'gratis')) is null, 'A 5 días del inicio, sin enlace (24 h antes por defecto)');
select pruebas.afirmar((select count(*) from public.incidencias) = 0, 'La alumna no ve incidencias');
select pruebas.afirmar((select count(*) from public.notificaciones where perfil_id <> 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'La alumna solo ve sus notificaciones');
select pruebas.afirmar((select count(*) from public.talleres where slug = 'taller-prueba') = 1, 'Ve el taller archivado en el que estuvo inscripta');
reset role;
update public.talleres set enlace_visible_horas = 168 where slug = 'gratis';
set local role authenticated;
select pruebas.afirmar(public.enlace_taller((select id from public.talleres where slug = 'gratis')) = 'https://reunion.test/gratis', 'Con 7 días de anticipación configurada, lo recibe');
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pruebas.afirmar(public.enlace_taller((select id from public.talleres where slug = 'gratis')) is null, 'Quien canceló su inscripción no lo recibe');
set local role anon;
select pruebas.afirmar((select count(*) from public.talleres where estado = 'archivado') = 0, 'El público no ve talleres archivados');
select pruebas.afirmar((select count(*) from public.talleres where estado = 'borrador') = 0, 'El público no ve borradores (ni las copias)');
reset role;

rollback;
