-- Revisión de permisos de la base (bloque H). Si una migración nueva expone una función o una columna,
-- esta prueba falla y obliga a revisarla y a agregarla a la lista de forma explícita.
begin;

-- 1. Todas las tablas públicas tienen RLS.
select pruebas.afirmar(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  'Todas las tablas públicas tienen RLS: ' || coalesce((select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), ''));

-- 2. Funciones con privilegios del dueño (security definer) que puede ejecutar un visitante: solo estas.
do $$
declare permitidas text[] := array['curso_de_leccion', 'curso_de_pregunta', 'curso_publicado', 'es_admin', 'evaluaciones_equivalentes', 'inscripto_en', 'leccion_visible_alumno', 'leccion_visible_publica', 'lugares_ocupados', 'mi_evaluacion', 'mi_version', 'modulo_vigente', 'modulo_visible_alumno', 'modulo_visible_publico', 'orden_preguntas_mi_version', 'pregunta_visible_alumno', 'recurso_visible_alumno', 'resumen_publico_curso', 'temario_version', 'tiene_acceso', 'verificar_certificado', 'version_vigente_publica', 'vista_cambio_version']; reales text[]; sobra text[];
begin
  select array_agg(p.proname order by p.proname) into reales from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype and has_function_privilege('anon', p.oid, 'execute');
  select array_agg(x) into sobra from unnest(reales) x where not x = any (permitidas);
  perform pruebas.afirmar(sobra is null, 'Funciones nuevas ejecutables por visitantes (revisar): ' || coalesce(array_to_string(sobra, ', '), ''));
end $$;

-- 3. Funciones security definer que puede ejecutar cualquier sesión (no visitantes): solo estas. Cada una
--    valida por dentro es_admin() o actúa sobre auth.uid().
do $$
declare permitidas text[] := array['anotar_incidencia', 'anular_validacion', 'aplicar_revision', 'asociar_complemento', 'bloquear_contenido', 'buscar_perfil_por_correo', 'calcular_revision', 'cambiar_estado_grabacion', 'cancelar_mi_inscripcion', 'cancelar_taller', 'corregir_leccion_publicada', 'corregir_modulo_publicado', 'descartar_revision', 'duplicar_curso', 'duplicar_taller', 'enlace_taller', 'guardar_condiciones_grabacion', 'guardar_reunion', 'guardar_revision_grabacion', 'inscribirme_gratis', 'lecciones_pendientes', 'marcar_asistencia', 'marcar_notificaciones_leidas', 'mi_finalizacion', 'mis_accesos', 'mis_grabaciones', 'ocupados_taller', 'oferta_curso', 'otorgar_beca', 'politica_seguridad_vigente', 'publicar_version', 'reemplazar_leccion', 'registrar_actividad', 'registrar_evento_segundo_factor', 'reintentar_otorgamiento', 'reprogramar_taller', 'resolver_reembolso_parcial', 'responder_reprogramacion', 'revocar_beca', 'seguimiento_curso', 'tiene_acceso_grabacion', 'tiene_rol_admin', 'validar_finalizacion']; reales text[]; sobra text[];
begin
  select array_agg(p.proname order by p.proname) into reales from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute');
  select array_agg(x) into sobra from unnest(reales) x where not x = any (permitidas);
  perform pruebas.afirmar(sobra is null, 'Funciones nuevas ejecutables por sesiones (revisar): ' || coalesce(array_to_string(sobra, ', '), ''));
end $$;

-- 4. Funciones que solo debe ejecutar el servidor.
select pruebas.afirmar(not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'),
  'Solo el servidor ejecuta ' || p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('corregir_evaluacion', 'emitir_certificado', 'crear_orden', 'procesar_evento_pago', 'conceder_acceso',
   'cambiar_version', 'registrar_actividad_formativa', 'otorgar_acceso_compra', 'faltantes_publicacion', 'estado_finalizacion_de',
   'version_de', 'version_historica_de', 'crear_version', 'inscribir_cortesia',
   'agregar_periodo', 'recalcular_vencimiento_acceso', 'revocar_periodo_interno', 'otorgar_compra_curso', 'reintentar_otorgamiento_orden',
   'revocar_periodos_orden', 'talleres_publicos', 'conciliar_periodos', 'acceso_cubierto', 'proximo_inicio_acceso',
   'exigir_verificacion_reforzada', 'mfa_admin_activo', 'claims_sesion');

-- 5. Columnas secretas que ningún cliente lee.
select pruebas.afirmar(not has_column_privilege(r, t::regclass, c, 'select'), format('%s no lee %s.%s', r, t, c))
  from (values ('public.opciones', 'es_correcta'), ('public.lecciones', 'video_id'), ('public.reuniones', 'enlace_anfitrion'),
               ('public.reuniones', 'enlace_participante'), ('public.respuestas_intento', 'correcta')) x(t, c),
       unnest(array['anon', 'authenticated']) r;

-- 5b. Períodos de acceso: motivos y responsables internos; ningún cliente escribe.
select pruebas.afirmar(not exists (select 1 from pg_policies where tablename = 'periodos_acceso' and (cmd <> 'SELECT' or 'anon' = any (roles))),
  'Períodos: solo lectura de la admin, sin escritura de clientes');

-- 6. Datos personales nuevos: no legibles por visitantes.
select pruebas.afirmar(not has_table_privilege('anon', 'public.validaciones_formativas', 'select')
  or not exists (select 1 from pg_policies where tablename = 'validaciones_formativas' and 'anon' = any (roles)),
  'Las validaciones docentes no son legibles por visitantes');

rollback;
