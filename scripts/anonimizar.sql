-- Reemplaza los datos personales de una copia restaurada antes de usarla en un entorno de prueba menos seguro.
-- Conserva la estructura, los identificadores y los vínculos (accesos, intentos, certificados), no las personas.
-- SOLO sobre copias: se niega si la base se llama como una base real conocida.
do $$ begin
  if current_database() in ('postgres') then raise exception 'anonimizar se usa solo sobre copias restauradas con nombre propio'; end if;
end $$;
begin;
set local session_replication_role = replica;   -- sin disparadores de inmutabilidad ni auditoría en la copia
update auth.users set email = 'persona-' || left(md5(id::text), 10) || '@albor.invalid',
                      raw_user_meta_data = jsonb_build_object('nombre_completo', 'Persona ' || left(md5(id::text), 6), 'confirma_mayoria_edad', true);
update public.perfiles set nombre_completo = 'Persona ' || left(md5(id::text), 6), area_laboral = null, estudios = null;
update public.mensajes_contacto set nombre = 'Persona', correo = 'contacto@albor.invalid', mensaje = '(mensaje anonimizado)';
update public.certificados set nombre_en_certificado = 'Persona ' || left(md5(perfil_id::text), 6);
commit;
