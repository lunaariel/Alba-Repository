-- Gestión de cursos (Fase 5, entrega 2): reglas de preservación del historial académico.
begin;

do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  CURSO constant uuid := 'c0000000-0000-0000-0000-000000000001';
  EVAL constant uuid := 'f0000000-0000-0000-0000-000000000001';
  L1 constant uuid := 'e0000000-0000-0000-0000-000000000001';
  L2 constant uuid := 'e0000000-0000-0000-0000-000000000002';
  P1 constant uuid := 'a1000000-0000-0000-0000-000000000001';
  P2 constant uuid := 'a1000000-0000-0000-0000-000000000002';
  r jsonb; puntaje1 int; c uuid; m1 uuid; m2 uuid; q uuid;
begin
  -- A visitó la lección 1: ya tiene historial.
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values (A, L1, now());

  begin
    delete from public.lecciones where id = L1;
    raise exception 'NO_FALLÓ: borró una lección con historial';
  exception when others then perform pruebas.afirmar(sqlerrm = 'leccion_con_historial', 'Lección con historial: no se borra (' || sqlerrm || ')');
  end;
  begin
    delete from public.modulos where id = 'd0000000-0000-0000-0000-000000000001';
    raise exception 'NO_FALLÓ: borró un módulo con historial';
  exception when others then perform pruebas.afirmar(sqlerrm = 'modulo_con_historial', 'Módulo con historial: no se borra (' || sqlerrm || ')');
  end;
  perform pruebas.afirmar((select count(*) from public.progreso_leccion where perfil_id = A) = 1, 'El avance de A sigue intacto');

  -- Retirar la lección 1: se permite; la 2 sigue vigente.
  update public.lecciones set retirada = true where id = L1;
  begin
    update public.lecciones set retirada = true where id = L2;
    raise exception 'NO_FALLÓ: retiró la última lección de un curso publicado';
  exception when others then perform pruebas.afirmar(sqlerrm = 'ultima_leccion_vigente', 'La última lección vigente no se retira (' || sqlerrm || ')');
  end;

  -- Retirar del borrador no cambia la versión de A (0014): completó la 1, le falta la 2.
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pruebas.afirmar(public.lecciones_pendientes(CURSO) = 1, 'Lo retirado no cuenta como pendiente');
  perform set_config('request.jwt.claim.sub', '', true);

  -- Completar la 2 habilita la evaluación. Primer intento: la 1 bien, la 2 mal.
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values (A, L2, now());
  -- Una pregunta publicada ya no cambia (0014): ni su tema.
  begin
    update public.preguntas set tema = 'Observación' where id = P2;
    raise exception 'NO_FALLÓ: cambió una pregunta publicada';
  exception when others then perform pruebas.afirmar(sqlerrm = 'pregunta_publicada', 'Pregunta publicada inmutable (' || sqlerrm || ')');
  end;
  r := public.corregir_evaluacion(A, EVAL, jsonb_build_object(
        P1::text, jsonb_build_array('a2000000-0000-0000-0000-000000000011'),
        P2::text, jsonb_build_array('a2000000-0000-0000-0000-000000000023')));
  puntaje1 := (r ->> 'puntaje')::int;
  perform pruebas.afirmar(puntaje1 = 50, 'Primer intento: 50 → ' || r::text);
  perform pruebas.afirmar(r -> 'temas_a_reforzar' = '[]'::jsonb, 'Sin tema, no hay temas a reforzar → ' || r::text);
  perform pruebas.afirmar(r::text !~ 'a[12]000000-', 'La respuesta no revela preguntas ni opciones');

  -- Con respuestas guardadas: ni la pregunta ni sus opciones se borran.
  begin
    delete from public.preguntas where id = P2;
    raise exception 'NO_FALLÓ: borró una pregunta respondida';
  exception when others then perform pruebas.afirmar(sqlerrm = 'pregunta_con_historial', 'Pregunta respondida: no se borra (' || sqlerrm || ')');
  end;
  begin
    delete from public.opciones where id = 'a2000000-0000-0000-0000-000000000023';
    raise exception 'NO_FALLÓ: borró una opción con respuestas';
  exception when others then perform pruebas.afirmar(sqlerrm = 'opcion_con_historial', 'Opción con respuestas: no se borra (' || sqlerrm || ')');
  end;

  -- "Editar" una pregunta publicada crea su reemplazo en el borrador; la original no cambia.
  q := public.guardar_pregunta(EVAL, P1, '¿Pregunta única?', 'unica', null, jsonb_build_array(
    jsonb_build_object('id', 'a2000000-0000-0000-0000-000000000011', 'texto', 'Correcta', 'es_correcta', false),
    jsonb_build_object('id', 'a2000000-0000-0000-0000-000000000012', 'texto', 'Ahora es la correcta', 'es_correcta', true)));
  perform pruebas.afirmar(q <> P1, 'Se creó una pregunta nueva');
  perform pruebas.afirmar((select retirada from public.preguntas where id = P1), 'La original queda retirada del borrador');
  perform pruebas.afirmar((select es_correcta from public.opciones where id = 'a2000000-0000-0000-0000-000000000011'), 'La clave original no cambió');
  perform pruebas.afirmar((select es_correcta from public.opciones where pregunta_id = q and texto = 'Ahora es la correcta'), 'El reemplazo tiene la clave nueva');
  perform pruebas.afirmar((select puntaje from public.intentos_evaluacion where perfil_id = A and numero = 1) = puntaje1,
    'El puntaje del intento anterior no cambia');

  -- Retirar una pregunta del borrador no cambia la evaluación de la versión de A.
  update public.preguntas set retirada = true where id = P2;
  r := public.corregir_evaluacion(A, EVAL, jsonb_build_object(
        P1::text, jsonb_build_array('a2000000-0000-0000-0000-000000000011'),
        P2::text, jsonb_build_array('a2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000022')));
  perform pruebas.afirmar((r ->> 'puntaje')::int = 100, 'A rinde las preguntas y la clave de su versión → ' || r::text);
  begin
    update public.preguntas set retirada = true where id = q;
    raise exception 'NO_FALLÓ: retiró la última pregunta';
  exception when others then perform pruebas.afirmar(sqlerrm = 'ultima_pregunta_vigente', 'La última pregunta vigente no se retira (' || sqlerrm || ')');
  end;

  -- Validaciones al guardar preguntas.
  begin
    perform public.guardar_pregunta(EVAL, null, 'Sin correcta', 'unica', null, '[{"texto":"a","es_correcta":false},{"texto":"b","es_correcta":false}]');
    raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'sin_correcta', 'Exige una correcta (' || sqlerrm || ')');
  end;
  begin
    perform public.guardar_pregunta(EVAL, null, 'Dos correctas', 'unica', null, '[{"texto":"a","es_correcta":true},{"texto":"b","es_correcta":true}]');
    raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'unica_una_correcta', 'Única: una sola correcta (' || sqlerrm || ')');
  end;
  begin
    perform public.guardar_pregunta(EVAL, null, 'Una opción', 'multiple', null, '[{"texto":"a","es_correcta":true}]');
    raise exception 'NO_FALLÓ';
  exception when others then perform pruebas.afirmar(sqlerrm = 'opciones_cantidad', 'Al menos dos opciones (' || sqlerrm || ')');
  end;
  q := public.guardar_pregunta(EVAL, null, 'Pregunta nueva', 'multiple', 'Ambiente',
        '[{"texto":"x","es_correcta":true},{"texto":"y","es_correcta":true},{"texto":"z","es_correcta":false}]');
  perform pruebas.afirmar((select string_agg(texto, ',' order by orden) from public.opciones where pregunta_id = q) = 'x,y,z', 'Pregunta nueva con sus opciones en orden');

  -- En un curso publicado, una pregunta vigente no se queda sin correcta (control al confirmar).
  begin
    set constraints all immediate;
    update public.opciones set es_correcta = false where pregunta_id = q;
    raise exception 'NO_FALLÓ: pregunta sin correcta';
  exception when others then perform pruebas.afirmar(sqlerrm = 'pregunta_sin_correcta', 'Pregunta vigente sin correcta: bloqueado (' || sqlerrm || ')');
  end;
  set constraints all deferred;

  -- Un curso con alumnos no vuelve a borrador ni se borra; se archiva.
  begin
    update public.cursos set estado = 'borrador' where id = CURSO;
    raise exception 'NO_FALLÓ: volvió a borrador';
  exception when others then perform pruebas.afirmar(sqlerrm = 'curso_con_alumnos', 'Curso con alumnos: no vuelve a borrador (' || sqlerrm || ')');
  end;
  begin
    delete from public.cursos where id = CURSO;
    raise exception 'NO_FALLÓ: borró un curso con historial';
  exception when others then perform pruebas.afirmar(sqlerrm = 'curso_con_historial', 'Curso con historial: no se borra (' || sqlerrm || ')');
  end;
  update public.cursos set estado = 'archivado' where id = CURSO;
  update public.cursos set estado = 'publicado' where id = CURSO;   -- vuelve a publicarse: se valida de nuevo y pasa

  -- Un curso sin historial: se arma, se reordena y se puede eliminar.
  insert into public.cursos (slug, titulo, precio_centavos) values ('nuevo', 'Curso nuevo', 3900) returning id into c;
  insert into public.modulos (curso_id, titulo, orden) values (c, 'Primero', 0) returning id into m1;
  insert into public.modulos (curso_id, titulo, orden) values (c, 'Segundo', 1) returning id into m2;
  perform public.mover_en_orden('modulos', m2, -1);
  perform pruebas.afirmar((select string_agg(titulo, ',' order by orden) from public.modulos where curso_id = c) = 'Segundo,Primero', 'Reordenar módulos intercambia con el vecino');
  perform public.mover_en_orden('modulos', m2, -1);   -- ya es el primero: no hace nada
  perform pruebas.afirmar((select orden from public.modulos where id = m2) = 0, 'Mover más allá del borde no cambia nada');
  insert into public.lecciones (modulo_id, titulo, orden) values (m1, 'Única', 0);
  update public.lecciones set retirada = true where modulo_id = m1;
  begin
    perform public.guardar_pregunta(null, null, 'x', 'unica', null, '[]');
  exception when others then null;
  end;
  insert into public.evaluaciones (curso_id) values (c);
  perform public.guardar_pregunta((select id from public.evaluaciones where curso_id = c), null, '¿Lista?', 'unica', null,
    '[{"texto":"Sí","es_correcta":true},{"texto":"No","es_correcta":false}]');
  begin
    update public.cursos set estado = 'publicado' where id = c;
    raise exception 'NO_FALLÓ: publicó un curso con todas las lecciones retiradas';
  exception when others then perform pruebas.afirmar(sqlerrm = 'curso_incompleto: lecciones', 'Las lecciones retiradas no cuentan para publicar (' || sqlerrm || ')');
  end;
  delete from public.cursos where id = c;
  perform pruebas.afirmar(not exists (select 1 from public.cursos where id = c), 'Un curso sin historial se puede eliminar');
