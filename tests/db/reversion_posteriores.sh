#!/usr/bin/env bash
# Ensayo de reversión de las migraciones posteriores a 0014 sobre datos existentes: base hasta 0014 con los
# datos de prueba, huella, aplicar 0015 en adelante, revertir en orden inverso, huella igual; volver a aplicar funciona.
# Después de usar las funciones nuevas (por ejemplo, una incidencia), la reversión se niega.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${DB_REVERSION:-albor_reversion}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U "${PGUSER:-postgres}")
q() { "${PSQL[@]}" -d "$DB" -tA -c "$1"; }

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB encoding 'UTF8' template template0" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/tests/db/supabase_stub.sql" >/dev/null
for m in "$RAIZ"/supabase/migrations/*.sql; do
  n=$(basename "$m"); [ $((10#${n:8:6})) -ge 15 ] && continue
  "${PSQL[@]}" -d "$DB" -f "$m" >/dev/null
done
"${PSQL[@]}" -d "$DB" -f "$RAIZ/tests/db/00_ayudas.sql" >/dev/null
# Algo de historial de talleres previo: una inscripción paga y un recordatorio registrado.
q "do \$\$ declare o uuid; begin
     o := public.crear_orden('aaaaaaaa-0000-0000-0000-000000000001', 'taller', '7a000000-0000-0000-0000-000000000001');
     perform public.procesar_evento_pago('simulado', 'rev-evt', 'pago', '{}', o, 'rev-pago', 'aprobado', 1500);
     insert into public.recordatorios (taller_id, minutos_antes) values ('7a000000-0000-0000-0000-000000000001', 60);
     insert into public.envios_recordatorio (recordatorio_id, inscripcion_id) select r.id, i.id from public.recordatorios r, public.inscripciones_taller i;
   end \$\$;" >/dev/null

HUELLA="select md5(string_agg(t, '|' order by t)) from (
  select 't'||id||estado||cupo||inicia_en t from public.talleres
  union all select 'i'||id||estado||coalesce(item_orden_id::text,'') from public.inscripciones_taller
  union all select 'o'||id||estado from public.ordenes
  union all select 'p'||id||estado from public.pagos
  union all select 'e'||recordatorio_id||inscripcion_id from public.envios_recordatorio
  union all select 'r'||id||titulo||complementario::text from (select id, titulo, false as complementario from public.recursos_leccion) x
  union all select 'l'||id||titulo||coalesce(video_id,'') from public.lecciones
  union all select 'v'||id||numero from public.versiones_curso) x"
antes=$(q "$HUELLA")
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/migrations/20261031000015_ajustes_versionado.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/migrations/20261031000016_talleres_gestion.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/migrations/20261031000017_talleres_adaptacion.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/migrations/20261101000018_modalidad_evaluacion.sql" >/dev/null
[ "$(q "select origen from public.inscripciones_taller limit 1")" = "compra" ] || { echo "FALLA      0016 no clasificó la inscripción existente"; exit 1; }
[ "$(q "select count(*) from public.envios_recordatorio where para_inicio is not null")" = "1" ] || { echo "FALLA      0016 no completó para_inicio"; exit 1; }
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/rollback/20261101000018_modalidad_evaluacion_down.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/rollback/20261031000017_talleres_adaptacion_down.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/rollback/20261031000016_talleres_gestion_down.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/rollback/20261031000015_ajustes_versionado_down.sql" >/dev/null
despues=$(q "$HUELLA")
[ "$antes" = "$despues" ] || { echo "FALLA      reversión 0015/0016: la huella cambió"; exit 1; }
[ "$(q "select count(*) from pg_proc where proname in ('cancelar_taller','asociar_complemento','enlace_taller','reemplazar_leccion','responder_reprogramacion','cambiar_estado_grabacion')")" = "0" ] \
  || { echo "FALLA      quedaron funciones de 0015/0016"; exit 1; }
# Se vuelve a aplicar sin errores; tras abrir una incidencia, la reversión de 0016 se niega.
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/migrations/20261031000015_ajustes_versionado.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/migrations/20261031000016_talleres_gestion.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/migrations/20261031000017_talleres_adaptacion.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/migrations/20261101000018_modalidad_evaluacion.sql" >/dev/null
# Con una evaluación formativa configurada, la reversión de 0018 se niega; sin ella, procede.
q "update public.evaluaciones set modalidad = 'formativa', requiere_validacion = true where id = (select id from public.evaluaciones limit 1)" >/dev/null
if "${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/rollback/20261101000018_modalidad_evaluacion_down.sql" >/dev/null 2>/tmp/albor_rev18.log; then
  echo "FALLA      la reversión de 0018 debió negarse"; exit 1
fi
grep -q reversion_imposible /tmp/albor_rev18.log || { echo "FALLA      la reversión de 0018 falló por otro motivo: $(head -2 /tmp/albor_rev18.log)"; exit 1; }
q "update public.evaluaciones set modalidad = 'sumativa', requiere_validacion = false" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/rollback/20261101000018_modalidad_evaluacion_down.sql" >/dev/null
# Con una grabación ya recibida, la reversión de 0017 se niega (perdería su estado).
q "insert into public.grabaciones_taller (taller_id, estado) select id, 'recibida' from public.talleres limit 1 on conflict (taller_id) do update set estado = 'recibida'" >/dev/null
if "${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/rollback/20261031000017_talleres_adaptacion_down.sql" >/dev/null 2>/tmp/albor_rev17.log; then
  echo "FALLA      la reversión de 0017 debió negarse"; exit 1
fi
grep -q reversion_imposible /tmp/albor_rev17.log || { echo "FALLA      la reversión de 0017 falló por otro motivo: $(head -2 /tmp/albor_rev17.log)"; exit 1; }
q "update public.grabaciones_taller set estado = 'prevista'" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/rollback/20261031000017_talleres_adaptacion_down.sql" >/dev/null
q "insert into public.incidencias (tipo) values ('pago_sin_cupo')" >/dev/null
if "${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/rollback/20261031000016_talleres_gestion_down.sql" >/dev/null 2>/tmp/albor_rev16.log; then
  echo "FALLA      la reversión de 0016 debió negarse"; exit 1
fi
grep -q reversion_imposible /tmp/albor_rev16.log || { echo "FALLA      la reversión falló por otro motivo: $(head -2 /tmp/albor_rev16.log)"; exit 1; }
echo "ok         reversión de 0015 a 0018: datos idénticos, se reaplican, y se niega cuando perdería información"
