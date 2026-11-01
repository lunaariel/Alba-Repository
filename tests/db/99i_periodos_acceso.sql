-- Períodos de acceso (0024): renovaciones, becas, reembolsos por compra, órdenes desactualizadas y
-- antiguas, recuperación de otorgamientos fallidos, cambio de versión con vencimiento y talleres apagados.
-- Cubre los casos 1 a 15, 17, 18 y 20 del pedido del 01/11/2026 (16, concurrencia, en concurrencia.sh).
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('24000000-0000-0000-0000-0000000000a1', 'r24@prueba.test', '{"nombre_completo": "Renueva", "confirma_mayoria_edad": true}'),
  ('24000000-0000-0000-0000-0000000000a2', 't24@prueba.test', '{"nombre_completo": "Dos compras", "confirma_mayoria_edad": true}'),
  ('24000000-0000-0000-0000-0000000000a3', 'u24@prueba.test', '{"nombre_completo": "Falla temporal", "confirma_mayoria_edad": true}'),
  ('24000000-0000-0000-0000-0000000000a4', 'v24@prueba.test', '{"nombre_completo": "Reintento admin", "confirma_mayoria_edad": true}'),
  ('24000000-0000-0000-0000-0000000000a5', 's24@prueba.test', '{"nombre_completo": "Becada vencida", "confirma_mayoria_edad": true}'),
  ('24000000-0000-0000-0000-0000000000a6', 'w24@prueba.test', '{"nombre_completo": "Becada sin vencimiento", "confirma_mayoria_edad": true}'),
  ('24000000-0000-0000-0000-0000000000a7', 'x24@prueba.test', '{"nombre_completo": "Compra y beca", "confirma_mayoria_edad": true}'),
  ('24000000-0000-0000-0000-0000000000a8', 'y24@prueba.test', '{"nombre_completo": "Orden antigua", "confirma_mayoria_edad": true}');

-- Ayudas de prueba: un error temporal simulado al otorgar y el paso del tiempo (solo en pruebas).
create or replace function pruebas.falla_simulada() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('pruebas.fallar', true), '') = 'si' then raise exception 'falla_temporal_simulada'; end if;
  return new;
end; $$;
create trigger periodos_falla_simulada before insert on public.periodos_acceso
  for each row execute function pruebas.falla_simulada();

create or replace function pruebas.envejecer(p_perfil uuid, p_curso uuid, p_meses int) returns void language plpgsql as $$
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

