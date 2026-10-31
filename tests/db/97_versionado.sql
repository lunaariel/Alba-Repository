-- Versionado académico (0014): escenarios críticos aprobados por la titular.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-0000-0000-0000-000000000004', 'c@prueba.test', '{"nombre_completo": "Alumna C", "confirma_mayoria_edad": true}');

do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  B constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  C constant uuid := 'cccccccc-0000-0000-0000-000000000004';
  ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003';
  CURSO constant uuid := 'c0000000-0000-0000-0000-000000000001';
  EVAL constant uuid := 'f0000000-0000-0000-0000-000000000001';
  MOD1 constant uuid := 'd0000000-0000-0000-0000-000000000001';
  L1 constant uuid := 'e0000000-0000-0000-0000-000000000001';
  L2 constant uuid := 'e0000000-0000-0000-0000-000000000002';
  P1 constant uuid := 'a1000000-0000-0000-0000-000000000001';
  P2 constant uuid := 'a1000000-0000-0000-0000-000000000002';
  v1 uuid; v2 uuid; v3 uuid; l3 uuid; p3 uuid; o uuid; m1 uuid; orden uuid; rev uuid; rev0 uuid;
  r jsonb; vista jsonb; cert_a uuid; cert_b2 uuid; cert_b3 uuid; codigo_b2 text; n int;
