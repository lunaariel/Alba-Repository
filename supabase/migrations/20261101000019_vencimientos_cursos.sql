-- Vencimiento de los cursos comprados (decisión de la maestra, Jornada autónoma 01/11/2026):
-- acceso = duración comercial del curso + 5 meses adicionales, contados desde la compra.
--
-- · La duración comercial se configura por curso, en meses calendario. No es la suma de minutos de las lecciones.
-- · Las condiciones se copian en cada ítem de orden al crearla (lo que la persona vio antes de comprar)
--   y de ahí al acceso cuando el pago se confirma. Cambiar la duración después no toca compras anteriores.
-- · El derecho empieza cuando el pago se confirma (también en pagos tardíos) y vence según el calendario
--   de Guatemala: el mismo día y hora local N meses después (si ese día no existe, el último del mes).
-- · Los accesos anteriores a esta migración no reciben vencimiento (no es retroactivo). Las concesiones
--   de la admin tampoco vencen hasta que la maestra decida otra cosa.
-- · Al vencer: no se ve el contenido ni se rinde, pero se conservan avance, intentos y certificados.
-- SOLO entornos locales o de prueba: no autorizada en producción.

-- ============================================================ 1. Configuración del curso
alter table public.cursos add column duracion_comercial_meses int check (duracion_comercial_meses between 1 and 60);

-- Meses adicionales fijados por la maestra. Una función (no un número suelto) para usar el mismo valor en todo.
create or replace function public.meses_adicionales_acceso() returns int language sql immutable as $$ select 5 $$;

-- Fin del derecho: N meses calendario después del inicio, en la hora local de Guatemala.
create or replace function public.calcular_vencimiento(p_inicio timestamptz, p_meses int)
returns timestamptz language sql immutable as $$
  select ((p_inicio at time zone 'America/Guatemala') + make_interval(months => p_meses)) at time zone 'America/Guatemala';
$$;

-- ============================================================ 2. Condiciones copiadas en cada compra
alter table public.items_orden add column condiciones_acceso jsonb;

create or replace function public.fijar_condiciones_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_meses int;
begin
  if new.curso_id is null then return new; end if;
  select duracion_comercial_meses into v_meses from public.cursos where id = new.curso_id;
  -- Sin condiciones definidas no se vende: la persona tiene que verlas antes de comprar.
  if v_meses is null then raise exception 'curso_sin_condiciones' using errcode = 'P0001'; end if;
  new.condiciones_acceso := jsonb_build_object(
    'regla', 'duracion_mas_adicionales', 'duracion_meses', v_meses, 'meses_adicionales', public.meses_adicionales_acceso(),
    'total_meses', v_meses + public.meses_adicionales_acceso(), 'zona_horaria', 'America/Guatemala');
  return new;
end; $$;
create trigger items_orden_condiciones before insert on public.items_orden
  for each row execute function public.fijar_condiciones_item();

-- Las condiciones de una compra no se reescriben.
create or replace function public.proteger_condiciones_item()
returns trigger language plpgsql as $$
begin
  if new.condiciones_acceso is distinct from old.condiciones_acceso then raise exception 'condiciones_inmutables' using errcode = 'P0001'; end if;
  return new;
end; $$;
create trigger items_orden_condiciones_fijas before update on public.items_orden
  for each row execute function public.proteger_condiciones_item();

-- ============================================================ 3. Inicio y vencimiento del acceso
alter table public.accesos_curso
  add column inicia_en timestamptz,
  add column vence_en timestamptz,
  add column condiciones jsonb;

-- Accesos existentes: inicio = fecha en que se otorgaron; sin vencimiento (no retroactivo).
alter table public.accesos_curso disable trigger user;
update public.accesos_curso set inicia_en = creado_en,
       condiciones = jsonb_build_object('regla', 'anterior_sin_vencimiento')
 where inicia_en is null;
alter table public.accesos_curso enable trigger user;
alter table public.accesos_curso alter column inicia_en set not null, alter column inicia_en set default now();
alter table public.accesos_curso add constraint acceso_vence_despues check (vence_en is null or vence_en > inicia_en);

