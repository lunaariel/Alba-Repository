-- Reversión de 20261101000021_plazo_cancelacion. SOLO entornos locales o de prueba.
-- Se niega si algún taller o inscripción tiene un plazo distinto de 24 horas (se perdería la condición).
do $$
begin
  if exists (select 1 from public.talleres where cancelacion_horas <> 24)
     or exists (select 1 from public.inscripciones_taller where cancelacion_horas is distinct from 24) then
    raise exception 'reversion_imposible: hay plazos de cancelación distintos de 24 horas' using errcode = 'P0001';
  end if;
end $$;
create or replace function public.cancelar_mi_inscripcion(p_taller uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.talleres%rowtype; v_i public.inscripciones_taller%rowtype;
begin
  if auth.uid() is null then raise exception 'sin_sesion' using errcode = '42501'; end if;
  select * into v_t from public.talleres where id = p_taller for update;
  select * into v_i from public.inscripciones_taller where taller_id = p_taller and perfil_id = auth.uid() and estado = 'confirmada' for update;
  if v_i.id is null then raise exception 'sin_inscripcion' using errcode = 'P0001'; end if;
  -- Pagas: no hay cancelación ordinaria hasta aprobar la política de reembolsos; se contacta a la academia.
  if v_i.origen = 'compra' or v_i.item_orden_id is not null then raise exception 'inscripcion_paga' using errcode = 'P0001'; end if;
  if v_t.inicia_en - interval '24 hours' <= now() then raise exception 'fuera_de_plazo' using errcode = 'P0001'; end if;
  update public.inscripciones_taller set estado = 'cancelada', cancelada_en = now(), cancelada_por = 'alumno' where id = v_i.id;
  update public.notificaciones set estado = 'descartada', motivo_descarte = 'inscripcion_cancelada'
   where inscripcion_id = v_i.id and estado = 'pendiente' and tipo in ('recordatorio_taller','reprogramacion_pendiente');
  perform public.registrar_notificacion(auth.uid(), p_taller, v_i.id, 'inscripcion_cancelada', 'cancelada:' || v_i.id);
end; $$;
revoke execute on function public.cancelar_mi_inscripcion(uuid) from public, anon;
grant execute on function public.cancelar_mi_inscripcion(uuid) to authenticated;

drop trigger talleres_auditar on public.talleres;
create trigger talleres_auditar after insert or update or delete on public.talleres
  for each row execute function public.auditar_cambio('taller', '{titulo,inicia_en,termina_en,zona_horaria,cupo,precio_centavos,plataforma,estado}');
drop trigger talleres_plazo_copia on public.talleres;
drop function public.heredar_plazo_copia();
drop trigger inscripciones_plazo_fijo on public.inscripciones_taller;
drop function public.proteger_plazo_cancelacion();
drop trigger inscripciones_plazo on public.inscripciones_taller;
drop function public.fijar_plazo_cancelacion();
alter table public.inscripciones_taller drop column cancelacion_horas;
alter table public.talleres drop column cancelacion_horas;
