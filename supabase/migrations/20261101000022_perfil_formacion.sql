-- Perfil del alumno: área laboral y estudios, opcionales (Jornada autónoma, bloque E).
-- No se piden para comprar. Los lee solo la propia persona o la admin (políticas existentes de perfiles)
-- y nunca se exponen en el sitio público ni en los certificados.
-- SOLO entornos locales o de prueba: no autorizada en producción.
alter table public.perfiles
  add column area_laboral text check (area_laboral is null or char_length(btrim(area_laboral)) between 2 and 120),
  add column estudios text check (estudios is null or char_length(btrim(estudios)) between 2 and 160);
comment on column public.perfiles.area_laboral is 'Opcional. Dato personal: solo la persona y la admin.';
comment on column public.perfiles.estudios is 'Opcional. Dato personal: solo la persona y la admin.';