begin
  -- 1. La compra de A quedó en la versión 1, la vigente al aprobarse el pago.
  v1 := (select version_vigente_id from public.cursos where id = CURSO);
  perform pruebas.afirmar(v1 is not null and (select numero from public.versiones_curso where id = v1) = 1, 'Publicar por primera vez creó la versión 1');
  perform pruebas.afirmar(public.version_de(A, CURSO) = v1, 'El acceso de A está en la versión 1');
  perform pruebas.afirmar((select count(*) from public.version_lecciones where version_id = v1) = 2
                          and (select count(*) from public.version_preguntas where version_id = v1) = 2, 'La versión 1 sella 2 lecciones y 2 preguntas');

  -- 2. La maestra cambia el borrador (lección 3, pregunta 3, mínimo 50, 5 intentos) y publica la versión 2.
  insert into public.lecciones (modulo_id, titulo, orden) values (MOD1, 'Lección 3', 2) returning id into l3;
  p3 := public.guardar_pregunta(EVAL, null, '¿Pregunta tres?', 'unica', 'Ambiente',
          '[{"texto":"Sí","es_correcta":true},{"texto":"No","es_correcta":false}]');
  update public.evaluaciones set puntaje_minimo = 50, intentos_permitidos = 5 where id = EVAL;
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  v2 := public.publicar_version(CURSO, 'Agrega la lección 3 y una pregunta');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pruebas.afirmar((select numero from public.versiones_curso where id = v2) = 2, 'Se publicó la versión 2');
  perform pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'version_publicada' and actor_id = ADMIN
                                    and (despues ->> 'numero')::int = 2), 'La publicación queda registrada con su autora');

  -- Publicar no cambia a quien ya estaba inscrito; quien compra después recibe la nueva.
  perform pruebas.afirmar(public.version_de(A, CURSO) = v1, 'A sigue en la versión 1');
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pruebas.afirmar(public.lecciones_pendientes(CURSO) = 2, 'A conserva sus 2 lecciones (no le suman la 3)');
  perform set_config('request.jwt.claim.sub', '', true);
  orden := public.crear_orden(B, 'curso', CURSO);
  perform public.procesar_evento_pago('simulado', 'v-evt-b', 'pago', '{}'::jsonb, orden, 'v-pago-b', 'aprobado', 4900);
  perform pruebas.afirmar(public.version_de(B, CURSO) = v2, 'B, que compra después, recibe la versión 2');
  perform set_config('request.jwt.claim.sub', B::text, true);
  perform pruebas.afirmar(public.lecciones_pendientes(CURSO) = 3, 'B tiene 3 lecciones');
  perform set_config('request.jwt.claim.sub', '', true);

  -- 3. Misma respuesta, distinto resultado según la versión (clave, mínimo e intentos de cada una).
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values (A, L1, now()), (A, L2, now()),
    (B, L1, now()), (B, L2, now()), (B, l3, now());
  r := public.corregir_evaluacion(A, EVAL, jsonb_build_object(P1::text, jsonb_build_array('a2000000-0000-0000-0000-000000000011'),
        P2::text, jsonb_build_array('a2000000-0000-0000-0000-000000000021')));
  perform pruebas.afirmar((r ->> 'puntaje')::int = 50 and not (r ->> 'aprobado')::boolean and (r ->> 'intentos_restantes')::int = 2,
    'A (v1: mínimo 100, 3 intentos) no aprueba con 50 → ' || r::text);
  select id into o from public.opciones where pregunta_id = p3 and es_correcta;
  r := public.corregir_evaluacion(B, EVAL, jsonb_build_object(P1::text, jsonb_build_array('a2000000-0000-0000-0000-000000000011'),
        P2::text, jsonb_build_array('a2000000-0000-0000-0000-000000000021'), p3::text, jsonb_build_array(o)));
  perform pruebas.afirmar((r ->> 'puntaje')::int = 67 and (r ->> 'aprobado')::boolean and (r ->> 'intentos_restantes')::int = 4,
    'B (v2: 3 preguntas, mínimo 50, 5 intentos) aprueba con 67 → ' || r::text);
  perform pruebas.afirmar((select version_id from public.intentos_evaluacion where perfil_id = A) = v1, 'El intento guarda su versión');
  cert_b2 := public.emitir_certificado(B, CURSO);
  select codigo_verificacion into codigo_b2 from public.certificados where id = cert_b2;
  perform pruebas.afirmar((select version_id from public.certificados where id = cert_b2) = v2, 'El certificado de B indica la versión 2');

  -- 4. Inmutabilidad.
  begin update public.versiones_curso set puntaje_minimo = 0 where id = v1; raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'version_inmutable', 'Una versión no se edita (' || sqlerrm || ')'); end;
  begin delete from public.version_lecciones where version_id = v1; raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'version_inmutable', 'Sus lecciones no se quitan (' || sqlerrm || ')'); end;
  begin update public.opciones set es_correcta = false where id = 'a2000000-0000-0000-0000-000000000011'; raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'pregunta_publicada', 'La clave publicada no cambia (' || sqlerrm || ')'); end;
  begin insert into public.opciones (pregunta_id, texto, es_correcta, orden) values (P2, 'Nueva', false, 9); raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'pregunta_publicada', 'No se agregan opciones a una pregunta publicada (' || sqlerrm || ')'); end;
  begin update public.accesos_curso set version_id = v2 where perfil_id = A; raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'version_inmutable', 'La versión de un acceso no se cambia por fuera del cambio voluntario (' || sqlerrm || ')'); end;
  begin delete from public.lecciones where id = l3; raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm in ('leccion_con_historial', 'leccion_en_version'), 'Una lección publicada no se borra (' || sqlerrm || ')'); end;

  -- 5. Materiales: el PDF de la versión 1 no se borra; quitarlo del borrador lo saca solo de versiones futuras.
  select id into m1 from public.recursos_leccion where leccion_id = L1;
  begin delete from public.recursos_leccion where id = m1; raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'material_en_version', 'Un PDF de una versión no se borra (' || sqlerrm || ')'); end;
  update public.recursos_leccion set retirado = true where id = m1;
  v3 := public.publicar_version(CURSO, 'Quita la guía del borrador');
  perform pruebas.afirmar(not exists (select 1 from public.version_materiales where version_id = v3 and recurso_id = m1), 'La versión 3 ya no incluye la guía');
  perform pruebas.afirmar(exists (select 1 from public.version_materiales where version_id = v1 and recurso_id = m1), 'La versión 1 la conserva');

  -- 6. Revisión favorable: la clave de P2 en la versión 1 estaba mal (debía ser solo la 21).
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  rev := public.calcular_revision(v1, P2, array['a2000000-0000-0000-0000-000000000021']::uuid[], 'La opción 22 no era correcta según el material');
  perform pruebas.afirmar(jsonb_array_length((select impacto from public.revisiones_evaluacion where id = rev)) = 1, 'El cálculo encuentra a A');
  perform pruebas.afirmar((select puntaje_revisado from public.intentos_evaluacion where perfil_id = A) is null, 'Calcular no cambia ningún resultado');
  begin perform public.aplicar_revision(rev, 'CORREGIR'); raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'confirmacion_incorrecta', 'La segunda confirmación exige el texto exacto (' || sqlerrm || ')'); end;
  r := public.aplicar_revision(rev, 'corregir 1');
  perform pruebas.afirmar((r ->> 'ajustados')::int = 1, 'Se ajustó 1 intento → ' || r::text);
  perform pruebas.afirmar((select puntaje from public.intentos_evaluacion where perfil_id = A) = 50
                          and (select puntaje_revisado from public.intentos_evaluacion where perfil_id = A) = 100
                          and (select aprobado_revisado from public.intentos_evaluacion where perfil_id = A),
    'Se conserva el resultado original (50) y se registra el corregido (100)');
  r := public.aplicar_revision(rev, 'CORREGIR 1');
  perform pruebas.afirmar(r ->> 'estado' = 'ya_aplicada' and (select count(*) from public.ajustes_intento where revision_id = rev) = 1,
    'Aplicar de nuevo no duplica el ajuste');
  perform pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'revision_favorable_aplicada' and actor_id = ADMIN
                                    and despues ->> 'motivo' like 'La opción 22%'), 'La revisión queda registrada con motivo y autora');
  -- La clave corregida se suma a la original: nunca exige más.
  perform pruebas.afirmar(public.eleccion_correcta(v1, P2, array['a2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000022']::uuid[])
                          and public.eleccion_correcta(v1, P2, array['a2000000-0000-0000-0000-000000000021']::uuid[]),
    'Después de la revisión, la respuesta original y la corregida son correctas');
  rev0 := public.calcular_revision(v1, P2, array['a2000000-0000-0000-0000-000000000022']::uuid[], 'Prueba sin beneficiados posibles');
  r := public.aplicar_revision(rev0, 'CORREGIR 0');
  perform pruebas.afirmar((r ->> 'ajustados')::int = 0 and (select puntaje_revisado from public.intentos_evaluacion where perfil_id = A) = 100,
    'Una revisión que no beneficia a nadie no baja ningún resultado');
  perform set_config('request.jwt.claim.sub', '', true);

  -- La revisión habilita el certificado de A (con lecciones completas), en su versión 1.
  cert_a := public.emitir_certificado(A, CURSO);
  perform pruebas.afirmar((select version_id from public.certificados where id = cert_a) = v1, 'A obtiene su certificado de la versión 1');

  -- 7. Cambio voluntario de A a la versión vigente (3): ve qué cambia, confirma, y nada se borra.
  perform set_config('request.jwt.claim.sub', A::text, true);
  vista := public.vista_cambio_version(CURSO);
  perform set_config('request.jwt.claim.sub', '', true);
  perform pruebas.afirmar((vista -> 'nueva' ->> 'numero')::int = 3 and vista -> 'lecciones_nuevas' = '["Lección 3"]'::jsonb
                          and (vista ->> 'pendientes_despues')::int = 1 and (vista ->> 'completadas_conservadas')::int = 2
                          and not (vista ->> 'evaluacion_igual')::boolean and (vista ->> 'tiene_certificado')::boolean,
    'La vista previa del cambio explica lo nuevo y lo que conserva → ' || vista::text);
  begin perform public.cambiar_version(A, CURSO, v2, 'Entiendo los cambios y confirmo'); raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'version_no_vigente', 'Solo hacia la versión vigente (' || sqlerrm || ')'); end;
  begin perform public.cambiar_version(A, CURSO, v3, 'sí'); raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'confirmacion_requerida', 'Exige una confirmación expresa (' || sqlerrm || ')'); end;
  perform public.cambiar_version(A, CURSO, v3, 'Entiendo los cambios y confirmo pasar a la versión 3');
  perform pruebas.afirmar(public.version_de(A, CURSO) = v3, 'A está ahora en la versión 3');
  perform pruebas.afirmar(exists (select 1 from public.cambios_version where perfil_id = A and version_anterior = v1 and version_nueva = v3),
    'Se registra versión anterior, nueva, fecha y confirmación');
  perform pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'version_cambiada_por_alumno' and actor_id = A), 'El cambio queda en la actividad');
  perform pruebas.afirmar((select count(*) from public.progreso_leccion where perfil_id = A and completada_en is not null) = 2, 'Conserva sus lecciones completadas');
  perform pruebas.afirmar((select count(*) from public.intentos_evaluacion where perfil_id = A and version_id = v1) = 1, 'Conserva su intento de la versión 1');
  perform pruebas.afirmar(exists (select 1 from public.certificados where id = cert_a and version_id = v1), 'Conserva su certificado de la versión 1');
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pruebas.afirmar(public.lecciones_pendientes(CURSO) = 1, 'En la versión 3 le falta solo la lección nueva');
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values (A, l3, now());
  begin perform public.emitir_certificado(A, CURSO); raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'evaluacion_no_aprobada', 'La aprobación de v1 no se traslada a una evaluación distinta (' || sqlerrm || ')'); end;
  begin perform public.cambiar_version(A, CURSO, v3, 'Entiendo los cambios y confirmo otra vez'); raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'version_no_mas_nueva', 'No se cambia a la misma versión (' || sqlerrm || ')'); end;

  -- B pasa de la 2 a la 3 (misma evaluación): conserva su certificado de la 2 y obtiene el de la 3 sin rendir de nuevo.
  perform public.cambiar_version(B, CURSO, v3, 'Entiendo los cambios y confirmo pasar a la versión 3');
  cert_b3 := public.emitir_certificado(B, CURSO);
  perform pruebas.afirmar(cert_b3 <> cert_b2 and (select version_id from public.certificados where id = cert_b3) = v3,
    'Evaluación igual: la aprobación se reconoce y se emite el certificado de la versión 3');
  perform pruebas.afirmar((public.verificar_certificado(codigo_b2) ->> 'version')::int = 2, 'El certificado anterior sigue verificable e indica la versión 2');

  -- 8. Bloqueo excepcional: deja de exigirse en todas las versiones, con motivo y registro.
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  begin perform public.bloquear_contenido('lecciones', l3, true, 'corto'); raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'motivo_requerido', 'El bloqueo exige motivo (' || sqlerrm || ')'); end;
  perform public.bloquear_contenido('lecciones', l3, true, 'Contenido retirado por pedido legal de un tercero');
  perform set_config('request.jwt.claim.sub', '', true);
  orden := public.crear_orden(C, 'curso', CURSO);
  perform public.procesar_evento_pago('simulado', 'v-evt-c', 'pago', '{}'::jsonb, orden, 'v-pago-c', 'aprobado', 4900);
  perform set_config('request.jwt.claim.sub', C::text, true);
  perform pruebas.afirmar(public.lecciones_pendientes(CURSO) = 2, 'La lección bloqueada no se exige (C, versión 3)');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'contenido_bloqueado' and entidad_id = l3::text
                                    and despues ->> 'motivo' like 'Contenido retirado%'), 'El bloqueo queda registrado con su motivo');
  perform pruebas.afirmar((select count(*) from public.certificados) = 3, 'Ningún certificado se perdió en todo el recorrido');
