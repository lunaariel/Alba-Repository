-- Vencimientos de cursos (0019): duración comercial + 5 meses desde la compra, condiciones copiadas por
-- compra, meses calendario en la hora de Guatemala, accesos históricos sin vencimiento y contenido
-- protegido al vencer, con historial y certificados conservados.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000019', 'c19@prueba.test', '{"nombre_completo": "Alumna Vence", "confirma_mayoria_edad": true}');

-- Meses calendario y zona horaria.
select pruebas.afirmar(public.calcular_vencimiento('2027-01-31 10:00 America/Guatemala', 1) = '2027-02-28 10:00 America/Guatemala', '31 de enero + 1 mes = 28 de febrero');
select pruebas.afirmar(public.calcular_vencimiento('2027-08-31 10:00 America/Guatemala', 6) = '2028-02-29 10:00 America/Guatemala', '31 de agosto + 6 meses = 29 de febrero (bisiesto)');
-- 23:30 en Guatemala ya es el día siguiente en UTC: se cuenta en la hora local.
select pruebas.afirmar(public.calcular_vencimiento('2027-01-15 23:30 America/Guatemala', 3) = '2027-04-15 23:30 America/Guatemala', 'Cuenta en la hora de Guatemala, no en UTC');
select pruebas.afirmar(public.meses_adicionales_acceso() = 5, 'Cinco meses adicionales');

do $$
declare
  C constant uuid := 'cccccccc-0000-0000-0000-000000000019';
  B constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003';
  K constant uuid := '19000000-0000-0000-0000-000000000001';
  M constant uuid := '19000000-0000-0000-0000-000000000002';
  L constant uuid := '19000000-0000-0000-0000-000000000003';
  EV constant uuid := '19000000-0000-0000-0000-000000000004';
  P constant uuid := '19000000-0000-0000-0000-000000000005';
  o uuid; a public.accesos_curso%rowtype; fallo text; cert uuid; v1 uuid; v2 uuid;
