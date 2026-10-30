-- Un alumno no puede ver ni tocar datos de otro, ni contenidos pagos sin acceso.
begin;

-- Alumno B (sin acceso al curso)
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';

select pruebas.afirmar((select count(*) from public.accesos_curso) = 0, 'B no ve los accesos de A');
select pruebas.afirmar((select count(*) from public.ordenes) = 0, 'B no ve las órdenes de A');
select pruebas.afirmar((select count(*) from public.pagos) = 0, 'B no ve los pagos de A');
select pruebas.afirmar((select count(*) from public.perfiles) = 1, 'B solo ve su propio perfil');
select pruebas.afirmar((select count(*) from public.recursos_leccion) = 0, 'B no ve los PDF de un curso que no compró');
select pruebas.afirmar((select count(*) from public.preguntas) = 0, 'B no ve la evaluación de un curso que no compró');
select pruebas.afirmar((select count(*) from public.reuniones) = 0, 'B no ve enlaces de talleres a los que no se inscribió');
select pruebas.afirmar((select count(*) from public.auditoria) = 0, 'Un alumno no lee la auditoría');
select pruebas.afirmar((select count(*) from public.lecciones) = 2, 'Los títulos de lecciones de un curso publicado son públicos');

-- B no puede registrar progreso en un curso sin acceso.
do $$ begin
  begin
    insert into public.progreso_leccion (perfil_id, leccion_id, completada_en)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', now());
    raise exception 'NO_FALLÓ: B registró progreso sin acceso';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B no puede hacerse pasar por A.
do $$ begin
  begin
    insert into public.progreso_leccion (perfil_id, leccion_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001');
    raise exception 'NO_FALLÓ: B escribió progreso a nombre de A';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B no puede darse el rol admin.
do $$ begin
  begin
    insert into public.roles_usuario (perfil_id, rol) values ('bbbbbbbb-0000-0000-0000-000000000002', 'admin');
    raise exception 'NO_FALLÓ: B se asignó admin';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B no puede concederse acceso ni llamar a las funciones del servidor.
do $$ begin
  begin
    insert into public.accesos_curso (perfil_id, curso_id, origen, motivo)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'concesion', 'me lo regalo');
    raise exception 'NO_FALLÓ: B se concedió acceso';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.emitir_certificado('bbbbbbbb-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001');
    raise exception 'NO_FALLÓ: B ejecutó emitir_certificado';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.crear_orden('bbbbbbbb-0000-0000-0000-000000000002', 'curso', 'c0000000-0000-0000-0000-000000000001');
    raise exception 'NO_FALLÓ: B ejecutó crear_orden';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Columnas protegidas: id del video privado y respuesta correcta.
do $$ declare v text; b boolean; begin
  begin
    select video_id into v from public.lecciones limit 1;
    raise exception 'NO_FALLÓ: un alumno leyó video_id';
  exception when insufficient_privilege then null;
  end;
  begin
    select es_correcta into b from public.opciones limit 1;
    raise exception 'NO_FALLÓ: un alumno leyó es_correcta';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Alumna A (con acceso)
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pruebas.afirmar((select count(*) from public.accesos_curso) = 1, 'A ve su acceso');
select pruebas.afirmar((select count(*) from public.recursos_leccion) = 1, 'A ve los PDF de su curso');
select pruebas.afirmar((select count(*) from public.opciones) = 0, 'A no ve las opciones hasta completar las lecciones (ver 80_campus)');
select pruebas.afirmar((select count(*) from public.roles_usuario where rol = 'admin') = 0, 'A no ve roles de otros');
insert into public.progreso_leccion (perfil_id, leccion_id, completada_en)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', now());
select pruebas.afirmar((select count(*) from public.progreso_leccion) = 1, 'A registra progreso en su curso');

-- A tampoco puede leer el enlace de anfitrión aunque se inscriba (prueba en 40_talleres).

-- Visitante sin sesión
set local role anon;
set local request.jwt.claim.sub = '';
select pruebas.afirmar((select count(*) from public.cursos) = 1, 'Un visitante ve el curso publicado');
select pruebas.afirmar((select count(*) from public.recursos_leccion) = 0, 'Un visitante no ve PDF');
select pruebas.afirmar((select count(*) from public.ordenes) = 0, 'Un visitante no ve órdenes');

-- Admin
set local role authenticated;
set local request.jwt.claim.sub = 'adadadad-0000-0000-0000-000000000003';
select pruebas.afirmar((select count(*) from public.ordenes) >= 1, 'La admin ve todas las órdenes');
select pruebas.afirmar((select count(*) from public.perfiles) = 3, 'La admin ve todos los perfiles');

rollback;
