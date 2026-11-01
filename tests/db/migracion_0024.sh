#!/usr/bin/env bash
# Ensayo de la migración 0024 (períodos de acceso) sobre datos históricos representativos: compra con
# condiciones, compra anterior sin condiciones, concesión sin vencimiento, compra reembolsada, compra
# vencida, avance, intentos y certificado, y una orden pendiente sin condiciones.
# Comprueba: conciliación en cero, accesos idénticos, un período histórico fiel por acceso, la orden antigua
# clasificada con incidencia, la renovación sobre datos históricos, la reversión exacta y su negativa.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${DB_MIGRACION:-albor_migracion_0024}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U "${PGUSER:-postgres}")
q() { "${PSQL[@]}" -d "$DB" -tA -c "$1"; }
falla() { echo "FALLA      migración 0024: $1"; exit 1; }

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB encoding 'UTF8' template template0" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/tests/db/supabase_stub.sql" >/dev/null
for m in "$RAIZ"/supabase/migrations/*.sql; do
  n=$(basename "$m"); [ $((10#${n:8:6})) -ge 24 ] && continue
  "${PSQL[@]}" -d "$DB" -f "$m" >/dev/null
done
"${PSQL[@]}" -d "$DB" -f "$RAIZ/tests/db/00_ayudas.sql" >/dev/null

C='c0000000-0000-0000-0000-000000000001'
q "insert into auth.users (id, email, raw_user_meta_data) values
     ('d0240000-0000-0000-0000-000000000001', 'hist-reemb@prueba.test', '{\"nombre_completo\": \"Reembolsada\", \"confirma_mayoria_edad\": true}'),
     ('d0240000-0000-0000-0000-000000000002', 'hist-vencida@prueba.test', '{\"nombre_completo\": \"Vencida\", \"confirma_mayoria_edad\": true}'),
     ('d0240000-0000-0000-0000-000000000003', 'hist-antigua@prueba.test', '{\"nombre_completo\": \"Compra antigua\", \"confirma_mayoria_edad\": true}'),
     ('d0240000-0000-0000-0000-000000000004', 'hist-pendiente@prueba.test', '{\"nombre_completo\": \"Pendiente antigua\", \"confirma_mayoria_edad\": true}')" >/dev/null
q "do \$\$ declare o uuid; begin
     -- Concesión de la admin (sin vencimiento).
     perform public.conceder_acceso('adadadad-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', '$C', 'Beca histórica');
     -- Compra reembolsada.
     o := public.crear_orden('d0240000-0000-0000-0000-000000000001', 'curso', '$C');
     perform public.procesar_evento_pago('simulado', 'h-r', 'pago', '{}', o, 'h-r', 'aprobado', 4900);
     perform public.procesar_evento_pago('simulado', 'h-r2', 'reembolso', '{}', o, 'h-r', 'reembolsado', 4900);
     -- Compra vencida.
     o := public.crear_orden('d0240000-0000-0000-0000-000000000002', 'curso', '$C');
     perform public.procesar_evento_pago('simulado', 'h-v', 'pago', '{}', o, 'h-v', 'aprobado', 4900);
     perform set_config('albor.ajuste_vencimiento', 'si', true);
     update public.accesos_curso set inicia_en = now() - interval '10 months', vence_en = now() - interval '2 months'
      where perfil_id = 'd0240000-0000-0000-0000-000000000002';
     -- Compra anterior a las condiciones (aceptada sin vencimiento) y una orden pendiente sin condiciones.
     alter table public.items_orden disable trigger items_orden_condiciones;
     insert into public.ordenes (id, perfil_id, subtotal_centavos, total_centavos, clave_producto)
     values ('e0240000-0000-0000-0000-000000000001', 'd0240000-0000-0000-0000-000000000003', 4900, 4900, 'curso:$C'),
            ('e0240000-0000-0000-0000-000000000002', 'd0240000-0000-0000-0000-000000000004', 4900, 4900, 'curso:$C');
     insert into public.items_orden (orden_id, curso_id, descripcion, precio_centavos)
     values ('e0240000-0000-0000-0000-000000000001', '$C', 'Montessori en casa', 4900),
            ('e0240000-0000-0000-0000-000000000002', '$C', 'Montessori en casa', 4900);
     alter table public.items_orden enable trigger items_orden_condiciones;
     perform public.procesar_evento_pago('simulado', 'h-a', 'pago', '{}', 'e0240000-0000-0000-0000-000000000001', 'h-a', 'aprobado', 4900);
   end \$\$;" >/dev/null

HUELLA="select md5(string_agg(t, '|' order by t)) from (
  select 'a'||id||perfil_id||curso_id||origen||estado||coalesce(inicia_en::text,'')||coalesce(vence_en::text,'')||coalesce(condiciones::text,'')
          ||coalesce(version_id::text,'')||coalesce(revocado_en::text,'')||coalesce(item_orden_id::text,'') t from public.accesos_curso
  union all select 'o'||id||estado||total_centavos from public.ordenes
  union all select 'i'||id||coalesce(condiciones_acceso::text,'') from public.items_orden
  union all select 'p'||perfil_id||leccion_id||coalesce(completada_en::text,'') from public.progreso_leccion
  union all select 'e'||id||coalesce(puntaje::text,'') from public.intentos_evaluacion
  union all select 'c'||id||codigo_verificacion from public.certificados) x"
antes=$(q "$HUELLA")
accesos=$(q "select count(*) from public.accesos_curso")
[ "$(q "select count(*) from public.accesos_curso where condiciones ->> 'regla' = 'compra_sin_condiciones'")" = "1" ] || falla "falta la compra histórica sin condiciones"
[ "$(q "select count(*) from public.accesos_curso where estado = 'revocado'")" = "1" ] || falla "falta el acceso reembolsado"

"${PSQL[@]}" -d "$DB" --single-transaction -f "$RAIZ/supabase/migrations/20261101000024_periodos_acceso.sql" >/dev/null
[ "$(q "select count(*) from public.conciliar_periodos()")" = "0" ] || falla "la conciliación no da cero"
[ "$(q "select count(*) from public.periodos_acceso where historico")" = "$accesos" ] || falla "no hay un período histórico por acceso"
[ "$(q "select count(*) from public.accesos_curso a join public.periodos_acceso p on p.acceso_id = a.id
        where p.inicia_en is distinct from a.inicia_en or p.vence_en is distinct from a.vence_en or p.condiciones is distinct from a.condiciones
           or p.version_id is distinct from a.version_id or p.item_orden_id is distinct from a.item_orden_id
           or (p.estado = 'activo') <> (a.estado = 'activo')")" = "0" ] || falla "algún período no reproduce su acceso"
[ "$(q "select count(*) from public.periodos_acceso where historico and vence_en is null")" = "2" ] || falla "se impusieron vencimientos retroactivos"
[ "$(q "select estado from public.ordenes where id = 'e0240000-0000-0000-0000-000000000002'")" = "vencida" ] || falla "la orden pendiente sin condiciones no se clasificó"
[ "$(q "select count(*) from public.incidencias where tipo = 'orden_sin_condiciones' and orden_id = 'e0240000-0000-0000-0000-000000000002'")" = "1" ] || falla "falta la incidencia de la orden antigua"
# Los accesos, avances, intentos y certificados no cambian (solo la orden clasificada).
[ "$(q "select md5(string_agg(t, '|' order by t)) from (select 'a'||id||estado||coalesce(vence_en::text,'') t from public.accesos_curso) x")" \
  = "$(q "select md5(string_agg(t, '|' order by t)) from (select 'a'||acceso_id||case when estado = 'activo' then 'activo' else 'revocado' end||coalesce(vence_en::text,'') t from public.periodos_acceso) x")" ] \
  || falla "accesos y períodos difieren"

# Reversión exacta: todo como antes, incluida la orden antigua; luego se vuelve a aplicar.
"${PSQL[@]}" -d "$DB" --single-transaction -f "$RAIZ/supabase/rollback/20261101000024_periodos_acceso_down.sql" >/dev/null
[ "$(q "$HUELLA")" = "$antes" ] || falla "la reversión no dejó los datos idénticos"
[ "$(q "select count(*) from pg_proc where proname in ('agregar_periodo','otorgar_beca','oferta_curso','conciliar_periodos')")" = "0" ] || falla "quedaron funciones de 0024"
"${PSQL[@]}" -d "$DB" --single-transaction -f "$RAIZ/supabase/migrations/20261101000024_periodos_acceso.sql" >/dev/null

# Sobre los datos históricos: renovar la compra vencida y volver a comprar tras un reembolso.
q "do \$\$ declare o uuid; acc uuid; begin
     acc := (select id from public.accesos_curso where perfil_id = 'd0240000-0000-0000-0000-000000000002');
     o := public.crear_orden('d0240000-0000-0000-0000-000000000002', 'curso', '$C');
     perform public.procesar_evento_pago('simulado', 'h-v-ren', 'pago', '{}', o, 'h-v-ren', 'aprobado', 4900);
     perform pruebas.afirmar((select id from public.accesos_curso where perfil_id = 'd0240000-0000-0000-0000-000000000002' and estado = 'activo') = acc
       and (select vence_en > now() from public.accesos_curso where id = acc), 'Renovación sobre un acceso histórico vencido');
     acc := (select id from public.accesos_curso where perfil_id = 'd0240000-0000-0000-0000-000000000001');
     o := public.crear_orden('d0240000-0000-0000-0000-000000000001', 'curso', '$C');
     perform public.procesar_evento_pago('simulado', 'h-r-ren', 'pago', '{}', o, 'h-r-ren', 'aprobado', 4900);
     perform pruebas.afirmar((select id from public.accesos_curso where perfil_id = 'd0240000-0000-0000-0000-000000000001' and estado = 'activo') = acc
       and (select count(*) from public.accesos_curso where perfil_id = 'd0240000-0000-0000-0000-000000000001') = 1,
       'Tras un reembolso histórico, la compra nueva reactiva la misma inscripción académica');
   end \$\$;" >/dev/null
[ "$(q "select count(*) from public.conciliar_periodos()")" = "0" ] || falla "la conciliación no da cero después de usarla"
if "${PSQL[@]}" -d "$DB" --single-transaction -f "$RAIZ/supabase/rollback/20261101000024_periodos_acceso_down.sql" >/dev/null 2>/tmp/albor_rev24.log; then
  falla "la reversión debió negarse después de una renovación"
fi
grep -q reversion_imposible /tmp/albor_rev24.log || falla "la reversión falló por otro motivo: $(head -2 /tmp/albor_rev24.log)"
echo "ok         migración 0024: datos históricos conciliados e intactos, sin vencimientos retroactivos, reversión exacta y negada tras usarla"
