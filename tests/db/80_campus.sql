-- Campus: acceso que no vence, evaluación con lecciones completas y verificación de certificados.
begin;

-- Archivar el curso no le quita el contenido a quien lo compró.
update public.cursos set estado = 'archivado' where id = 'c0000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pruebas.afirmar((select count(*) from public.cursos where id = 'c0000000-0000-0000-0000-000000000001') = 1, 'A sigue viendo el curso archivado que compró');
select pruebas.afirmar((select count(*) from public.lecciones) = 2, 'A sigue viendo las lecciones del curso archivado');
select pruebas.afirmar((select count(*) from public.modulos) = 1, 'A sigue viendo los módulos del curso archivado');

-- Con lecciones pendientes, las preguntas no se muestran.
select pruebas.afirmar(public.lecciones_pendientes('c0000000-0000-0000-0000-000000000001') = 2, 'A tiene 2 lecciones pendientes');
select pruebas.afirmar((select count(*) from public.preguntas) = 0, 'Sin completar las lecciones, A no ve las preguntas');
select pruebas.afirmar((select count(*) from public.opciones) = 0, 'Sin completar las lecciones, A no ve las opciones');

-- A no puede leer el id del video ni la respuesta correcta, aun con acceso.
do $$ begin
  begin
    perform video_id from public.lecciones limit 1;
    raise exception 'NO_FALLÓ: A leyó video_id';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A completa las lecciones (lo hace ella misma, por RLS).
insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', now());
select pruebas.afirmar((select count(*) from public.preguntas) = 2, 'Con las lecciones completas, A ve las 2 preguntas');
select pruebas.afirmar((select count(*) from public.opciones) = 5, 'Y sus opciones (sin la marca de correcta)');
do $$ begin
  begin
    perform es_correcta from public.opciones limit 1;
    raise exception 'NO_FALLÓ: A leyó es_correcta';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A puede desmarcar una lección, pero no borrar su progreso.
update public.progreso_leccion set completada_en = null where leccion_id = 'e0000000-0000-0000-0000-000000000002';
delete from public.progreso_leccion;
select pruebas.afirmar((select count(*) from public.progreso_leccion) = 2, 'El progreso no se borra desde el navegador');

-- B, sin acceso, no ve el curso archivado.
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pruebas.afirmar((select count(*) from public.cursos) = 0, 'B no ve el curso archivado');
select pruebas.afirmar((select count(*) from public.lecciones) = 0, 'B no ve sus lecciones');
reset role;

-- El servidor tampoco corrige con lecciones pendientes (la 2 quedó desmarcada).
do $$
declare r jsonb;
begin
  begin
    perform public.corregir_evaluacion('aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '{}');
    raise exception 'NO_FALLÓ: corrigió con lecciones pendientes';
  exception when others then perform pruebas.afirmar(sqlerrm like 'lecciones_pendientes%', 'Evaluación bloqueada por lecciones: ' || sqlerrm);
  end;

  update public.progreso_leccion set completada_en = now()
   where perfil_id = 'aaaaaaaa-0000-0000-0000-000000000001' and leccion_id = 'e0000000-0000-0000-0000-000000000002';

  -- Texto que no es uuid: se descarta sin error.
  r := public.corregir_evaluacion('aaaaaaaa-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
        jsonb_build_object('a1000000-0000-0000-0000-000000000001', jsonb_build_array('no-es-uuid', 'a2000000-0000-0000-0000-000000000011'),
                           'a1000000-0000-0000-0000-000000000002', jsonb_build_array('a2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000022')));
  perform pruebas.afirmar((r ->> 'aprobado')::boolean, 'Aprobado ignorando el texto inválido → ' || r::text);
  perform public.emitir_certificado('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001');
end $$;

-- Verificación pública del certificado.
create temp table cert_codigo as select codigo_verificacion as c from public.certificados limit 1;
grant select on cert_codigo to anon;
set local role anon;
select pruebas.afirmar((public.verificar_certificado((select c from cert_codigo)) ->> 'nombre') = 'Alumna A', 'El código verifica el certificado');
select pruebas.afirmar((public.verificar_certificado(lower((select c from cert_codigo))) ->> 'curso') = 'Montessori en casa', 'El código no distingue mayúsculas');
select pruebas.afirmar(public.verificar_certificado('NOEXISTE0000') is null, 'Código inexistente: nada');
select pruebas.afirmar(public.verificar_certificado('') is null, 'Código vacío: nada');
select pruebas.afirmar((select count(*) from public.certificados) = 0, 'El visitante no lista certificados');
reset role;

rollback;