end $$;

-- Desde 0014, retirar es un cambio del borrador: el sitio y la alumna siguen viendo la versión publicada
-- (el efecto de publicar una versión nueva se prueba en 97_versionado).
set local role anon;
select pruebas.afirmar((select count(*) from public.lecciones where modulo_id = 'd0000000-0000-0000-0000-000000000001') = 2, 'El sitio muestra la versión vigente, no el borrador');
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pruebas.afirmar((select count(*) from public.lecciones) = 2, 'La alumna ve las lecciones de su versión');
select pruebas.afirmar((select count(*) from public.preguntas) = 2, 'La alumna ve las preguntas de su versión, no las del borrador');
-- Una alumna no reordena aunque vea el curso.
do $$ begin
  begin
    perform public.mover_en_orden('modulos', 'd0000000-0000-0000-0000-000000000001', 1);
    -- con un solo módulo no hay vecino: probar con preguntas, que tiene vecinos visibles
    perform public.mover_en_orden('preguntas', 'a1000000-0000-0000-0000-000000000001', -1);
    raise exception 'NO_FALLÓ: la alumna reordenó';
  exception when others then perform pruebas.afirmar(sqlerrm in ('no_autorizado', 'no_encontrado'), 'La alumna no reordena (' || sqlerrm || ')');
  end;