create or replace function public.fijar_vencimiento_acceso()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cond jsonb;
begin
  new.inicia_en := coalesce(new.inicia_en, now());
  if new.origen = 'compra' then
    select condiciones_acceso into v_cond from public.items_orden where id = new.item_orden_id;
    if v_cond ? 'total_meses' then
      new.condiciones := v_cond;
      new.vence_en := public.calcular_vencimiento(new.inicia_en, (v_cond ->> 'total_meses')::int);
    else
      -- Ítem anterior a esta migración (sin condiciones copiadas): no se inventa un vencimiento.
      new.condiciones := jsonb_build_object('regla', 'compra_sin_condiciones');
      new.vence_en := null;
    end if;
  else
    new.condiciones := jsonb_build_object('regla', 'concesion_sin_vencimiento');
    new.vence_en := null;
  end if;
  return new;
end; $$;
create trigger accesos_vencimiento before insert on public.accesos_curso
  for each row execute function public.fijar_vencimiento_acceso();

-- Inicio, vencimiento y condiciones no se modifican por el flujo ordinario.
create or replace function public.proteger_vencimiento_acceso()
returns trigger language plpgsql as $$
begin
  if (new.inicia_en, new.vence_en, new.condiciones) is distinct from (old.inicia_en, old.vence_en, old.condiciones)
     and coalesce(current_setting('albor.ajuste_vencimiento', true), '') <> 'si' then
    raise exception 'vencimiento_inmutable' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger accesos_vencimiento_fijo before update on public.accesos_curso
  for each row execute function public.proteger_vencimiento_acceso();

-- ============================================================ 4. Acceso vigente: protege el contenido al vencer
-- Vigente = activo y sin vencer. Lo usan las políticas (tiene_acceso) y el versionado (version_de).
create or replace function public.tiene_acceso(p_curso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.accesos_curso
    where perfil_id = auth.uid() and curso_id = p_curso and estado = 'activo' and (vence_en is null or vence_en > now())
  );
$$;

