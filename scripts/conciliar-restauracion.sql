-- Conciliación posterior a una restauración (o a una migración): integridad referencial, registros académicos,
-- órdenes y períodos de acceso, y certificados. Falla (error) ante cualquier diferencia.
do $$
declare v int; r record;
begin
  -- Integridad referencial: todas las claves foráneas validadas; además, cero filas huérfanas en cada una.
  if exists (select 1 from pg_constraint where contype = 'f' and not convalidated) then raise exception 'clave foránea sin validar'; end if;
  for r in select conrelid::regclass t, confrelid::regclass p, conname, pg_get_constraintdef(oid) d
             from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace and array_length(conkey, 1) = 1 loop
    execute format('select count(*) from %s h where %I is not null and not exists (select 1 from %s x where x.%I = h.%I)',
                   r.t, (select attname from pg_attribute where attrelid = r.t and attnum = (select conkey[1] from pg_constraint where conname = r.conname and conrelid = r.t)),
                   r.p, (select attname from pg_attribute where attrelid = r.p and attnum = (select confkey[1] from pg_constraint where conname = r.conname and conrelid = r.t)),
                   (select attname from pg_attribute where attrelid = r.t and attnum = (select conkey[1] from pg_constraint where conname = r.conname and conrelid = r.t))) into v;
    if v > 0 then raise exception 'huérfanos en % (%): %', r.t, r.conname, v; end if;
  end loop;
  -- Períodos de acceso coherentes con los accesos (función de 0024).
  select count(*) into v from public.conciliar_periodos();
  if v > 0 then raise exception 'conciliar_periodos: % diferencias', v; end if;
  -- Cada orden aprobada tiene su pago aprobado.
  select count(*) into v from public.ordenes o where o.estado = 'aprobada' and not exists (select 1 from public.pagos p where p.orden_id = o.id and p.estado = 'aprobado');
  if v > 0 then raise exception 'órdenes aprobadas sin pago aprobado: %', v; end if;
  -- Certificados: código único y datos congelados presentes; intentos con su evaluación.
  select count(*) - count(distinct codigo_verificacion) into v from public.certificados;
  if v > 0 then raise exception 'códigos de certificado repetidos: %', v; end if;
  raise notice 'conciliación en cero';
end $$;
select 'conciliación en cero';