end $$;
do $$ begin
  begin
    perform public.guardar_pregunta('f0000000-0000-0000-0000-000000000001', null, 'Pirata', 'unica', null,
      '[{"texto":"a","es_correcta":true},{"texto":"b","es_correcta":false}]');
    raise exception 'NO_FALLÓ: la alumna creó una pregunta';
  exception when insufficient_privilege then null;
  end;
end $$;
set local request.jwt.claim.sub = 'adadadad-0000-0000-0000-000000000003';
select pruebas.afirmar((select count(*) from public.lecciones where modulo_id = 'd0000000-0000-0000-0000-000000000001') = 2, 'La admin ve también lo retirado');
-- La admin, con su propia sesión (no como superusuario), archiva, vuelve a publicar, retira y restaura.
update public.cursos set estado = 'archivado' where id = 'c0000000-0000-0000-0000-000000000001';
update public.cursos set estado = 'publicado' where id = 'c0000000-0000-0000-0000-000000000001';
select pruebas.afirmar((select estado from public.cursos where id = 'c0000000-0000-0000-0000-000000000001') = 'publicado', 'La admin vuelve a publicar con su sesión');
update public.lecciones set retirada = false where id = 'e0000000-0000-0000-0000-000000000001';
update public.lecciones set retirada = true where id = 'e0000000-0000-0000-0000-000000000001';
update public.preguntas set retirada = false where id = 'a1000000-0000-0000-0000-000000000002';
select public.mover_en_orden('preguntas', 'a1000000-0000-0000-0000-000000000002', -1);
select pruebas.afirmar((select orden from public.preguntas where id = 'a1000000-0000-0000-0000-000000000002') = 0, 'La admin reordena con su sesión');
do $$ declare c uuid; m uuid; e uuid; begin
  insert into public.cursos (slug, titulo, precio_centavos) values ('de-la-admin', 'Curso de la admin', 2900) returning id into c;
  insert into public.modulos (curso_id, titulo, orden) values (c, 'M', 0) returning id into m;
  insert into public.lecciones (modulo_id, titulo, orden) values (m, 'L', 0);
  insert into public.evaluaciones (curso_id) values (c) returning id into e;
  perform public.guardar_pregunta(e, null, '¿Lista?', 'unica', null, '[{"texto":"Sí","es_correcta":true},{"texto":"No","es_correcta":false}]');
  update public.cursos set estado = 'publicado' where id = c;
  perform pruebas.afirmar((select estado from public.cursos where id = c) = 'publicado', 'La admin crea y publica un curso con su sesión');
  update public.cursos set estado = 'borrador' where id = c;   -- sin alumnos: puede volver a borrador
  delete from public.cursos where id = c;
  perform pruebas.afirmar(not exists (select 1 from public.cursos where id = c), 'La admin elimina un curso sin historial con su sesión');
end $$;
reset role;

-- Todo quedó en el registro de actividad.
select pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'leccion_actualizado' and (despues ->> 'retirada')::boolean), 'Retiro de lección registrado');
select pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'pregunta_actualizado' and (despues ->> 'retirada')::boolean), 'Retiro de pregunta registrado');
select pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'pregunta_creado' and despues ->> 'enunciado' = '¿Pregunta única?'), 'El reemplazo de una pregunta publicada queda registrado');

rollback;
