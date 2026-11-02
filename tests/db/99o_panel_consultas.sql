-- Consultas del panel (0030): la lista de alumnos con el estado de cada acceso, solo para la admin.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('30000000-0000-0000-0000-000000000001', 'vigente30@prueba.test', '{"nombre_completo": "Ana Vigente", "confirma_mayoria_edad": true}'),
  ('30000000-0000-0000-0000-000000000002', 'pronto30@prueba.test', '{"nombre_completo": "Berta Pronto", "confirma_mayoria_edad": true}'),
  ('30000000-0000-0000-0000-000000000003', 'sinfin30@prueba.test', '{"nombre_completo": "Carla Sinfin", "confirma_mayoria_edad": true}');
do $$
declare C constant uuid := 'c0000000-0000-0000-0000-000000000001'; r jsonb;
begin
  perform public.agregar_periodo('30000000-0000-0000-0000-000000000001', C, 'beca', null, null, now() + interval '90 days', null, false, '{"regla": "beca_con_fin"}', null, 'Prueba del panel 1', 'Prueba', null);
  perform public.agregar_periodo('30000000-0000-0000-0000-000000000002', C, 'beca', null, null, now() + interval '10 days', null, false, '{"regla": "beca_con_fin"}', null, 'Prueba del panel 2', 'Prueba', null);
  perform public.agregar_periodo('30000000-0000-0000-0000-000000000003', C, 'beca', null, null, null, null, true, '{"regla": "beca_sin_vencimiento"}', null, 'Prueba del panel 3', 'Prueba', null);
end $$;

-- Una alumna no puede usarla.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
do $$ declare e text;
begin
  begin perform public.panel_alumnos(); e := 'no falló'; exception when others then e := sqlerrm; end;
  perform pruebas.afirmar(e = 'no_autorizado', 'Una alumna no consulta la lista de alumnos: ' || e);
end $$;
-- La admin sí, con el estado de cada acceso.
select set_config('request.jwt.claim.sub', 'adadadad-0000-0000-0000-000000000003', true);
select pruebas.afirmar((select cursos -> 0 ->> 'estado' from public.panel_alumnos('Ana Vigente')) = 'vigente', 'Acceso vigente');
select pruebas.afirmar((select cursos -> 0 ->> 'estado' from public.panel_alumnos('pronto30')) = 'vence_pronto', 'Busca por correo y marca «vence pronto»');
select pruebas.afirmar((select (cursos -> 0 ->> 'estado') || coalesce(cursos -> 0 ->> 'fin', 'sin fin') from public.panel_alumnos('Carla')) = 'sin_vencimientosin fin', 'Sin vencimiento');
select pruebas.afirmar((select count(*) from public.panel_alumnos(null, 'vencen_pronto') where nombre = 'Berta Pronto') = 1
  and (select count(*) from public.panel_alumnos(null, 'vencen_pronto') where nombre = 'Ana Vigente') = 0, 'El filtro «vencen pronto» separa');
select pruebas.afirmar((select count(*) from public.panel_alumnos(null, 'vigentes') where nombre in ('Ana Vigente', 'Berta Pronto', 'Carla Sinfin')) = 3, '«Vigentes» incluye las tres');
select pruebas.afirmar((select count(*) from public.panel_alumnos() where nombre = 'Maestra') = 0, 'La lista no incluye cuentas admin');
do $$ declare e text;
begin
  begin perform public.panel_alumnos(null, 'otro'); e := 'no falló'; exception when others then e := sqlerrm; end;
  perform pruebas.afirmar(e = 'filtro_invalido', 'Filtro inválido: ' || e);
end $$;
reset role;
-- Vencido: se envejece el período de Berta.
alter table public.periodos_acceso disable trigger periodos_inmutables;
update public.periodos_acceso set inicia_en = inicia_en - interval '1 year', vence_en = vence_en - interval '1 year' where perfil_id = '30000000-0000-0000-0000-000000000002';
alter table public.periodos_acceso enable trigger periodos_inmutables;
set local role authenticated;
select pruebas.afirmar((select cursos -> 0 ->> 'estado' from public.panel_alumnos('Berta')) = 'vencido', 'Acceso vencido');
select pruebas.afirmar((select count(*) from public.panel_alumnos(null, 'vencidos') where nombre = 'Berta Pronto') = 1, 'El filtro «vencidos» la muestra');
reset role;
-- El campus de cada persona: solo sus fines de cobertura; sin vencimiento → null.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select pruebas.afirmar((select count(*) from public.mis_fines_cobertura()) = 1 and (select fin > now() + interval '80 days' from public.mis_fines_cobertura()),
  'Ana ve solo su curso, con su fin de cobertura');
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
select pruebas.afirmar((select fin is null from public.mis_fines_cobertura()), 'Sin vencimiento: fin nulo');
select set_config('request.jwt.claim.sub', 'adadadad-0000-0000-0000-000000000003', true);
select pruebas.afirmar((select count(*) from public.mis_fines_cobertura()) = 0, 'La admin, en su campus, no ve fines de otras personas');
reset role;
rollback;
