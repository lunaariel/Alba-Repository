-- Perfil (0022): área laboral y estudios opcionales, protegidos por RLS.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.perfiles set area_laboral = 'Docente de nivel inicial', estudios = 'Profesorado en educación inicial' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pruebas.afirmar((select area_laboral from public.perfiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Docente de nivel inicial', 'La persona guarda su área laboral');
-- Otra persona no lee ni modifica esos datos.
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pruebas.afirmar((select count(*) from public.perfiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'Otra persona no lee el perfil ajeno');
update public.perfiles set estudios = 'Intrusión' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;
select pruebas.afirmar((select estudios from public.perfiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Profesorado en educación inicial', 'Otra persona no modifica el perfil ajeno');
set local role anon;
select pruebas.afirmar((select count(*) from public.perfiles) = 0, 'Un visitante no lee perfiles');
reset role;
-- Son opcionales: vacíos no impiden nada; textos de un solo carácter no se aceptan.
do $$ begin
  update public.perfiles set area_laboral = 'x' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  raise exception 'debió fallar';
exception when check_violation then null;
end $$;
select pruebas.afirmar((select count(*) from public.perfiles where area_laboral is null) >= 1, 'Los datos son opcionales');
rollback;
