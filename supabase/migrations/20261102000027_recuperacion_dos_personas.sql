-- Recuperación administrativa con dos personas (cierre de la Fase 6A). SOLO entornos locales o de prueba.
--
-- Reemplaza el script de recuperación de una sola persona. Para quitar los segundos factores de una cuenta admin
-- hacen falta DOS identidades de base de datos distintas:
--   1. el responsable técnico (miembro directo del rol albor_recuperacion_tecnico) registra la solicitud, con el
--      motivo y el canal previamente acordado por el que verificó la identidad de la titular;
--   2. una persona o autoridad independiente (miembro directo de albor_recuperacion_aprobador, que no puede ser
--      también técnico) la aprueba dentro de las 24 horas, con su propia verificación. Recién entonces se quitan
--      los factores y se cierran todas las sesiones de la cuenta.
-- Nadie es miembro de esos roles al aplicar esta migración: el procedimiento queda bloqueado hasta que la
-- titular designe a las personas (docs/recuperacion-acceso.md). Ser superusuario no alcanza: se exige
-- pertenencia directa al rol. Todo queda en la auditoría. No se guarda ningún código ni secreto.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'albor_recuperacion_tecnico') then create role albor_recuperacion_tecnico nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'albor_recuperacion_aprobador') then create role albor_recuperacion_aprobador nologin; end if;
end $$;

create table public.recuperaciones_mfa (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  motivo text not null check (char_length(motivo) >= 20),
  canal_verificacion text not null check (char_length(canal_verificacion) >= 10),
  solicitada_por text not null,
  solicitada_en timestamptz not null default now(),
  vence_en timestamptz not null default now() + interval '24 hours',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'ejecutada', 'cancelada')),
  aprobada_por text,
  aprobada_en timestamptz,
  verificacion_aprobador text,
  cancelada_por text,
  motivo_cancelacion text,
  factores_quitados int,
  sesiones_cerradas int
);
create unique index recuperacion_pendiente_unica on public.recuperaciones_mfa (perfil_id) where estado = 'pendiente';
alter table public.recuperaciones_mfa enable row level security;
create policy recuperaciones_admin_lee on public.recuperaciones_mfa for select to authenticated using (public.es_admin());
revoke insert, update, delete on public.recuperaciones_mfa from anon, authenticated;

-- Pertenencia DIRECTA de la identidad que se conectó (session_user) a un rol del procedimiento.
create or replace function public.miembro_directo(p_rol text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member
                  where r.rolname = p_rol and u.rolname = session_user)
$$;
revoke execute on function public.miembro_directo(text) from public, anon, authenticated, service_role;

create or replace function public.solicitar_recuperacion_mfa(p_correo text, p_motivo text, p_canal text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_perfil uuid; v_id uuid;
begin
  if not public.miembro_directo('albor_recuperacion_tecnico') then
    raise exception 'no_autorizado: la solicitud la registra el responsable técnico designado (rol albor_recuperacion_tecnico)' using errcode = '42501';
  end if;
  select u.id into v_perfil from auth.users u where lower(u.email) = lower(btrim(p_correo));
  if v_perfil is null then raise exception 'cuenta_inexistente' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.roles_usuario where perfil_id = v_perfil and rol = 'admin') then
    raise exception 'no_es_admin: este procedimiento es solo para cuentas administrativas' using errcode = 'P0001';
  end if;
  update public.recuperaciones_mfa set estado = 'cancelada', cancelada_por = 'sistema', motivo_cancelacion = 'vencida sin aprobar'
   where perfil_id = v_perfil and estado = 'pendiente' and vence_en <= now();
  insert into public.recuperaciones_mfa (perfil_id, motivo, canal_verificacion, solicitada_por)
  values (v_perfil, btrim(p_motivo), btrim(p_canal), session_user) returning id into v_id;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (null, 'recuperacion_mfa_solicitada', 'recuperaciones_mfa', v_id::text,
          jsonb_build_object('perfil_id', v_perfil, 'solicitada_por', session_user, 'canal_verificacion', btrim(p_canal), 'motivo', btrim(p_motivo)));
  return v_id;
end; $$;

create or replace function public.aprobar_recuperacion_mfa(p_id uuid, p_verificacion text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.recuperaciones_mfa%rowtype; v_factores int; v_sesiones int;
begin
  if not public.miembro_directo('albor_recuperacion_aprobador') then
    raise exception 'no_autorizado: la aprobación la da la persona o autoridad independiente designada (rol albor_recuperacion_aprobador)' using errcode = '42501';
  end if;
  if public.miembro_directo('albor_recuperacion_tecnico') then
    raise exception 'roles_incompatibles: quien aprueba no puede ser también responsable técnico' using errcode = '42501';
  end if;
  select * into r from public.recuperaciones_mfa where id = p_id for update;
  if r.id is null or r.estado <> 'pendiente' then raise exception 'recuperacion_no_pendiente' using errcode = 'P0001'; end if;
  if r.vence_en <= now() then raise exception 'recuperacion_vencida: registre una solicitud nueva' using errcode = 'P0001'; end if;
  if r.solicitada_por = session_user then raise exception 'misma_persona: quien solicita no puede aprobar' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_verificacion, ''))) < 10 then
    raise exception 'verificacion_requerida: describa cómo verificó usted la identidad, por un canal independiente' using errcode = 'P0001';
  end if;
  delete from auth.mfa_factors where user_id = r.perfil_id;
  get diagnostics v_factores = row_count;
  delete from auth.sessions where user_id = r.perfil_id;
  get diagnostics v_sesiones = row_count;
  update public.recuperaciones_mfa set estado = 'ejecutada', aprobada_por = session_user, aprobada_en = now(),
         verificacion_aprobador = btrim(p_verificacion), factores_quitados = v_factores, sesiones_cerradas = v_sesiones
   where id = p_id;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (null, 'recuperacion_mfa_ejecutada', 'recuperaciones_mfa', p_id::text,
          jsonb_build_object('perfil_id', r.perfil_id, 'solicitada_por', r.solicitada_por, 'aprobada_por', session_user,
                             'verificacion_aprobador', btrim(p_verificacion), 'factores_quitados', v_factores, 'sesiones_cerradas', v_sesiones));
  return jsonb_build_object('factores_quitados', v_factores, 'sesiones_cerradas', v_sesiones);
end; $$;

create or replace function public.cancelar_recuperacion_mfa(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.miembro_directo('albor_recuperacion_tecnico') or public.miembro_directo('albor_recuperacion_aprobador')) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  update public.recuperaciones_mfa set estado = 'cancelada', cancelada_por = session_user, motivo_cancelacion = btrim(p_motivo)
   where id = p_id and estado = 'pendiente';
  if not found then raise exception 'recuperacion_no_pendiente' using errcode = 'P0001'; end if;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (null, 'recuperacion_mfa_cancelada', 'recuperaciones_mfa', p_id::text, jsonb_build_object('cancelada_por', session_user, 'motivo', btrim(p_motivo)));
end; $$;

revoke execute on function public.solicitar_recuperacion_mfa(text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.aprobar_recuperacion_mfa(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.cancelar_recuperacion_mfa(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.solicitar_recuperacion_mfa(text, text, text) to albor_recuperacion_tecnico;
grant execute on function public.aprobar_recuperacion_mfa(uuid, text) to albor_recuperacion_aprobador;
grant execute on function public.cancelar_recuperacion_mfa(uuid, text) to albor_recuperacion_tecnico, albor_recuperacion_aprobador;
grant usage on schema public to albor_recuperacion_tecnico, albor_recuperacion_aprobador;