create or replace function pruebas.error_de(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'no falló';
exception when others then return sqlerrm;
end; $$;

do $$
declare
  ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003';
  R constant uuid := '24000000-0000-0000-0000-0000000000a1';
  T constant uuid := '24000000-0000-0000-0000-0000000000a2';
  K constant uuid := '24000000-0000-0000-0000-000000000001';
  M constant uuid := '24000000-0000-0000-0000-000000000002';
  L constant uuid := '24000000-0000-0000-0000-000000000003';
  EV constant uuid := '24000000-0000-0000-0000-000000000004';
  P constant uuid := '24000000-0000-0000-0000-000000000005';
  o1 uuid; o2 uuid; oa uuid; ob uuid; res text; acc uuid; cert uuid; v1 uuid; v2 uuid; fallo text;
  pa public.periodos_acceso%rowtype; pb public.periodos_acceso%rowtype; vence_b timestamptz;
begin
  insert into public.cursos (id, slug, titulo, precio_centavos, duracion_comercial_meses) values (K, 'periodos', 'Curso con períodos', 3000, 2);
  insert into public.modulos (id, curso_id, titulo, orden) values (M, K, 'Módulo', 0);
  insert into public.lecciones (id, modulo_id, titulo, orden) values (L, M, 'Lección', 0);
  insert into public.evaluaciones (id, curso_id, puntaje_minimo, intentos_permitidos) values (EV, K, 50, 2);
  insert into public.preguntas (id, evaluacion_id, enunciado, tipo, orden) values (P, EV, '¿Sí?', 'unica', 0);
  insert into public.opciones (pregunta_id, texto, es_correcta, orden) values (P, 'Sí', true, 0), (P, 'No', false, 1);
  update public.cursos set estado = 'publicado' where id = K;

  -- ---------------------------------------------------------------- 1. Recompra de un curso vencido
  o1 := public.crear_orden(R, 'curso', K);
  perform pruebas.afirmar(public.procesar_evento_pago('simulado', 'p24-r1', 'pago', '{}', o1, 'p24-r1', 'aprobado', 3000) = 'procesado', 'Primera compra procesada');
  select id, version_id into acc, v1 from public.accesos_curso where perfil_id = R and curso_id = K;
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values (R, L, now());
  perform public.corregir_evaluacion(R, EV, jsonb_build_object(P::text, jsonb_build_array((select id from public.opciones where pregunta_id = P and es_correcta))));
  cert := public.emitir_certificado(R, K);
  perform pruebas.afirmar((select count(*) from public.periodos_acceso where acceso_id = acc) = 1, 'La compra crea un período');
  perform pruebas.afirmar((select vence_en from public.accesos_curso where id = acc)
    = (select public.calcular_vencimiento(inicia_en, 7) from public.periodos_acceso where acceso_id = acc), '2 + 5 = 7 meses desde la confirmación');

  perform pruebas.envejecer(R, K, 8);
  perform pruebas.afirmar((select vence_en <= now() from public.accesos_curso where id = acc), 'El acceso venció');
  perform pruebas.afirmar(public.version_de(R, K) is null, 'Vencido: sin versión para el contenido');

  -- 14. Cambio de versión con el acceso vencido: se rechaza en la base.
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  v2 := public.publicar_version(K, 'Versión 2 de períodos');
  perform set_config('request.jwt.claim.sub', '', true);
  fallo := pruebas.error_de(format('select public.cambiar_version(%L, %L, %L, %L)', R, K, v2, 'Entiendo qué cambia y quiero pasar.'));
  perform pruebas.afirmar(fallo = 'acceso_vencido', 'Vencido: no cambia de versión aunque arme la solicitud: ' || fallo);
  perform pruebas.afirmar((select version_id from public.accesos_curso where id = acc) = v1, 'La versión sigue igual');

  -- La renovación muestra la oferta vigente antes de confirmar.
  update public.cursos set precio_centavos = 3500, duracion_comercial_meses = 3 where id = K;
  perform set_config('request.jwt.claim.sub', R::text, true);
  perform pruebas.afirmar((public.oferta_curso(K) ->> 'situacion') = 'renovacion' and (public.oferta_curso(K) ->> 'precio_centavos')::int = 3500
    and (public.oferta_curso(K) ->> 'total_meses')::int = 8 and (public.oferta_curso(K) ->> 'disponible')::boolean, 'Oferta de renovación con precio y condiciones vigentes');
  perform set_config('request.jwt.claim.sub', '', true);

  o2 := public.crear_orden(R, 'curso', K);
  perform pruebas.afirmar((select precio_centavos from public.items_orden where orden_id = o2) = 3500
    and (select condiciones_acceso ->> 'total_meses' from public.items_orden where orden_id = o2) = '8', 'La orden de renovación congela la oferta vigente');
  res := public.procesar_evento_pago('simulado', 'p24-r2', 'pago', '{}', o2, 'p24-r2', 'aprobado', 3500);
  perform pruebas.afirmar(res = 'procesado', 'Renovación procesada: ' || res);
  perform pruebas.afirmar((select count(*) from public.accesos_curso where perfil_id = R and curso_id = K) = 1, 'Una sola inscripción académica');
  perform pruebas.afirmar((select id from public.accesos_curso where perfil_id = R and curso_id = K and estado = 'activo') = acc, 'Es la misma inscripción');
  perform pruebas.afirmar((select version_id from public.accesos_curso where id = acc) = v1, 'La renovación no cambia la versión');
  select * into pb from public.periodos_acceso where item_orden_id = (select id from public.items_orden where orden_id = o2);
  perform pruebas.afirmar(pb.inicia_en = now() and pb.vence_en = public.calcular_vencimiento(now(), 8) and pb.precio_centavos = 3500
    and pb.version_id = v1 and pb.origen = 'compra', 'Período nuevo desde la confirmación, con precio, condiciones y versión');
  perform pruebas.afirmar((select vence_en from public.accesos_curso where id = acc) = pb.vence_en, 'El vencimiento del acceso es el del período nuevo');
  perform pruebas.afirmar(public.version_de(R, K) = v1, 'Renovado: vuelve a ver su versión');
  -- 12. Avance, intentos y certificado intactos; el certificado no se duplica.
  perform pruebas.afirmar((select count(*) from public.progreso_leccion where perfil_id = R and leccion_id = L) = 1
    and (select count(*) from public.intentos_evaluacion where perfil_id = R) = 1, 'Avance e intentos se conservan (no se reinician)');
  perform pruebas.afirmar(public.emitir_certificado(R, K) = cert and (select count(*) from public.certificados where perfil_id = R) = 1,
    'El certificado se conserva y no se duplica');
  perform pruebas.afirmar((select count(*) from public.periodos_acceso where acceso_id = acc and estado = 'activo') = 2, 'La compra anterior conserva su período');

  -- 15. Renovado: el cambio voluntario de versión funciona, con sus reglas.
  perform public.cambiar_version(R, K, v2, 'Entiendo qué cambia y quiero pasar.');
  perform pruebas.afirmar((select version_id from public.accesos_curso where id = acc) = v2, 'Después de renovar, cambia de versión voluntariamente');
  perform pruebas.afirmar((select vence_en from public.accesos_curso where id = acc) = pb.vence_en, 'El cambio de versión no toca el vencimiento');

  -- ---------------------------------------------------------------- 2. Recompra con acceso vigente
  fallo := pruebas.error_de(format('select public.crear_orden(%L, %L, %L)', R, 'curso', K));
  perform pruebas.afirmar(fallo = 'ya_tiene_acceso', 'Con un período vigente no se crea otra orden: ' || fallo);

  -- ---------------------------------------------------------------- 3. Reprocesamiento del mismo pago
  perform pruebas.afirmar(public.procesar_evento_pago('simulado', 'p24-r2', 'pago', '{}', o2, 'p24-r2', 'aprobado', 3500) = 'duplicado', 'El mismo aviso se reconoce');
  res := public.procesar_evento_pago('simulado', 'p24-r2-bis', 'pago', '{}', o2, 'p24-r2', 'aprobado', 3500);
  perform pruebas.afirmar(res = 'ignorado: ya_aprobada', 'Otro aviso del mismo pago no duplica: ' || res);
  perform pruebas.afirmar((select count(*) from public.periodos_acceso where acceso_id = acc) = 2, 'Sigue habiendo dos períodos');

  -- ---------------------------------------------------------------- 6. Orden con precio antiguo, pagada tarde con acceso vigente
  update public.cursos set precio_centavos = 3000, duracion_comercial_meses = 2 where id = K;
  oa := public.crear_orden(T, 'curso', K);
  perform pruebas.afirmar(public.crear_orden(T, 'curso', K) = oa, 'Doble clic: se reutiliza la orden mientras la oferta no cambie');
  update public.cursos set precio_centavos = 4000 where id = K;
  ob := public.crear_orden(T, 'curso', K);
  perform pruebas.afirmar(ob <> oa and (select estado from public.ordenes where id = oa) = 'vencida', 'Con el precio cambiado, la orden anterior vence');
  perform pruebas.afirmar((select total_centavos from public.ordenes where id = ob) = 4000, 'La orden nueva tiene el precio vigente');
  perform pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'orden_desactualizada' and entidad_id = oa::text and despues ->> 'motivo' = 'precio_cambiado'),
    'El vencimiento de la orden queda registrado con su motivo');
  perform pruebas.afirmar((select total_centavos from public.ordenes where id = oa) = 3000
    and (select condiciones_acceso ->> 'total_meses' from public.items_orden where orden_id = oa) = '7', 'La orden vieja conserva lo que se aceptó');
  -- Un importe distinto del autorizado no se acepta.
  res := public.procesar_evento_pago('simulado', 'p24-t-mal', 'pago', '{}', ob, 'p24-t-mal', 'aprobado', 3000);
  perform pruebas.afirmar(res = 'error: monto_no_coincide' and not exists (select 1 from public.accesos_curso where perfil_id = T), 'Importe distinto: sin acceso');
  res := public.procesar_evento_pago('simulado', 'p24-tb', 'pago', '{}', ob, 'p24-tb', 'aprobado', 4000);
  perform pruebas.afirmar(res = 'procesado', 'Compra con el precio vigente: ' || res);
  vence_b := (select vence_en from public.accesos_curso where perfil_id = T and curso_id = K);
  -- El pago tardío de la orden vieja (con su precio aceptado) se respeta y se encadena: no acorta ni duplica.
  res := public.procesar_evento_pago('simulado', 'p24-ta', 'pago', '{}', oa, 'p24-ta', 'aprobado', 3000);
  perform pruebas.afirmar(res = 'procesado', 'Pago tardío de la orden vieja: ' || res);
  select * into pa from public.periodos_acceso where item_orden_id = (select id from public.items_orden where orden_id = oa);
  perform pruebas.afirmar(pa.inicia_en = vence_b and pa.vence_en = public.calcular_vencimiento(vence_b, 7) and pa.precio_centavos = 3000,
    'Encadenado: empieza cuando termina el vigente y dura lo que se compró');
  perform pruebas.afirmar((select vence_en from public.accesos_curso where perfil_id = T and curso_id = K) = pa.vence_en, 'El acceso llega al fin del período encadenado');
  perform pruebas.afirmar((select count(*) from public.accesos_curso where perfil_id = T and curso_id = K) = 1, 'Sin accesos académicos contradictorios');
  perform pruebas.afirmar(exists (select 1 from public.incidencias where tipo = 'compra_con_acceso_vigente' and orden_id = oa and estado = 'abierta'),
    'Queda una incidencia para que la admin decida');

  -- ---------------------------------------------------------------- 10. Reembolso de una compra entre varias
  res := public.procesar_evento_pago('simulado', 'p24-ta-reemb', 'reembolso', '{}', oa, 'p24-ta', 'reembolsado', 3000);
  perform pruebas.afirmar(res = 'procesado', 'Reembolso procesado: ' || res);
  perform pruebas.afirmar((select estado from public.periodos_acceso where id = pa.id) = 'revocado', 'Se revoca el período reembolsado');
  perform pruebas.afirmar((select estado from public.periodos_acceso p join public.items_orden i on i.id = p.item_orden_id where i.orden_id = ob) = 'activo',
    'La otra compra sigue activa');
  perform pruebas.afirmar((select vence_en from public.accesos_curso where perfil_id = T and curso_id = K and estado = 'activo') = vence_b,
    'El acceso vuelve al fin de la compra que sigue vigente');
  perform pruebas.afirmar((select estado from public.ordenes where id = oa) = 'reembolsada' and (select estado from public.ordenes where id = ob) = 'aprobada',
    'Cada orden conserva su estado');
  perform pruebas.afirmar(not exists (select 1 from public.incidencias where tipo = 'revisar_periodos' and orden_id = oa), 'Sin períodos huérfanos que revisar');
  -- Reembolso parcial confirmado: no revoca; queda una incidencia.
  res := public.procesar_evento_pago('simulado', 'p24-tb-parcial', 'reembolso', '{}', ob, 'p24-tb', 'reembolsado', 1000);
  perform pruebas.afirmar(res = 'requiere_revision', 'Reembolso parcial: ' || res);
  perform pruebas.afirmar(exists (select 1 from public.incidencias where tipo = 'reembolso_parcial' and orden_id = ob)
    and (select estado from public.ordenes where id = ob) = 'aprobada'
    and exists (select 1 from public.accesos_curso where perfil_id = T and curso_id = K and estado = 'activo' and vence_en = vence_b),
    'El reembolso parcial no quita el acceso');

  -- 12. Reembolso de la renovación de R: su compra anterior (vencida) queda; el certificado también.
  res := public.procesar_evento_pago('simulado', 'p24-r2-reemb', 'reembolso', '{}', o2, 'p24-r2', 'reembolsado', 3500);
  perform pruebas.afirmar(res = 'procesado', 'Reembolso de la renovación: ' || res);
  perform pruebas.afirmar((select vence_en <= now() from public.accesos_curso where id = acc and estado = 'activo'), 'Vuelve a estar vencido (no revocado)');
  perform pruebas.afirmar((select count(*) from public.certificados where perfil_id = R) = 1 and (select count(*) from public.progreso_leccion where perfil_id = R) = 1,
    'El reembolso no borra certificados ni avances');
  perform pruebas.afirmar(public.verificar_certificado((select codigo_verificacion from public.certificados where id = cert)) is not null,
    'La verificación pública sigue funcionando');
  perform pruebas.afirmar((select count(*) from public.ordenes where perfil_id = R) = 2, 'Las compras históricas se conservan');
