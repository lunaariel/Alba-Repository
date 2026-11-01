-- Modalidad de evaluación (0018): formativa y sumativa, requisitos de finalización, elegibilidad para
-- certificado, versiones históricas, validación docente y permisos.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000018', 'c18@prueba.test', '{"nombre_completo": "Alumna C", "confirma_mayoria_edad": true}');

do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  B constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  C constant uuid := 'cccccccc-0000-0000-0000-000000000018';
  ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003';
  F constant uuid := '18000000-0000-0000-0000-000000000001';
  M constant uuid := '18000000-0000-0000-0000-000000000002';
  L1 constant uuid := '18000000-0000-0000-0000-000000000003';
  L2 constant uuid := '18000000-0000-0000-0000-000000000004';
  EV constant uuid := '18000000-0000-0000-0000-000000000005';
  P1 constant uuid := '18000000-0000-0000-0000-000000000006';
  O1 constant uuid := '18000000-0000-0000-0000-000000000007';
  O2 constant uuid := '18000000-0000-0000-0000-000000000008';
  v1 uuid; v2 uuid; v3 uuid; r jsonb; fallo text; cert uuid; val uuid; e jsonb;
begin
  -- Curso nuevo con evaluación sin configurar: valores predeterminados 70 % y 2 intentos.
  insert into public.cursos (id, slug, titulo, precio_centavos) values (F, 'formativo', 'Curso formativo', 3000);
  insert into public.modulos (id, curso_id, titulo, orden) values (M, F, 'Módulo', 0);
  insert into public.lecciones (id, modulo_id, titulo, orden) values (L1, M, 'L1', 0), (L2, M, 'L2', 1);
  insert into public.evaluaciones (id, curso_id) values (EV, F);
  perform pruebas.afirmar((select puntaje_minimo || '/' || intentos_permitidos || '/' || modalidad from public.evaluaciones where id = EV) = '70/2/sumativa',
    'Una evaluación nueva nace sumativa, con 70 % y 2 intentos');

  -- La sumativa no admite requisitos formativos (restricción en la base).
  begin update public.evaluaciones set requiere_validacion = true where id = EV; fallo := 'no falló';
  exception when check_violation then fallo := 'rechazado'; end;
  perform pruebas.afirmar(fallo = 'rechazado', 'La sumativa no acepta requisitos formativos');

  -- Formativa con certificado y sin criterios: no se publica (queda en borrador hasta configurarlos).
  update public.evaluaciones set modalidad = 'formativa' where id = EV;
  perform pruebas.afirmar('criterios_certificacion' = any (public.faltantes_publicacion(F)), 'Sin criterios de certificación no se publica');
  begin update public.cursos set estado = 'publicado' where id = F; fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo like 'curso_incompleto%criterios_certificacion%', 'Publicar falla y el curso sigue en borrador: ' || fallo);
  perform pruebas.afirmar((select estado from public.cursos where id = F) = 'borrador', 'Sigue en borrador');

  -- Exige actividades: hacen falta preguntas con respuesta correcta.
  update public.evaluaciones set requiere_actividades = true where id = EV;
  perform pruebas.afirmar('actividades' = any (public.faltantes_publicacion(F)), 'Exigir actividades sin preguntas no se publica');
  insert into public.preguntas (id, evaluacion_id, enunciado, tipo, orden, tema) values (P1, EV, '¿Actividad?', 'unica', 0, 'Rutinas');
  insert into public.opciones (id, pregunta_id, texto, es_correcta, orden) values (O1, P1, 'Sí', true, 0), (O2, P1, 'No', false, 1);
  perform pruebas.afirmar(cardinality(public.faltantes_publicacion(F)) = 0, 'Con actividades configuradas, se puede publicar');
  update public.cursos set estado = 'publicado' where id = F;
  v1 := (select version_vigente_id from public.cursos where id = F);
  perform pruebas.afirmar((select modalidad || ':' || requiere_actividades || ':' || requiere_validacion || ':' || con_certificado from public.versiones_curso where id = v1)
    = 'formativa:true:false:true', 'La versión 1 fija la modalidad y los requisitos');

  -- A accede a la versión 1.
  insert into public.accesos_curso (perfil_id, curso_id, origen, motivo) values (A, F, 'concesion', 'Prueba de modalidad formativa');
  begin perform public.corregir_evaluacion(A, EV, '{}'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'modalidad_formativa', 'En la formativa no se rinde la evaluación sumativa: ' || fallo);
  r := public.registrar_actividad_formativa(A, EV, '{}');
  perform pruebas.afirmar((r ->> 'completo')::boolean = false and (r ->> 'respondidas')::int = 0, 'Un envío vacío no completa la actividad');
  perform pruebas.afirmar(not (r ? 'puntaje'), 'El envío formativo no devuelve una nota');
  begin cert := public.emitir_certificado(A, F); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo like 'lecciones_pendientes%', 'Sin lecciones completas no hay certificado: ' || fallo);
  -- Abrir lecciones (sin completarlas) no cuenta.
  insert into public.progreso_leccion (perfil_id, leccion_id, ultima_visita_en) values (A, L1, now()), (A, L2, now());
  perform pruebas.afirmar((public.estado_finalizacion_de(A, F) ->> 'lecciones_pendientes')::int = 2, 'Visitar una lección no la completa');
  update public.progreso_leccion set completada_en = now() where perfil_id = A and leccion_id in (L1, L2);
  begin cert := public.emitir_certificado(A, F); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'actividades_pendientes', 'Sin actividades completas no hay certificado: ' || fallo);
  -- Respuesta incorrecta: la actividad queda completa (formativa, sin nota mínima), con temas a repasar.
  r := public.registrar_actividad_formativa(A, EV, jsonb_build_object(P1::text, jsonb_build_array(O2)));
  perform pruebas.afirmar((r ->> 'completo')::boolean and r -> 'temas_a_reforzar' = '["Rutinas"]'::jsonb, 'Completa con temas a repasar');
  perform pruebas.afirmar(not exists (select 1 from public.intentos_evaluacion where perfil_id = A and formativo and aprobado), 'Un envío formativo nunca figura aprobado');
  e := public.estado_finalizacion_de(A, F);
  perform pruebas.afirmar((e ->> 'finalizado')::boolean and (e ->> 'elegible_certificado')::boolean and not (e ->> 'evaluacion_aprobada')::boolean,
    'Finalizado y elegible, sin «evaluación aprobada»');
  cert := public.emitir_certificado(A, F);
  perform pruebas.afirmar((select modalidad || ':' || (intento_id is not null) from public.certificados where id = cert) = 'formativa:true', 'Certificado formativo emitido');

  -- Versión 2: validación docente en lugar de actividades. A sigue en la 1; B entra en la 2.
  update public.evaluaciones set requiere_actividades = false, requiere_validacion = true where id = EV;
  perform pruebas.afirmar(cardinality(public.faltantes_publicacion(F)) = 0, 'Validación docente sola alcanza como criterio');
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  v2 := public.publicar_version(F, 'Validación docente');
  perform pruebas.afirmar((select count(*) from public.version_preguntas where version_id = v2) = 0, 'Sin actividades exigidas, la versión no incluye preguntas');
  perform pruebas.afirmar(public.version_de(A, F) = v1, 'A conserva su versión y su certificado');
  insert into public.accesos_curso (perfil_id, curso_id, origen, motivo) values (B, F, 'concesion', 'Prueba de validación docente');
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values (B, L1, now()), (B, L2, now());
  begin cert := public.emitir_certificado(B, F); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'validacion_pendiente', 'Sin validación docente no hay certificado: ' || fallo);
  begin perform public.registrar_actividad_formativa(B, EV, '{}'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'evaluacion_sin_preguntas', 'Sin actividades en la versión no se registra un envío: ' || fallo);

  -- Permisos: solo la admin valida.
  perform set_config('request.jwt.claim.sub', B::text, true);
  begin perform public.validar_finalizacion(B, F, 'Me valido yo misma, sin permiso.'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'no_autorizado', 'Un alumno no puede validarse: ' || fallo);
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  begin perform public.validar_finalizacion(B, F, 'corta'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'nota_requerida', 'La validación exige una nota');
  begin perform public.validar_finalizacion(A, F, 'La versión de A no pide validación.'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'validacion_no_corresponde', 'No se valida en una versión que no lo pide: ' || fallo);
  val := public.validar_finalizacion(B, F, 'Participó en el seguimiento con la maestra.');
  begin perform public.validar_finalizacion(B, F, 'Otra validación repetida.'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'ya_validada', 'Una sola validación vigente');
  perform public.anular_validacion(val, 'Validé a la persona equivocada.');
  perform pruebas.afirmar(not (public.estado_finalizacion_de(B, F) ->> 'validada')::boolean, 'Anulada, deja de contar');
  val := public.validar_finalizacion(B, F, 'Validación correcta después de revisar.');
  cert := public.emitir_certificado(B, F);
  perform pruebas.afirmar((select modalidad || ':' || (intento_id is null) from public.certificados where id = cert) = 'formativa:true', 'Certificado por validación docente');
  begin perform public.anular_validacion(val, 'Intento anular después del certificado.'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'certificado_emitido', 'Con certificado emitido, la validación no se anula: ' || fallo);
  perform pruebas.afirmar((select count(*) from public.auditoria where accion in ('finalizacion_validada', 'validacion_anulada')) >= 3, 'Validaciones y anulaciones auditadas');

  -- Versión 3: formativa sin certificado. C finaliza pero no es elegible.
  update public.evaluaciones set con_certificado = false, requiere_validacion = false where id = EV;
  perform pruebas.afirmar(cardinality(public.faltantes_publicacion(F)) = 0, 'Sin certificado no hacen falta criterios extra');
  v3 := public.publicar_version(F, 'Sin certificado');
  insert into public.accesos_curso (perfil_id, curso_id, origen, motivo) values (C, F, 'concesion', 'Prueba sin certificado');
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values (C, L1, now()), (C, L2, now());
  e := public.estado_finalizacion_de(C, F);
  perform pruebas.afirmar((e ->> 'finalizado')::boolean and not (e ->> 'elegible_certificado')::boolean, 'Finalizado sin elegibilidad para certificado');
  begin cert := public.emitir_certificado(C, F); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'curso_sin_certificado', 'Un curso sin certificado no emite: ' || fallo);

  -- Versión 4: vuelve a sumativa con la misma pregunta. No es equivalente a las formativas.
  update public.evaluaciones set modalidad = 'sumativa', con_certificado = true where id = EV;
  perform public.publicar_version(F, 'Vuelve a sumativa');
  perform pruebas.afirmar(not public.evaluaciones_equivalentes(v1, (select version_vigente_id from public.cursos where id = F)),
    'Una versión formativa nunca es equivalente a una sumativa');
  perform pruebas.afirmar((select count(*) from public.certificados where curso_id = F) = 2
    and (select modalidad from public.versiones_curso where id = v1) = 'formativa', 'Versiones y certificados anteriores intactos');
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Actividades formativas visibles antes de completar las lecciones (D sigue la versión 1 formativa).
insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0000-0000-0000-000000000018', 'd18@prueba.test', '{"nombre_completo": "Alumna D", "confirma_mayoria_edad": true}');
-- La versión 1 es formativa con actividades: se asigna a D directamente (prueba).
insert into public.accesos_curso (perfil_id, curso_id, origen, motivo, version_id)
select 'dddddddd-0000-0000-0000-000000000018', '18000000-0000-0000-0000-000000000001', 'concesion', 'Prueba de visibilidad',
       (select id from public.versiones_curso where curso_id = '18000000-0000-0000-0000-000000000001' and numero = 1);
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000018';
select pruebas.afirmar((select count(*) from public.preguntas where id = '18000000-0000-0000-0000-000000000006') = 1,
  'En la formativa, las actividades se ven sin haber completado las lecciones');
