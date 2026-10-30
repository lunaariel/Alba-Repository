-- Órdenes, pagos y webhooks: acceso exactamente una vez, duplicados ignorados, reembolsos revocan.
begin;

do $$
declare
  B constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  CURSO constant uuid := 'c0000000-0000-0000-0000-000000000001';
  v_orden uuid; v_orden2 uuid; r text;
begin
  -- Crear la orden dos veces devuelve la misma (doble clic).
  v_orden := public.crear_orden(B, 'curso', CURSO);
  v_orden2 := public.crear_orden(B, 'curso', CURSO);
  perform pruebas.afirmar(v_orden = v_orden2, 'Una sola orden pendiente por producto');
  perform pruebas.afirmar((select total_centavos from public.ordenes where id = v_orden) = 4900, 'Total = precio del curso');

  -- Pago pendiente: no da acceso.
  r := public.procesar_evento_pago('simulado', 'evt-pend', 'pago', '{}', v_orden, 'pago-b', 'pendiente', 4900);
  perform pruebas.afirmar(not exists (select 1 from public.accesos_curso where perfil_id = B), 'Pago pendiente no da acceso');

  -- Monto distinto: no da acceso.
  r := public.procesar_evento_pago('simulado', 'evt-monto', 'pago', '{}', v_orden, 'pago-b', 'aprobado', 100);
  perform pruebas.afirmar(r = 'error: monto_no_coincide', 'Monto incorrecto se rechaza: ' || r);
  perform pruebas.afirmar(not exists (select 1 from public.accesos_curso where perfil_id = B), 'Monto incorrecto no da acceso');

  -- Aprobado: da acceso una vez.
  r := public.procesar_evento_pago('simulado', 'evt-ok', 'pago', '{}', v_orden, 'pago-b', 'aprobado', 4900);
  perform pruebas.afirmar(r = 'procesado', 'Pago aprobado se procesa: ' || r);
  perform pruebas.afirmar((select count(*) from public.accesos_curso where perfil_id = B and estado = 'activo') = 1, 'Acceso concedido');
  perform pruebas.afirmar((select estado from public.ordenes where id = v_orden) = 'aprobada', 'Orden aprobada');
  perform pruebas.afirmar(exists (select 1 from public.documentos_fiscales where orden_id = v_orden and tipo = 'recibo' and estado = 'pendiente'),
                          'Se encola un recibo comercial (no una factura)');

  -- Webhook duplicado: se ignora.
  r := public.procesar_evento_pago('simulado', 'evt-ok', 'pago', '{}', v_orden, 'pago-b', 'aprobado', 4900);
  perform pruebas.afirmar(r = 'duplicado', 'Evento repetido se reconoce: ' || r);
  -- Otro evento distinto que también dice "aprobado": no duplica el acceso.
  r := public.procesar_evento_pago('simulado', 'evt-ok-2', 'pago', '{}', v_orden, 'pago-b', 'aprobado', 4900);
  perform pruebas.afirmar(r = 'ignorado: ya_aprobada', 'Segundo aprobado se ignora: ' || r);
  perform pruebas.afirmar((select count(*) from public.accesos_curso where perfil_id = B) = 1, 'Acceso concedido exactamente una vez');

  -- Ya tiene acceso: no puede volver a comprar.
  begin
    perform public.crear_orden(B, 'curso', CURSO);
    raise exception 'NO_FALLÓ: compró dos veces';
  exception when others then
    perform pruebas.afirmar(sqlerrm = 'ya_tiene_acceso', 'Compra repetida bloqueada: ' || sqlerrm);
  end;

  -- Reembolso: revoca el acceso.
  r := public.procesar_evento_pago('simulado', 'evt-reemb', 'reembolso', '{}', v_orden, 'pago-b', 'reembolsado', 4900);
  perform pruebas.afirmar(r = 'procesado', 'Reembolso procesado: ' || r);
  perform pruebas.afirmar(not exists (select 1 from public.accesos_curso where perfil_id = B and estado = 'activo'), 'Reembolso revoca el acceso');
  perform pruebas.afirmar((select estado from public.ordenes where id = v_orden) = 'reembolsada', 'Orden reembolsada');
  perform pruebas.afirmar(exists (select 1 from public.auditoria where entidad_id = v_orden::text and accion = 'orden_reembolsado'), 'Reembolso auditado');
end $$;

-- Pago rechazado y contracargo, con una orden nueva de B.
do $$
declare
  B constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  CURSO constant uuid := 'c0000000-0000-0000-0000-000000000001';
  v_orden uuid; r text;
begin
  v_orden := public.crear_orden(B, 'curso', CURSO);
  r := public.procesar_evento_pago('simulado', 'evt-rech', 'pago', '{}', v_orden, 'pago-b2', 'rechazado', 4900);
  perform pruebas.afirmar((select estado from public.ordenes where id = v_orden) = 'rechazada', 'Pago rechazado marca la orden');
  perform pruebas.afirmar(not exists (select 1 from public.accesos_curso where perfil_id = B and estado = 'activo'), 'Rechazo no da acceso');

  v_orden := public.crear_orden(B, 'curso', CURSO);
  r := public.procesar_evento_pago('simulado', 'evt-ok-3', 'pago', '{}', v_orden, 'pago-b3', 'aprobado', 4900);
  r := public.procesar_evento_pago('simulado', 'evt-cb', 'disputa', '{}', v_orden, 'pago-b3', 'contracargo', 4900);
  perform pruebas.afirmar((select estado from public.ordenes where id = v_orden) = 'contracargo', 'Contracargo registrado');
  perform pruebas.afirmar(not exists (select 1 from public.accesos_curso where perfil_id = B and estado = 'activo'), 'Contracargo revoca el acceso');
end $$;

-- Cupón de 50 %
do $$
declare v_orden uuid;
begin
  insert into public.cupones (codigo, tipo, valor, usos_maximos) values ('BIENVENIDA', 'porcentaje', 50, 1);
  v_orden := public.crear_orden('adadadad-0000-0000-0000-000000000003', 'curso', 'c0000000-0000-0000-0000-000000000001', 'bienvenida');
  perform pruebas.afirmar((select total_centavos from public.ordenes where id = v_orden) = 2450, 'Cupón aplica 50 %');
end $$;

-- Reembolso mayor a lo pagado: se rechaza.
do $$ begin
  begin
    insert into public.reembolsos (pago_id, monto_centavos, motivo)
    select id, monto_centavos + 1, 'prueba' from public.pagos where id_externo = 'fixture-pago-1';
    raise exception 'NO_FALLÓ: reembolso mayor al pago';
  exception when others then
    perform pruebas.afirmar(sqlerrm = 'reembolso_excede_pago', 'Reembolso excedido bloqueado: ' || sqlerrm);
  end;
end $$;

rollback;