end $$;

-- ---------------------------------------------------------------- 4 y 5. Error temporal al otorgar y recuperación
do $$
declare
  ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003';
  U constant uuid := '24000000-0000-0000-0000-0000000000a3';
  V constant uuid := '24000000-0000-0000-0000-0000000000a4';
  K constant uuid := '24000000-0000-0000-0000-000000000001';
  o uuid; res text; inc uuid; fallo text;
begin
  o := public.crear_orden(U, 'curso', K);
  perform set_config('pruebas.fallar', 'si', true);
  res := public.procesar_evento_pago('simulado', 'p24-u', 'pago', '{}', o, 'p24-u', 'aprobado', 4000);
  perform set_config('pruebas.fallar', '', true);
  perform pruebas.afirmar(res = 'requiere_revision', 'Falla temporal: el pago queda para revisión: ' || res);
  perform pruebas.afirmar((select estado from public.pagos where id_externo = 'p24-u') = 'aprobado' and (select estado from public.ordenes where id = o) = 'aprobada',
    'El pago confirmado queda registrado');
  perform pruebas.afirmar(not exists (select 1 from public.accesos_curso where perfil_id = U), 'Sin acceso a medias');
  select id into inc from public.incidencias where tipo = 'otorgamiento_fallido' and orden_id = o and estado = 'abierta';
  perform pruebas.afirmar(inc is not null and (select detalle ->> 'error' from public.incidencias where id = inc) = 'falla_temporal_simulada',
    'Nunca en silencio: incidencia con el error');
  -- Recuperación automática: un nuevo aviso de la pasarela reintenta.
  res := public.procesar_evento_pago('simulado', 'p24-u-bis', 'pago', '{}', o, 'p24-u', 'aprobado', 4000);
  perform pruebas.afirmar(res = 'procesado: otorgamiento_recuperado', 'Reintento automático: ' || res);
  perform pruebas.afirmar(exists (select 1 from public.accesos_curso where perfil_id = U and estado = 'activo' and vence_en > now())
    and (select estado from public.incidencias where id = inc) = 'resuelta', 'Recuperado: acceso otorgado e incidencia resuelta');
  perform pruebas.afirmar((select count(*) from public.periodos_acceso where perfil_id = U) = 1, 'Un solo período');

  -- Recuperación por la admin, desde el panel.
  o := public.crear_orden(V, 'curso', K);
  perform set_config('pruebas.fallar', 'si', true);
  perform public.procesar_evento_pago('simulado', 'p24-v', 'pago', '{}', o, 'p24-v', 'aprobado', 4000);
  select id into inc from public.incidencias where tipo = 'otorgamiento_fallido' and orden_id = o;
  -- Si vuelve a fallar, la incidencia sigue abierta.
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  perform pruebas.afirmar(not public.reintentar_otorgamiento(inc, 'Primer reintento'), 'Si vuelve a fallar, informa que no se pudo');
  perform pruebas.afirmar((select estado from public.incidencias where id = inc) = 'abierta', 'Y la incidencia sigue abierta');
  perform set_config('pruebas.fallar', '', true);
  perform set_config('request.jwt.claim.sub', V::text, true);
  fallo := pruebas.error_de(format('select public.reintentar_otorgamiento(%L, %L)', inc, 'Intento de la alumna'));
  perform pruebas.afirmar(fallo = 'no_autorizado', 'Una alumna no reintenta otorgamientos: ' || fallo);
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  perform pruebas.afirmar(public.reintentar_otorgamiento(inc, 'Reintento después de corregir el problema'), 'La admin recupera el otorgamiento');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pruebas.afirmar((select estado from public.incidencias where id = inc) = 'resuelta'
    and exists (select 1 from public.accesos_curso where perfil_id = V and estado = 'activo'), 'Incidencia resuelta y acceso otorgado');
  perform pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'otorgamiento_reintentado' and entidad_id = o::text), 'El reintento queda registrado');
