-- Reversión de 20261101000019_vencimientos_cursos. SOLO entornos locales o de prueba.
-- Se niega si ya hay cursos con duración comercial, compras con condiciones copiadas o accesos con
-- vencimiento: revertir borraría las condiciones que cada persona aceptó.
do $$
begin
  if exists (select 1 from public.cursos where duracion_comercial_meses is not null)
     or exists (select 1 from public.items_orden where condiciones_acceso is not null)
     or exists (select 1 from public.accesos_curso where vence_en is not null
                 or coalesce(condiciones ->> 'regla', '') not in ('anterior_sin_vencimiento', 'concesion_sin_vencimiento', 'compra_sin_condiciones')) then
    raise exception 'reversion_imposible: hay duraciones comerciales, condiciones de compra o vencimientos registrados' using errcode = 'P0001';
  end if;
end $$;

drop trigger cursos_auditar_duracion on public.cursos;
drop function public.mis_accesos();
drop function public.seguimiento_curso(uuid);
create function public.seguimiento_curso(p_curso uuid)
returns table (perfil_id uuid, nombre text, version int, estado jsonb, envios_formativos int, ultimo_envio timestamptz,
               validacion_id uuid, tiene_certificado boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return query
  select a.perfil_id, pf.nombre_completo, v.numero, public.estado_finalizacion_de(a.perfil_id, p_curso),
         (select count(*)::int from public.intentos_evaluacion i where i.perfil_id = a.perfil_id and i.version_id = a.version_id and i.formativo),
         (select max(i.entregado_en) from public.intentos_evaluacion i where i.perfil_id = a.perfil_id and i.version_id = a.version_id and i.formativo),
         (select f.id from public.validaciones_formativas f where f.perfil_id = a.perfil_id and f.version_id = a.version_id and f.anulada_en is null),
         exists (select 1 from public.certificados c where c.perfil_id = a.perfil_id and c.curso_id = p_curso and c.version_id = a.version_id)
    from public.accesos_curso a
    join public.perfiles pf on pf.id = a.perfil_id
    join public.versiones_curso v on v.id = a.version_id
   where a.curso_id = p_curso and a.estado = 'activo'
   order by v.numero, pf.nombre_completo;
end; $$;
revoke execute on function public.seguimiento_curso(uuid) from public, anon;
grant execute on function public.seguimiento_curso(uuid) to authenticated;

-- Funciones anteriores.
create or replace function public.resumen_publico_curso(p_curso uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.version_vigente_publica(p_curso) is not null then jsonb_build_object(
    'materiales', (select count(*) from public.version_materiales vm join public.recursos_leccion r on r.id = vm.recurso_id
                    where vm.version_id = public.version_vigente_publica(p_curso) and not r.bloqueado),
    'evaluacion', exists (select 1 from public.version_preguntas vp join public.preguntas p on p.id = vp.pregunta_id
                           where vp.version_id = public.version_vigente_publica(p_curso) and not p.bloqueada))
  else null end;
$$;

create or replace function public.tiene_acceso(p_curso uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.accesos_curso
    where perfil_id = auth.uid() and curso_id = p_curso and estado = 'activo'
  );
$$;

create or replace function public.version_de(p_perfil uuid, p_curso uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select version_id from public.accesos_curso where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo';
$$;
revoke execute on function public.version_de(uuid, uuid) from public, anon, authenticated;

create or replace function public.estado_finalizacion_de(p_perfil uuid, p_curso uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.versiones_curso%rowtype;
  v_pend int; v_act boolean := false; v_val boolean := false; v_aprob boolean := false; v_fin boolean;
begin
  select * into v from public.versiones_curso where id = public.version_de(p_perfil, p_curso);
  if v.id is null then return null; end if;
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
    -- Elegible: requisitos cumplidos, el curso certifica y hay al menos un criterio más allá de las lecciones.
    'elegible_certificado', v_fin and v.con_certificado
       and (v.modalidad = 'sumativa' or v.requiere_actividades or v.requiere_validacion));
end; $$;
revoke execute on function public.estado_finalizacion_de(uuid, uuid) from public, anon, authenticated;

drop function public.version_historica_de(uuid, uuid);
drop trigger accesos_vencimiento_fijo on public.accesos_curso;
drop trigger accesos_vencimiento on public.accesos_curso;
drop function public.proteger_vencimiento_acceso();
drop function public.fijar_vencimiento_acceso();
alter table public.accesos_curso drop constraint acceso_vence_despues, drop column inicia_en, drop column vence_en, drop column condiciones;
drop trigger items_orden_condiciones_fijas on public.items_orden;
drop trigger items_orden_condiciones on public.items_orden;
drop function public.proteger_condiciones_item();
drop function public.fijar_condiciones_item();
alter table public.items_orden drop column condiciones_acceso;
drop function public.calcular_vencimiento(timestamptz, int);
drop function public.meses_adicionales_acceso();
alter table public.cursos drop column duracion_comercial_meses;
