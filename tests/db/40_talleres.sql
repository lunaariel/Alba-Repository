-- Cupos, reservas que vencen, inscripción por pago y enlaces protegidos.
begin;

do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  B constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  T constant uuid := '7a000000-0000-0000-0000-000000000001';
  oa uuid; ob uuid; r text;
begin
  -- A reserva el único lugar.
  oa := public.crear_orden(A, 'taller', T);
  perform pruebas.afirmar(exists (select 1 from public.reservas_cupo where orden_id = oa and liberada_en is null), 'Reserva creada');

  -- B no consigue lugar mientras la reserva de A está vigente.
  begin
    ob := public.crear_orden(B, 'taller', T);
    raise exception 'NO_FALLÓ: sobreventa';
  exception when others then perform pruebas.afirmar(sqlerrm = 'sin_cupo', 'Cupo completo con reserva vigente: ' || sqlerrm);
  end;

  -- La reserva de A vence: el lugar se libera y la orden queda vencida.
  update public.reservas_cupo set vence_en = now() - interval '1 minute' where orden_id = oa;
  perform pruebas.afirmar(public.vencer_reservas() = 1, 'Una reserva vencida liberada');
  perform pruebas.afirmar((select estado from public.ordenes where id = oa) = 'vencida', 'Orden de A vencida');

  -- Ahora B reserva y paga.
  ob := public.crear_orden(B, 'taller', T);
  r := public.procesar_evento_pago('simulado', 'evt-t-b', 'pago', '{}', ob, 'pago-t-b', 'aprobado', 1500);
  perform pruebas.afirmar(r = 'procesado', 'Pago de B procesado: ' || r);
  perform pruebas.afirmar(exists (select 1 from public.inscripciones_taller where perfil_id = B and taller_id = T and estado = 'confirmada'), 'B inscripta');

  -- El pago tardío de A llega con el taller lleno: no se inscribe y queda para reembolso.
  r := public.procesar_evento_pago('simulado', 'evt-t-a', 'pago', '{}', oa, 'pago-t-a', 'aprobado', 1500);
  perform pruebas.afirmar(r = 'error: sin_cupo_requiere_reembolso', 'Pago tardío sin cupo detectado: ' || r);
  perform pruebas.afirmar(not exists (select 1 from public.inscripciones_taller where perfil_id = A and taller_id = T and estado = 'confirmada'), 'Sin sobreventa');

  -- Recordatorio: no se envía dos veces a la misma inscripción.
  insert into public.recordatorios (taller_id, minutos_antes) values (T, 1440);
  insert into public.envios_recordatorio (recordatorio_id, inscripcion_id)
  select r.id, i.id from public.recordatorios r, public.inscripciones_taller i where r.taller_id = T and i.perfil_id = B;
  begin
    insert into public.envios_recordatorio (recordatorio_id, inscripcion_id)
    select r.id, i.id from public.recordatorios r, public.inscripciones_taller i where r.taller_id = T and i.perfil_id = B;
    raise exception 'NO_FALLÓ: recordatorio duplicado';
  exception when unique_violation then null;
  end;
end $$;

-- Reserva vencida que la tarea programada todavía no procesó: no puede usarse para inscribirse
-- si otra persona ya tomó el lugar.
do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  T2 constant uuid := '7a000000-0000-0000-0000-000000000002';
  B constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  oa uuid; oa2 uuid; ob uuid; r text;
begin
  insert into public.talleres (id, slug, titulo, inicia_en, termina_en, cupo, precio_centavos, estado)
  values (T2, 'taller-dos', 'Taller dos', now() + interval '3 days', now() + interval '3 days 1 hour', 1, 1000, 'publicado');
  oa := public.crear_orden(A, 'taller', T2);
  update public.reservas_cupo set vence_en = now() - interval '1 second' where orden_id = oa;
  ob := public.crear_orden(B, 'taller', T2);                       -- el lugar quedó libre
  r := public.procesar_evento_pago('simulado', 'evt-t2-b', 'pago', '{}', ob, 'pago-t2-b', 'aprobado', 1000);
  perform pruebas.afirmar(r = 'procesado', 'B se inscribe en el lugar liberado: ' || r);
  r := public.procesar_evento_pago('simulado', 'evt-t2-a', 'pago', '{}', oa, 'pago-t2-a', 'aprobado', 1000);
  perform pruebas.afirmar(r = 'error: sin_cupo_requiere_reembolso', 'Pago con reserva vencida no sobrevende: ' || r);
  perform pruebas.afirmar((select count(*) from public.inscripciones_taller where taller_id = T2 and estado = 'confirmada') = 1, 'Una sola inscripción');
end $$;

-- Como B (inscripta): ve el enlace de participante, nunca el de anfitrión.
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pruebas.afirmar((select enlace_participante from public.reuniones) = 'https://reunion.test/participante', 'Inscripta ve el enlace de participante');
do $$ declare v text; begin
  begin
    select enlace_anfitrion into v from public.reuniones;
    raise exception 'NO_FALLÓ: alumno leyó el enlace de anfitrión';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Como A (no inscripta): no ve la reunión.
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pruebas.afirmar((select count(*) from public.reuniones) = 0, 'No inscripta no ve la reunión');

rollback;