end $$;

-- ---------------------------------------------------------------- 7. Órdenes antiguas sin condiciones suficientes (D5)
do $$
declare
  Y constant uuid := '24000000-0000-0000-0000-0000000000a8';
  K constant uuid := '24000000-0000-0000-0000-000000000001';
  vieja uuid; nueva uuid; res text;
begin
  -- Una orden pendiente como las anteriores a 0019 (sin condiciones copiadas).
  alter table public.items_orden disable trigger items_orden_condiciones;
  insert into public.ordenes (perfil_id, subtotal_centavos, total_centavos, clave_producto) values (Y, 3000, 3000, 'curso:' || K) returning id into vieja;
  insert into public.items_orden (orden_id, curso_id, descripcion, precio_centavos) values (vieja, K, 'Curso con períodos', 3000);
  alter table public.items_orden enable trigger items_orden_condiciones;
  -- No se reutiliza para una compra nueva: vence y se crea otra con condiciones.
  nueva := public.crear_orden(Y, 'curso', K);
  perform pruebas.afirmar(nueva <> vieja and (select estado from public.ordenes where id = vieja) = 'vencida'
    and (select condiciones_acceso ? 'total_meses' from public.items_orden where orden_id = nueva), 'La orden sin condiciones no se reutiliza');
  -- Si igual llega el pago de la orden vieja: no se inventa un acceso (ni indefinido); queda una incidencia.
  res := public.procesar_evento_pago('simulado', 'p24-y', 'pago', '{}', vieja, 'p24-y', 'aprobado', 3000);
  perform pruebas.afirmar(res = 'requiere_revision', 'Pago de orden sin condiciones: ' || res);
  perform pruebas.afirmar(not exists (select 1 from public.accesos_curso where perfil_id = Y), 'Sin acceso inventado');
  perform pruebas.afirmar(exists (select 1 from public.incidencias where tipo = 'pago_sin_condiciones' and orden_id = vieja and estado = 'abierta'), 'Incidencia para revisión');
  -- Tampoco por inserción directa: una compra sin condiciones no da un acceso sin vencimiento.
  perform pruebas.afirmar(pruebas.error_de(format('insert into public.accesos_curso (perfil_id, curso_id, origen, item_orden_id) values (%L, %L, %L, %L)',
    Y, K, 'compra', (select id from public.items_orden where orden_id = vieja))) = 'compra_sin_condiciones', 'La base rechaza un acceso de compra sin condiciones');
