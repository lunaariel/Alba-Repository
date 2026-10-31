-- Ajustes del versionado (0015): materiales complementarios, correcciones menores protegidas,
-- lección de reemplazo para cambios sustanciales y objetivos fijados por versión.
begin;

do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  B constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003';
  CURSO constant uuid := 'c0000000-0000-0000-0000-000000000001';
  MOD1 constant uuid := 'd0000000-0000-0000-0000-000000000001';
  L1 constant uuid := 'e0000000-0000-0000-0000-000000000001';
  L2 constant uuid := 'e0000000-0000-0000-0000-000000000002';
  v1 uuid; v2 uuid; complemento uuid; requisito uuid; copia uuid; n int; pendientes_antes int;
  fallo text;
begin
  v1 := (select version_vigente_id from public.cursos where id = CURSO);
  requisito := (select id from public.recursos_leccion where leccion_id = L1 limit 1);

  -- 1. Una lección publicada no se edita directamente: ni título, ni descripción, ni video, ni duración.
  begin
    update public.lecciones set titulo = 'Otro contenido' where id = L1;
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'leccion_publicada', 'Editar el título de una lección publicada se rechaza: ' || fallo);
  begin
    update public.lecciones set video_id = 'otro-video' where id = L1;
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'leccion_publicada', 'Cambiar el video directamente se rechaza: ' || fallo);
  update public.lecciones set orden = orden where id = L1;   -- lo que no cambia contenido sigue permitido
  begin
    update public.modulos set titulo = 'Otro módulo' where id = MOD1;
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'modulo_publicado', 'Renombrar un módulo publicado directamente se rechaza: ' || fallo);

  -- 2. Correcciones menores declaradas.
  perform set_config('request.jwt.claim.sub', A::text, true);
  begin
    perform public.corregir_leccion_publicada(L1, 'Lección 1 corregida', null, null, 'bunny-video-1', 'ortografia', 'Faltaba una tilde.');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'no_autorizado', 'Una alumna no puede corregir lecciones: ' || fallo);
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  begin
    perform public.corregir_leccion_publicada(L1, 'Lección 1', null, null, 'bunny-video-1', 'ortografia', 'corto');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'motivo_requerido', 'Sin motivo no hay corrección: ' || fallo);
  begin
    perform public.corregir_leccion_publicada(L1, 'Cómo armar un rincón de lectura completamente nuevo', null, null, 'bunny-video-1', 'redaccion', 'Cambio el enfoque de la clase.');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'cambio_sustancial', 'Un título que reemplaza el contenido no pasa como corrección menor: ' || fallo);
  begin
    perform public.corregir_leccion_publicada(L1, 'Lección 1', null, null, 'otro-video', 'ortografia', 'Cambio de video sin declararlo.');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'correccion_no_permitida', 'Cambiar el video exige declarar un video mejorado: ' || fallo);
  begin
    perform public.corregir_leccion_publicada(L1, 'Lección 1', 'Una descripción entera nueva', null, 'bunny-video-1', 'formato', 'Agrego una descripción.');
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'cambio_sustancial', 'Agregar una descripción donde no había es sustancial: ' || fallo);

  perform public.corregir_leccion_publicada(L1, 'Lección 1 (corregida)', null, null, 'bunny-video-1', 'ortografia', 'Faltaba aclarar el número.');
  perform public.corregir_leccion_publicada(L1, 'Lección 1 (corregida)', null, 14, 'bunny-video-1b', 'video_mejorado', 'Mismo video con mejor sonido.');
  perform pruebas.afirmar((select titulo from public.lecciones where id = L1) = 'Lección 1 (corregida)'
                          and (select video_id from public.lecciones where id = L1) = 'bunny-video-1b', 'Las correcciones menores se aplican');
  perform pruebas.afirmar((select count(*) from public.auditoria where accion = 'correccion_menor' and entidad_id = L1::text and actor_id = ADMIN) = 2
                          and exists (select 1 from public.auditoria where accion = 'correccion_menor' and entidad_id = L1::text
                                        and despues ->> 'tipo' = 'video_mejorado' and (despues ->> 'video_cambiado')::boolean
                                        and despues ->> 'motivo' = 'Mismo video con mejor sonido.'),
                          'Cada corrección menor queda registrada con autora, tipo y motivo');
  perform public.corregir_modulo_publicado(MOD1, 'Módulo 1: inicio', 'redaccion', 'Nombre más claro del módulo.');
  perform pruebas.afirmar((select titulo from public.modulos where id = MOD1) = 'Módulo 1: inicio', 'El módulo admite una corrección menor declarada');
  -- La bandera de corrección no queda encendida para lo que siga en la transacción.
  begin
    update public.lecciones set titulo = 'Sin declarar' where id = L1;
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'leccion_publicada', 'Tras una corrección, la protección sigue activa: ' || fallo);

  -- 3. Cambio sustancial: lección de reemplazo en el borrador; la original queda intacta en la versión 1.
  copia := public.reemplazar_leccion(L2);
  perform pruebas.afirmar((select retirada from public.lecciones where id = L2), 'La original sale del borrador');
  perform pruebas.afirmar((select orden from public.lecciones where id = copia) = 1 and not (select retirada from public.lecciones where id = copia),
    'La copia ocupa su lugar en el borrador');
  update public.lecciones set titulo = 'Lección 2, nueva versión', video_id = 'video-nuevo' where id = copia;
  perform pruebas.afirmar(exists (select 1 from public.version_lecciones where version_id = v1 and leccion_id = L2)
                          and (select titulo from public.lecciones where id = L2) = 'Lección 2', 'La versión 1 conserva la lección original');
  perform pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'leccion_reemplazada' and entidad_id = copia::text), 'El reemplazo queda registrado');

  -- 4. Material complementario: no cambia el programa; la admin decide a qué versiones se asocia.
  perform set_config('request.jwt.claim.sub', A::text, true);
  pendientes_antes := public.lecciones_pendientes(CURSO);
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  insert into public.recursos_leccion (leccion_id, titulo, ruta_almacenamiento, tipo_mime, tamano_bytes, complementario, orden)
  values (L1, 'Lectura opcional', 'cursos/c1/opcional.pdf', 'application/pdf', 900, true, 5) returning id into complemento;
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pruebas.afirmar(not public.recurso_visible_alumno(complemento), 'Sin asociar, el complemento no se muestra');
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  n := public.asociar_complemento(complemento, array[v1]);
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform pruebas.afirmar(n = 1 and public.recurso_visible_alumno(complemento), 'Asociado a la versión 1, A lo ve sin versión nueva');
  perform pruebas.afirmar(public.lecciones_pendientes(CURSO) = pendientes_antes, 'El complemento no cambia lo que A tiene pendiente');
  perform pruebas.afirmar(not exists (select 1 from public.version_materiales where recurso_id = complemento), 'No pasa a ser requisito de ninguna versión');
  begin
    perform public.asociar_complemento(complemento, array[v1]);
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'no_autorizado', 'Una alumna no asocia complementos: ' || fallo);
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  perform pruebas.afirmar(exists (select 1 from public.auditoria where accion = 'complemento_asociado' and entidad_id = complemento::text
                                    and despues -> 'versiones' = '[1]'::jsonb), 'La asociación queda registrada');
  begin
    perform public.asociar_complemento(requisito, array[v1]);
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'material_no_complementario', 'Un material del programa no se asocia como complemento: ' || fallo);
  begin
    update public.recursos_leccion set complementario = true where id = requisito;
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'material_tipo_fijo', 'Un material que ya es requisito no pasa a complementario: ' || fallo);
  begin
    update public.recursos_leccion set complementario = false where id = complemento;
    fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'material_tipo_fijo', 'Un complemento asociado no pasa a requisito en silencio: ' || fallo);

  -- 5. Una versión nueva fija objetivos y mantiene los complementos de las lecciones que siguen.
  update public.cursos set objetivos = array['Objetivo nuevo'] where id = CURSO;
  v2 := public.publicar_version(CURSO, 'Lección 2 reemplazada y objetivos nuevos');
  perform pruebas.afirmar((select objetivos from public.versiones_curso where id = v2) = array['Objetivo nuevo']
                          and (select objetivos from public.versiones_curso where id = v1) = '{}', 'Cada versión conserva sus objetivos');
  perform pruebas.afirmar(exists (select 1 from public.version_complementos where version_id = v2 and recurso_id = complemento),
    'El complemento sigue asociado en la versión 2');
  perform pruebas.afirmar(exists (select 1 from public.version_lecciones where version_id = v2 and leccion_id = copia)
                          and not exists (select 1 from public.version_lecciones where version_id = v2 and leccion_id = L2),
    'La versión 2 lleva la lección de reemplazo');
  perform pruebas.afirmar(exists (select 1 from public.version_materiales vm join public.recursos_leccion r on r.id = vm.recurso_id
                                   where vm.version_id = v2 and r.leccion_id = L1 and not r.complementario), 'Los requisitos siguen en version_materiales');
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- La alumna no lee la tabla de asociaciones.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select pruebas.afirmar((select count(*) from public.version_complementos) = 0, 'Una alumna no lee las asociaciones de complementos');
select pruebas.afirmar((select count(*) from public.recursos_leccion where complementario) = 1, 'Pero sí ve el complemento asociado a su versión');
reset role;

-- Parecido de textos: la guarda objetiva de "corrección menor".
select pruebas.afirmar(public.similitud_texto('Qué significa acompañar', 'Qué significa acompañar.') = 1, 'La puntuación no cuenta');
select pruebas.afirmar(public.similitud_texto('Un espacio a su altura', 'Un espacio a la altura del niño') < 0.6, 'Una reescritura tiene poco parecido');

rollback;
