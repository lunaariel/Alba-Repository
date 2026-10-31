-- Panel de cursos (0020): duplicar como borrador independiente y descartar revisiones calculadas.
begin;

do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003';
  CURSO constant uuid := 'c0000000-0000-0000-0000-000000000001';
  r jsonb; nuevo uuid; r2 jsonb; fallo text; rev uuid; rev2 uuid; v uuid; retirada uuid;
begin
  -- El curso de las pruebas tiene alumna, compra, intentos y versión. Se retira una lección extra del borrador.
  insert into public.lecciones (modulo_id, titulo, orden, retirada) values ('d0000000-0000-0000-0000-000000000001', 'Lección retirada', 5, true) returning id into retirada;

  -- Solo la admin duplica.
  perform set_config('request.jwt.claim.sub', A::text, true);
  begin r := public.duplicar_curso(CURSO, 'Copia pirata'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'no_autorizado', 'Un alumno no duplica cursos: ' || fallo);

  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  r := public.duplicar_curso(CURSO, 'Montessori en casa (copia)');
  nuevo := (r ->> 'curso')::uuid;
  perform pruebas.afirmar((select estado || ':' || slug || ':' || (version_vigente_id is null) || ':' || (publicado_en is null) from public.cursos where id = nuevo)
    = 'borrador:montessori-en-casa-copia:true:true', 'La copia nace en borrador, sin versión ni publicación');
  perform pruebas.afirmar((select count(*) from public.accesos_curso where curso_id = nuevo) = 0
    and (select count(*) from public.items_orden where curso_id = nuevo) = 0
    and (select count(*) from public.certificados where curso_id = nuevo) = 0
    and (select count(*) from public.versiones_curso where curso_id = nuevo) = 0
    and (select count(*) from public.intentos_evaluacion i join public.evaluaciones e on e.id = i.evaluacion_id where e.curso_id = nuevo) = 0,
    'No copia alumnos, compras, certificados, versiones ni intentos');
  perform pruebas.afirmar((select count(*) from public.lecciones l join public.modulos m on m.id = l.modulo_id where m.curso_id = nuevo) = 2,
    'Copia las lecciones vigentes, no las retiradas');
  perform pruebas.afirmar((select count(*) from public.progreso_leccion p join public.lecciones l on l.id = p.leccion_id join public.modulos m on m.id = l.modulo_id where m.curso_id = nuevo) = 0,
    'Sin avances en la copia');
  perform pruebas.afirmar(jsonb_array_length(r -> 'materiales') = 1
    and (r -> 'materiales' -> 0 ->> 'destino') like 'cursos/' || nuevo || '/%'
    and (r -> 'materiales' -> 0 ->> 'origen') = 'cursos/c1/guia.pdf', 'El material tiene ruta propia para copiar el archivo');
  perform pruebas.afirmar((select count(*) from public.opciones o join public.preguntas p on p.id = o.pregunta_id join public.evaluaciones e on e.id = p.evaluacion_id
                            where e.curso_id = nuevo and o.es_correcta) = 3, 'Copia preguntas con sus respuestas correctas');
  perform pruebas.afirmar((select puntaje_minimo || '/' || intentos_permitidos || '/' || modalidad from public.evaluaciones where curso_id = nuevo) = '100/3/sumativa',
    'Copia los criterios de la evaluación');
  perform pruebas.afirmar((select count(*) from public.auditoria where accion = 'curso_duplicado' and entidad_id = nuevo::text) = 1, 'La duplicación queda registrada');
  -- El original no cambió.
  perform pruebas.afirmar((select estado from public.cursos where id = CURSO) = 'publicado'
    and (select count(*) from public.accesos_curso where curso_id = CURSO) >= 1, 'El curso original sigue igual');
  -- Una segunda copia recibe otra dirección.
  r2 := public.duplicar_curso(CURSO, 'Otra copia');
  perform pruebas.afirmar(r2 ->> 'slug' = 'montessori-en-casa-copia-2', 'La segunda copia tiene otra dirección: ' || (r2 ->> 'slug'));
  -- La copia se puede eliminar (no tiene historial).
  delete from public.cursos where id = (r2 ->> 'curso')::uuid;
  perform pruebas.afirmar(not exists (select 1 from public.cursos where id = (r2 ->> 'curso')::uuid), 'La copia sin historial se puede eliminar');

  -- Descartar una revisión calculada.
  v := (select version_vigente_id from public.cursos where id = CURSO);
  rev := public.calcular_revision(v, 'a1000000-0000-0000-0000-000000000001', array['a2000000-0000-0000-0000-000000000012']::uuid[], 'Revisión de prueba para descartar.');
  perform pruebas.afirmar(rev is not null, 'Se calcula una revisión');
  perform set_config('request.jwt.claim.sub', A::text, true);
  begin perform public.descartar_revision(rev, 'Intento de un alumno.'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'no_autorizado', 'Un alumno no descarta revisiones: ' || fallo);
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  begin perform public.descartar_revision(rev, 'corto'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'motivo_requerido', 'Descartar exige motivo');
  perform public.descartar_revision(rev, 'Me equivoqué al elegir la opción.');
  perform pruebas.afirmar((select estado || ':' || (descartada_por = ADMIN) from public.revisiones_evaluacion where id = rev) = 'descartada:true', 'Queda descartada, con responsable');
  begin perform public.aplicar_revision(rev, 'CORREGIR 0'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'revision_descartada', 'Una revisión descartada no se aplica: ' || fallo);
  begin perform public.descartar_revision(rev, 'Descartar dos veces.'); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'revision_no_descartable', 'No se descarta dos veces');
  perform pruebas.afirmar((select count(*) from public.auditoria where accion = 'revision_descartada' and entidad_id = rev::text) = 1, 'El descarte queda registrado');
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

rollback;
