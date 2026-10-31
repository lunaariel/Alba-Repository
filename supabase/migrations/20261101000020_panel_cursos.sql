-- Pendientes aprobados del panel de cursos (Jornada autónoma, bloque C):
-- · Duplicar un curso como borrador independiente, sin alumnos, compras, intentos, certificados ni historial.
-- · Descartar explícitamente una revisión favorable calculada y no aplicada.
-- SOLO entornos locales o de prueba: no autorizada en producción.

-- ============================================================ 1. Descartar una revisión calculada
alter table public.revisiones_evaluacion
  add column descartada_por uuid,
  add column descartada_en timestamptz,
  add column motivo_descarte text;

create or replace function public.descartar_revision(p_revision uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.revisiones_evaluacion%rowtype;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'motivo_requerido' using errcode = 'P0001'; end if;
  select * into v from public.revisiones_evaluacion where id = p_revision for update;
  if v.id is null then raise exception 'revision_inexistente' using errcode = 'P0001'; end if;
  -- Una revisión aplicada ya cambió resultados: no se «descarta» (los resultados originales se conservan aparte).
  if v.estado <> 'calculada' then raise exception 'revision_no_descartable' using errcode = 'P0001'; end if;
  update public.revisiones_evaluacion set estado = 'descartada', descartada_por = auth.uid(), descartada_en = now(), motivo_descarte = btrim(p_motivo)
   where id = v.id;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (auth.uid(), 'revision_descartada', 'revisiones_evaluacion', v.id::text, jsonb_build_object('estado', 'calculada'),
          jsonb_build_object('estado', 'descartada', 'motivo', btrim(p_motivo)));
end; $$;
revoke execute on function public.descartar_revision(uuid, text) from public, anon;
grant execute on function public.descartar_revision(uuid, text) to authenticated;

-- ============================================================ 2. Duplicar un curso
-- Copia el contenido vigente del borrador (sin lo retirado ni lo bloqueado) en un curso nuevo en borrador.
-- No copia alumnos, accesos, órdenes, avances, intentos, certificados, versiones ni registros.
-- Los PDF se copian en el almacenamiento desde el servidor con las rutas que devuelve esta función.
create or replace function public.duplicar_curso(p_curso uuid, p_titulo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.cursos%rowtype; v_nuevo uuid; v_slug text; v_base text; n int := 1;
  m record; l record; r record; p record; v_mod uuid; v_lec uuid; v_preg uuid; v_eval_origen public.evaluaciones%rowtype; v_eval uuid;
  v_materiales jsonb := '[]'; v_mat jsonb;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select * into o from public.cursos where id = p_curso;
  if o.id is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_titulo, ''))) < 3 then raise exception 'titulo_vacio' using errcode = 'P0001'; end if;

  v_base := left(regexp_replace(o.slug, '-copia(-[0-9]+)?$', ''), 50) || '-copia';
  v_slug := v_base;
  while exists (select 1 from public.cursos where slug = v_slug) loop
    n := n + 1; v_slug := v_base || '-' || n;
  end loop;

  insert into public.cursos (slug, titulo, resumen, descripcion, publico, edad_desde_meses, edad_hasta_meses, duracion_minutos,
                             objetivos, requisitos, precio_centavos, video_presentacion_id, duracion_comercial_meses)
  values (v_slug, btrim(p_titulo), o.resumen, o.descripcion, o.publico, o.edad_desde_meses, o.edad_hasta_meses, o.duracion_minutos,
          o.objetivos, o.requisitos, o.precio_centavos, o.video_presentacion_id, o.duracion_comercial_meses)
  returning id into v_nuevo;

  for m in select id, titulo, row_number() over (order by orden) - 1 as pos from public.modulos
            where curso_id = p_curso and not retirado order by orden loop
    insert into public.modulos (curso_id, titulo, orden) values (v_nuevo, m.titulo, m.pos) returning id into v_mod;
    for l in select id, titulo, descripcion, duracion_minutos, video_id, row_number() over (order by orden) - 1 as pos
               from public.lecciones where modulo_id = m.id and not retirada and not bloqueada order by orden loop
      insert into public.lecciones (modulo_id, titulo, descripcion, duracion_minutos, video_id, orden)
      values (v_mod, l.titulo, l.descripcion, l.duracion_minutos, l.video_id, l.pos) returning id into v_lec;
      for r in select id, titulo, ruta_almacenamiento, tipo_mime, tamano_bytes, orden, complementario
                 from public.recursos_leccion where leccion_id = l.id and not retirado and not bloqueado order by orden loop
        -- Ruta propia: el archivo se copia; borrar el material de un curso nunca afecta al otro.
        insert into public.recursos_leccion (leccion_id, titulo, ruta_almacenamiento, tipo_mime, tamano_bytes, orden, complementario)
        values (v_lec, r.titulo, 'cursos/' || v_nuevo || '/' || gen_random_uuid() || '.pdf', r.tipo_mime, r.tamano_bytes, r.orden, r.complementario)
        returning jsonb_build_object('id', id, 'origen', r.ruta_almacenamiento, 'destino', ruta_almacenamiento) into v_mat;
        v_materiales := v_materiales || jsonb_build_array(v_mat);
      end loop;
    end loop;
  end loop;

  select * into v_eval_origen from public.evaluaciones where curso_id = p_curso;
  if v_eval_origen.id is not null then
    insert into public.evaluaciones (curso_id, puntaje_minimo, intentos_permitidos, mensaje_aprobado, mensaje_desaprobado,
                                     modalidad, requiere_actividades, requiere_validacion, con_certificado)
    values (v_nuevo, v_eval_origen.puntaje_minimo, v_eval_origen.intentos_permitidos, v_eval_origen.mensaje_aprobado, v_eval_origen.mensaje_desaprobado,
            v_eval_origen.modalidad, v_eval_origen.requiere_actividades, v_eval_origen.requiere_validacion, v_eval_origen.con_certificado)
    returning id into v_eval;
    for p in select id, enunciado, tipo, tema, row_number() over (order by orden) - 1 as pos from public.preguntas
              where evaluacion_id = v_eval_origen.id and not retirada and not bloqueada order by orden loop
      insert into public.preguntas (evaluacion_id, enunciado, tipo, tema, orden) values (v_eval, p.enunciado, p.tipo, p.tema, p.pos) returning id into v_preg;
      insert into public.opciones (pregunta_id, texto, es_correcta, orden)
      select v_preg, texto, es_correcta, orden from public.opciones where pregunta_id = p.id;
    end loop;
  end if;

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), 'curso_duplicado', 'cursos', v_nuevo::text,
          jsonb_build_object('origen', p_curso, 'titulo', btrim(p_titulo), 'slug', v_slug, 'materiales', jsonb_array_length(v_materiales)));
  return jsonb_build_object('curso', v_nuevo, 'slug', v_slug, 'materiales', v_materiales);
end; $$;
revoke execute on function public.duplicar_curso(uuid, text) from public, anon;
grant execute on function public.duplicar_curso(uuid, text) to authenticated;
