-- Datos de demostración para desarrollo local. TODO es ficticio y está marcado como tal.
-- Los cursos quedan en borrador: no se muestran como disponibles ni se pueden comprar.

insert into public.cursos (slug, titulo, resumen, publico, edad_desde_meses, edad_hasta_meses, duracion_minutos, precio_centavos, estado)
values
  ('ejemplo-montessori-en-casa', '[Ejemplo] Montessori en casa: un primer acercamiento',
   'Contenido de demostración. Qué cambiar en casa para que su hijo pueda hacer más por sí mismo.',
   array['familias'], 0, 72, null, 0, 'borrador'),
  ('ejemplo-autonomia-0-3', '[Ejemplo] Desarrollo y autonomía de 0 a 3 años',
   'Contenido de demostración. Movimiento, lenguaje y vida cotidiana en los primeros años.',
   array['familias','cuidadores'], 0, 36, null, 0, 'borrador'),
  ('ejemplo-ambiente-3-6', '[Ejemplo] El ambiente preparado de 3 a 6 años',
   'Contenido de demostración. Organizar materiales y espacios para el trabajo independiente.',
   array['docentes','familias'], 36, 72, null, 0, 'borrador')
on conflict (slug) do nothing;

insert into public.plantillas_correo (clave, asunto, cuerpo) values
  ('confirmacion_compra', 'Su compra en Albor', 'Hola, {{nombre}}. Recibimos su pago por «{{curso}}». Ya puede empezar desde Mis cursos.'),
  ('recordatorio_taller', 'Recordatorio: {{taller}}', 'Hola, {{nombre}}. Le recordamos el taller «{{taller}}», {{horario}}. El enlace está en Mis talleres.')
on conflict (clave) do nothing;
