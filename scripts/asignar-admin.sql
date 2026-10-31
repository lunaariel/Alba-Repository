-- Asigna el rol admin a una cuenta existente, por correo. Queda en la auditoría.
-- Uso (con la clave de servicio o desde psql contra la base):
--   psql "$URL_BASE" -v ON_ERROR_STOP=1 -v correo="'maestra@ejemplo.com'" -f scripts/asignar-admin.sql
begin;

create temp table _correo_admin (correo text not null) on commit drop;
insert into _correo_admin values (lower(btrim(:correo)));

do $$ begin
  if not exists (select 1 from auth.users u join _correo_admin c on lower(u.email) = c.correo) then
    raise exception 'No hay ninguna cuenta con ese correo. Primero debe registrarse en el sitio.';
  end if;
end $$;

insert into public.roles_usuario (perfil_id, rol)
select u.id, 'admin' from auth.users u join _correo_admin c on lower(u.email) = c.correo
on conflict (perfil_id, rol) do nothing;

-- La auditoría la escribe el disparador roles_auditar_alta (migración 0012).

commit;
