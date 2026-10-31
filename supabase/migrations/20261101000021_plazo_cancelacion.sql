-- Plazo de cancelación configurable por taller (Jornada autónoma, bloque D).
-- Predeterminado: 24 horas antes del inicio (decisión de la maestra). Cada inscripción copia el plazo vigente
-- al inscribirse: cambiar el plazo del taller vale para inscripciones nuevas, nunca en silencio para las
-- existentes. Las inscripciones pagas siguen sin cancelación ordinaria desde el campus.
-- SOLO entornos locales o de prueba: no autorizada en producción.

alter table public.talleres add column cancelacion_horas int not null default 24 check (cancelacion_horas between 0 and 336);
alter table public.inscripciones_taller add column cancelacion_horas int check (cancelacion_horas between 0 and 336);

-- Inscripciones existentes: conservan el plazo con que se inscribieron (24 h desde la migración 0017).
alter table public.inscripciones_taller disable trigger user;
update public.inscripciones_taller set cancelacion_horas = 24 where cancelacion_horas is null;
alter table public.inscripciones_taller enable trigger user;

create or replace function public.fijar_plazo_cancelacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.cancelacion_horas := coalesce(new.cancelacion_horas, (select cancelacion_horas from public.talleres where id = new.taller_id), 24);
  return new;
end; $$;
create trigger inscripciones_plazo before insert on public.inscripciones_taller
  for each row execute function public.fijar_plazo_cancelacion();

-- El plazo de una inscripción no se reescribe.
create or replace function public.proteger_plazo_cancelacion()
returns trigger language plpgsql as $$
begin
  if new.cancelacion_horas is distinct from old.cancelacion_horas then raise exception 'plazo_inmutable' using errcode = 'P0001'; end if;
  return new;
end; $$;
create trigger inscripciones_plazo_fijo before update on public.inscripciones_taller
  for each row execute function public.proteger_plazo_cancelacion();

-- Una copia del taller hereda el plazo.
create or replace function public.heredar_plazo_copia()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.duplicado_de is not null then
    new.cancelacion_horas := coalesce((select cancelacion_horas from public.talleres where id = new.duplicado_de), new.cancelacion_horas);
  end if;
  return new;
end; $$;
create trigger talleres_plazo_copia before insert on public.talleres
  for each row execute function public.heredar_plazo_copia();

drop trigger talleres_auditar on public.talleres;
create trigger talleres_auditar after insert or update or delete on public.talleres
  for each row execute function public.auditar_cambio('taller', '{titulo,inicia_en,termina_en,zona_horaria,cupo,precio_centavos,plataforma,estado,cancelacion_horas}');

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
  -- Plazo de la inscripción (copiado al inscribirse); el del taller solo si es anterior a 0021.
  if v_t.inicia_en - make_interval(hours => coalesce(v_i.cancelacion_horas, v_t.cancelacion_horas, 24)) <= now() then
    raise exception 'fuera_de_plazo' using errcode = 'P0001';
  end if;
  update public.inscripciones_taller set estado = 'cancelada', cancelada_en = now(), cancelada_por = 'alumno' where id = v_i.id;
  update public.notificaciones set estado = 'descartada', motivo_descarte = 'inscripcion_cancelada'
   where inscripcion_id = v_i.id and estado = 'pendiente' and tipo in ('recordatorio_taller','reprogramacion_pendiente');
  perform public.registrar_notificacion(auth.uid(), p_taller, v_i.id, 'inscripcion_cancelada', 'cancelada:' || v_i.id);
end; $$;
revoke execute on function public.cancelar_mi_inscripcion(uuid) from public, anon;
grant execute on function public.cancelar_mi_inscripcion(uuid) to authenticated;
