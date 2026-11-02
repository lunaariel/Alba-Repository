-- Huella de verificación de una base: filas y md5 del contenido de cada tabla de public y de auth.users.
-- Dos bases con la misma huella tienen exactamente los mismos datos. No muestra datos, solo resúmenes.
select tabla
       || '|' || (xpath('/row/f/text()', query_to_xml(format('select count(*) as f from %s', tabla), false, true, '')))[1]::text
       || '|' || (xpath('/row/f/text()', query_to_xml(
                    format('select coalesce(md5(string_agg(r::text, %L order by r::text)), %L) as f from %s r', '|', 'vacia', tabla), false, true, '')))[1]::text
  from (select quote_ident(n.nspname) || '.' || quote_ident(c.relname) as tabla
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where c.relkind = 'r' and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))) t
 order by 1;
