-- Albor · 0024 · Períodos de acceso: renovaciones, becas y reembolsos por compra (correcciones D1–D5 y D7)
-- Decisión de la titular (01/11/2026): una inscripción académica estable por persona y curso
-- (accesos_curso: versión, avance, intentos, resultados y certificados) y, aparte, los derechos de
-- acceso en períodos (compra, beca o concesión), cada uno con su origen, fechas, condiciones y estado.
--
-- · Volver a comprar un curso vencido abre un período nuevo desde la confirmación del pago: no borra ni
--   reinicia nada, no cambia la versión académica y no da intentos nuevos.
-- · Si el pago se confirma mientras hay un período vigente, el nuevo se encadena al final (no acorta ni
--   duplica) y queda una incidencia para que la admin decida.
-- · Un pago confirmado nunca queda sin acceso y sin incidencia: si el otorgamiento falla, se registra una
--   incidencia recuperable (reintento idempotente).
-- · Un reembolso o contracargo revoca solo el período de esa compra. Un reembolso parcial no revoca:
--   queda una incidencia.
-- · Becas: duración configurable (inicio, fin o «sin vencimiento» expreso), motivo, responsable y
--   auditoría. No generan órdenes, pagos ni recibos.
-- · Órdenes pendientes sin condiciones registradas (anteriores a 0019): no se convierten en acceso
--   indefinido; se clasifican y quedan como incidencia.
-- · Talleres: no se ofrecen al público hasta que se autorice su lanzamiento (interruptor apagado).
-- SOLO entornos locales o de prueba: no autorizada en producción.

-- ============================================================ 1. Tabla de períodos
create table public.periodos_acceso (
  id uuid primary key default gen_random_uuid(),
  acceso_id uuid not null references public.accesos_curso (id) on delete cascade,
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  curso_id uuid not null references public.cursos (id) on delete restrict,
  origen text not null check (origen in ('compra','beca','concesion')),
  item_orden_id uuid references public.items_orden (id) on delete restrict,
  inicia_en timestamptz not null,
  vence_en timestamptz,                                -- null = sin vencimiento (solo si se otorgó así)
  condiciones jsonb not null,                          -- congeladas al otorgar
  precio_centavos int check (precio_centavos >= 0),    -- compras: precio pagado
  version_id uuid references public.versiones_curso (id) on delete restrict,  -- versión al otorgar (referencia)
  motivo text,
  responsable text,
  otorgado_por uuid references public.perfiles (id) on delete set null,
  historico boolean not null default false,            -- creado al migrar un acceso anterior
  estado text not null default 'activo' check (estado in ('activo','revocado')),
  revocado_en timestamptz,
  revocado_motivo text,
  revocado_por uuid references public.perfiles (id) on delete set null,
  creado_en timestamptz not null default now(),
  check (vence_en is null or vence_en > inicia_en),
  check (origen <> 'compra' or item_orden_id is not null),
  check (origen = 'compra' or item_orden_id is null),
  check (origen <> 'beca' or (char_length(btrim(coalesce(motivo, ''))) >= 10 and char_length(btrim(coalesce(responsable, ''))) >= 3)),
  check ((estado = 'revocado') = (revocado_en is not null))
);
-- Un ítem comprado da un solo período: procesar dos veces el mismo pago no duplica derechos.
create unique index periodos_un_item on public.periodos_acceso (item_orden_id) where item_orden_id is not null;
create index periodos_acceso_idx on public.periodos_acceso (acceso_id);
create index periodos_perfil_curso_idx on public.periodos_acceso (perfil_id, curso_id);

alter table public.periodos_acceso enable row level security;
-- Motivos y responsables son internos: solo la admin lee la tabla. La alumna ve su vencimiento en su acceso.
create policy periodos_admin on public.periodos_acceso for select to authenticated using (public.es_admin());

-- Perfil y curso salen siempre del acceso (no se aceptan valores sueltos).
create or replace function public.completar_periodo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select perfil_id, curso_id into new.perfil_id, new.curso_id from public.accesos_curso where id = new.acceso_id;
  return new;
end; $$;
create trigger periodos_completar before insert on public.periodos_acceso
  for each row execute function public.completar_periodo();

-- Un período no se reescribe: solo puede pasar de activo a revocado, una vez, con motivo.
create or replace function public.proteger_periodo()
returns trigger language plpgsql as $$
begin
  if old.estado = 'revocado'
     or (new.acceso_id, new.perfil_id, new.curso_id, new.origen, new.item_orden_id, new.inicia_en, new.vence_en, new.condiciones,
         new.precio_centavos, new.version_id, new.motivo, new.responsable, new.otorgado_por, new.historico, new.creado_en)
        is distinct from
        (old.acceso_id, old.perfil_id, old.curso_id, old.origen, old.item_orden_id, old.inicia_en, old.vence_en, old.condiciones,
         old.precio_centavos, old.version_id, old.motivo, old.responsable, old.otorgado_por, old.historico, old.creado_en) then
    raise exception 'periodo_inmutable' using errcode = 'P0001';
  end if;
  if new.estado = 'revocado' and char_length(btrim(coalesce(new.revocado_motivo, ''))) < 5 then
    raise exception 'motivo_requerido' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger periodos_inmutables before update on public.periodos_acceso
  for each row execute function public.proteger_periodo();

