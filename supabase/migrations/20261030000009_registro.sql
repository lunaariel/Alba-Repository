-- Albor · 0009 · Registro
-- El perfil se crea en la base de datos al crearse la cuenta en Supabase Auth, con los datos
-- enviados en el registro (options.data). Sin confirmación de mayoría de edad, la cuenta no se crea.

create or replace function public.crear_perfil_desde_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := btrim(coalesce(new.raw_user_meta_data ->> 'nombre_completo', ''));
  v_mayor boolean := coalesce((new.raw_user_meta_data ->> 'confirma_mayoria_edad')::boolean, false);
begin
  if not v_mayor then
    raise exception 'registro_requiere_mayoria_de_edad' using errcode = 'P0001';
  end if;
  if char_length(v_nombre) < 2 then
    raise exception 'registro_requiere_nombre' using errcode = 'P0001';
  end if;
  insert into public.perfiles (id, nombre_completo, confirma_mayoria_edad, zona_horaria, pais)
  values (
    new.id, v_nombre, true,
    coalesce(nullif(new.raw_user_meta_data ->> 'zona_horaria', ''), 'America/Guatemala'),
    nullif(upper(new.raw_user_meta_data ->> 'pais'), '')
  );
  if coalesce((new.raw_user_meta_data ->> 'acepta_promociones')::boolean, false) then
    insert into public.consentimientos (perfil_id, tipo, otorgado, origen) values (new.id, 'promocional', true, 'registro');
  end if;
  return new;
end;
$$;

create trigger auth_crear_perfil
  after insert on auth.users
  for each row execute function public.crear_perfil_desde_auth();
