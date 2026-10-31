-- Panel (Fase 5, entrega 1): matriz de permisos y registro de actividad automático.
begin;

-- 1) Alumna A (sin rol admin): no escribe nada de lo que gestiona el panel.
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

do $$
declare intentos text[] := array[
  $q$insert into public.cursos (slug, titulo) values ('pirata', 'Curso pirata')$q$,
  $q$insert into public.modulos (curso_id, titulo, orden) values ('c0000000-0000-0000-0000-000000000001', 'M pirata', 9)$q$,
  $q$insert into public.talleres (slug, titulo, inicia_en, termina_en) values ('pirata', 'Taller pirata', now() + interval '1 day', now() + interval '2 days')$q$,
  $q$insert into public.articulos (slug, titulo) values ('pirata', 'Artículo pirata')$q$,
  $q$insert into public.cupones (codigo, tipo, valor) values ('PIRATA', 'porcentaje', 100)$q$,
  $q$insert into public.plantillas_correo (clave, asunto, cuerpo) values ('pirata', 'a', 'b')$q$,
  $q$insert into public.roles_usuario (perfil_id, rol) values ('aaaaaaaa-0000-0000-0000-000000000001', 'admin')$q$,
  $q$insert into public.accesos_curso (perfil_id, curso_id, origen, motivo) values ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'concesion', 'me lo regalo')$q$,
  $q$select public.registrar_actividad('accion_falsa', 'cursos', 'x')$q$
]; q text;
begin
  foreach q in array intentos loop
    begin
      execute q;
      raise exception 'NO_FALLÓ: %', q;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

-- Las modificaciones no fallan con error, pero no tocan ninguna fila (RLS).
update public.talleres set cupo = 999;
update public.cursos set precio_centavos = 1;
update public.configuracion_academia set whatsapp = '+00000000';
update public.opciones set texto = 'alterada';
delete from public.cursos;
reset role;
select pruebas.afirmar((select cupo from public.talleres where id = '7a000000-0000-0000-0000-000000000001') = 1, 'La alumna no cambia el cupo');
select pruebas.afirmar((select precio_centavos from public.cursos where id = 'c0000000-0000-0000-0000-000000000001') = 4900, 'La alumna no cambia precios');
select pruebas.afirmar((select whatsapp from public.configuracion_academia) is null, 'La alumna no cambia la configuración');
select pruebas.afirmar((select count(*) from public.opciones where texto = 'alterada') = 0, 'La alumna no cambia opciones');
select pruebas.afirmar((select count(*) from public.cursos) = 1, 'La alumna no borra cursos');
select pruebas.afirmar((select count(*) from public.auditoria where actor_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'Los intentos rechazados no dejan actividad falsa');

-- 2) Visitante sin sesión: tampoco.
set local role anon;
do $$ begin
  begin
    perform public.registrar_actividad('accion_falsa', 'cursos', 'x');
    raise exception 'NO_FALLÓ: un visitante registró actividad';
  exception when insufficient_privilege then null;
  end;
end $$;
select pruebas.afirmar((select count(*) from public.auditoria) = 0, 'Un visitante no lee la actividad');
reset role;

-- 3) La admin: sus cambios quedan registrados con su nombre y el antes/después.
set local role authenticated;
set local request.jwt.claim.sub = 'adadadad-0000-0000-0000-000000000003';

update public.talleres set cupo = 12 where id = '7a000000-0000-0000-0000-000000000001';
select pruebas.afirmar(exists (
  select 1 from public.auditoria where accion = 'taller_actualizado' and actor_id = 'adadadad-0000-0000-0000-000000000003'
     and (antes ->> 'cupo')::int = 1 and (despues ->> 'cupo')::int = 12), 'Cambio de cupo registrado con antes y después');

