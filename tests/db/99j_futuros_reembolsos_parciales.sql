-- Decisiones A y B de la titular (01/11/2026), migración 0025.
-- A. Revocar un período no adelanta las renovaciones posteriores: conservan sus fechas, el intervalo sin
--    período queda sin acceso y la renovación se activa en su fecha.
-- B. Todo reembolso parcial queda para revisión administrativa: se registra, el acceso no cambia y nada
--    cierra la incidencia sin una resolución escrita de la admin.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('25000000-0000-0000-0000-0000000000a1', 'p25@prueba.test', '{"nombre_completo": "Renovación futura", "confirma_mayoria_edad": true}'),
  ('25000000-0000-0000-0000-0000000000a2', 'm25@prueba.test', '{"nombre_completo": "Tres renovaciones", "confirma_mayoria_edad": true}'),
  ('25000000-0000-0000-0000-0000000000a3', 'q25@prueba.test', '{"nombre_completo": "Reembolso parcial", "confirma_mayoria_edad": true}');

create or replace function pruebas.error_de(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'no falló';
exception when others then return sqlerrm;
end; $$;

-- Paso del tiempo (solo en pruebas): mueve juntos el acceso y todos sus períodos.
create or replace function pruebas.envejecer(p_perfil uuid, p_curso uuid, p_intervalo interval) returns void language plpgsql as $$
begin
  alter table public.periodos_acceso disable trigger periodos_inmutables;
  update public.periodos_acceso set inicia_en = inicia_en - p_intervalo, vence_en = vence_en - p_intervalo
   where perfil_id = p_perfil and curso_id = p_curso;
  alter table public.periodos_acceso enable trigger periodos_inmutables;
  perform set_config('albor.ajuste_vencimiento', 'si', true);
  update public.accesos_curso set inicia_en = inicia_en - p_intervalo, vence_en = vence_en - p_intervalo
   where perfil_id = p_perfil and curso_id = p_curso;
  perform set_config('albor.ajuste_vencimiento', '', true);
end; $$;

-- Tres órdenes del mismo curso con precios distintos (cada cambio de precio vence la orden anterior).
create or replace function pruebas.tres_ordenes(p_perfil uuid, p_curso uuid) returns uuid[] language plpgsql as $$
declare o1 uuid; o2 uuid; o3 uuid;
begin
  update public.cursos set precio_centavos = 3000 where id = p_curso;
  o1 := public.crear_orden(p_perfil, 'curso', p_curso);
  update public.cursos set precio_centavos = 3100 where id = p_curso;
  o2 := public.crear_orden(p_perfil, 'curso', p_curso);
  update public.cursos set precio_centavos = 3200 where id = p_curso;
  o3 := public.crear_orden(p_perfil, 'curso', p_curso);
  return array[o1, o2, o3];
end; $$;

do $$
declare
  ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003';
  PA constant uuid := '25000000-0000-0000-0000-0000000000a1';
  K constant uuid := '25000000-0000-0000-0000-000000000001';
  L constant uuid := '25000000-0000-0000-0000-000000000003';
  EV constant uuid := '25000000-0000-0000-0000-000000000004';
  P constant uuid := '25000000-0000-0000-0000-000000000005';
  o uuid[]; acc uuid; v1 uuid; v2 uuid; cert uuid; res text; fallo text;
  a public.periodos_acceso%rowtype; b public.periodos_acceso%rowtype; b_despues public.periodos_acceso%rowtype;
  ordenes text; items text; periodos int;
begin
  insert into public.cursos (id, slug, titulo, precio_centavos, duracion_comercial_meses) values (K, 'futuros', 'Curso con renovaciones', 3000, 1);
  insert into public.modulos (id, curso_id, titulo, orden) values ('25000000-0000-0000-0000-000000000002', K, 'Módulo', 0);
  insert into public.lecciones (id, modulo_id, titulo, orden) values (L, '25000000-0000-0000-0000-000000000002', 'Lección', 0);
  insert into public.evaluaciones (id, curso_id, puntaje_minimo) values (EV, K, 50);
  insert into public.preguntas (id, evaluacion_id, enunciado, tipo, orden) values (P, EV, '¿Sí?', 'unica', 0);
  insert into public.opciones (pregunta_id, texto, es_correcta, orden) values (P, 'Sí', true, 0), (P, 'No', false, 1);
  update public.cursos set estado = 'publicado' where id = K;

  -- Período A (pagado primero) y período B (pago tardío de otra orden), encadenado: B empieza cuando termina A.
  o := pruebas.tres_ordenes(PA, K);
  perform public.procesar_evento_pago('simulado', 'f25-a', 'pago', '{}', o[3], 'f25-a', 'aprobado', 3200);
  perform public.procesar_evento_pago('simulado', 'f25-b', 'pago', '{}', o[2], 'f25-b', 'aprobado', 3100);
  select id, version_id into acc, v1 from public.accesos_curso where perfil_id = PA and curso_id = K;
  select * into a from public.periodos_acceso where item_orden_id = (select id from public.items_orden where orden_id = o[3]);
  select * into b from public.periodos_acceso where item_orden_id = (select id from public.items_orden where orden_id = o[2]);
  perform pruebas.afirmar(b.inicia_en = a.vence_en, 'B está encadenado a A');
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values (PA, L, now());
  perform public.corregir_evaluacion(PA, EV, jsonb_build_object(P::text, jsonb_build_array((select id from public.opciones where pregunta_id = P and es_correcta))));
  cert := public.emitir_certificado(PA, K);
  ordenes := (select string_agg(id::text || estado || total_centavos, ',' order by id) from public.ordenes where perfil_id = PA and estado <> 'reembolsada');
  items := (select string_agg(id::text || precio_centavos || condiciones_acceso::text, ',' order by id) from public.items_orden i where i.orden_id = any (o));

  -- A.1 Revocar el período vigente (reembolso confirmado de su compra) con B futuro.
  res := public.procesar_evento_pago('simulado', 'f25-a-reemb', 'reembolso', '{}', o[3], 'f25-a', 'reembolsado', 3200);
  perform pruebas.afirmar(res = 'procesado', 'Reembolso de A: ' || res);
  perform pruebas.afirmar((select estado from public.periodos_acceso where id = a.id) = 'revocado'
    and (select revocado_motivo from public.periodos_acceso where id = a.id) like 'Reembolso confirmado%', 'A queda revocado, con motivo');
  -- A.2 B conserva exactamente sus fechas y sus datos.
  select * into b_despues from public.periodos_acceso where id = b.id;
  perform pruebas.afirmar(b_despues.inicia_en = b.inicia_en and b_despues.vence_en = b.vence_en and b_despues.estado = 'activo'
    and b_despues.precio_centavos = b.precio_centavos and b_despues.condiciones = b.condiciones, 'B conserva sus fechas originales: no se adelanta');
  perform pruebas.afirmar((select count(*) from public.periodos_acceso where acceso_id = acc) = 2, 'No se crean períodos adicionales');
  perform pruebas.afirmar(not exists (select 1 from public.incidencias where tipo = 'revisar_periodos' and perfil_id = PA), 'Sin incidencia: la regla está decidida');
  -- A.3 Intervalo sin cobertura: sin acceso al contenido.
  perform pruebas.afirmar(not public.acceso_cubierto(acc) and public.version_de(PA, K) is null, 'Intervalo sin cobertura: sin acceso');
  perform set_config('request.jwt.claim.sub', PA::text, true);
  perform pruebas.afirmar(not public.tiene_acceso(K), 'Intervalo sin cobertura: tiene_acceso es falso');
  perform pruebas.afirmar((select not vigente and vencido and proximo_inicio = b.inicia_en from public.mis_accesos() where curso_id = K),
    'El campus sabe que no tiene acceso ahora y cuándo empieza el derecho futuro');
  perform pruebas.afirmar((public.oferta_curso(K) ->> 'situacion') = 'programado' and not (public.oferta_curso(K) ->> 'disponible')::boolean,
    'Con un derecho futuro no se le ofrece comprar');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pruebas.afirmar(pruebas.error_de(format('select public.crear_orden(%L, %L, %L)', PA, 'curso', K)) = 'ya_tiene_acceso', 'Tampoco se crea otra orden');
  perform pruebas.afirmar((public.estado_finalizacion_de(PA, K) ->> 'vencido')::boolean
    and (public.estado_finalizacion_de(PA, K) ->> 'proximo_inicio')::timestamptz = b.inicia_en, 'El estado de finalización informa el intervalo');
  perform pruebas.afirmar((select estado = 'activo' and vence_en = b.vence_en from public.accesos_curso where id = acc), 'La inscripción sigue activa hasta el fin de B');
  perform pruebas.afirmar(public.acceso_cubierto(acc, b.inicia_en - interval '1 second') = false
    and public.acceso_cubierto(acc, b.inicia_en) and public.acceso_cubierto(acc, b.vence_en - interval '1 second')
    and not public.acceso_cubierto(acc, b.vence_en), 'La cobertura empieza y termina exactamente en las fechas de B');
  fallo := pruebas.error_de(format('select public.cambiar_version(%L, %L, %L, %L)', PA, K, v1, 'Entiendo qué cambia y quiero pasar.'));
  perform pruebas.afirmar(fallo = 'acceso_vencido', 'Sin cobertura no cambia de versión: ' || fallo);
  -- A.5, A.6, A.7 Historial, certificado y compras intactos.
  perform pruebas.afirmar((select count(*) from public.progreso_leccion where perfil_id = PA) = 1 and (select count(*) from public.intentos_evaluacion where perfil_id = PA) = 1,
    'El historial académico se conserva');
  perform pruebas.afirmar(exists (select 1 from public.certificados where id = cert) and public.verificar_certificado((select codigo_verificacion from public.certificados where id = cert)) is not null,
    'El certificado se conserva y se verifica');
  perform pruebas.afirmar(items = (select string_agg(id::text || precio_centavos || condiciones_acceso::text, ',' order by id) from public.items_orden i where i.orden_id = any (o))
    and (select estado from public.ordenes where id = o[2]) = 'aprobada', 'Las compras no se alteran (solo la reembolsada cambia de estado)');

  -- A.9 Revocaciones repetidas: sin efectos adicionales.
  perform pruebas.afirmar(public.procesar_evento_pago('simulado', 'f25-a-reemb', 'reembolso', '{}', o[3], 'f25-a', 'reembolsado', 3200) = 'duplicado', 'El mismo aviso no se procesa dos veces');
  perform public.procesar_evento_pago('simulado', 'f25-a-reemb-2', 'reembolso', '{}', o[3], 'f25-a', 'reembolsado', 3200);
  perform pruebas.afirmar((select count(*) from public.periodos_acceso where acceso_id = acc and estado = 'activo') = 1
    and (select inicia_en = b.inicia_en and vence_en = b.vence_en from public.periodos_acceso where id = b.id), 'Otro aviso del mismo reembolso no cambia nada');
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  perform pruebas.afirmar(pruebas.error_de(format('select public.revocar_beca(%L, %L)', a.id, 'Revocar otra vez lo mismo')) like 'compra_solo_con_reembolso%'
    and (select revocado_en from public.periodos_acceso where id = a.id) is not null, 'La admin no vuelve a revocar ni restaura el período');
  perform set_config('request.jwt.claim.sub', '', true);

  -- A.8 Una versión nueva publicada mientras tanto no se transfiere.
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  v2 := public.publicar_version(K, 'Versión 2 de renovaciones');
  perform set_config('request.jwt.claim.sub', '', true);

  -- A.4 Al llegar la fecha de B, el acceso se activa solo, con la misma versión.
  perform pruebas.envejecer(PA, K, (b.inicia_en - now()) + interval '1 day');
  perform pruebas.afirmar(public.acceso_cubierto(acc) and public.version_de(PA, K) = v1, 'Llegada la fecha de B, hay acceso, en la versión que seguía');
  perform set_config('request.jwt.claim.sub', PA::text, true);
  perform pruebas.afirmar(public.tiene_acceso(K) and (select vigente and proximo_inicio is null from public.mis_accesos() where curso_id = K), 'El campus lo ve vigente');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pruebas.afirmar((select version_id from public.accesos_curso where id = acc) = v1 and v2 <> v1, 'No se transfiere la versión académica');
  perform pruebas.afirmar((select count(*) from public.conciliar_periodos()) = 0, 'Accesos y períodos concilian');
end $$;

-- A.10 Períodos consecutivos y múltiples renovaciones.
do $$
declare
  MM constant uuid := '25000000-0000-0000-0000-0000000000a2';
  K constant uuid := '25000000-0000-0000-0000-000000000001';
  o uuid[]; acc uuid; pa public.periodos_acceso%rowtype; pb public.periodos_acceso%rowtype; pc public.periodos_acceso%rowtype;
begin
  o := pruebas.tres_ordenes(MM, K);
  perform public.procesar_evento_pago('simulado', 'm25-a', 'pago', '{}', o[3], 'm25-a', 'aprobado', 3200);
  perform public.procesar_evento_pago('simulado', 'm25-b', 'pago', '{}', o[2], 'm25-b', 'aprobado', 3100);
  perform public.procesar_evento_pago('simulado', 'm25-c', 'pago', '{}', o[1], 'm25-c', 'aprobado', 3000);
  acc := (select id from public.accesos_curso where perfil_id = MM and curso_id = K);
  select * into pa from public.periodos_acceso where item_orden_id = (select id from public.items_orden where orden_id = o[3]);
  select * into pb from public.periodos_acceso where item_orden_id = (select id from public.items_orden where orden_id = o[2]);
  select * into pc from public.periodos_acceso where item_orden_id = (select id from public.items_orden where orden_id = o[1]);
  perform pruebas.afirmar(pb.inicia_en = pa.vence_en and pc.inicia_en = pb.vence_en, 'Tres períodos contiguos, sin superposición');
  perform pruebas.afirmar((select vence_en from public.accesos_curso where id = acc) = pc.vence_en, 'El acceso llega al fin del tercero');
  -- Se revoca el del medio: el primero y el tercero no cambian; el intervalo del medio queda sin acceso.
  perform public.procesar_evento_pago('simulado', 'm25-b-reemb', 'reembolso', '{}', o[2], 'm25-b', 'reembolsado', 3100);
  perform pruebas.afirmar((select inicia_en = pa.inicia_en and vence_en = pa.vence_en and estado = 'activo' from public.periodos_acceso where id = pa.id)
    and (select inicia_en = pc.inicia_en and vence_en = pc.vence_en and estado = 'activo' from public.periodos_acceso where id = pc.id), 'Primero y tercero conservan sus fechas');
  perform pruebas.afirmar(public.acceso_cubierto(acc) and not public.acceso_cubierto(acc, pb.inicia_en + interval '1 day')
    and public.acceso_cubierto(acc, pc.inicia_en + interval '1 day'), 'Acceso ahora, sin acceso en el hueco, acceso otra vez en el tercero');
  perform pruebas.afirmar((select vence_en from public.accesos_curso where id = acc) = pc.vence_en, 'El fin no cambia');
  -- Se revoca también el tercero: el acceso vuelve al fin del primero.
  perform public.procesar_evento_pago('simulado', 'm25-c-reemb', 'reembolso', '{}', o[1], 'm25-c', 'reembolsado', 3000);
  perform pruebas.afirmar((select vence_en from public.accesos_curso where id = acc) = pa.vence_en and public.acceso_cubierto(acc), 'Queda solo el primero, vigente');
  perform pruebas.afirmar((select count(*) from public.periodos_acceso where acceso_id = acc) = 3, 'Ningún período se borró ni se agregó');
  perform pruebas.afirmar((select count(*) from public.conciliar_periodos()) = 0, 'Accesos y períodos concilian');
end $$;

-- ---------------------------------------------------------------- B. Reembolsos parciales
do $$
declare
  ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003';
  Q constant uuid := '25000000-0000-0000-0000-0000000000a3';
  K constant uuid := '25000000-0000-0000-0000-000000000001';
  L constant uuid := '25000000-0000-0000-0000-000000000003';
  EV constant uuid := '25000000-0000-0000-0000-000000000004';
  P constant uuid := '25000000-0000-0000-0000-000000000005';
  o uuid; acc uuid; inc uuid; cert uuid; res text; antes text; beca uuid; pago uuid;
begin
  update public.cursos set precio_centavos = 4000 where id = K;
  o := public.crear_orden(Q, 'curso', K);
  perform public.procesar_evento_pago('simulado', 'q25', 'pago', '{}', o, 'q25', 'aprobado', 4000);
  acc := (select id from public.accesos_curso where perfil_id = Q and curso_id = K);
  pago := (select id from public.pagos where id_externo = 'q25');
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  beca := public.otorgar_beca(Q, K, null, null, true, 'Beca adicional de prueba para la docente', 'Maestra titular');
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values (Q, L, now());
  perform public.corregir_evaluacion(Q, EV, jsonb_build_object(P::text, jsonb_build_array((select id from public.opciones where pregunta_id = P and es_correcta))));
  cert := public.emitir_certificado(Q, K);
  antes := (select string_agg(id::text || estado || inicia_en || coalesce(vence_en::text, '-'), ',' order by id) from public.periodos_acceso where acceso_id = acc)
        || (select estado || coalesce(vence_en::text, '-') || version_id from public.accesos_curso where id = acc);

  -- B.1 a B.3 Recepción simulada, registro del importe e incidencia.
  res := public.procesar_evento_pago('simulado', 'q25-p1', 'reembolso', '{}', o, 'q25', 'reembolsado', 1500);
  perform pruebas.afirmar(res = 'requiere_revision', 'Reembolso parcial: ' || res);
  perform pruebas.afirmar((select monto_centavos = 4000 and estado = 'aprobado' from public.pagos where id = pago), 'El pago conserva su importe y su estado originales');
  perform pruebas.afirmar((select count(*) from public.reembolsos where pago_id = pago and monto_centavos = 1500 and estado = 'completado' and id_externo = 'q25-p1') = 1,
    'Se registra el importe reembolsado');
  select id into inc from public.incidencias where tipo = 'reembolso_parcial' and orden_id = o;
  perform pruebas.afirmar((select estado = 'abierta' and (detalle ->> 'importe_original_centavos')::int = 4000 and (detalle ->> 'reembolsado_centavos')::int = 1500
                             and (detalle ->> 'requiere_revision_administrativa')::boolean and detalle -> 'items' ? (select id::text from public.items_orden where orden_id = o)
                             from public.incidencias where id = inc), 'Incidencia pendiente con importe original, reembolsado y compra identificada');
  -- B.4, B.6, B.9 Sin revocación automática; otros períodos, resultados y certificados intactos.
  perform pruebas.afirmar(antes = (select string_agg(id::text || estado || inicia_en || coalesce(vence_en::text, '-'), ',' order by id) from public.periodos_acceso where acceso_id = acc)
        || (select estado || coalesce(vence_en::text, '-') || version_id from public.accesos_curso where id = acc), 'El acceso y todos los períodos siguen iguales');
  perform pruebas.afirmar((select estado from public.ordenes where id = o) = 'aprobada' and public.acceso_cubierto(acc), 'La orden sigue aprobada y hay acceso');
  perform pruebas.afirmar(exists (select 1 from public.certificados where id = cert) and (select count(*) from public.intentos_evaluacion where perfil_id = Q) = 1
    and (select count(*) from public.progreso_leccion where perfil_id = Q) = 1, 'Resultados, avance y certificado intactos');
  -- B.5 El mismo evento otra vez: idempotente.
  perform pruebas.afirmar(public.procesar_evento_pago('simulado', 'q25-p1', 'reembolso', '{}', o, 'q25', 'reembolsado', 1500) = 'duplicado', 'El mismo aviso se reconoce');
  perform pruebas.afirmar((select count(*) from public.reembolsos where pago_id = pago) = 1, 'No se registra dos veces');
  -- Un segundo reembolso parcial acumula; uno que excediera lo pagado no se registra y queda señalado.
  perform public.procesar_evento_pago('simulado', 'q25-p2', 'reembolso', '{}', o, 'q25', 'reembolsado', 1000);
  perform pruebas.afirmar((select (detalle ->> 'reembolsado_centavos')::int = 2500 from public.incidencias where id = inc)
    and (select count(*) from public.incidencias where tipo = 'reembolso_parcial' and orden_id = o) = 1, 'Acumula en la misma incidencia');
  perform public.procesar_evento_pago('simulado', 'q25-p3', 'reembolso', '{}', o, 'q25', 'reembolsado', 2000);
  perform pruebas.afirmar((select (detalle ->> 'excede_lo_pagado')::boolean and (detalle ->> 'reembolsado_centavos')::int = 2500 from public.incidencias where id = inc)
    and (select count(*) from public.reembolsos where pago_id = pago) = 2, 'Lo que excedería lo pagado no se registra y queda señalado');
  perform pruebas.afirmar(antes = (select string_agg(id::text || estado || inicia_en || coalesce(vence_en::text, '-'), ',' order by id) from public.periodos_acceso where acceso_id = acc)
        || (select estado || coalesce(vence_en::text, '-') || version_id from public.accesos_curso where id = acc), 'Tras varios reembolsos parciales, el acceso sigue igual');

  -- B.10 Nada cierra la incidencia sola: anotar la deja en revisión; cerrarla exige una resolución escrita.
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  perform public.anotar_incidencia(inc, 'Consulté con el contador');
  perform pruebas.afirmar((select estado from public.incidencias where id = inc) = 'en_revision', 'Anotar no la resuelve');
  perform pruebas.afirmar(pruebas.error_de(format('select public.resolver_reembolso_parcial(%L, %L)', inc, 'corto')) = 'resolucion_requerida', 'La resolución exige un texto');
  perform public.resolver_reembolso_parcial(inc, 'Se mantiene el acceso: reembolso por un cargo duplicado del banco.');
  perform pruebas.afirmar((select estado from public.incidencias where id = inc) = 'resuelta'
    and exists (select 1 from public.auditoria where accion = 'reembolso_parcial_resuelto' and entidad_id = inc::text and actor_id = ADMIN), 'La resolución queda registrada con la admin');
  perform pruebas.afirmar(pruebas.error_de(format('select public.resolver_reembolso_parcial(%L, %L)', inc, 'Segunda resolución del mismo caso')) = 'incidencia_resuelta', 'No se resuelve dos veces');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pruebas.afirmar(antes = (select string_agg(id::text || estado || inicia_en || coalesce(vence_en::text, '-'), ',' order by id) from public.periodos_acceso where acceso_id = acc)
        || (select estado || coalesce(vence_en::text, '-') || version_id from public.accesos_curso where id = acc), 'Resolver no modifica el acceso');
  -- Un reembolso parcial nuevo reabre el caso.
  perform public.procesar_evento_pago('simulado', 'q25-p4', 'reembolso', '{}', o, 'q25', 'reembolsado', 500);
  perform pruebas.afirmar((select estado from public.incidencias where id = inc) = 'abierta', 'Un reembolso parcial nuevo vuelve a dejarla pendiente');
  -- Un reembolso total confirmado sigue su regla: revoca solo esa compra; la beca y el pago original quedan.
  perform public.procesar_evento_pago('simulado', 'q25-total', 'reembolso', '{}', o, 'q25', 'reembolsado', 4000);
  perform pruebas.afirmar((select estado from public.periodos_acceso where item_orden_id = (select id from public.items_orden where orden_id = o)) = 'revocado'
    and (select estado from public.periodos_acceso where id = beca) = 'activo' and public.acceso_cubierto(acc)
    and (select monto_centavos from public.pagos where id = pago) = 4000, 'El reembolso total revoca solo la compra y no pisa el importe pagado');
end $$;

-- B.7 y B.8 Datos comerciales protegidos y acciones administrativas rechazadas a una alumna.
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pruebas.afirmar((select count(*) from public.reembolsos r join public.pagos p on p.id = r.pago_id where p.id_externo = 'q25') = 0
  and (select count(*) from public.pagos where id_externo = 'q25') = 0 and (select count(*) from public.incidencias) = 0,
  'Otra alumna no ve pagos, reembolsos ni incidencias ajenas');
set local request.jwt.claim.sub = '25000000-0000-0000-0000-0000000000a3';
select pruebas.afirmar((select count(*) from public.incidencias) = 0, 'La propia alumna tampoco ve la incidencia (es interna)');
select pruebas.afirmar(pruebas.error_de($q$update public.incidencias set estado = 'resuelta' where tipo = 'reembolso_parcial'$q$) like 'permission denied%'
  or not exists (select 1 from public.incidencias where estado = 'resuelta'), 'Una alumna no cambia el estado de una incidencia');
select pruebas.afirmar(pruebas.error_de($q$select public.resolver_reembolso_parcial((select id from public.incidencias limit 1), 'Me resuelvo el caso a mí misma')$q$) = 'no_autorizado',
  'Una alumna no resuelve reembolsos parciales');
select pruebas.afirmar(pruebas.error_de($q$select public.anotar_incidencia((select id from public.incidencias limit 1), 'Nota de la alumna')$q$) = 'no_autorizado',
  'Una alumna no anota incidencias');
select pruebas.afirmar(pruebas.error_de($q$insert into public.reembolsos (pago_id, monto_centavos, motivo) select id, 1, 'x' from public.pagos limit 1$q$) like 'permission denied%'
  or pruebas.error_de($q$insert into public.reembolsos (pago_id, monto_centavos, motivo) select id, 1, 'x' from public.pagos limit 1$q$) like '%row-level security%',
  'Una alumna no registra reembolsos');
reset role;
-- La incidencia sigue como la dejó la base, sin cambios de la alumna.
select pruebas.afirmar((select estado from public.incidencias where tipo = 'reembolso_parcial' and orden_id = (select orden_id from public.pagos where id_externo = 'q25')) = 'abierta',
  'La incidencia no cambió por los intentos de la alumna');
set local role anon;
select pruebas.afirmar(pruebas.error_de($q$select public.resolver_reembolso_parcial(gen_random_uuid(), 'Intento de un visitante sin sesión')$q$) like 'permission denied%', 'Un visitante no ejecuta la resolución');
reset role;

rollback;
