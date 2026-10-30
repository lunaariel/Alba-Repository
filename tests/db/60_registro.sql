-- Registro: el perfil y el rol alumno se crean solos; sin mayoría de edad no hay cuenta.
begin;
select pruebas.afirmar((select count(*) from public.roles_usuario where rol = 'alumno') = 3, 'Toda cuenta nueva recibe el rol alumno');
select pruebas.afirmar((select zona_horaria from public.perfiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'America/Guatemala', 'Zona horaria por defecto: Guatemala');
select pruebas.afirmar(exists (select 1 from public.consentimientos where perfil_id = 'bbbbbbbb-0000-0000-0000-000000000002' and otorgado),
  'El consentimiento promocional se registra solo si se marcó');
select pruebas.afirmar(not exists (select 1 from public.consentimientos where perfil_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'Sin marcar, no hay consentimiento promocional');
do $$ begin
  begin
    insert into auth.users (email, raw_user_meta_data) values ('menor@prueba.test', '{"nombre_completo": "Sin confirmar"}');
    raise exception 'NO_FALLÓ: cuenta creada sin confirmar mayoría de edad';
  exception when others then
    perform pruebas.afirmar(sqlerrm = 'registro_requiere_mayoria_de_edad', 'Registro sin mayoría de edad rechazado: ' || sqlerrm);
  end;
end $$;
rollback;
