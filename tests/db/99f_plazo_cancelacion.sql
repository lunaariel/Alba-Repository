-- Plazo de cancelación configurable por taller (0021): predeterminado 24 h, copiado en cada inscripción.
begin;

do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  B constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  ADMIN constant uuid := 'adadadad-0000-0000-0000-000000000003';
  t uuid; copia uuid; fallo text;
begin
  insert into public.talleres (slug, titulo, descripcion, inicia_en, termina_en, cupo, precio_centavos)
  values ('plazo', 'Plazo', 'Taller gratuito de prueba.', now() + interval '30 hours', now() + interval '31 hours', 5, 0) returning id into t;
  perform pruebas.afirmar((select cancelacion_horas from public.talleres where id = t) = 24, 'El plazo predeterminado es 24 horas');
  update public.talleres set cancelacion_horas = 48, estado = 'publicado' where id = t;

  -- A se inscribe con 48 h: a 30 h del inicio ya no puede cancelar.
  perform set_config('request.jwt.claim.sub', A::text, true);
  perform public.inscribirme_gratis(t);
  perform pruebas.afirmar((select cancelacion_horas from public.inscripciones_taller where taller_id = t and perfil_id = A) = 48, 'La inscripción copia el plazo vigente');
  begin perform public.cancelar_mi_inscripcion(t); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'fuera_de_plazo', 'Con 48 h de plazo, a 30 h ya no se cancela: ' || fallo);

  -- La admin acorta el plazo a 2 h: vale para inscripciones nuevas, no para A.
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  update public.talleres set cancelacion_horas = 2 where id = t;
  perform pruebas.afirmar((select count(*) from public.auditoria where accion = 'taller_actualizado' and entidad_id = t::text and despues ? 'cancelacion_horas') >= 1,
    'El cambio de plazo queda registrado');
  perform set_config('request.jwt.claim.sub', A::text, true);
  begin perform public.cancelar_mi_inscripcion(t); fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'fuera_de_plazo', 'A conserva el plazo con que se inscribió: ' || fallo);
  perform set_config('request.jwt.claim.sub', B::text, true);
  perform public.inscribirme_gratis(t);
  perform public.cancelar_mi_inscripcion(t);
  perform pruebas.afirmar((select estado from public.inscripciones_taller where taller_id = t and perfil_id = B order by creado_en desc limit 1) = 'cancelada',
    'B, inscripta con 2 h de plazo, cancela a 30 h');

  -- El plazo de una inscripción no se reescribe.
  perform set_config('request.jwt.claim.sub', '', true);
  begin update public.inscripciones_taller set cancelacion_horas = 1 where taller_id = t and perfil_id = A; fallo := 'no falló';
  exception when others then fallo := sqlerrm; end;
  perform pruebas.afirmar(fallo = 'plazo_inmutable', 'El plazo de una inscripción no cambia en silencio');

  -- Una copia hereda el plazo del taller.
  perform set_config('request.jwt.claim.sub', ADMIN::text, true);
  copia := public.duplicar_taller(t, now() + interval '10 days', now() + interval '10 days 1 hour');
  perform pruebas.afirmar((select cancelacion_horas from public.talleres where id = copia) = 2, 'La copia hereda el plazo');
  -- Fuera de rango: la base lo rechaza.
  begin update public.talleres set cancelacion_horas = 500 where id = t; fallo := 'no falló';
  exception when check_violation then fallo := 'rechazado'; end;
  perform pruebas.afirmar(fallo = 'rechazado', 'Plazo entre 0 y 336 horas');
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

rollback;
