-- Recuperación de acceso por pérdida del teléfono o de la app autenticadora (docs/recuperacion-acceso.md).
-- NO es un mecanismo de autoservicio ni se hace por correo: lo ejecuta una persona con acceso de dueño a la base,
-- DESPUÉS de verificar la identidad de la titular por otra vía (procedimiento documentado), y queda auditado.
--   psql "$URL_BASE" -v ON_ERROR_STOP=1 -v correo="'maestra@ejemplo.com'" -v confirmacion="'maestra@ejemplo.com'" \
--        -v responsable="'Nombre de quien lo ejecuta'" -v motivo="'Pérdida del teléfono; identidad verificada por videollamada con …'" \
--        -f scripts/recuperar-mfa.sql
-- Efecto: quita los segundos factores de esa cuenta y cierra todas sus sesiones. En el próximo ingreso, con la
-- política encendida, la administradora tendrá que activar un factor nuevo antes de entrar al panel.
-- No cambia la contraseña ni el rol. Si se sospecha que también conocen la contraseña, restablecerla antes.
begin;
select set_config('albor.responsable', btrim(:responsable), true);
create temp table _recuperacion (correo text, confirmacion text, motivo text) on commit drop;
insert into _recuperacion values (lower(btrim(:correo)), lower(btrim(:confirmacion)), btrim(:motivo));

do $$
declare r _recuperacion%rowtype; v_id uuid; v_factores int; v_sesiones int; v_responsable text := current_setting('albor.responsable', true);
begin
  select * into r from _recuperacion;
  if char_length(coalesce(v_responsable, '')) < 3 then raise exception 'responsable_requerido'; end if;
  if r.correo is distinct from r.confirmacion then raise exception 'confirmacion_incorrecta: escriba el correo dos veces'; end if;
  if char_length(coalesce(r.motivo, '')) < 20 then raise exception 'motivo_requerido: describa el motivo y cómo se verificó la identidad (20 caracteres o más)'; end if;
  select id into v_id from auth.users where lower(email) = r.correo;
  if v_id is null then raise exception 'cuenta_inexistente'; end if;
  delete from auth.mfa_factors where user_id = v_id;
  get diagnostics v_factores = row_count;
  delete from auth.sessions where user_id = v_id;   -- borra también sus refresh tokens (cascada)
  get diagnostics v_sesiones = row_count;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (null, 'segundo_factor_recuperacion', 'seguridad', v_id::text,
          jsonb_build_object('responsable', v_responsable, 'motivo', r.motivo, 'factores_quitados', v_factores,
                             'sesiones_cerradas', v_sesiones, 'via', 'script_servidor'));
  raise notice 'Factores quitados: %, sesiones cerradas: %', v_factores, v_sesiones;
end $$;
commit;
