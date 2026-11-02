-- Reversión de 20261103000028_video_correo. SOLO entornos locales o de prueba.
-- Se niega si la cola tiene correos con los estados o datos nuevos (se perderían).
do $$ begin
  if exists (select 1 from public.envios_correo where estado not in ('pendiente', 'enviado', 'fallido') or intentos > 0 or variables <> '{}'::jsonb) then
    raise exception 'reversion_imposible: hay correos registrados con la cola de 0028';
  end if;
end $$;
drop trigger ordenes_correo_confirmacion on public.ordenes;
drop function public.correo_confirmacion_compra();
drop function public.encolar_avisos_vencimiento(int);
drop function public.recuperar_correos_trabados();
drop function public.registrar_envio_correo(uuid, text, text, text, text);
drop function public.tomar_correos(int);
drop function public.encolar_correo(text, text, uuid, jsonb, text);
drop index public.envios_correo_cola_idx;
alter table public.envios_correo drop constraint envios_correo_estado_check;
alter table public.envios_correo drop column variables, drop column intentos, drop column proximo_intento_en, drop column enviado_en,
  drop column proveedor, drop column actualizado_en;
alter table public.envios_correo add constraint envios_correo_estado_check check (estado in ('pendiente','enviado','fallido'));
delete from public.plantillas_correo where clave in ('aviso_vencimiento', 'comunicacion_importante')
  and not exists (select 1 from public.envios_correo e where e.plantilla_clave = plantillas_correo.clave);
drop function public.autorizar_video_leccion(uuid, uuid);
