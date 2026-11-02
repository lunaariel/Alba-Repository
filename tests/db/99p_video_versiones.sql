-- Video y versiones académicas (0028): quien sigue la versión 1 conserva el video de una lección que la versión 2
-- retiró; quien entra en la versión 2 no lo recibe. Cambiar de versión cambia también los videos autorizados.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('2b000000-0000-0000-0000-000000000001', 'v2@prueba.test', '{"nombre_completo": "Alumna Versión Dos", "confirma_mayoria_edad": true}');
do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  N constant uuid := '2b000000-0000-0000-0000-000000000001';
  ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003';
  CURSO constant uuid := 'c0000000-0000-0000-0000-000000000001';
  L2 constant uuid := 'e0000000-0000-0000-0000-000000000002';
  v1 uuid; v2 uuid;
begin
  v1 := public.version_de(A, CURSO);
  perform pruebas.afirmar(v1 is not null and public.autorizar_video_leccion(A, L2) ->> 'estado' = 'autorizado', 'A, en la versión 1, ve el video de la lección 2');
  -- La maestra retira la lección 2 del borrador y publica la versión 2.
  update public.lecciones set retirada = true where id = L2;
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  v2 := public.publicar_version(CURSO, 'Retira la lección 2');
  perform set_config('request.jwt.claim.sub', '', true);
  perform pruebas.afirmar(public.version_de(A, CURSO) = v1, 'A sigue en la versión 1');
  perform pruebas.afirmar(public.autorizar_video_leccion(A, L2) ->> 'estado' = 'autorizado', 'A conserva el video de la lección retirada en la versión 2');
  -- N entra con la versión vigente (2): esa lección no es de su versión.
  insert into public.accesos_curso (perfil_id, curso_id, origen, motivo) values (N, CURSO, 'concesion', 'Prueba de versiones y video');
  perform pruebas.afirmar(public.version_de(N, CURSO) = v2, 'N está en la versión 2');
  perform pruebas.afirmar(public.autorizar_video_leccion(N, L2) ->> 'estado' = 'fuera_de_su_version', 'N no recibe el video de una lección que su versión no incluye');
  perform pruebas.afirmar(public.autorizar_video_leccion(N, 'e0000000-0000-0000-0000-000000000001') ->> 'estado' = 'autorizado', 'N sí ve las lecciones de su versión');
end $$;
rollback;
