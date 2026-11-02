-- Reversión de 20261102000026_mfa_reforzada. SOLO entornos locales o de prueba.
-- Se niega si la política está encendida (revertir dejaría el panel sin segundo factor sin que nadie lo decida)
-- o si hay verificaciones reforzadas usadas (se perdería su registro; la auditoría se conserva igual).
do $$ begin
  if (select mfa_admin_obligatorio from public.politica_seguridad) then
    raise exception 'reversion_imposible: la política de segundo factor está encendida; apáguela primero con scripts/politica-mfa.sql';
  end if;
  if exists (select 1 from public.verificaciones_reforzadas) then
    raise exception 'reversion_imposible: hay verificaciones reforzadas registradas';
  end if;
end $$;

drop trigger reforzada_curso on public.cursos;
drop trigger reforzada_curso_eliminar on public.cursos;
drop trigger reforzada_version on public.versiones_curso;
drop trigger reforzada_taller on public.talleres;
drop trigger reforzada_taller_eliminar on public.talleres;
drop trigger reforzada_grabacion on public.grabaciones_taller;
drop trigger reforzada_cupon on public.cupones;
drop trigger reforzada_revision on public.revisiones_evaluacion;
drop trigger reforzada_bloqueo_leccion on public.lecciones;
drop trigger reforzada_bloqueo_material on public.recursos_leccion;
drop trigger reforzada_bloqueo_pregunta on public.preguntas;
drop trigger reforzada_anular_validacion on public.validaciones_formativas;
drop trigger reforzada_periodo_alta on public.periodos_acceso;
drop trigger reforzada_periodo_revocar on public.periodos_acceso;
drop trigger reforzada_incidencia on public.incidencias;
drop trigger reforzada_configuracion on public.configuracion_academia;
drop trigger reforzada_roles on public.roles_usuario;
drop trigger reforzada_roles_baja on public.roles_usuario;
drop function public.tg_verificacion_reforzada();
drop function public.exigir_verificacion_reforzada(text);
drop table public.verificaciones_reforzadas;

-- es_admin() vuelve a su definición original (0002).
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.roles_usuario where perfil_id = auth.uid() and rol = 'admin');
$$;
drop function public.registrar_evento_segundo_factor(text);
drop function public.tiene_rol_admin();
drop function public.mfa_admin_activo();
drop function public.claims_sesion();
drop function public.politica_seguridad_vigente();
drop table public.politica_seguridad;
drop function public.auditar_politica_seguridad();

-- D8: sin límite de frecuencia (definición de 0018).
create or replace function public.registrar_actividad_formativa(p_perfil uuid, p_evaluacion uuid, p_respuestas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_curso uuid; v_version public.versiones_curso%rowtype; v_intento uuid; v_numero int;
  v_pregunta record; v_elegidas uuid[]; v_ok boolean; v_total int := 0; v_respondidas int := 0; v_correctas int := 0;
  v_temas text[] := '{}'; v_completo boolean;
begin
  select curso_id into v_curso from public.evaluaciones where id = p_evaluacion;
  if v_curso is null then raise exception 'evaluacion_inexistente' using errcode = 'P0001'; end if;
  select * into v_version from public.versiones_curso where id = public.version_de(p_perfil, v_curso);
  if v_version.id is null then raise exception 'sin_acceso' using errcode = 'P0001'; end if;
  if v_version.modalidad <> 'formativa' then raise exception 'modalidad_sumativa' using errcode = 'P0001'; end if;

  perform pg_advisory_xact_lock(hashtext(p_perfil::text || p_evaluacion::text));
  select coalesce(max(numero), 0) + 1 into v_numero from public.intentos_evaluacion where perfil_id = p_perfil and evaluacion_id = p_evaluacion;
  insert into public.intentos_evaluacion (perfil_id, evaluacion_id, numero, puntaje, aprobado, version_id, formativo)
  values (p_perfil, p_evaluacion, v_numero, 0, false, v_version.id, true) returning id into v_intento;

  for v_pregunta in select p.id, p.tema from public.version_preguntas vp join public.preguntas p on p.id = vp.pregunta_id
                     where vp.version_id = v_version.id and not p.bloqueada order by vp.orden loop
    v_total := v_total + 1;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_elegidas
      from jsonb_array_elements_text(coalesce(p_respuestas -> v_pregunta.id::text, '[]'::jsonb)) as x
     where (case when x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then x::uuid end)
           in (select id from public.opciones where pregunta_id = v_pregunta.id);
    if cardinality(v_elegidas) > 0 then v_respondidas := v_respondidas + 1; end if;
    v_ok := cardinality(v_elegidas) > 0 and public.eleccion_correcta(v_version.id, v_pregunta.id, v_elegidas);
    if v_ok then v_correctas := v_correctas + 1;
    elsif v_pregunta.tema is not null and not (btrim(v_pregunta.tema) = any (v_temas)) then v_temas := array_append(v_temas, btrim(v_pregunta.tema));
    end if;
    insert into public.respuestas_intento (intento_id, pregunta_id, opciones_elegidas, correcta) values (v_intento, v_pregunta.id, v_elegidas, v_ok);
  end loop;
  if v_total = 0 then raise exception 'evaluacion_sin_preguntas' using errcode = 'P0001'; end if;
  v_completo := v_respondidas = v_total;
  update public.intentos_evaluacion set puntaje = round(100.0 * v_correctas / v_total), completo = v_completo where id = v_intento;
  return jsonb_build_object('completo', v_completo, 'respondidas', v_respondidas, 'total', v_total, 'temas_a_reforzar', to_jsonb(v_temas));
end; $$;
revoke execute on function public.registrar_actividad_formativa(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_actividad_formativa(uuid, uuid, jsonb) to service_role;

-- D9: políticas de lectura originales.
drop policy intentos_lee on public.intentos_evaluacion;
create policy intentos_lee on public.intentos_evaluacion for select to authenticated
  using (perfil_id = auth.uid() or public.es_admin());
drop policy respuestas_lee on public.respuestas_intento;
create policy respuestas_lee on public.respuestas_intento for select to authenticated
  using (exists (select 1 from public.intentos_evaluacion i where i.id = intento_id and (i.perfil_id = auth.uid() or public.es_admin())));

-- D12: responsable exigido también en cascada (definición de 0023).
create or replace function public.exigir_responsable_rol()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol text := coalesce(new.rol, old.rol); v_responsable text := btrim(coalesce(current_setting('albor.responsable', true), ''));
begin
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