create or replace function public.version_de(p_perfil uuid, p_curso uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select version_id from public.accesos_curso
   where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo' and (vence_en is null or vence_en > now());
$$;
revoke execute on function public.version_de(uuid, uuid) from public, anon, authenticated;

-- Versión del acceso aunque haya vencido: para el estado de finalización y el certificado de quien
-- cumplió todo antes de vencer. No da acceso al contenido.
create or replace function public.version_historica_de(p_perfil uuid, p_curso uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select version_id from public.accesos_curso where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo';
$$;
revoke execute on function public.version_historica_de(uuid, uuid) from public, anon, authenticated;

create or replace function public.estado_finalizacion_de(p_perfil uuid, p_curso uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.versiones_curso%rowtype;
  v_pend int; v_act boolean := false; v_val boolean := false; v_aprob boolean := false; v_fin boolean;
  v_vence timestamptz;
begin
  select * into v from public.versiones_curso where id = public.version_historica_de(p_perfil, p_curso);
  if v.id is null then return null; end if;
  select vence_en into v_vence from public.accesos_curso where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo';
  select count(*) into v_pend from public.lecciones_de_version(v.id) l(id)
   where not exists (select 1 from public.progreso_leccion p where p.leccion_id = l.id and p.perfil_id = p_perfil and p.completada_en is not null);
  if v.modalidad = 'sumativa' then
    v_aprob := exists (select 1 from public.intentos_evaluacion i join public.evaluaciones e on e.id = i.evaluacion_id
                        where e.curso_id = p_curso and i.perfil_id = p_perfil and not i.formativo
                          and (i.aprobado or coalesce(i.aprobado_revisado, false))
                          and public.evaluaciones_equivalentes(i.version_id, v.id));
    v_fin := v_pend = 0 and v_aprob;
  else
    v_act := exists (select 1 from public.intentos_evaluacion i where i.perfil_id = p_perfil and i.version_id = v.id and i.formativo and i.completo);
    v_val := exists (select 1 from public.validaciones_formativas f where f.perfil_id = p_perfil and f.version_id = v.id and f.anulada_en is null);
    v_fin := v_pend = 0 and (not v.requiere_actividades or v_act) and (not v.requiere_validacion or v_val);
  end if;
  return jsonb_build_object(
    'version_id', v.id, 'version', v.numero, 'modalidad', v.modalidad,
    'lecciones_pendientes', v_pend,
    'requiere_actividades', v.requiere_actividades, 'actividades_completas', v_act,
    'requiere_validacion', v.requiere_validacion, 'validada', v_val,
    'evaluacion_aprobada', v_aprob,
    'con_certificado', v.con_certificado,
    'finalizado', v_fin,
    'elegible_certificado', v_fin and v.con_certificado
       and (v.modalidad = 'sumativa' or v.requiere_actividades or v.requiere_validacion),
    'vence_en', v_vence, 'vencido', v_vence is not null and v_vence <= now());
end; $$;
revoke execute on function public.estado_finalizacion_de(uuid, uuid) from public, anon, authenticated;

-- ============================================================ 5. Campus: los accesos propios con su vencimiento
create or replace function public.mis_accesos()
returns table (curso_id uuid, inicia_en timestamptz, vence_en timestamptz, vencido boolean, condiciones jsonb)
language sql stable security definer set search_path = public as $$
  select a.curso_id, a.inicia_en, a.vence_en, a.vence_en is not null and a.vence_en <= now(), a.condiciones
    from public.accesos_curso a where a.perfil_id = auth.uid() and a.estado = 'activo';
$$;
revoke execute on function public.mis_accesos() from public, anon;
grant execute on function public.mis_accesos() to authenticated;

-- ============================================================ 6. Seguimiento del panel: también el vencimiento
drop function public.seguimiento_curso(uuid);
create function public.seguimiento_curso(p_curso uuid)
returns table (perfil_id uuid, nombre text, version int, estado jsonb, envios_formativos int, ultimo_envio timestamptz,
               validacion_id uuid, tiene_certificado boolean, inicia_en timestamptz, vence_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return query
  select a.perfil_id, pf.nombre_completo, v.numero, public.estado_finalizacion_de(a.perfil_id, p_curso),
         (select count(*)::int from public.intentos_evaluacion i where i.perfil_id = a.perfil_id and i.version_id = a.version_id and i.formativo),
         (select max(i.entregado_en) from public.intentos_evaluacion i where i.perfil_id = a.perfil_id and i.version_id = a.version_id and i.formativo),
         (select f.id from public.validaciones_formativas f where f.perfil_id = a.perfil_id and f.version_id = a.version_id and f.anulada_en is null),
         exists (select 1 from public.certificados c where c.perfil_id = a.perfil_id and c.curso_id = p_curso and c.version_id = a.version_id),
         a.inicia_en, a.vence_en
    from public.accesos_curso a
    join public.perfiles pf on pf.id = a.perfil_id
    join public.versiones_curso v on v.id = a.version_id
   where a.curso_id = p_curso and a.estado = 'activo'
   order by v.numero, pf.nombre_completo;
end; $$;
revoke execute on function public.seguimiento_curso(uuid) from public, anon;
grant execute on function public.seguimiento_curso(uuid) to authenticated;

-- ============================================================ 7. Auditoría de la duración comercial
-- Cambiar la duración comercial queda registrado (afecta solo a compras futuras).
create trigger cursos_auditar_duracion after update of duracion_comercial_meses on public.cursos
  for each row execute function public.auditar_cambio('curso', '{titulo,duracion_comercial_meses}');

-- ============================================================ 8. Ficha pública: modalidad y condiciones de acceso
create or replace function public.resumen_publico_curso(p_curso uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.version_vigente_publica(p_curso) is not null then jsonb_build_object(
    'materiales', (select count(*) from public.version_materiales vm join public.recursos_leccion r on r.id = vm.recurso_id
                    where vm.version_id = public.version_vigente_publica(p_curso) and not r.bloqueado),
    'evaluacion', exists (select 1 from public.version_preguntas vp join public.preguntas p on p.id = vp.pregunta_id
                           where vp.version_id = public.version_vigente_publica(p_curso) and not p.bloqueada),
    'modalidad', (select modalidad from public.versiones_curso where id = public.version_vigente_publica(p_curso)),
    'con_certificado', (select con_certificado from public.versiones_curso where id = public.version_vigente_publica(p_curso)),
    'duracion_comercial_meses', (select duracion_comercial_meses from public.cursos where id = p_curso),
    'meses_adicionales', public.meses_adicionales_acceso())
  else null end;
$$;
