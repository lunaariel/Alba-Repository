-- D10: medición de seguimiento_curso con datos sintéticos (no corre en la verificación automática).
-- Uso: sobre una base de pruebas con las migraciones y tests/db/00_ayudas.sql (por ejemplo la de probar-db.sh):
--   psql -d albor_pruebas -v n=2000 -f tests/rendimiento/seguimiento_curso.sql
-- Todo ocurre en una transacción que se deshace al final.
begin;
insert into auth.users (id, email, raw_user_meta_data)
select gen_random_uuid(), 'sintetica' || g || '@prueba.test', '{"nombre_completo": "Persona sintética", "confirma_mayoria_edad": true}'
  from generate_series(1, :n) g;
insert into public.accesos_curso (perfil_id, curso_id, origen, motivo)
select u.id, 'c0000000-0000-0000-0000-000000000001', 'concesion', 'Medición D10' from auth.users u where u.email like 'sintetica%';
insert into public.progreso_leccion (perfil_id, leccion_id, completada_en)
select u.id, 'e0000000-0000-0000-0000-000000000001', now() from auth.users u where u.email like 'sintetica%';
analyze;
select set_config('request.jwt.claim.sub', 'adadadad-0000-0000-0000-000000000003', true);
\timing on
select count(*) as filas from public.seguimiento_curso('c0000000-0000-0000-0000-000000000001');
select count(*) as filas from public.seguimiento_curso('c0000000-0000-0000-0000-000000000001');
\timing off
rollback;