-- Un cambio en una columna no vigilada (descripción) no llena el registro.
update public.talleres set descripcion = 'Nueva descripción' where id = '7a000000-0000-0000-0000-000000000001';
select pruebas.afirmar((select count(*) from public.auditoria where accion = 'taller_actualizado') = 1, 'Editar la descripción no genera ruido');

insert into public.articulos (id, slug, titulo) values ('ab000000-0000-0000-0000-000000000001', 'primer-articulo', 'Primer artículo');
update public.articulos set estado = 'publicado', publicado_en = now() where id = 'ab000000-0000-0000-0000-000000000001';
delete from public.articulos where id = 'ab000000-0000-0000-0000-000000000001';
select pruebas.afirmar((select array_agg(accion order by id) from public.auditoria where entidad = 'articulos')
  = array['articulo_creado','articulo_actualizado','articulo_eliminado'], 'Alta, publicación y baja de un artículo registradas');

update public.configuracion_academia set whatsapp = '+50200000000';
select pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'configuracion_actualizado'
  and antes ->> 'whatsapp' is null and despues ->> 'whatsapp' = '+50200000000'), 'Cambio de configuración registrado');

-- (La columna es_correcta no se lee desde el cliente ni siquiera como admin: se escribe sin leerla.)
-- Desde la migración 0014, una pregunta publicada no cambia (ver 97_versionado); se prueba con una del borrador.
do $$ declare q uuid; o uuid; begin
  q := public.guardar_pregunta('f0000000-0000-0000-0000-000000000001', null, 'Pregunta del borrador', 'multiple', null,
        '[{"texto":"x","es_correcta":true},{"texto":"y","es_correcta":false}]');
  select id into o from public.opciones where pregunta_id = q and texto = 'y';
  update public.opciones set es_correcta = true where id = o;
  perform pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'opcion_actualizado' and entidad_id = o::text),
    'Cambiar la respuesta correcta queda registrado');
end $$;

insert into public.cupones (codigo, tipo, valor) values ('BECA50', 'porcentaje', 50);
select pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'cupon_creado' and despues ->> 'codigo' = 'BECA50'), 'Alta de cupón registrada');

select public.registrar_actividad('inscriptos_exportados', 'talleres', '7a000000-0000-0000-0000-000000000001', '{"filas": 1}');
select pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'inscriptos_exportados'
  and actor_id = 'adadadad-0000-0000-0000-000000000003'), 'Acción del panel registrada con la autora');
do $$ begin
  begin
    perform public.registrar_actividad('Acción con espacios', 'talleres', 'x');
    raise exception 'NO_FALLÓ: acción con nombre inválido';
  exception when others then perform pruebas.afirmar(sqlerrm = 'accion_invalida', 'Nombre de acción validado: ' || sqlerrm);
  end;
end $$;

-- Ni la admin se da roles desde el panel: solo el script del servidor.
do $$ begin
  begin
    insert into public.roles_usuario (perfil_id, rol) values ('bbbbbbbb-0000-0000-0000-000000000002', 'admin');
    raise exception 'NO_FALLÓ: la admin asignó un rol desde el cliente';
  exception when insufficient_privilege then null;
  end;
end $$;
select pruebas.afirmar((select count(*) from public.auditoria) >= 7, 'La admin lee el registro de actividad');
reset role;

-- 4) Asignar el rol admin (script del servidor) queda registrado; el rol alumno de cada registro, no.
set local request.jwt.claim.sub = '';
insert into public.roles_usuario (perfil_id, rol) values ('bbbbbbbb-0000-0000-0000-000000000002', 'admin');
select pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'rol_admin_creado'
  and despues ->> 'perfil_id' = 'bbbbbbbb-0000-0000-0000-000000000002' and actor_id is null), 'Alta de admin registrada (autor: sistema)');
select pruebas.afirmar(not exists (select 1 from public.auditoria where entidad = 'roles_usuario' and despues ->> 'rol' = 'alumno'),
  'El rol alumno automático no llena el registro');

rollback;
