-- Ayudas y datos fijos para las pruebas. Se ejecuta primero.
create schema if not exists pruebas;
grant usage on schema pruebas to anon, authenticated, service_role;

create or replace function pruebas.afirmar(condicion boolean, mensaje text)
returns void language plpgsql as $$
begin
  if condicion is distinct from true then
    raise exception 'AFIRMACIÓN FALLIDA: %', mensaje;
  end if;
end; $$;
grant execute on function pruebas.afirmar(boolean, text) to anon, authenticated, service_role;

-- Personas: A y B alumnos, M la maestra (admin).
-- Los perfiles los crea el disparador de registro (migración 0009).
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@prueba.test', '{"nombre_completo": "Alumna A", "confirma_mayoria_edad": true}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@prueba.test', '{"nombre_completo": "Alumno B", "confirma_mayoria_edad": true, "acepta_promociones": true}'),
  ('adadadad-0000-0000-0000-000000000003', 'maestra@prueba.test', '{"nombre_completo": "Maestra", "confirma_mayoria_edad": true}');
insert into public.roles_usuario (perfil_id, rol) values ('adadadad-0000-0000-0000-000000000003', 'admin');

-- Curso con 1 módulo, 2 lecciones, 1 PDF y evaluación de 2 preguntas.
insert into public.cursos (id, slug, titulo, precio_centavos) values
  ('c0000000-0000-0000-0000-000000000001', 'montessori-en-casa', 'Montessori en casa', 4900);
insert into public.modulos (id, curso_id, titulo, orden) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Módulo 1', 0);
insert into public.lecciones (id, modulo_id, titulo, video_id, orden) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Lección 1', 'bunny-video-1', 0),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'Lección 2', 'bunny-video-2', 1);
insert into public.recursos_leccion (leccion_id, titulo, ruta_almacenamiento, tipo_mime, tamano_bytes) values
  ('e0000000-0000-0000-0000-000000000001', 'Guía', 'cursos/c1/guia.pdf', 'application/pdf', 1000);
insert into public.evaluaciones (id, curso_id, puntaje_minimo, intentos_permitidos) values
  ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 100, 3);
insert into public.preguntas (id, evaluacion_id, enunciado, tipo, orden) values
  ('a1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '¿Pregunta única?', 'unica', 0),
  ('a1000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', '¿Pregunta múltiple?', 'multiple', 1);
insert into public.opciones (id, pregunta_id, texto, es_correcta, orden) values
  ('a2000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', 'Correcta', true, 0),
  ('a2000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000001', 'Incorrecta', false, 1),
  ('a2000000-0000-0000-0000-000000000021', 'a1000000-0000-0000-0000-000000000002', 'Correcta 1', true, 0),
  ('a2000000-0000-0000-0000-000000000022', 'a1000000-0000-0000-0000-000000000002', 'Correcta 2', true, 1),
  ('a2000000-0000-0000-0000-000000000023', 'a1000000-0000-0000-0000-000000000002', 'Incorrecta', false, 2);
update public.cursos set estado = 'publicado' where id = 'c0000000-0000-0000-0000-000000000001';

-- Taller con cupo de 1 lugar.
insert into public.talleres (id, slug, titulo, inicia_en, termina_en, cupo, precio_centavos, estado) values
  ('7a000000-0000-0000-0000-000000000001', 'taller-prueba', 'Taller de prueba',
   now() + interval '7 days', now() + interval '7 days 1 hour', 1, 1500, 'publicado');
insert into public.reuniones (taller_id, proveedor, enlace_participante, enlace_anfitrion) values
  ('7a000000-0000-0000-0000-000000000001', 'manual', 'https://reunion.test/participante', 'https://reunion.test/anfitrion');

-- Duración comercial del curso (migración 0019): sin ella no se vende. Condicional, porque algunos
-- ensayos de migración cargan estas ayudas sobre una base anterior.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cursos' and column_name = 'duracion_comercial_meses') then
    update public.cursos set duracion_comercial_meses = 3 where id = 'c0000000-0000-0000-0000-000000000001';
  end if;
end $$;

-- A compra el curso (vía las funciones del servidor). B no tiene acceso.
do $$
declare v_orden uuid;
begin
  v_orden := public.crear_orden('aaaaaaaa-0000-0000-0000-000000000001', 'curso', 'c0000000-0000-0000-0000-000000000001');
  perform public.procesar_evento_pago('simulado', 'fixture-evt-1', 'pago', '{}'::jsonb, v_orden, 'fixture-pago-1', 'aprobado', 4900);
end $$;
