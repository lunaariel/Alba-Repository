-- Evaluación corregida en el servidor y certificado con sus tres condiciones.
begin;

do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  B constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  CURSO constant uuid := 'c0000000-0000-0000-0000-000000000001';
  EVAL constant uuid := 'f0000000-0000-0000-0000-000000000001';
  r jsonb; c1 uuid; c2 uuid;
begin
  -- Sin acceso no se puede rendir.
  begin
    perform public.corregir_evaluacion(B, EVAL, '{}');
    raise exception 'NO_FALLÓ: rindió sin acceso';
  exception when others then perform pruebas.afirmar(sqlerrm = 'sin_acceso', 'Evaluación sin acceso bloqueada: ' || sqlerrm);
  end;

  -- Certificado bloqueado: lecciones pendientes.
  begin
    perform public.emitir_certificado(A, CURSO);
    raise exception 'NO_FALLÓ: certificado con lecciones pendientes';
  exception when others then perform pruebas.afirmar(sqlerrm like 'lecciones_pendientes%', 'Bloqueado por lecciones: ' || sqlerrm);
  end;

  -- A completa las dos lecciones (acción explícita).
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values
    (A, 'e0000000-0000-0000-0000-000000000001', now()),
    (A, 'e0000000-0000-0000-0000-000000000002', now());

  -- Certificado bloqueado: evaluación no aprobada.
  begin
    perform public.emitir_certificado(A, CURSO);
    raise exception 'NO_FALLÓ: certificado sin evaluación';
  exception when others then perform pruebas.afirmar(sqlerrm = 'evaluacion_no_aprobada', 'Bloqueado por evaluación: ' || sqlerrm);
  end;

  -- Intento 1: la múltiple incompleta → 50 %, desaprobado.
  r := public.corregir_evaluacion(A, EVAL, jsonb_build_object(
        'a1000000-0000-0000-0000-000000000001', jsonb_build_array('a2000000-0000-0000-0000-000000000011'),
        'a1000000-0000-0000-0000-000000000002', jsonb_build_array('a2000000-0000-0000-0000-000000000021')));
  perform pruebas.afirmar((r ->> 'puntaje')::int = 50 and not (r ->> 'aprobado')::boolean, 'Intento parcial: 50 % desaprobado → ' || r::text);
  perform pruebas.afirmar((r ->> 'intentos_restantes')::int = 2, 'Quedan 2 intentos');

  -- Intento 2: opción de otra pregunta inyectada → se ignora; única con dos marcadas → incorrecta.
  r := public.corregir_evaluacion(A, EVAL, jsonb_build_object(
        'a1000000-0000-0000-0000-000000000001', jsonb_build_array('a2000000-0000-0000-0000-000000000011', 'a2000000-0000-0000-0000-000000000012'),
        'a1000000-0000-0000-0000-000000000002', jsonb_build_array('a2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000022', 'a2000000-0000-0000-0000-000000000011')));
  perform pruebas.afirmar((r ->> 'puntaje')::int = 50, 'Única con dos marcas es incorrecta; opción ajena ignorada → ' || r::text);

  -- Intento 3: todo correcto → aprobado.
  r := public.corregir_evaluacion(A, EVAL, jsonb_build_object(
        'a1000000-0000-0000-0000-000000000001', jsonb_build_array('a2000000-0000-0000-0000-000000000011'),
        'a1000000-0000-0000-0000-000000000002', jsonb_build_array('a2000000-0000-0000-0000-000000000022', 'a2000000-0000-0000-0000-000000000021')));
  perform pruebas.afirmar((r ->> 'aprobado')::boolean and (r ->> 'puntaje')::int = 100, 'Aprobado con 100 → ' || r::text);

  -- Intento 4: superó el límite de 3.
  begin
    perform public.corregir_evaluacion(A, EVAL, '{}');
    raise exception 'NO_FALLÓ: cuarto intento';
  exception when others then perform pruebas.afirmar(sqlerrm = 'sin_intentos', 'Límite de intentos respetado: ' || sqlerrm);
  end;
  perform pruebas.afirmar((select count(*) from public.intentos_evaluacion where perfil_id = A) = 3, 'Se registraron 3 intentos');

  -- Certificado: se emite y regenerar devuelve el mismo.
  c1 := public.emitir_certificado(A, CURSO);
  c2 := public.emitir_certificado(A, CURSO);
  perform pruebas.afirmar(c1 is not null and c1 = c2, 'Un solo certificado por alumno y curso');
  perform pruebas.afirmar((select nombre_en_certificado from public.certificados where id = c1) = 'Alumna A', 'Nombre congelado en el certificado');
end $$;

rollback;
