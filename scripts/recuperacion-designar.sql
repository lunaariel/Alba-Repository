-- Designa (o retira) a una persona en el procedimiento de recuperación administrativa (migración 0027).
-- Lo ejecuta quien tenga acceso de dueño a la base, con autorización de la titular. Cada persona usa SU PROPIA
-- conexión a la base (usuario de base de datos individual, con contraseña propia): así la solicitud y la
-- aprobación las hacen dos identidades distintas.
--   psql "$URL_BASE" -v ON_ERROR_STOP=1 -v usuario_bd="'nombre_usuario_bd'" -v rol="'albor_recuperacion_tecnico'" \
--        -v accion="'designar'" -v responsable="'Quien autoriza'" -f scripts/recuperacion-designar.sql
-- rol: albor_recuperacion_tecnico (responsable técnico) o albor_recuperacion_aprobador (persona o autoridad
-- independiente). Una misma persona no puede tener los dos roles.
-- PENDIENTE (titular): identificar al responsable técnico y a la persona o autoridad independiente.
begin;
create temp table _designacion (usuario text, rol text, accion text, responsable text) on commit drop;
insert into _designacion values (btrim(:usuario_bd), btrim(:rol), btrim(:accion), btrim(:responsable));
do $$
declare d _designacion%rowtype; otro text;
begin
  select * into d from _designacion;
  if d.rol not in ('albor_recuperacion_tecnico', 'albor_recuperacion_aprobador') then raise exception 'rol_invalido'; end if;
  if d.accion not in ('designar', 'retirar') then raise exception 'accion_invalida'; end if;
  if char_length(coalesce(d.responsable, '')) < 3 then raise exception 'responsable_requerido'; end if;
  if not exists (select 1 from pg_roles where rolname = d.usuario and rolcanlogin) then raise exception 'usuario_bd_inexistente: cree primero el usuario individual de base de datos'; end if;
  otro := case d.rol when 'albor_recuperacion_tecnico' then 'albor_recuperacion_aprobador' else 'albor_recuperacion_tecnico' end;
  if d.accion = 'designar' then
    if pg_has_role(d.usuario, otro, 'MEMBER') and exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member where r.rolname = otro and u.rolname = d.usuario) then
      raise exception 'roles_incompatibles: esa persona ya tiene el otro rol del procedimiento';
    end if;
    execute format('grant %I to %I', d.rol, d.usuario);
  else
    execute format('revoke %I from %I', d.rol, d.usuario);
  end if;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (null, 'recuperacion_mfa_' || d.accion, 'seguridad', d.usuario, jsonb_build_object('rol', d.rol, 'responsable', d.responsable));
end $$;
commit;
