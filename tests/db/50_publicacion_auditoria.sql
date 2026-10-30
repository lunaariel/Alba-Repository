-- Validación de publicación, auditoría automática e inmutable, permisos de la admin.
begin;

-- Un curso sin contenido no se puede publicar.
do $$ begin
  insert into public.cursos (id, slug, titulo, precio_centavos)
  values ('c0000000-0000-0000-0000-000000000099', 'curso-vacio', 'Curso vacío', 0);
  begin
    update public.cursos set estado = 'publicado' where id = 'c0000000-0000-0000-0000-000000000099';
    raise exception 'NO_FALLÓ: publicó un curso vacío';
  exception when others then
    perform pruebas.afirmar(sqlerrm = 'curso_incompleto: precio,lecciones,evaluacion', 'Publicación incompleta bloqueada: ' || sqlerrm);
  end;
end $$;

-- La admin cambia un precio desde el panel: queda auditado.
set local role authenticated;
set local request.jwt.claim.sub = 'adadadad-0000-0000-0000-000000000003';
update public.cursos set precio_centavos = 5900 where id = 'c0000000-0000-0000-0000-000000000001';
select pruebas.afirmar(
  exists (select 1 from public.auditoria where entidad = 'cursos' and accion = 'curso_actualizado'
          and actor_id = 'adadadad-0000-0000-0000-000000000003' and (despues ->> 'precio_centavos')::int = 5900),
  'Cambio de precio auditado con la autora');

-- Ni la admin puede borrar la auditoría.
do $$ begin
  begin
    delete from public.auditoria;
    -- RLS sin política de borrado: no borra nada, pero tampoco debe quedar vacía.
  exception when others then null;
  end;
end $$;
reset role;
select pruebas.afirmar((select count(*) from public.auditoria) > 0, 'La auditoría no se borra');
do $$ begin
  begin
    update public.auditoria set accion = 'alterada';
    raise exception 'NO_FALLÓ: auditoría editada';
  exception when others then perform pruebas.afirmar(sqlerrm = 'auditoria_inmutable', 'Auditoría inmutable: ' || sqlerrm);
  end;
end $$;

-- Un alumno no puede editar cursos ni cambiar precios.
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
update public.cursos set precio_centavos = 1 where id = 'c0000000-0000-0000-0000-000000000001';
reset role;
select pruebas.afirmar((select precio_centavos from public.cursos where id = 'c0000000-0000-0000-0000-000000000001') = 5900,
  'Un alumno no cambia precios');

-- Concesión excepcional: solo admin, con motivo y auditoría.
do $$ declare v uuid; begin
  begin
    perform public.conceder_acceso('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'me lo merezco');
    raise exception 'NO_FALLÓ: un alumno se concedió acceso';
  exception when others then perform pruebas.afirmar(sqlerrm = 'no_autorizado', 'Concesión de alumno bloqueada: ' || sqlerrm);
  end;
  v := public.conceder_acceso('adadadad-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Beca para docente rural');
  perform pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'acceso_concedido' and entidad_id = v::text), 'Concesión auditada');
end $$;

rollback;
