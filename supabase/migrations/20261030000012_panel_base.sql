-- Albor · 0012 · Base del panel de administración (Fase 5, entrega 1)
-- Registro de actividad automático para las tablas que edita la administradora,
-- y una función para registrar acciones que no son un simple cambio de fila.
-- Los cambios de esquema de cada sección llegan con la entrega que los usa.

-- Disparador genérico: guarda quién, qué y el antes/después de las columnas vigiladas.
-- Argumentos: 0 = nombre corto de la entidad (taller, articulo…); 1 = columnas vigiladas ('{a,b}').
-- En un UPDATE solo registra si cambió alguna columna vigilada.
create or replace function public.auditar_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cols text[] := tg_argv[1]::text[];
  v_antes jsonb;
  v_despues jsonb;
  v_id text;
begin
  if tg_op <> 'INSERT' then
    select coalesce(jsonb_object_agg(key, value), '{}') into v_antes
      from jsonb_each(to_jsonb(old)) where key = any (v_cols);
  end if;
  if tg_op <> 'DELETE' then
    select coalesce(jsonb_object_agg(key, value), '{}') into v_despues
      from jsonb_each(to_jsonb(new)) where key = any (v_cols);
  end if;
  if tg_op = 'UPDATE' and v_antes = v_despues then
    return new;
  end if;
  v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id', to_jsonb(new) ->> 'clave', to_jsonb(old) ->> 'clave');
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (auth.uid(),
          tg_argv[0] || case tg_op when 'INSERT' then '_creado' when 'UPDATE' then '_actualizado' else '_eliminado' end,
          tg_table_name, v_id, v_antes, v_despues);
  return coalesce(new, old);
end;
$$;
revoke execute on function public.auditar_cambio() from public, anon, authenticated;

-- Talleres: fecha, cupo, precio y estado (afectan a inscriptos y pagos).
create trigger talleres_auditar after insert or update or delete on public.talleres
  for each row execute function public.auditar_cambio('taller', '{titulo,inicia_en,termina_en,zona_horaria,cupo,precio_centavos,plataforma,estado}');

-- Cursos: el cambio de precio y estado ya lo registra auditar_curso (0007); aquí, alta y baja.
create trigger cursos_auditar_alta_baja after insert or delete on public.cursos
  for each row execute function public.auditar_cambio('curso', '{titulo,slug,precio_centavos,estado}');

-- Temario y evaluación: lo que puede afectar el avance o la corrección de alumnos.
create trigger modulos_auditar_baja after delete on public.modulos
  for each row execute function public.auditar_cambio('modulo', '{curso_id,titulo}');
create trigger lecciones_auditar_baja after delete on public.lecciones
  for each row execute function public.auditar_cambio('leccion', '{modulo_id,titulo}');
create trigger recursos_auditar after insert or delete on public.recursos_leccion
  for each row execute function public.auditar_cambio('material', '{leccion_id,titulo,ruta_almacenamiento}');
create trigger evaluaciones_auditar after update on public.evaluaciones
  for each row execute function public.auditar_cambio('evaluacion', '{curso_id,puntaje_minimo,intentos_permitidos}');
create trigger preguntas_auditar_baja after delete on public.preguntas
  for each row execute function public.auditar_cambio('pregunta', '{evaluacion_id,enunciado}');
create trigger opciones_auditar after update on public.opciones
  for each row execute function public.auditar_cambio('opcion', '{pregunta_id,es_correcta}');

-- Accesos: la revocación (la concesión ya la registra conceder_acceso).
create trigger accesos_auditar after update on public.accesos_curso
  for each row execute function public.auditar_cambio('acceso', '{perfil_id,curso_id,estado}');

-- Roles: dar o quitar permisos de administración (el rol alumno de cada registro no se anota).
create trigger roles_auditar_alta after insert on public.roles_usuario
  for each row when (new.rol = 'admin') execute function public.auditar_cambio('rol_admin', '{perfil_id,rol}');
create trigger roles_auditar_baja after delete on public.roles_usuario
  for each row when (old.rol = 'admin') execute function public.auditar_cambio('rol_admin', '{perfil_id,rol}');

-- Contenido, configuración, correos y cupones.
create trigger articulos_auditar after insert or update or delete on public.articulos
  for each row execute function public.auditar_cambio('articulo', '{titulo,slug,estado}');
create trigger configuracion_auditar after update on public.configuracion_academia
  for each row execute function public.auditar_cambio('configuracion', '{nombre,correo_contacto,whatsapp,zona_horaria,textos}');
create trigger plantillas_auditar after insert or update or delete on public.plantillas_correo
  for each row execute function public.auditar_cambio('plantilla', '{asunto,cuerpo}');
create trigger cupones_auditar after insert or update or delete on public.cupones
  for each row execute function public.auditar_cambio('cupon', '{codigo,tipo,valor,activo,vigente_desde,vigente_hasta,usos_maximos}');

-- Acciones del panel que no son un cambio de fila (por ejemplo, exportar inscriptos).
-- Solo la admin; la autora es siempre quien hace la solicitud, nunca un dato del navegador.
create or replace function public.registrar_actividad(p_accion text, p_entidad text, p_entidad_id text, p_detalle jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if p_accion !~ '^[a-z_]{3,60}$' or p_entidad !~ '^[a-z_]{3,60}$' then
    raise exception 'accion_invalida' using errcode = 'P0001';
  end if;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), p_accion, p_entidad, left(p_entidad_id, 120), coalesce(p_detalle, '{}'));
end;
$$;
revoke execute on function public.registrar_actividad(text, text, text, jsonb) from public, anon;
grant execute on function public.registrar_actividad(text, text, text, jsonb) to authenticated;

create index auditoria_fecha_idx on public.auditoria (creado_en desc);