-- ============================================================ 2. Vencimiento derivado del acceso
-- El vencimiento guardado en accesos_curso (que usan tiene_acceso, version_de y el campus) es siempre el
-- fin del último período activo, o nulo si alguno es sin vencimiento. Sin períodos activos (todos
-- revocados) el acceso queda revocado, como antes; su historial académico no se toca.
-- Lo escribe solo esta función.
create or replace function public.recalcular_vencimiento_acceso(p_acceso uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_a public.accesos_curso%rowtype; v_n int; v_sin boolean; v_max timestamptz; v_nuevo timestamptz;
begin
  select * into v_a from public.accesos_curso where id = p_acceso for update;
  select count(*), coalesce(bool_or(vence_en is null), false), max(vence_en) into v_n, v_sin, v_max
    from public.periodos_acceso where acceso_id = p_acceso and estado = 'activo';
  if v_n = 0 then
    if v_a.estado = 'activo' then
      update public.accesos_curso set estado = 'revocado', revocado_en = now() where id = p_acceso;
    end if;
    return;
  end if;
  v_nuevo := case when v_sin then null else v_max end;
  if v_nuevo is distinct from v_a.vence_en then
    perform set_config('albor.ajuste_vencimiento', 'si', true);
    update public.accesos_curso set vence_en = v_nuevo where id = p_acceso;
    perform set_config('albor.ajuste_vencimiento', '', true);
  end if;
end; $$;

-- Inserción de accesos: el flujo controlado (agregar_periodo) fija las fechas y crea el período él mismo.
-- Cualquier otra inserción conserva la regla de 0019 y recibe su período automáticamente.
-- Una compra sin condiciones registradas ya no da un acceso sin vencimiento (D5): se rechaza.
create or replace function public.fijar_vencimiento_acceso()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cond jsonb;
begin
  if coalesce(current_setting('albor.periodo_controlado', true), '') = 'si' then
    new.inicia_en := coalesce(new.inicia_en, now());
    return new;
  end if;
  new.inicia_en := coalesce(new.inicia_en, now());
  if new.origen = 'compra' then
    select condiciones_acceso into v_cond from public.items_orden where id = new.item_orden_id;
    if not (coalesce(v_cond, '{}') ? 'total_meses') then
      raise exception 'compra_sin_condiciones' using errcode = 'P0001';
    end if;
    new.condiciones := v_cond;
    new.vence_en := public.calcular_vencimiento(new.inicia_en, (v_cond ->> 'total_meses')::int);
  else
    new.condiciones := jsonb_build_object('regla', 'concesion_sin_vencimiento');
    new.vence_en := null;
  end if;
  return new;
end; $$;

create or replace function public.crear_periodo_inicial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('albor.periodo_controlado', true), '') = 'si' then return new; end if;
  insert into public.periodos_acceso (acceso_id, origen, item_orden_id, inicia_en, vence_en, condiciones, precio_centavos,
                                      version_id, motivo, estado, revocado_en, revocado_motivo)
  values (new.id, case when new.origen = 'compra' then 'compra' else 'concesion' end, new.item_orden_id, new.inicia_en, new.vence_en,
          coalesce(new.condiciones, '{}'::jsonb), (select precio_centavos from public.items_orden where id = new.item_orden_id),
          new.version_id, new.motivo,
          case when new.estado = 'activo' then 'activo' else 'revocado' end,
          case when new.estado = 'activo' then null else coalesce(new.revocado_en, now()) end,
          case when new.estado = 'activo' then null else 'Acceso registrado como revocado' end);
  return new;
end; $$;
create trigger accesos_periodo_inicial after insert on public.accesos_curso
  for each row execute function public.crear_periodo_inicial();

-- ============================================================ 3. Migración de los accesos existentes
-- Cada acceso recibe un período histórico con sus mismas fechas y condiciones: nada vence de forma
-- retroactiva y las cortesías anteriores siguen sin vencimiento.
insert into public.periodos_acceso (acceso_id, perfil_id, curso_id, origen, item_orden_id, inicia_en, vence_en, condiciones,
                                    precio_centavos, version_id, motivo, historico, estado, revocado_en, revocado_motivo, creado_en)
select a.id, a.perfil_id, a.curso_id, case when a.origen = 'compra' then 'compra' else 'concesion' end, a.item_orden_id,
       coalesce(a.inicia_en, a.creado_en), a.vence_en,
       coalesce(a.condiciones, jsonb_build_object('regla', 'anterior_sin_vencimiento')),
       i.precio_centavos, a.version_id, a.motivo, true,
       case when a.estado = 'activo' then 'activo' else 'revocado' end,
       case when a.estado = 'activo' then null else coalesce(a.revocado_en, a.creado_en) end,
       case when a.estado = 'activo' then null else 'Acceso revocado antes de los períodos' end,
       a.creado_en
  from public.accesos_curso a
  left join public.items_orden i on i.id = a.item_orden_id;

-- ============================================================ 4. Incidencias nuevas
alter table public.incidencias drop constraint if exists incidencias_tipo_check;
alter table public.incidencias add constraint incidencias_tipo_check
  check (tipo in ('pago_sin_cupo','reembolso_por_cancelacion','reembolso_por_reprogramacion',
                  'pago_sin_condiciones','otorgamiento_fallido','compra_con_acceso_vigente','orden_sin_condiciones',
                  'reembolso_parcial','revisar_periodos'));

-- D5: órdenes de curso pendientes sin condiciones registradas. No se inventan condiciones ni se
-- convierten en acceso: la orden vence y queda una incidencia para revisión.
with afectadas as (
  select distinct on (o.id) o.id, o.perfil_id, i.curso_id, o.total_centavos, o.creado_en
    from public.ordenes o join public.items_orden i on i.orden_id = o.id
   where o.estado = 'pendiente' and i.curso_id is not null and not (coalesce(i.condiciones_acceso, '{}') ? 'total_meses')
), vencidas as (
  update public.ordenes o set estado = 'vencida' from afectadas a where o.id = a.id returning o.id
)
insert into public.incidencias (tipo, orden_id, perfil_id, detalle)
select 'orden_sin_condiciones', a.id, a.perfil_id,
       jsonb_build_object('curso', a.curso_id, 'total_centavos', a.total_centavos, 'creada', a.creado_en, 'estado_previo', 'pendiente',
                          'motivo', 'Orden anterior a las condiciones de acceso: no se puede determinar qué se ofreció.')
  from afectadas a where a.id in (select id from vencidas);