begin
  insert into public.cursos (id, slug, titulo, precio_centavos) values (K, 'vence', 'Curso con vencimiento', 3000);
  insert into public.modulos (id, curso_id, titulo, orden) values (M, K, 'Módulo', 0);
  insert into public.lecciones (id, modulo_id, titulo, orden) values (L, M, 'Lección', 0);
  insert into public.recursos_leccion (id, leccion_id, titulo, ruta_almacenamiento, tipo_mime, tamano_bytes)
  values ('19000000-0000-0000-0000-000000000006', L, 'Guía privada', 'cursos/vence/guia.pdf', 'application/pdf', 1000);
  insert into public.evaluaciones (id, curso_id, puntaje_minimo) values (EV, K, 50);
  insert into public.preguntas (id, evaluacion_id, enunciado, tipo, orden) values (P, EV, '¿Sí?', 'unica', 0);
  insert into public.opciones (pregunta_id, texto, es_correcta, orden) values (P, 'Sí', true, 0), (P, 'No', false, 1);
  update public.cursos set estado = 'publicado' where id = K;

  -- Sin duración comercial no se vende.
  begin o := public.crear_orden(C, 'curso', K); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'curso_sin_condiciones', 'Sin condiciones visibles no se puede comprar: ' || fallo);

  -- Con 3 meses: la orden copia 3 + 5 = 8 meses. Cambiar la duración después no la afecta.
  update public.cursos set duracion_comercial_meses = 3 where id = K;
  o := public.crear_orden(C, 'curso', K);
  perform pruebas.afirmar((select condiciones_acceso ->> 'total_meses' from public.items_orden where orden_id = o) = '8', 'La compra copia 8 meses');
  update public.cursos set duracion_comercial_meses = 6 where id = K;
  begin update public.items_orden set condiciones_acceso = '{"total_meses": 99}' where orden_id = o; fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'condiciones_inmutables', 'Las condiciones de una compra no se reescriben');
  -- Pago confirmado (aunque llegue tarde): el derecho empieza al confirmarse y dura lo que se compró.
  perform public.procesar_evento_pago('simulado', 'vence-evt', 'pago', '{}', o, 'vence-pago', 'aprobado', 3000);
  select * into a from public.accesos_curso where perfil_id = C and curso_id = K;
  perform pruebas.afirmar(a.inicia_en >= (select creado_en from public.ordenes where id = o), 'El inicio se registra al confirmar el pago');
  perform pruebas.afirmar(a.vence_en = public.calcular_vencimiento(a.inicia_en, 8), 'Vence a los 8 meses calculados por el servidor (no 11)');
  perform pruebas.afirmar((a.condiciones ->> 'duracion_meses') = '3' and (a.condiciones ->> 'meses_adicionales') = '5', 'El acceso guarda las condiciones compradas');
  perform pruebas.afirmar((select count(*) from public.auditoria where accion = 'curso_actualizado' and entidad_id = K::text
                           and despues ? 'duracion_comercial_meses') >= 1, 'El cambio de duración queda registrado');

  -- El vencimiento no se modifica por el flujo ordinario.
  begin update public.accesos_curso set vence_en = vence_en + interval '1 year' where id = a.id; fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'vencimiento_inmutable', 'El vencimiento no se cambia en silencio');

  -- Concesión de la admin: sin vencimiento hasta que la maestra decida otra cosa.
  insert into public.accesos_curso (perfil_id, curso_id, origen, motivo) values (B, K, 'concesion', 'Beca de prueba');
  perform pruebas.afirmar((select vence_en is null and condiciones ->> 'regla' = 'concesion_sin_vencimiento' from public.accesos_curso where perfil_id = B and curso_id = K),
    'La concesión no vence');

  -- C completa y aprueba antes de vencer y obtiene su certificado.
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values (C, L, now());
  perform public.corregir_evaluacion(C, EV, jsonb_build_object(P::text, jsonb_build_array((select id from public.opciones where pregunta_id = P and es_correcta))));
  cert := public.emitir_certificado(C, K);

  -- Cambio de versión: conserva el vencimiento.
  v1 := public.version_de(C, K);
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  v2 := public.publicar_version(K, 'Versión 2 para el vencimiento');
  perform set_config('request.jwt.claim.sub', '', true);
  perform public.cambiar_version(C, K, v2, 'Entiendo qué cambia y quiero pasar.');
  perform pruebas.afirmar((select vence_en from public.accesos_curso where id = a.id) = a.vence_en, 'Cambiar de versión no cambia el vencimiento');

  -- Simulación de vencimiento (solo en pruebas, con el ajuste explícito).
  perform set_config('albor.ajuste_vencimiento', 'si', true);
  update public.accesos_curso set inicia_en = now() - interval '9 months', vence_en = now() - interval '1 day' where id = a.id;
  perform set_config('albor.ajuste_vencimiento', '', true);
  perform pruebas.afirmar(public.version_de(C, K) is null, 'Vencido: sin versión para el contenido');
  begin perform public.corregir_evaluacion(C, EV, '{}'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'sin_acceso', 'Vencido: no se rinde la evaluación');
  perform pruebas.afirmar((public.estado_finalizacion_de(C, K) ->> 'vencido')::boolean, 'El estado informa el vencimiento');
  perform pruebas.afirmar(exists (select 1 from public.certificados where id = cert), 'El certificado obtenido antes de vencer se conserva');
  -- Quien cumplió todo antes de vencer (aquí, aprobación equivalente en la versión 2) puede pedir su certificado.
  perform pruebas.afirmar(public.emitir_certificado(C, K) is not null, 'Cumplido antes de vencer, el certificado se puede emitir después');
  perform pruebas.afirmar((select count(*) from public.progreso_leccion where perfil_id = C) = 1
    and (select count(*) from public.intentos_evaluacion where perfil_id = C) = 1, 'El historial académico se conserva');
  -- Recompra tras vencer (decisión del 01/11/2026, migración 0024): se permite con la oferta vigente y no
  -- toca el acceso anterior hasta que el pago se confirme. El detalle de la renovación se prueba en 99i.
  o := public.crear_orden(C, 'curso', K);
  perform pruebas.afirmar((select condiciones_acceso ->> 'total_meses' from public.items_orden where orden_id = o) = '11',
    'La renovación ofrece las condiciones vigentes (6 + 5 meses)');
  perform pruebas.afirmar((select vence_en <= now() from public.accesos_curso where perfil_id = C and curso_id = K and estado = 'activo'),
    'Crear la orden no cambia el acceso vencido');
end $$;

-- Vista de la alumna vencida (RLS): no ve lecciones ni materiales; sí su acceso, su certificado y su historial.
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000019';
select pruebas.afirmar(not public.tiene_acceso('19000000-0000-0000-0000-000000000001'), 'Vencido: tiene_acceso es falso');
select pruebas.afirmar((select count(*) from public.recursos_leccion where id = '19000000-0000-0000-0000-000000000006') = 0, 'Vencido: el material privado no es legible');
do $$ begin
  update public.progreso_leccion set completada_en = null where leccion_id = '19000000-0000-0000-0000-000000000003';
  perform pruebas.afirmar((select completada_en is not null from public.progreso_leccion where leccion_id = '19000000-0000-0000-0000-000000000003'),
    'Vencido: el avance no se modifica');
exception when insufficient_privilege then null;
end $$;
select pruebas.afirmar((select vencido from public.mis_accesos() where curso_id = '19000000-0000-0000-0000-000000000001'), 'El campus sabe que venció');
select pruebas.afirmar((select count(*) from public.certificados where curso_id = '19000000-0000-0000-0000-000000000001') = 2, 'Sus certificados siguen disponibles');
select pruebas.afirmar((select count(*) from public.mis_accesos()) = 1, 'Solo ve sus propios accesos');
do $$ begin
  perform public.version_historica_de('cccccccc-0000-0000-0000-000000000019', '19000000-0000-0000-0000-000000000001');
  raise exception 'debió fallar';
exception when insufficient_privilege then null;
end $$;
reset role;

-- La verificación pública del certificado no depende del acceso vigente.
select pruebas.afirmar(public.verificar_certificado((select codigo_verificacion from public.certificados where curso_id = '19000000-0000-0000-0000-000000000001' order by emitido_en limit 1)) is not null,
  'La verificación pública del certificado sigue funcionando');

rollback;
