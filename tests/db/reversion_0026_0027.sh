#!/usr/bin/env bash
# Ensayo de reversión de 0028, 0027 y 0026 sobre una base con datos: los datos previos quedan idénticos, las funciones
# vuelven a su definición anterior, se pueden reaplicar, y la reversión se niega cuando perdería información o
# dejaría sin decidir la política de segundo factor.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${DB_REVERSION26:-albor_reversion26}"
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U "${PGUSER:-postgres}")
q() { "${PSQL[@]}" -d "$DB" -tA -c "$1"; }
falla() { echo "FALLA      reversión 0026/0027: $1"; exit 1; }
M="$RAIZ/supabase/migrations"; R="$RAIZ/supabase/rollback"
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB encoding 'UTF8' template template0" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/tests/db/supabase_stub.sql" >/dev/null
for m in "$M"/*.sql; do n=$(basename "$m"); [ $((10#${n:8:6})) -ge 26 ] && continue; "${PSQL[@]}" -d "$DB" -f "$m" >/dev/null; done
"${PSQL[@]}" -d "$DB" -f "$RAIZ/tests/db/00_ayudas.sql" >/dev/null
HUELLA="select md5(string_agg(t, '|' order by t)) from (
  select 'c'||id||precio_centavos||estado t from public.cursos union all select 'a'||id||estado from public.accesos_curso
  union all select 'p'||id||estado from public.periodos_acceso union all select 'r'||perfil_id||rol from public.roles_usuario
  union all select 'i'||id||puntaje from public.intentos_evaluacion) x"
FUNCIONES="select md5(string_agg(pg_get_functiondef(p.oid), '|' order by p.proname)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('es_admin', 'registrar_actividad_formativa', 'exigir_responsable_rol')"
antes=$(q "$HUELLA"); fantes=$(q "$FUNCIONES")
"${PSQL[@]}" -d "$DB" -f "$M/20261102000026_mfa_reforzada.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$M/20261102000027_recuperacion_dos_personas.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$M/20261103000028_video_correo.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$M/20261103000029_avisos_vencimiento.sql" >/dev/null
[ "$(q "$HUELLA")" = "$antes" ] || falla "aplicar 0026 a 0029 cambió datos existentes"
"${PSQL[@]}" -d "$DB" -f "$R/20261103000029_avisos_vencimiento_down.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$R/20261103000028_video_correo_down.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$R/20261102000027_recuperacion_dos_personas_down.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$R/20261102000026_mfa_reforzada_down.sql" >/dev/null
[ "$(q "$HUELLA")" = "$antes" ] || falla "la reversión cambió datos"
[ "$(q "$FUNCIONES")" = "$fantes" ] || falla "las funciones no volvieron a su definición anterior"
[ "$(q "select count(*) from pg_tables where tablename in ('politica_seguridad', 'verificaciones_reforzadas', 'recuperaciones_mfa')")" = "0" ] || falla "quedaron tablas"
[ "$(q "select count(*) from pg_trigger where tgname like 'reforzada_%' or tgname = 'ordenes_correo_confirmacion'")" = "0" ] || falla "quedaron disparadores"
[ "$(q "select count(*) from pg_proc where proname in ('autorizar_video_leccion', 'encolar_correo', 'fin_cobertura_continua')")" = "0" ] || falla "quedaron funciones de 0028"
# Se reaplican; con la política encendida, la reversión de 0026 se niega.
"${PSQL[@]}" -d "$DB" -f "$M/20261102000026_mfa_reforzada.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$M/20261102000027_recuperacion_dos_personas.sql" >/dev/null
q "select set_config('albor.responsable', 'Ensayo', false); update public.politica_seguridad set mfa_admin_obligatorio = true" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$R/20261102000027_recuperacion_dos_personas_down.sql" >/dev/null
if "${PSQL[@]}" -d "$DB" -f "$R/20261102000026_mfa_reforzada_down.sql" >/dev/null 2>/tmp/albor_rev26.log; then falla "la reversión de 0026 debió negarse con la política encendida"; fi
grep -q reversion_imposible /tmp/albor_rev26.log || falla "la reversión de 0026 falló por otro motivo"
"${PSQL[@]}" -d postgres -c "drop database $DB" >/dev/null
echo "ok         reversión de 0026 a 0029: datos y funciones idénticos, se reaplican, y se niega con la política encendida"