-- ============================================================ 5. Núcleo: agregar un período
-- Único camino para dar derechos: compra, beca o concesión. Serializa por persona y curso, reutiliza la
-- inscripción académica (activa, o la última revocada) y solo crea una nueva si nunca existió.
create or replace function public.agregar_periodo(
  p_perfil uuid, p_curso uuid, p_origen text, p_item uuid, p_inicio timestamptz, p_vence timestamptz, p_meses int,
  p_sin_vencimiento boolean, p_condiciones jsonb, p_precio int, p_motivo text, p_responsable text, p_actor uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_a public.accesos_curso%rowtype;
  v_vigente boolean;
  v_inicio timestamptz;
  v_vence timestamptz;
  v_modo text;
  v_periodo uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('acceso:' || p_perfil || ':' || p_curso, 0));
  select * into v_a from public.accesos_curso where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo' for update;
  if v_a.id is null then
    select * into v_a from public.accesos_curso where perfil_id = p_perfil and curso_id = p_curso and estado = 'revocado'
     order by creado_en desc limit 1 for update;
  end if;
  v_vigente := v_a.id is not null and v_a.estado = 'activo' and (v_a.vence_en is null or v_a.vence_en > now());

  if p_inicio is null then
    if p_origen = 'compra' and v_vigente and v_a.vence_en is not null then
      v_inicio := v_a.vence_en; v_modo := 'encadenado';       -- empieza cuando termina el vigente
    elsif v_vigente then
      v_inicio := now(); v_modo := 'superpuesto';
    else
      v_inicio := now(); v_modo := 'otorgado';
    end if;
  else
    -- Un inicio futuro solo se admite si continúa un derecho vigente (sin huecos ni fechas ambiguas).
    if p_inicio > now() and not (v_vigente and (v_a.vence_en is null or p_inicio <= v_a.vence_en)) then
      raise exception 'inicio_futuro' using errcode = 'P0001';
    end if;
    v_inicio := p_inicio;
    v_modo := case when v_vigente then 'superpuesto' else 'otorgado' end;
  end if;

  if coalesce(p_sin_vencimiento, false) then
    v_vence := null;
  elsif p_meses is not null then
    v_vence := public.calcular_vencimiento(v_inicio, p_meses);
  else
    v_vence := p_vence;
    if v_vence is null then raise exception 'fin_requerido' using errcode = 'P0001'; end if;
  end if;
  if v_vence is not null and v_vence <= now() then raise exception 'fin_pasado' using errcode = 'P0001'; end if;
  if v_vence is not null and v_vence <= v_inicio then raise exception 'fin_invalido' using errcode = 'P0001'; end if;

  perform set_config('albor.periodo_controlado', 'si', true);
  if v_a.id is null then
    insert into public.accesos_curso (perfil_id, curso_id, origen, item_orden_id, motivo, inicia_en, vence_en, condiciones)
    values (p_perfil, p_curso, case when p_origen = 'compra' then 'compra' else 'concesion' end, p_item,
            case when p_origen = 'compra' then null else p_motivo end, v_inicio, v_vence, p_condiciones)
    returning * into v_a;
  elsif v_a.estado = 'revocado' then
    update public.accesos_curso set estado = 'activo', revocado_en = null where id = v_a.id;
    insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
    values (p_actor, 'acceso_reactivado', 'accesos_curso', v_a.id::text,
            jsonb_build_object('estado', 'revocado', 'revocado_en', v_a.revocado_en, 'version', v_a.version_id),
            jsonb_build_object('estado', 'activo', 'origen', p_origen, 'version', v_a.version_id));
  end if;
  insert into public.periodos_acceso (acceso_id, origen, item_orden_id, inicia_en, vence_en, condiciones, precio_centavos,
                                      version_id, motivo, responsable, otorgado_por)
  values (v_a.id, p_origen, p_item, v_inicio, v_vence, p_condiciones, p_precio, v_a.version_id, p_motivo, p_responsable, p_actor)
  returning id into v_periodo;
  perform set_config('albor.periodo_controlado', '', true);
  perform public.recalcular_vencimiento_acceso(v_a.id);

  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (p_actor, 'periodo_otorgado', 'periodos_acceso', v_periodo::text,
          jsonb_build_object('acceso', v_a.id, 'perfil', p_perfil, 'curso', p_curso, 'origen', p_origen, 'item', p_item, 'modo', v_modo,
                             'inicia_en', v_inicio, 'vence_en', v_vence, 'motivo', p_motivo, 'responsable', p_responsable,
                             'version', v_a.version_id));
  return jsonb_build_object('acceso', v_a.id, 'periodo', v_periodo, 'modo', v_modo, 'inicia_en', v_inicio, 'vence_en', v_vence);
end; $$;

-- Revoca un período con su motivo y recalcula el acceso. No borra nada.
create or replace function public.revocar_periodo_interno(p_periodo uuid, p_motivo text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_p public.periodos_acceso%rowtype;
begin
  select * into v_p from public.periodos_acceso where id = p_periodo for update;
  if v_p.id is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  if v_p.estado = 'revocado' then raise exception 'periodo_ya_revocado' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('acceso:' || v_p.perfil_id || ':' || v_p.curso_id, 0));
  update public.periodos_acceso set estado = 'revocado', revocado_en = now(), revocado_motivo = btrim(p_motivo), revocado_por = p_actor
   where id = p_periodo;
  perform public.recalcular_vencimiento_acceso(v_p.acceso_id);
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (p_actor, 'periodo_revocado', 'periodos_acceso', p_periodo::text,
          jsonb_build_object('estado', 'activo', 'origen', v_p.origen, 'inicia_en', v_p.inicia_en, 'vence_en', v_p.vence_en),
          jsonb_build_object('estado', 'revocado', 'motivo', btrim(p_motivo)));
end; $$;

-- ============================================================ 6. Compras: otorgamiento idempotente y recuperable (D1)
create or replace function public.otorgar_compra_curso(p_item uuid, p_evento text)
returns text language plpgsql security definer set search_path = public as $$
declare v_item public.items_orden%rowtype; v_orden public.ordenes%rowtype; v_r jsonb;
begin
  select * into v_item from public.items_orden where id = p_item;
  select * into v_orden from public.ordenes where id = v_item.orden_id;
  if exists (select 1 from public.periodos_acceso where item_orden_id = p_item) then return 'ya_otorgado'; end if;
  if not (coalesce(v_item.condiciones_acceso, '{}') ? 'total_meses') then
    insert into public.incidencias (tipo, orden_id, perfil_id, detalle)
    values ('pago_sin_condiciones', v_orden.id, v_orden.perfil_id,
            jsonb_build_object('curso', v_item.curso_id, 'item', p_item, 'evento', p_evento,
                               'motivo', 'La orden no registra las condiciones aceptadas: no se otorga un acceso inventado.'))
    on conflict do nothing;
    insert into public.auditoria (accion, entidad, entidad_id, despues)
    values ('acceso_no_otorgado', 'ordenes', v_orden.id::text, jsonb_build_object('motivo', 'sin_condiciones', 'item', p_item));
    return 'sin_condiciones';
  end if;
  begin
    v_r := public.agregar_periodo(v_orden.perfil_id, v_item.curso_id, 'compra', p_item, null, null,
                                  (v_item.condiciones_acceso ->> 'total_meses')::int, false, v_item.condiciones_acceso,
                                  v_item.precio_centavos, null, 'Pago confirmado por la pasarela', null);
  exception when others then
    -- El pago ya está registrado: se deja una incidencia recuperable en lugar de perderlo en silencio.
    insert into public.incidencias (tipo, orden_id, perfil_id, detalle)
    values ('otorgamiento_fallido', v_orden.id, v_orden.perfil_id,
            jsonb_build_object('curso', v_item.curso_id, 'item', p_item, 'evento', p_evento, 'error', sqlerrm, 'codigo', sqlstate))
    on conflict (tipo, orden_id) where orden_id is not null
    do update set estado = 'abierta', detalle = excluded.detalle, actualizado_en = now();
    return 'fallido';
  end;
  if v_r ->> 'modo' in ('encadenado', 'superpuesto') then
    insert into public.incidencias (tipo, orden_id, perfil_id, detalle)
    values ('compra_con_acceso_vigente', v_orden.id, v_orden.perfil_id,
            jsonb_build_object('curso', v_item.curso_id, 'item', p_item, 'modo', v_r ->> 'modo', 'inicia_en', v_r -> 'inicia_en',
                               'vence_en', v_r -> 'vence_en', 'evento', p_evento))
    on conflict do nothing;
  end if;
  return v_r ->> 'modo';
