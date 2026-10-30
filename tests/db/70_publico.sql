-- Un visitante ve cuántos lugares están ocupados, pero no quién se inscribió.
begin;

do $$
declare o uuid;
begin
  o := public.crear_orden('aaaaaaaa-0000-0000-0000-000000000001', 'taller', '7a000000-0000-0000-0000-000000000001');
end $$;

set local role anon;
select pruebas.afirmar(public.lugares_ocupados('7a000000-0000-0000-0000-000000000001') = 1, 'Una reserva vigente cuenta como lugar ocupado');
select pruebas.afirmar((select count(*) from public.reservas_cupo) = 0, 'El visitante no ve las reservas');
select pruebas.afirmar((select count(*) from public.inscripciones_taller) = 0, 'El visitante no ve las inscripciones');
reset role;

-- Un taller en borrador no revela nada.
insert into public.talleres (id, slug, titulo, inicia_en, termina_en, estado)
values ('7a000000-0000-0000-0000-000000000009', 'borrador', 'Borrador', now() + interval '1 day', now() + interval '1 day 1 hour', 'borrador');
set local role anon;
select pruebas.afirmar(public.lugares_ocupados('7a000000-0000-0000-0000-000000000009') is null, 'Un taller en borrador no devuelve datos');

select pruebas.afirmar(public.resumen_publico_curso('c0000000-0000-0000-0000-000000000001') = '{"materiales": 1, "evaluacion": true}'::jsonb,
  'Resumen público del curso: 1 material y evaluación');
select pruebas.afirmar(public.resumen_publico_curso('c0000000-0000-0000-0000-000000000099') is null, 'Curso inexistente o en borrador: nada');

rollback;
