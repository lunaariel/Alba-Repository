-- Albor · 0001 · Base común
-- Funciones auxiliares usadas por todas las tablas.

-- Actualiza actualizado_en en cada UPDATE.
create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- Normaliza un texto para usarlo como slug o código (minúsculas, sin espacios extremos).
create or replace function public.normalizar(t text)
returns text
language sql
immutable
as $$ select lower(btrim(t)) $$;