end; $$;

-- Reintenta el otorgamiento de una orden aprobada. Idempotente: lo ya otorgado no se repite.
create or replace function public.reintentar_otorgamiento_orden(p_orden uuid, p_nota text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_item public.items_orden%rowtype; v_r text; v_ok boolean := true;
begin
  if (select estado from public.ordenes where id = p_orden) is distinct from 'aprobada' then
    raise exception 'orden_no_aprobada' using errcode = 'P0001';
  end if;
  for v_item in select * from public.items_orden where orden_id = p_orden and curso_id is not null loop
    v_r := public.otorgar_compra_curso(v_item.id, 'reintento');
    if v_r in ('fallido', 'sin_condiciones') then v_ok := false; end if;
  end loop;
  if v_ok then
    update public.incidencias set estado = 'resuelta', nota = btrim(p_nota), actualizado_en = now()
     where orden_id = p_orden and tipo = 'otorgamiento_fallido' and estado <> 'resuelta';
  end if;
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (auth.uid(), 'otorgamiento_reintentado', 'ordenes', p_orden::text, jsonb_build_object('resultado', v_ok, 'nota', btrim(p_nota)));
  return v_ok;
end; $$;

-- La admin reintenta desde el panel.
create or replace function public.reintentar_otorgamiento(p_incidencia uuid, p_nota text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_i public.incidencias%rowtype;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_nota, ''))) < 5 then raise exception 'nota_requerida' using errcode = 'P0001'; end if;
  select * into v_i from public.incidencias where id = p_incidencia;
  if v_i.id is null or v_i.tipo <> 'otorgamiento_fallido' then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  return public.reintentar_otorgamiento_orden(v_i.orden_id, p_nota);
end; $$;

-- Reembolso o contracargo confirmados: revocan solo los períodos de esa orden.
create or replace function public.revocar_periodos_orden(p_orden uuid, p_motivo text, p_evento text)
returns int language plpgsql security definer set search_path = public as $$
declare v_p public.periodos_acceso%rowtype; v_n int := 0; v_accesos uuid[] := '{}';
begin
  for v_p in select p.* from public.periodos_acceso p join public.items_orden i on i.id = p.item_orden_id
              where i.orden_id = p_orden and p.estado = 'activo' loop
    perform public.revocar_periodo_interno(v_p.id, p_motivo || ' (evento ' || p_evento || ')', null);
    v_accesos := v_accesos || v_p.acceso_id;
    v_n := v_n + 1;
  end loop;
  -- Si quedan períodos posteriores encadenados, el vencimiento derivado puede dar más días de los
  -- comprados en el período siguiente: la admin lo revisa.
  if exists (select 1 from public.periodos_acceso where acceso_id = any (v_accesos) and estado = 'activo' and inicia_en > now()) then
    insert into public.incidencias (tipo, orden_id, perfil_id, detalle)
    select 'revisar_periodos', p_orden, (select perfil_id from public.ordenes where id = p_orden),
           jsonb_build_object('motivo', 'Se revocó un período con otro encadenado después', 'evento', p_evento)
    on conflict do nothing;
  end if;
  return v_n;
end; $$;

-- ============================================================ 7. Becas y concesiones (D3)
create or replace function public.otorgar_beca(
  p_perfil uuid, p_curso uuid, p_inicio timestamptz, p_fin timestamptz, p_sin_vencimiento boolean, p_motivo text, p_responsable text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_r jsonb;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'motivo_requerido' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_responsable, ''))) < 3 then raise exception 'responsable_requerido' using errcode = 'P0001'; end if;
  -- Fin o «sin vencimiento», de forma expresa y excluyente.
  if coalesce(p_sin_vencimiento, false) = (p_fin is not null) then raise exception 'fin_o_sin_vencimiento' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.perfiles where id = p_perfil) then raise exception 'persona_inexistente' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.cursos where id = p_curso and version_vigente_id is not null) then
    raise exception 'curso_sin_version' using errcode = 'P0001';
  end if;
  v_r := public.agregar_periodo(p_perfil, p_curso, 'beca', null, p_inicio, p_fin, null, p_sin_vencimiento,
                                jsonb_build_object('regla', case when coalesce(p_sin_vencimiento, false) then 'beca_sin_vencimiento' else 'beca_con_fin' end,
                                                   'fin', p_fin, 'otorgada_en', now()),
                                null, btrim(p_motivo), btrim(p_responsable), auth.uid());
  return (v_r ->> 'periodo')::uuid;
end; $$;

