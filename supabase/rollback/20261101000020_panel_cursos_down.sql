-- Reversión de 20261101000020_panel_cursos. SOLO entornos locales o de prueba.
-- Se niega si hay revisiones descartadas (se perdería quién, cuándo y por qué). Los cursos duplicados
-- son cursos comunes: la reversión no los toca.
do $$
begin
  if exists (select 1 from public.revisiones_evaluacion where estado = 'descartada' or descartada_en is not null) then
    raise exception 'reversion_imposible: hay revisiones descartadas con su motivo' using errcode = 'P0001';
  end if;
end $$;
drop function public.duplicar_curso(uuid, text);
drop function public.descartar_revision(uuid, text);
alter table public.revisiones_evaluacion drop column descartada_por, drop column descartada_en, drop column motivo_descarte;