end $$;

-- ---------------------------------------------------------------- 8, 9 y 11. Becas
do $$
declare
  ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003';
  S constant uuid := '24000000-0000-0000-0000-0000000000a5';
  W constant uuid := '24000000-0000-0000-0000-0000000000a6';
  X constant uuid := '24000000-0000-0000-0000-0000000000a7';
  K constant uuid := '24000000-0000-0000-0000-000000000001';
  o uuid; acc uuid; beca uuid; ordenes int; recibos int; fin timestamptz := now() + interval '3 months'; fallo text; compra uuid;
begin
  -- 8. Beca sobre un acceso vencido.
  o := public.crear_orden(S, 'curso', K);
  perform public.procesar_evento_pago('simulado', 'p24-s', 'pago', '{}', o, 'p24-s', 'aprobado', 4000);
  acc := (select id from public.accesos_curso where perfil_id = S and curso_id = K);
  perform pruebas.envejecer(S, K, 9);
  ordenes := (select count(*) from public.ordenes where perfil_id = S);
  recibos := (select count(*) from public.documentos_fiscales);

  perform set_config('request.jwt.claim.sub', S::text, true);
  fallo := pruebas.error_de(format('select public.otorgar_beca(%L, %L, null, %L, false, %L, %L)', S, K, fin, 'Me la otorgo yo misma', 'Yo'));
  perform pruebas.afirmar(fallo = 'no_autorizado', 'Sin autorización de la admin no hay beca: ' || fallo);
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  fallo := pruebas.error_de(format('select public.otorgar_beca(%L, %L, null, %L, false, %L, %L)', S, K, fin, 'corto', 'Maestra'));
  perform pruebas.afirmar(fallo = 'motivo_requerido', 'Motivo obligatorio: ' || fallo);
  fallo := pruebas.error_de(format('select public.otorgar_beca(%L, %L, null, %L, false, %L, %L)', S, K, fin, 'Beca por situación económica', ''));
  perform pruebas.afirmar(fallo = 'responsable_requerido', 'Responsable obligatorio: ' || fallo);
  fallo := pruebas.error_de(format('select public.otorgar_beca(%L, %L, null, null, false, %L, %L)', S, K, 'Beca por situación económica', 'Maestra'));
  perform pruebas.afirmar(fallo = 'fin_o_sin_vencimiento', 'Sin fin ni «sin vencimiento» expreso: ' || fallo);
  fallo := pruebas.error_de(format('select public.otorgar_beca(%L, %L, null, %L, true, %L, %L)', S, K, fin, 'Beca por situación económica', 'Maestra'));
  perform pruebas.afirmar(fallo = 'fin_o_sin_vencimiento', 'Fin y «sin vencimiento» a la vez: ' || fallo);
  fallo := pruebas.error_de(format('select public.otorgar_beca(%L, %L, null, %L, false, %L, %L)', S, K, now() - interval '1 day', 'Beca por situación económica', 'Maestra'));
  perform pruebas.afirmar(fallo = 'fin_pasado', 'Un fin pasado no da acceso: ' || fallo);
  fallo := pruebas.error_de(format('select public.otorgar_beca(%L, %L, %L, %L, false, %L, %L)', S, K, now() + interval '1 month', fin, 'Beca por situación económica', 'Maestra'));
  perform pruebas.afirmar(fallo = 'inicio_futuro', 'Un inicio futuro sin acceso vigente es ambiguo: ' || fallo);

  perform pruebas.afirmar((select perfil_id from public.buscar_perfil_por_correo(' S24@prueba.test ')) = S, 'La admin encuentra a la persona por su correo');
  beca := public.otorgar_beca(S, K, null, fin, false, 'Beca por situación económica', 'Maestra titular');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pruebas.afirmar((select id from public.accesos_curso where perfil_id = S and curso_id = K and estado = 'activo') = acc, 'La beca usa la misma inscripción');
  perform pruebas.afirmar((select vence_en from public.accesos_curso where id = acc) = fin and public.version_de(S, K) is not null, 'Vuelve a tener acceso hasta el fin de la beca');
  perform pruebas.afirmar((select origen = 'beca' and inicia_en = now() and vence_en = fin and motivo = 'Beca por situación económica' and responsable = 'Maestra titular'
                             and otorgado_por = ADMIN from public.periodos_acceso where id = beca), 'La beca registra beneficiaria, curso, fechas, motivo y responsable');
  perform pruebas.afirmar((select count(*) from public.ordenes where perfil_id = S) = ordenes and (select count(*) from public.documentos_fiscales) = recibos,
    'La beca no crea compras ni recibos');
  perform pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'periodo_otorgado' and entidad_id = beca::text and actor_id = ADMIN
                                    and despues ->> 'origen' = 'beca'), 'La beca queda auditada con la admin');

  -- 9. Beca sin vencimiento para quien nunca tuvo el curso; revocarla no deja acceso.
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  beca := public.otorgar_beca(W, K, null, null, true, 'Docente invitada por la maestra', 'Maestra titular');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pruebas.afirmar((select vence_en is null and origen = 'concesion' from public.accesos_curso where perfil_id = W and estado = 'activo'), 'Sin vencimiento expreso');
  perform pruebas.afirmar((select condiciones ->> 'regla' from public.periodos_acceso where id = beca) = 'beca_sin_vencimiento', 'La regla queda registrada');
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  perform public.revocar_beca(beca, 'Se otorgó por error a otra persona');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pruebas.afirmar(not exists (select 1 from public.accesos_curso where perfil_id = W and estado = 'activo')
    and exists (select 1 from public.accesos_curso where perfil_id = W and estado = 'revocado'), 'Revocada: sin acceso, la inscripción se conserva');
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  fallo := pruebas.error_de(format('select public.revocar_beca(%L, %L)', beca, 'Segunda revocación de lo mismo'));
  perform pruebas.afirmar(fallo = 'periodo_ya_revocado', 'No se revoca dos veces: ' || fallo);
  -- Una compra no se revoca como beca: solo con un reembolso confirmado.
  compra := (select id from public.periodos_acceso where perfil_id = S and origen = 'compra');
  fallo := pruebas.error_de(format('select public.revocar_beca(%L, %L)', compra, 'Intento de revocar una compra'));
  perform pruebas.afirmar(fallo = 'compra_solo_con_reembolso', 'Una compra se revoca solo con reembolso: ' || fallo);
  perform set_config('request.jwt.claim.sub', '', true);

  -- 11. Reembolso con una beca vigente: el acceso sigue por la beca.
  o := public.crear_orden(X, 'curso', K);
  perform public.procesar_evento_pago('simulado', 'p24-x', 'pago', '{}', o, 'p24-x', 'aprobado', 4000);
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values (X, '24000000-0000-0000-0000-000000000003', now());
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  perform public.otorgar_beca(X, K, null, now() + interval '12 months', false, 'Beca de continuidad por un año', 'Maestra titular');
  perform set_config('request.jwt.claim.sub', '', true);
  perform public.procesar_evento_pago('simulado', 'p24-x-reemb', 'reembolso', '{}', o, 'p24-x', 'reembolsado', 4000);
  perform pruebas.afirmar((select vence_en from public.accesos_curso where perfil_id = X and estado = 'activo') = now() + interval '12 months',
    'El reembolso no revoca la beca vigente');
  perform pruebas.afirmar((select count(*) from public.periodos_acceso where perfil_id = X and estado = 'activo') = 1
    and (select count(*) from public.periodos_acceso where perfil_id = X and estado = 'revocado') = 1, 'Solo se revocó el período comprado');
  perform pruebas.afirmar((select count(*) from public.progreso_leccion where perfil_id = X) = 1, 'El avance se conserva');

  -- Los períodos no se reescriben.
  perform pruebas.afirmar(pruebas.error_de(format('update public.periodos_acceso set vence_en = vence_en + interval %L where perfil_id = %L', '1 year', X)) = 'periodo_inmutable',
    'Un período no se reescribe');
