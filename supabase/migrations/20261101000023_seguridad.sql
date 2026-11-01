-- Seguridad (Jornada autónoma, bloque H). SOLO entornos locales o de prueba: no autorizada en producción.
--
-- 1. Responsable real de los cambios de rol admin: un alta o baja de admin hecha por un script del servidor
--    (sin sesión) exige identificar a la persona que lo ejecuta (albor.responsable). Queda en la auditoría.
--    No quita ningún rol existente: las cuentas actuales conservan su acceso.
-- 2. faltantes_publicacion deja de ser ejecutable por sesiones de alumnos (exponía el estado de borradores).

-- ============================================================ 1. Responsable de los cambios de rol
create or replace function public.exigir_responsable_rol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol text := coalesce(new.rol, old.rol); v_responsable text := btrim(coalesce(current_setting('albor.responsable', true), ''));
begin
  -- El rol alumno automático de cada registro no requiere responsable.
  if v_rol <> 'admin' then return coalesce(new, old); end if;
  if auth.uid() is null and char_length(v_responsable) < 3 then
    raise exception 'responsable_requerido' using errcode = 'P0001',
      hint = 'Ejecute el script con -v responsable="''Nombre o correo de quien lo hace''"';
  end if;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), case when tg_op = 'INSERT' then 'rol_admin_responsable_alta' else 'rol_admin_responsable_baja' end, 'roles_usuario',
          coalesce(new.perfil_id, old.perfil_id)::text,
          jsonb_build_object('rol', v_rol, 'perfil_id', coalesce(new.perfil_id, old.perfil_id),
                             'responsable', case when auth.uid() is not null then auth.uid()::text else v_responsable end,
                             'via', case when auth.uid() is not null then 'sesion' else 'script_servidor' end));
  return coalesce(new, old);
end; $$;
create trigger roles_responsable before insert or delete on public.roles_usuario
  for each row execute function public.exigir_responsable_rol();

-- ============================================================ 2. Estado de borradores solo para el servidor
revoke execute on function public.faltantes_publicacion(uuid) from authenticated;
grant execute on function public.faltantes_publicacion(uuid) to service_role;
