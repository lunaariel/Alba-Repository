-- Reversión de 20261101000023_seguridad. SOLO entornos locales o de prueba.
-- No borra auditoría: los registros de responsables quedan.
drop trigger roles_responsable on public.roles_usuario;
drop function public.exigir_responsable_rol();
grant execute on function public.faltantes_publicacion(uuid) to authenticated;