-- Revocar una beca o concesión. Las compras se revocan solo con un reembolso confirmado.
create or replace function public.revocar_beca(p_periodo uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_origen text;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then raise exception 'motivo_requerido' using errcode = 'P0001'; end if;
  select origen into v_origen from public.periodos_acceso where id = p_periodo;
  if v_origen is null then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  if v_origen = 'compra' then raise exception 'compra_solo_con_reembolso' using errcode = 'P0001'; end if;
  perform public.revocar_periodo_interno(p_periodo, p_motivo, auth.uid());
end; $$;

-- Concesión del servidor (anterior a las becas): ahora también funciona sobre un acceso vencido.
-- Conserva su regla histórica: sin vencimiento.
create or replace function public.conceder_acceso(p_admin uuid, p_perfil uuid, p_curso uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_r jsonb;
begin
  if not exists (select 1 from public.roles_usuario where perfil_id = p_admin and rol = 'admin') then
    raise exception 'no_autorizado' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'motivo_requerido' using errcode = 'P0001'; end if;
  v_r := public.agregar_periodo(p_perfil, p_curso, 'concesion', null, null, null, null, true,
                                jsonb_build_object('regla', 'concesion_sin_vencimiento'), null, btrim(p_motivo),
                                (select nombre_completo from public.perfiles where id = p_admin), p_admin);
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, despues)
  values (p_admin, 'acceso_concedido', 'accesos_curso', v_r ->> 'acceso',
          jsonb_build_object('perfil', p_perfil, 'curso', p_curso, 'motivo', p_motivo, 'periodo', v_r ->> 'periodo'));
  return (v_r ->> 'acceso')::uuid;
end; $$;

-- La admin busca a la persona por su correo para otorgarle una beca (el correo vive en auth.users).
create or replace function public.buscar_perfil_por_correo(p_correo text)
returns table (perfil_id uuid, nombre text) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return query select p.id, p.nombre_completo from auth.users u join public.perfiles p on p.id = u.id
                where lower(u.email) = lower(btrim(p_correo));
end; $$;

-- ============================================================ 8. Talleres: no se ofrecen al público hasta su lanzamiento
-- Decisión de la titular: primero se lanzan los cursos. El módulo de talleres se conserva entero; solo se
-- apaga la oferta pública (nuevas órdenes e inscripciones propias). La admin puede seguir trabajando y las
-- inscripciones existentes no cambian.
alter table public.configuracion_academia add column talleres_publicos boolean not null default false;
create trigger configuracion_auditar_talleres after update of talleres_publicos on public.configuracion_academia
  for each row execute function public.auditar_cambio('configuracion', '{talleres_publicos}');

create or replace function public.talleres_publicos()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select talleres_publicos from public.configuracion_academia limit 1), false);
$$;