end $$;

-- ---------------------------------------------------------------- 17 y 18. Permisos y aislamiento
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pruebas.afirmar((select count(*) from public.periodos_acceso) = 0, 'Una alumna no lee períodos (motivos internos)');
select pruebas.afirmar((select count(*) from public.accesos_curso where perfil_id <> 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'Una alumna no ve accesos ajenos');
select pruebas.afirmar((public.oferta_curso('24000000-0000-0000-0000-000000000001') ->> 'situacion') = 'nueva', 'La oferta es la de quien la consulta');
select pruebas.afirmar(pruebas.error_de($q$select public.agregar_periodo('aaaaaaaa-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', 'beca', null, null, null, null, true, '{}', null, 'Me lo doy a mí misma', 'Yo', null)$q$)
  like 'permission denied%', 'Una alumna no ejecuta el núcleo de períodos');
select pruebas.afirmar(pruebas.error_de($q$insert into public.periodos_acceso (acceso_id, origen, inicia_en, condiciones) select id, 'concesion', now(), '{}' from public.accesos_curso limit 1$q$)
  like 'permission denied%' or pruebas.error_de($q$insert into public.periodos_acceso (acceso_id, origen, inicia_en, condiciones) select id, 'concesion', now(), '{}' from public.accesos_curso limit 1$q$) like '%row-level security%',
  'Una alumna no escribe períodos');
select pruebas.afirmar(pruebas.error_de($q$select * from public.buscar_perfil_por_correo('r24@prueba.test')$q$) = 'no_autorizado', 'Una alumna no busca personas por correo');
select pruebas.afirmar(pruebas.error_de($q$select public.revocar_beca((select id from public.periodos_acceso limit 1), 'Intento de una alumna')$q$) = 'no_autorizado', 'Una alumna no revoca becas');
reset role;
set local role anon;
select pruebas.afirmar(pruebas.error_de($q$select public.oferta_curso('24000000-0000-0000-0000-000000000001')$q$) like 'permission denied%', 'Un visitante no consulta ofertas personales');
reset role;

-- ---------------------------------------------------------------- Talleres apagados para el público
do $$
declare A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; G constant uuid := '7a000000-0000-0000-0000-000000000001'; antes int;
begin
  antes := (select count(*) from public.inscripciones_taller);
  update public.configuracion_academia set talleres_publicos = false;
  perform pruebas.afirmar(pruebas.error_de(format('select public.crear_orden(%L, %L, %L)', A, 'taller', '7a000000-0000-0000-0000-000000000001')) = 'talleres_no_disponibles',
    'Apagados: no hay órdenes nuevas de talleres');
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pruebas.afirmar(pruebas.error_de(format('select public.inscribirme_gratis(%L)', G)) = 'talleres_no_disponibles', 'Apagados: no hay inscripciones propias');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pruebas.afirmar((select count(*) from public.inscripciones_taller) = antes, 'Las inscripciones existentes no cambian');
  perform pruebas.afirmar(exists (select 1 from public.auditoria where entidad = 'configuracion_academia' and accion = 'configuracion_actualizado' and despues ? 'talleres_publicos'), 'El cambio queda registrado');
  update public.configuracion_academia set talleres_publicos = true;
end $$;

-- ---------------------------------------------------------------- 20. Conciliación
select pruebas.afirmar((select count(*) from public.conciliar_periodos()) = 0,
  'Accesos y períodos concilian: ' || coalesce((select string_agg(problema, ', ') from public.conciliar_periodos()), ''));

rollback;
