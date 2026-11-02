-- Avisos de vencimiento de cursos (jornada del 03/11/2026). SOLO entornos locales o de prueba.
--
-- Anticipación aprobada por la titular: 30, 7 y 1 día antes del fin del acceso. Se calcula sobre la COBERTURA
-- CONTINUA (períodos activos encadenados, incluidas renovaciones futuras que empiezan cuando termina el actual), en
-- días calendario de Guatemala. No avisa: sin vencimiento, sin acceso ahora, períodos revocados, ni el fin de un
-- período que continúa sin interrupción con otro. Si la cobertura cambia (renovación, revocación, beca), los avisos
-- pendientes que ya no corresponden se cancelan y, si toca, se registra el nuevo. Idempotente y seguro en paralelo.
-- Los mensajes van a la cola (envios_correo); con el proveedor simulado quedan «simulado», nunca «enviado».

alter table public.envios_correo drop constraint envios_correo_estado_check;
alter table public.envios_correo add constraint envios_correo_estado_check
  check (estado in ('creado', 'pendiente', 'enviando', 'enviado', 'simulado', 'fallido', 'cancelado'));

-- Fin de la cobertura continua que incluye p_momento: 'infinity' si algún período de esa cadena no vence; null si
-- no hay cobertura en ese momento.
create or replace function public.fin_cobertura_continua(p_acceso uuid, p_momento timestamptz default now())
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare v_fin timestamptz; v_siguiente timestamptz; v_sin boolean;
begin
  if not exists (select 1 from public.accesos_curso where id = p_acceso and estado = 'activo') then return null; end if;
  select bool_or(vence_en is null), max(vence_en) into v_sin, v_fin from public.periodos_acceso
   where acceso_id = p_acceso and estado = 'activo' and inicia_en <= p_momento and (vence_en is null or vence_en > p_momento);
  if v_sin then return 'infinity'; end if;
  if v_fin is null then return null; end if;
  loop
    -- Un período que empieza antes o justo al terminar la cobertura actual la continúa sin interrupción.
    select bool_or(vence_en is null), max(vence_en) into v_sin, v_siguiente from public.periodos_acceso
     where acceso_id = p_acceso and estado = 'activo' and inicia_en <= v_fin and (vence_en is null or vence_en > v_fin);
    if v_sin then return 'infinity'; end if;
    exit when v_siguiente is null;
    v_fin := v_siguiente;
  end loop;
  return v_fin;
end; $$;

-- Umbral que corresponde según los días calendario (Guatemala) que faltan: 30 (8 a 30), 7 (2 a 7), 1 (0 y 1).
create or replace function public.umbral_aviso_vencimiento(p_dias int)
returns int language sql immutable as $$
  select case when p_dias between 8 and 30 then 30 when p_dias between 2 and 7 then 7 when p_dias between 0 and 1 then 1 end
$$;

drop function if exists public.encolar_avisos_vencimiento(int);
create or replace function public.encolar_avisos_vencimiento(p_momento timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_fin timestamptz; v_dias int; v_umbral int; v_fecha date; v_hoy date := (p_momento at time zone 'America/Guatemala')::date;
  v_registrados int := 0; v_cancelados int; v_antes int;
begin
  -- Una ejecución a la vez (las demás esperan y luego no encuentran nada nuevo: la clave impide duplicados).
  perform pg_advisory_xact_lock(hashtext('albor_avisos_vencimiento'));

  -- 1. Cancelar avisos pendientes que ya no corresponden (la cobertura cambió o terminó).
  with vigentes as (
    select e.id, (e.variables ->> 'acceso_id')::uuid acceso, e.variables ->> 'fin_iso' fin
      from public.envios_correo e
     where e.plantilla_clave = 'aviso_vencimiento' and e.estado in ('creado', 'pendiente') and e.variables ? 'acceso_id'
  ), cancelar as (
    update public.envios_correo e set estado = 'cancelado', actualizado_en = now(), error = 'cobertura_cambiada'
      from vigentes v
     where e.id = v.id
       and (public.fin_cobertura_continua(v.acceso, p_momento) is distinct from v.fin::timestamptz
            or public.fin_cobertura_continua(v.acceso, p_momento) <= p_momento)
    returning 1
  ) select count(*) into v_cancelados from cancelar;

  -- 2. Registrar el aviso que corresponde hoy a cada acceso con fin de cobertura próximo.
  for r in select a.id, a.perfil_id, c.titulo, u.email, p.nombre_completo
             from public.accesos_curso a join public.cursos c on c.id = a.curso_id
             join auth.users u on u.id = a.perfil_id join public.perfiles p on p.id = a.perfil_id
            where a.estado = 'activo' loop
    v_fin := public.fin_cobertura_continua(r.id, p_momento);
    continue when v_fin is null or v_fin = 'infinity' or v_fin <= p_momento;
    v_fecha := ((v_fin - interval '1 microsecond') at time zone 'America/Guatemala')::date;  -- último día con acceso
    v_dias := v_fecha - v_hoy;
    v_umbral := public.umbral_aviso_vencimiento(v_dias);
    continue when v_umbral is null or r.email is null;
    select count(*) into v_antes from public.envios_correo where clave_idempotencia = 'aviso_vencimiento:' || r.id || ':' || v_fecha || ':' || v_umbral;
    perform public.encolar_correo('aviso_vencimiento', r.email, r.perfil_id,
      jsonb_build_object('nombre', split_part(coalesce(r.nombre_completo, ''), ' ', 1), 'curso', r.titulo,
                         'fecha', to_char(v_fecha, 'DD/MM/YYYY'), 'dias', v_dias, 'umbral', v_umbral,
                         'acceso_id', r.id, 'fin_iso', v_fin),
      'aviso_vencimiento:' || r.id || ':' || v_fecha || ':' || v_umbral);
    if v_antes = 0 then v_registrados := v_registrados + 1; end if;
    -- Un aviso más próximo reemplaza a los anteriores que todavía no salieron (no se envía «quedan 30 días» tarde).
    update public.envios_correo set estado = 'cancelado', actualizado_en = now(), error = 'reemplazado_por_aviso_mas_proximo'
     where plantilla_clave = 'aviso_vencimiento' and estado in ('creado', 'pendiente') and variables ->> 'acceso_id' = r.id::text
       and (variables ->> 'umbral')::int > v_umbral;
  end loop;
  return jsonb_build_object('registrados', v_registrados, 'cancelados', v_cancelados);
end; $$;

update public.plantillas_correo
   set asunto = 'Su acceso a «{{curso}}» termina el {{fecha}}',
       cuerpo = 'Hola, {{nombre}}. Su acceso a «{{curso}}» termina el {{fecha}} (quedan {{dias}} día(s)). Después de esa fecha no podrá ver las lecciones; su avance y sus certificados se conservan.'
 where clave = 'aviso_vencimiento';

revoke execute on function public.fin_cobertura_continua(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.encolar_avisos_vencimiento(timestamptz) from public, anon, authenticated;
grant execute on function public.fin_cobertura_continua(uuid, timestamptz) to service_role;
grant execute on function public.encolar_avisos_vencimiento(timestamptz) to service_role;
