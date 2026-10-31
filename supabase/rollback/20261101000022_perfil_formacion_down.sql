-- Reversión de 20261101000022_perfil_formacion. SOLO entornos locales o de prueba.
-- Se niega si alguna persona cargó estos datos (se perderían).
do $$
begin
  if exists (select 1 from public.perfiles where area_laboral is not null or estudios is not null) then
    raise exception 'reversion_imposible: hay perfiles con área laboral o estudios cargados' using errcode = 'P0001';
  end if;
end $$;
alter table public.perfiles drop column area_laboral, drop column estudios;