end $$;

-- 9. Permisos: una alumna no publica, no revisa, no bloquea ni lee las listas internas de versiones.
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin
  begin perform public.publicar_version('c0000000-0000-0000-0000-000000000001', 'Versión pirata'); raise exception 'NO_FALLÓ';
  exception when insufficient_privilege then null; end;
  begin perform public.calcular_revision((select version_id from public.accesos_curso limit 1), 'a1000000-0000-0000-0000-000000000002',
          array['a2000000-0000-0000-0000-000000000022']::uuid[], 'Intento de una alumna'); raise exception 'NO_FALLÓ';
  exception when insufficient_privilege then null; end;
  begin perform public.bloquear_contenido('lecciones', 'e0000000-0000-0000-0000-000000000001', true, 'Intento de una alumna'); raise exception 'NO_FALLÓ';
  exception when insufficient_privilege then null; end;
  begin perform public.cambiar_version('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', null, 'Intento directo de la alumna'); raise exception 'NO_FALLÓ';
  exception when insufficient_privilege then null; end;
end $$;
select pruebas.afirmar((select count(*) from public.version_lecciones) = 0, 'La alumna no lee las listas internas de versiones');
select pruebas.afirmar((select count(*) from public.revisiones_evaluacion) = 0, 'La alumna no lee revisiones');
select pruebas.afirmar((select count(*) from public.versiones_curso) = 1, 'La alumna ve solo su versión, que es la vigente (la 3)');
select pruebas.afirmar((select count(*) from public.lecciones) = 2, 'La lección bloqueada no se muestra a la alumna');
select pruebas.afirmar(not exists (select 1 from public.temario_version((select version_id from public.accesos_curso limit 1)) t where t.leccion_titulo = 'Lección 3'),
  'El temario de su versión no muestra lo bloqueado');
-- Una alumna no puede leer el temario de una versión ajena que no es la vigente.
select pruebas.afirmar((select count(*) from public.temario_version((select id from public.versiones_curso where numero = 1 limit 1))) = 0,
  'No lee versiones que no le corresponden');
reset role;
set local role anon;
select pruebas.afirmar((select count(*) from public.lecciones) = 2, 'El sitio muestra la versión vigente sin lo bloqueado');
reset role;

rollback;