reset role;

-- El alumno ve su propio estado; no el de otra persona ni el seguimiento del curso.
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000018';
select pruebas.afirmar((public.mi_finalizacion('18000000-0000-0000-0000-000000000001') ->> 'finalizado')::boolean, 'El alumno lee su estado de finalización');
select pruebas.afirmar((select count(*) from public.validaciones_formativas) = 0, 'No ve validaciones ajenas');
do $$ begin
  perform public.seguimiento_curso('18000000-0000-0000-0000-000000000001');
  raise exception 'debió fallar';
exception when others then
  perform pruebas.afirmar(sqlerrm = 'no_autorizado', 'El seguimiento del curso es solo para la admin: ' || sqlerrm);
end $$;
do $$ begin
  perform public.estado_finalizacion_de('aaaaaaaa-0000-0000-0000-000000000001', '18000000-0000-0000-0000-000000000001');
  raise exception 'debió fallar';
exception when insufficient_privilege then null;
end $$;
-- Defecto corregido: la columna «correcta» de las respuestas no es legible por el alumno.
do $$ begin
  perform correcta from public.respuestas_intento limit 1;
  raise exception 'debió fallar';
exception when insufficient_privilege then null;
end $$;
reset role;
set local request.jwt.claim.sub = 'adadadad-0000-0000-0000-000000000003';
select pruebas.afirmar((select count(*) from public.seguimiento_curso('18000000-0000-0000-0000-000000000001')) = 4, 'La admin ve el seguimiento de los cuatro alumnos');

rollback;