create or replace function public.inscribirme_gratis(p_taller uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sin_sesion' using errcode = '42501'; end if;
  if not public.talleres_publicos() then raise exception 'talleres_no_disponibles' using errcode = 'P0001'; end if;
  return public.inscribir_en_taller(auth.uid(), p_taller, 'gratuita');
end; $$;

-- ============================================================ 9. Órdenes: renovación y órdenes desactualizadas (D2)
create or replace function public.crear_orden(
  p_perfil uuid, p_tipo text, p_producto uuid, p_cupon text default null,
  p_minutos_reserva int default 15
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_clave text := p_tipo || ':' || p_producto;
  v_orden uuid;
  v_pendiente public.ordenes%rowtype;
  v_item_prev public.items_orden%rowtype;
  v_precio int;
  v_titulo text;
  v_meses int;
  v_motivo text;
  v_cupon public.cupones%rowtype;
  v_descuento int := 0;
  v_taller public.talleres%rowtype;
  v_ocupados int;
begin
  if p_tipo not in ('curso','taller') then raise exception 'tipo_invalido' using errcode = 'P0001'; end if;

  if p_tipo = 'curso' then
    select precio_centavos, titulo, duracion_comercial_meses into v_precio, v_titulo, v_meses from public.cursos
     where id = p_producto and estado = 'publicado';
    if not found then raise exception 'curso_no_disponible' using errcode = 'P0001'; end if;
    -- Solo un derecho vigente impide comprar: un acceso vencido (o revocado) se puede renovar.
    if exists (select 1 from public.accesos_curso where perfil_id = p_perfil and curso_id = p_producto and estado = 'activo'
                and (vence_en is null or vence_en > now())) then
      raise exception 'ya_tiene_acceso' using errcode = 'P0001';
    end if;
    -- La orden pendiente se reutiliza (doble clic, recarga) solo si sigue ofreciendo exactamente lo mismo.
    -- Si cambió el precio o las condiciones, o pasaron 24 h, vence y se crea otra con la oferta vigente:
    -- nunca se cambia en silencio lo que la persona aceptó.
    select * into v_pendiente from public.ordenes
     where perfil_id = p_perfil and clave_producto = v_clave and estado = 'pendiente' for update;
    if v_pendiente.id is not null then
      select * into v_item_prev from public.items_orden where orden_id = v_pendiente.id and curso_id = p_producto limit 1;
      v_motivo := case
        when v_pendiente.creado_en <= now() - interval '24 hours' then 'vencida_por_tiempo'
        when v_item_prev.precio_centavos is distinct from v_precio then 'precio_cambiado'
        when not (coalesce(v_item_prev.condiciones_acceso, '{}') ? 'total_meses') then 'sin_condiciones'
        when (v_item_prev.condiciones_acceso ->> 'duracion_meses')::int is distinct from v_meses
          or (v_item_prev.condiciones_acceso ->> 'meses_adicionales')::int is distinct from public.meses_adicionales_acceso() then 'condiciones_cambiadas'
        when p_cupon is not null and upper(btrim(p_cupon)) is distinct from (select codigo from public.cupones where id = v_pendiente.cupon_id) then 'cupon_distinto'
        else null end;
      if v_motivo is null then return v_pendiente.id; end if;
      update public.ordenes set estado = 'vencida' where id = v_pendiente.id;
      insert into public.auditoria (accion, entidad, entidad_id, antes, despues)
      values ('orden_desactualizada', 'ordenes', v_pendiente.id::text, jsonb_build_object('estado', 'pendiente'),
              jsonb_build_object('estado', 'vencida', 'motivo', v_motivo));
    end if;
  else
    -- Reutiliza la orden pendiente de un taller mientras su reserva siga vigente; si no, esa orden vence.
    select id into v_orden from public.ordenes
     where perfil_id = p_perfil and clave_producto = v_clave and estado = 'pendiente'
     for update;
    if v_orden is not null then
      if exists (select 1 from public.reservas_cupo where orden_id = v_orden and liberada_en is null and vence_en > now()) then
        return v_orden;
      end if;
      update public.reservas_cupo set liberada_en = now() where orden_id = v_orden and liberada_en is null;
      update public.ordenes set estado = 'vencida' where id = v_orden;
      v_orden := null;
    end if;
    if not public.talleres_publicos() then raise exception 'talleres_no_disponibles' using errcode = 'P0001'; end if;
    select * into v_taller from public.talleres where id = p_producto for update;   -- bloqueo del cupo
    if not found or v_taller.estado <> 'publicado' or v_taller.inicia_en <= now() then
      raise exception 'taller_no_disponible' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.inscripciones_taller where perfil_id = p_perfil and taller_id = p_producto and estado = 'confirmada') then
      raise exception 'ya_inscripto' using errcode = 'P0001';
    end if;
    if v_taller.cupo is not null then
      select (select count(*) from public.inscripciones_taller where taller_id = p_producto and estado = 'confirmada')
           + (select count(*) from public.reservas_cupo where taller_id = p_producto and liberada_en is null and vence_en > now())
        into v_ocupados;
      if v_ocupados >= v_taller.cupo then raise exception 'sin_cupo' using errcode = 'P0001'; end if;
    end if;
    v_precio := v_taller.precio_centavos;
    v_titulo := v_taller.titulo;
  end if;

  if p_cupon is not null then
    select * into v_cupon from public.cupones where codigo = upper(btrim(p_cupon)) for update;
    if not found or not v_cupon.activo
       or (v_cupon.vigente_desde is not null and now() < v_cupon.vigente_desde)
       or (v_cupon.vigente_hasta is not null and now() > v_cupon.vigente_hasta)
       or (v_cupon.usos_maximos is not null and v_cupon.usos >= v_cupon.usos_maximos) then
      raise exception 'cupon_invalido' using errcode = 'P0001';
    end if;
    v_descuento := least(v_precio, case v_cupon.tipo when 'porcentaje' then (v_precio * v_cupon.valor) / 100 else v_cupon.valor end);
  end if;

  insert into public.ordenes (perfil_id, cupon_id, subtotal_centavos, descuento_centavos, total_centavos, clave_producto)
  values (p_perfil, v_cupon.id, v_precio, v_descuento, v_precio - v_descuento, v_clave)
  returning id into v_orden;

  insert into public.items_orden (orden_id, curso_id, taller_id, descripcion, precio_centavos)
  values (v_orden,
          case when p_tipo = 'curso' then p_producto end,
          case when p_tipo = 'taller' then p_producto end,
          v_titulo, v_precio);

  if p_tipo = 'taller' then
    insert into public.reservas_cupo (taller_id, perfil_id, orden_id, vence_en)
    values (p_producto, p_perfil, v_orden, now() + make_interval(mins => p_minutos_reserva));
  end if;

  return v_orden;
end; $$;

-- Oferta vigente de un curso para la persona que la mira, antes de confirmar: precio, condiciones y el
-- vencimiento que tendría si el pago se confirmara ahora.
create or replace function public.oferta_curso(p_curso uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_c public.cursos%rowtype; v_a public.accesos_curso%rowtype; v_total int; v_situacion text; v_inicio timestamptz;
begin
  if auth.uid() is null then return null; end if;
  select * into v_c from public.cursos where id = p_curso and estado = 'publicado';
  if v_c.id is null then return null; end if;
  select * into v_a from public.accesos_curso where perfil_id = auth.uid() and curso_id = p_curso and estado = 'activo';
  v_situacion := case
    when v_a.id is not null and (v_a.vence_en is null or v_a.vence_en > now()) then 'vigente'
    when v_a.id is not null or exists (select 1 from public.accesos_curso where perfil_id = auth.uid() and curso_id = p_curso) then 'renovacion'
    else 'nueva' end;
  v_total := v_c.duracion_comercial_meses + public.meses_adicionales_acceso();
  v_inicio := now();
  return jsonb_build_object(
    'disponible', v_c.duracion_comercial_meses is not null and v_situacion <> 'vigente',
    'situacion', v_situacion, 'precio_centavos', v_c.precio_centavos,
    'duracion_meses', v_c.duracion_comercial_meses, 'meses_adicionales', public.meses_adicionales_acceso(), 'total_meses', v_total,
    'vence_si_confirma_hoy', case when v_total is not null then public.calcular_vencimiento(v_inicio, v_total) end,
    'vence_actual', v_a.vence_en);
end; $$;

-- ============================================================ 10. Procesar pagos (D1, D4)
create or replace function public.procesar_evento_pago(
  p_proveedor text, p_id_evento text, p_tipo text, p_cuerpo jsonb,
  p_orden uuid, p_id_pago_externo text, p_estado text, p_monto_centavos int
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_evento uuid;
  v_orden public.ordenes%rowtype;
  v_item public.items_orden%rowtype;
  v_resultado text;
  v_taller public.talleres%rowtype;
  v_sin_lugar text;
  v_tiene_taller boolean;
  v_otorgado text;
  v_revision boolean := false;
begin
  insert into public.eventos_pasarela (proveedor, id_evento, tipo, cuerpo)
  values (p_proveedor, p_id_evento, p_tipo, p_cuerpo)
  on conflict (proveedor, id_evento) do nothing
  returning id into v_evento;
  if v_evento is null then return 'duplicado'; end if;

  select * into v_orden from public.ordenes where id = p_orden for update;
  if not found then
    update public.eventos_pasarela set resultado = 'error: orden_inexistente' where id = v_evento;
    return 'error: orden_inexistente';
  end if;
  v_tiene_taller := exists (select 1 from public.items_orden where orden_id = p_orden and taller_id is not null);

  insert into public.pagos (orden_id, proveedor, id_externo, estado, monto_centavos)
  values (p_orden, p_proveedor, p_id_pago_externo, p_estado, p_monto_centavos)
  on conflict (proveedor, id_externo) do update set estado = excluded.estado, monto_centavos = excluded.monto_centavos;

  if p_estado = 'aprobado' then
    if v_orden.estado = 'aprobada' then
      -- Otro aviso de un pago ya aprobado no duplica nada. Si el otorgamiento había fallado, se reintenta.
      if exists (select 1 from public.incidencias where orden_id = p_orden and tipo = 'otorgamiento_fallido' and estado <> 'resuelta') then
        v_resultado := case when public.reintentar_otorgamiento_orden(p_orden, 'Reintento automático ante un nuevo aviso de la pasarela')
                            then 'procesado: otorgamiento_recuperado' else 'requiere_revision' end;
      else
        v_resultado := 'ignorado: ya_aprobada';
      end if;
    elsif v_orden.estado = 'requiere_reembolso' then
      v_resultado := 'ignorado: requiere_reembolso';
    elsif not (v_orden.estado in ('pendiente','vencida') or (v_orden.estado = 'cancelada' and v_tiene_taller)) then
      v_resultado := 'ignorado: orden_' || v_orden.estado;
    elsif p_monto_centavos <> v_orden.total_centavos then
      v_resultado := 'error: monto_no_coincide';
    else
      v_resultado := 'procesado';
      for v_item in select * from public.items_orden where orden_id = p_orden loop
        if v_item.curso_id is not null then
          -- Un período por ítem, con las condiciones que la persona aceptó. Si no se puede otorgar,
          -- queda una incidencia (nunca un pago confirmado sin acceso ni aviso).
          v_otorgado := public.otorgar_compra_curso(v_item.id, p_id_evento);
          if v_otorgado in ('sin_condiciones', 'fallido') then v_revision := true; end if;
        else
          select * into v_taller from public.talleres where id = v_item.taller_id for update;
          v_sin_lugar := null;
          if v_taller.estado <> 'publicado' then
            v_sin_lugar := 'taller_' || v_taller.estado;
          elsif v_taller.inicia_en <= now() then
            v_sin_lugar := 'taller_empezado';
          elsif v_orden.estado = 'cancelada' then
            v_sin_lugar := 'orden_cancelada';
          elsif not exists (select 1 from public.reservas_cupo where orden_id = p_orden and liberada_en is null and vence_en > now()) then
            if v_taller.cupo is not null and public.ocupados_taller(v_item.taller_id) >= v_taller.cupo then
              v_sin_lugar := 'sin_cupo';
            end if;
          end if;
          if v_sin_lugar is not null then
            v_resultado := 'requiere_reembolso';
            update public.reservas_cupo set liberada_en = now() where orden_id = p_orden and liberada_en is null;
            insert into public.incidencias (tipo, orden_id, taller_id, perfil_id, detalle)
            values ('pago_sin_cupo', p_orden, v_item.taller_id, v_orden.perfil_id,
                    jsonb_build_object('motivo', v_sin_lugar, 'monto_centavos', p_monto_centavos, 'proveedor', p_proveedor,
                                       'pago_externo', p_id_pago_externo, 'evento', p_id_evento, 'estado_orden_previo', v_orden.estado))
            on conflict do nothing;
            continue;
          end if;
          insert into public.inscripciones_taller (taller_id, perfil_id, item_orden_id, origen)
          values (v_item.taller_id, v_orden.perfil_id, v_item.id, 'compra')
          on conflict (taller_id, perfil_id) where estado = 'confirmada' do nothing;
          update public.reservas_cupo set liberada_en = now() where orden_id = p_orden and liberada_en is null;
        end if;
      end loop;
      if v_resultado = 'procesado' then
        update public.ordenes set estado = 'aprobada', aprobada_en = now() where id = p_orden;
        if v_orden.cupon_id is not null then
          update public.cupones set usos = usos + 1 where id = v_orden.cupon_id;
        end if;
        insert into public.documentos_fiscales (orden_id, tipo) values (p_orden, 'recibo')
        on conflict (orden_id, tipo) do nothing;
        perform public.registrar_notificacion(v_orden.perfil_id, i.taller_id, i.id, 'inscripcion_taller', 'inscripcion:' || i.id)
           from public.inscripciones_taller i join public.items_orden it on it.id = i.item_orden_id where it.orden_id = p_orden;
        if v_revision then v_resultado := 'requiere_revision'; end if;
      elsif v_resultado = 'requiere_reembolso' then
        update public.ordenes set estado = 'requiere_reembolso' where id = p_orden;
        insert into public.auditoria (accion, entidad, entidad_id, despues)
        values ('pago_requiere_reembolso', 'ordenes', p_orden::text,
                jsonb_build_object('evento', p_id_evento, 'monto_centavos', p_monto_centavos, 'estado_previo', v_orden.estado));
      end if;
    end if;

  elsif p_estado in ('rechazado','cancelado') then
    if v_orden.estado = 'pendiente' then
      update public.ordenes set estado = case p_estado when 'rechazado' then 'rechazada' else 'cancelada' end where id = p_orden;
      update public.reservas_cupo set liberada_en = now() where orden_id = p_orden and liberada_en is null;
      v_resultado := 'procesado';
    else
      v_resultado := 'ignorado: orden_' || v_orden.estado;
    end if;

  elsif p_estado in ('reembolsado','contracargo') then
    if v_orden.estado in ('aprobada','reembolsada','contracargo','requiere_reembolso') then
      if p_estado = 'reembolsado' and p_monto_centavos < v_orden.total_centavos then
        -- Reembolso parcial confirmado: no revoca derechos por sí solo; la admin decide.
        insert into public.incidencias (tipo, orden_id, perfil_id, detalle)
        values ('reembolso_parcial', p_orden, v_orden.perfil_id,
                jsonb_build_object('monto_centavos', p_monto_centavos, 'total_centavos', v_orden.total_centavos, 'evento', p_id_evento))
        on conflict (tipo, orden_id) where orden_id is not null
        do update set estado = 'abierta', detalle = excluded.detalle, actualizado_en = now();
        insert into public.auditoria (accion, entidad, entidad_id, despues)
        values ('reembolso_parcial', 'ordenes', p_orden::text, jsonb_build_object('evento', p_id_evento, 'monto_centavos', p_monto_centavos));
        v_resultado := 'requiere_revision';
      else
        update public.ordenes set estado = case p_estado when 'reembolsado' then 'reembolsada' else 'contracargo' end where id = p_orden;
        -- Solo los derechos de esta compra: otras compras, becas, avances y certificados no se tocan.
        perform public.revocar_periodos_orden(p_orden, case p_estado when 'reembolsado' then 'Reembolso confirmado' else 'Contracargo confirmado' end, p_id_evento);
        update public.inscripciones_taller set estado = 'reembolsada'
         where estado in ('confirmada','reembolso_pendiente') and item_orden_id in (select id from public.items_orden where orden_id = p_orden);
        insert into public.auditoria (accion, entidad, entidad_id, despues)
        values ('orden_' || p_estado, 'ordenes', p_orden::text, jsonb_build_object('evento', p_id_evento));
        v_resultado := 'procesado';
      end if;
    else
      v_resultado := 'ignorado: orden_' || v_orden.estado;
    end if;
  else
    v_resultado := 'ignorado: estado_pendiente';
  end if;

  update public.eventos_pasarela set resultado = v_resultado where id = v_evento;
  return v_resultado;
end; $$;

-- ============================================================ 11. Cambio de versión: también en la base (D7)
create or replace function public.cambiar_version(p_perfil uuid, p_curso uuid, p_version_destino uuid, p_confirmacion text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_acceso public.accesos_curso%rowtype; v_act int; v_dest int; v_cambio uuid;
begin
  if char_length(btrim(coalesce(p_confirmacion, ''))) < 10 then raise exception 'confirmacion_requerida' using errcode = 'P0001'; end if;
  select * into v_acceso from public.accesos_curso where perfil_id = p_perfil and curso_id = p_curso and estado = 'activo' for update;
  if v_acceso.id is null then raise exception 'sin_acceso' using errcode = 'P0001'; end if;
  -- Con el acceso vencido no se cambia de versión, aunque la solicitud se arme a mano.
  if v_acceso.vence_en is not null and v_acceso.vence_en <= now() then raise exception 'acceso_vencido' using errcode = 'P0001'; end if;
  if p_version_destino is distinct from (select version_vigente_id from public.cursos where id = p_curso) then
    raise exception 'version_no_vigente' using errcode = 'P0001';
  end if;
  select numero into v_act from public.versiones_curso where id = v_acceso.version_id;
  select numero into v_dest from public.versiones_curso where id = p_version_destino;
  if v_dest <= v_act then raise exception 'version_no_mas_nueva' using errcode = 'P0001'; end if;

  insert into public.cambios_version (acceso_id, perfil_id, curso_id, version_anterior, version_nueva, confirmacion)
  values (v_acceso.id, p_perfil, p_curso, v_acceso.version_id, p_version_destino, btrim(p_confirmacion))
  returning id into v_cambio;
  perform set_config('albor.cambio_version', 'si', true);
  update public.accesos_curso set version_id = p_version_destino where id = v_acceso.id;
  perform set_config('albor.cambio_version', '', true);
  insert into public.auditoria (actor_id, accion, entidad, entidad_id, antes, despues)
  values (p_perfil, 'version_cambiada_por_alumno', 'accesos_curso', v_acceso.id::text,
          jsonb_build_object('version', v_acceso.version_id, 'numero', v_act),
          jsonb_build_object('version', p_version_destino, 'numero', v_dest, 'cambio', v_cambio));
  return v_cambio;
end; $$;

-- ============================================================ 12. Conciliación
-- Accesos cuyo estado o vencimiento no coincide con sus períodos. Debe devolver cero filas.
create or replace function public.conciliar_periodos()
returns table (acceso_id uuid, problema text)
language sql stable security definer set search_path = public as $$
  with r as (
    select a.id, a.estado, a.vence_en,
           count(p.id) as total,
           count(p.id) filter (where p.estado = 'activo') as activos,
           coalesce(bool_or(p.vence_en is null) filter (where p.estado = 'activo'), false) as sin_venc,
           max(p.vence_en) filter (where p.estado = 'activo') as max_venc
      from public.accesos_curso a left join public.periodos_acceso p on p.acceso_id = a.id
     group by a.id, a.estado, a.vence_en)
  select id, case
           when total = 0 then 'sin_periodos'
           when estado = 'activo' and activos = 0 then 'activo_sin_periodos_activos'
           when estado = 'revocado' and activos > 0 then 'revocado_con_periodos_activos'
           else 'vencimiento_distinto' end
    from r
   where total = 0
      or (estado = 'activo' and activos = 0)
      or (estado = 'revocado' and activos > 0)
      or (estado = 'activo' and activos > 0 and vence_en is distinct from (case when sin_venc then null else max_venc end));
$$;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.conciliar_periodos();
  if v_n > 0 then raise exception 'conciliacion_fallida: % acceso(s) no coinciden con sus períodos', v_n; end if;
end $$;

-- ============================================================ 13. Permisos
revoke execute on function public.completar_periodo() from public, anon, authenticated;
revoke execute on function public.recalcular_vencimiento_acceso(uuid) from public, anon, authenticated;
revoke execute on function public.crear_periodo_inicial() from public, anon, authenticated;
revoke execute on function public.agregar_periodo(uuid, uuid, text, uuid, timestamptz, timestamptz, int, boolean, jsonb, int, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.revocar_periodo_interno(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.otorgar_compra_curso(uuid, text) from public, anon, authenticated;
revoke execute on function public.reintentar_otorgamiento_orden(uuid, text) from public, anon, authenticated;
revoke execute on function public.revocar_periodos_orden(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.talleres_publicos() from public, anon, authenticated;
revoke execute on function public.conciliar_periodos() from public, anon, authenticated;
revoke execute on function public.crear_orden(uuid, text, uuid, text, int) from public, anon, authenticated;
revoke execute on function public.procesar_evento_pago(text, text, text, jsonb, uuid, text, text, int) from public, anon, authenticated;
revoke execute on function public.conceder_acceso(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.cambiar_version(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.crear_orden(uuid, text, uuid, text, int) to service_role;
grant execute on function public.procesar_evento_pago(text, text, text, jsonb, uuid, text, text, int) to service_role;
grant execute on function public.conceder_acceso(uuid, uuid, uuid, text) to service_role;
grant execute on function public.cambiar_version(uuid, uuid, uuid, text) to service_role;
grant execute on function public.reintentar_otorgamiento_orden(uuid, text) to service_role;
grant execute on function public.conciliar_periodos() to service_role;

-- Sesiones: cada una valida es_admin() o actúa sobre auth.uid().
revoke execute on function public.otorgar_beca(uuid, uuid, timestamptz, timestamptz, boolean, text, text) from public, anon;
revoke execute on function public.revocar_beca(uuid, text) from public, anon;
revoke execute on function public.reintentar_otorgamiento(uuid, text) from public, anon;
revoke execute on function public.oferta_curso(uuid) from public, anon;
revoke execute on function public.buscar_perfil_por_correo(text) from public, anon;
revoke execute on function public.inscribirme_gratis(uuid) from public, anon;
grant execute on function public.otorgar_beca(uuid, uuid, timestamptz, timestamptz, boolean, text, text) to authenticated;
grant execute on function public.revocar_beca(uuid, text) to authenticated;
grant execute on function public.reintentar_otorgamiento(uuid, text) to authenticated;
grant execute on function public.oferta_curso(uuid) to authenticated;
grant execute on function public.buscar_perfil_por_correo(text) to authenticated;
grant execute on function public.inscribirme_gratis(uuid) to authenticated;
