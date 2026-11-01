-- Contenido de demostración SOLO para las capturas automáticas. Nunca se aplica en producción.
-- Todo está marcado como ejemplo.

insert into public.cursos (id, slug, titulo, resumen, publico, edad_desde_meses, edad_hasta_meses, duracion_minutos, precio_centavos, objetivos)
values
  ('c1000000-0000-0000-0000-000000000001', 'demo-montessori-en-casa', '[Ejemplo] Montessori en casa: un primer acercamiento',
   'Qué cambiar en casa para que su hijo pueda hacer más por sí mismo.', array['familias'], 0, 72, 240, 4900,
   array['Preparar un rincón de la casa a la altura del niño', 'Observar antes de intervenir']),
  ('c1000000-0000-0000-0000-000000000002', 'demo-autonomia-0-3', '[Ejemplo] Desarrollo y autonomía de 0 a 3 años',
   'Movimiento, lenguaje y vida cotidiana en los primeros años.', array['familias','cuidadores'], 0, 36, 300, 5900, '{}'),
  ('c1000000-0000-0000-0000-000000000003', 'demo-ambiente-3-6', '[Ejemplo] El ambiente preparado de 3 a 6 años',
   'Organizar materiales y espacios para el trabajo independiente.', array['docentes','familias'], 36, 72, 360, 6900, '{}');
-- Duración comercial de ejemplo (el acceso dura esto + 5 meses desde la compra). Valores de demostración.
update public.cursos set duracion_comercial_meses = 3 where id::text like 'c1000000-%';

do $$
declare c uuid; m uuid; e uuid; p uuid;
begin
  foreach c in array array['c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000003']::uuid[] loop
    insert into public.modulos (curso_id, titulo, orden) values (c, 'Observar y preparar', 0) returning id into m;
    insert into public.lecciones (modulo_id, titulo, duracion_minutos, orden) values
      (m, 'Qué significa acompañar', 12, 0), (m, 'Un espacio a su altura', 15, 1);
    insert into public.modulos (curso_id, titulo, orden) values (c, 'Vida cotidiana', 1) returning id into m;
    insert into public.lecciones (modulo_id, titulo, duracion_minutos, orden) values (m, 'Rutinas que dan autonomía', 18, 0);
    insert into public.evaluaciones (curso_id) values (c) returning id into e;
    insert into public.preguntas (evaluacion_id, enunciado, tipo, orden) values (e, 'Pregunta de ejemplo', 'unica', 0) returning id into p;
    insert into public.opciones (pregunta_id, texto, es_correcta, orden) values (p, 'Correcta', true, 0), (p, 'Incorrecta', false, 1);
    -- El material de ejemplo se agrega antes de publicar para que forme parte de la versión 1.
    if c = 'c1000000-0000-0000-0000-000000000001' then
      insert into public.recursos_leccion (leccion_id, titulo, ruta_almacenamiento, tipo_mime, tamano_bytes)
      select l.id, 'Guía para observar en casa', 'demo/guia.pdf', 'application/pdf', 480000
        from public.lecciones l join public.modulos m2 on m2.id = l.modulo_id where m2.curso_id = c and m2.orden = 0 and l.orden = 0;
    end if;
    update public.cursos set estado = 'publicado' where id = c;
  end loop;
end $$;

insert into public.talleres (slug, titulo, descripcion, inicia_en, termina_en, cupo, precio_centavos, estado) values
  ('demo-taller-limites', '[Ejemplo] Límites con respeto', 'Encuentro de ejemplo para las capturas.',
   date_trunc('hour', now()) + interval '10 days 2 hours', date_trunc('hour', now()) + interval '10 days 3 hours 30 minutes', 20, 1500, 'publicado'),
  ('demo-taller-ambiente', '[Ejemplo] Preparar el ambiente en casa', 'Encuentro de ejemplo para las capturas.',
   date_trunc('hour', now()) + interval '20 days 2 hours', date_trunc('hour', now()) + interval '20 days 3 hours 30 minutes', 2, 1500, 'publicado');

-- Talleres ofrecidos al público en la demo (la migración 0024 los deja apagados hasta su lanzamiento).
-- Así las capturas y recorridos de talleres siguen funcionando; recorrido-renovaciones prueba el estado apagado.
update public.configuracion_academia set talleres_publicos = true;
