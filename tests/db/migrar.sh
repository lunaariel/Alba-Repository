#!/usr/bin/env bash
# Ensayo del ejecutor de migraciones (scripts/migrar.sh) sobre bases efímeras locales: aplicación ordenada y
# registrada, repetición sin efecto, falla a mitad de una migración sin dejar nada aplicado ni seguir, huella
# alterada bloqueada, dos ejecuciones simultáneas, registro de una base existente y negativa ante hosts remotos.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${DB_MIGRAR:-albor_migrar}"
U="${PGUSER:-postgres}"; H="${PGHOST:-localhost}"; P="${PGPORT:-5432}"; W="${PGPASSWORD:-postgres}"
URL="postgresql://$U:$W@$H:$P/$DB"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U "$U")
q() { psql "$URL" -X -tA -c "$1"; }
falla() { echo "FALLA      ejecutor de migraciones: $1"; exit 1; }
nueva() { "${PSQL[@]}" -d postgres -c "drop database if exists $1" -c "create database $1 encoding 'UTF8' template template0" >/dev/null
          "${PSQL[@]}" -d "$1" -f "$RAIZ/tests/db/supabase_stub.sql" >/dev/null; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
total=$(ls "$RAIZ"/supabase/migrations/*.sql | wc -l)

# 1. Aplicación ordenada hasta 0025, luego el resto; repetir no hace nada.
nueva "$DB"
MIGRAR_URL="$URL" "$RAIZ/scripts/migrar.sh" --simular | grep -q "simulación: $total pendiente" || falla "la simulación no lista todas"
[ "$(q "select count(*) from information_schema.tables where table_schema = 'public'")" = "0" ] || falla "la simulación cambió la base"
MIGRAR_URL="$URL" "$RAIZ/scripts/migrar.sh" --hasta 0025 >/dev/null
[ "$(q "select count(*) from albor_control.migraciones")" = "25" ] || falla "--hasta 0025 no se respetó"
[ "$(q "select count(*) from pg_tables where tablename = 'politica_seguridad'")" = "0" ] || falla "se aplicó 0026 antes de tiempo"
MIGRAR_URL="$URL" "$RAIZ/scripts/migrar.sh" >/dev/null
[ "$(q "select count(*) from albor_control.migraciones")" = "$total" ] || falla "no se aplicaron todas"
MIGRAR_URL="$URL" "$RAIZ/scripts/migrar.sh" | grep -q "listo: 0 aplicada" || falla "repetir volvió a aplicar"

# 2. Falla a mitad de una migración nueva: no queda nada de ella, no se registra, no sigue con la siguiente.
cp "$RAIZ"/supabase/migrations/*.sql "$TMP/"
cat > "$TMP/20991231000098_rota.sql" <<'SQL'
create table public.tabla_de_ensayo (id int primary key);
alter table public.tabla_de_ensayo enable row level security;
insert into public.tabla_de_ensayo values (1);
select 1 / 0;   -- falla a propósito
SQL
cat > "$TMP/20991231000099_siguiente.sql" <<'SQL'
create table public.no_debe_existir (id int primary key);
SQL
if MIGRAR_URL="$URL" "$RAIZ/scripts/migrar.sh" --directorio "$TMP" >"$TMP/salida.log" 2>&1; then falla "una migración rota no detuvo el proceso"; fi
grep -q "FALLA        20991231000098_rota.sql" "$TMP/salida.log" || falla "no informó la migración rota"
[ "$(q "select count(*) from pg_tables where tablename in ('tabla_de_ensayo', 'no_debe_existir')")" = "0" ] || falla "quedó una aplicación parcial o siguió con la siguiente"
[ "$(q "select count(*) from albor_control.migraciones where version in ('0098', '0099')")" = "0" ] || falla "registró una migración fallida"

# 3. Un archivo aplicado que cambió después: bloqueado.
echo "-- cambio posterior" >> "$TMP/20261102000026_mfa_reforzada.sql"
rm "$TMP"/20991231*.sql
if MIGRAR_URL="$URL" "$RAIZ/scripts/migrar.sh" --directorio "$TMP" >"$TMP/salida.log" 2>&1; then falla "una huella alterada no bloqueó"; fi
grep -q "cambió después de aplicarse" "$TMP/salida.log" || falla "no explicó la huella alterada"

# 4. Dos ejecuciones simultáneas sobre una base nueva: cada migración se aplica una sola vez.
nueva "${DB}_b"
URLB="postgresql://$U:$W@$H:$P/${DB}_b"
( MIGRAR_URL="$URLB" "$RAIZ/scripts/migrar.sh" >"$TMP/a.log" 2>&1 || true ) &
( MIGRAR_URL="$URLB" "$RAIZ/scripts/migrar.sh" >"$TMP/b.log" 2>&1 || true ) &
wait
MIGRAR_URL="$URLB" "$RAIZ/scripts/migrar.sh" >/dev/null   # completa si una de las dos se detuvo al chocar
[ "$(psql "$URLB" -X -tA -c "select count(*) from albor_control.migraciones")" = "$total" ] || falla "ejecuciones simultáneas dejaron el registro incompleto"
[ "$(psql "$URLB" -X -tA -c "select count(*) from public.politica_seguridad")" = "1" ] || falla "ejecuciones simultáneas duplicaron datos"

# 5. Base que ya tiene 0001–0013 (como la real): se registran sin reaplicar y se aplican solo las nuevas.
nueva "${DB}_c"
URLC="postgresql://$U:$W@$H:$P/${DB}_c"
for m in "$RAIZ"/supabase/migrations/*.sql; do n=$(basename "$m"); [ $((10#${n:8:6})) -le 13 ] && "${PSQL[@]}" -d "${DB}_c" -f "$m" >/dev/null; done
MIGRAR_URL="$URLC" "$RAIZ/scripts/migrar.sh" --registrar-existentes-hasta 0013 --simular | grep -q "simulación: $((total - 13)) pendiente" || falla "la simulación sobre una base existente no coincide"
MIGRAR_URL="$URLC" "$RAIZ/scripts/migrar.sh" --registrar-existentes-hasta 0013 >/dev/null
[ "$(psql "$URLC" -X -tA -c "select count(*) filter (where modo = 'registrada_existente') || '/' || count(*) from albor_control.migraciones")" = "13/$total" ] || falla "registro de base existente"

# 6. Host remoto: se niega sin conectarse.
if MIGRAR_URL="postgresql://u:p@db.ejemplo.invalid:5432/x" "$RAIZ/scripts/migrar.sh" --simular >"$TMP/r.log" 2>&1; then falla "aceptó un host remoto"; fi
grep -q "BLOQUEADO" "$TMP/r.log" || falla "no explicó el bloqueo del host remoto"

"${PSQL[@]}" -d postgres -c "drop database $DB" -c "drop database ${DB}_b" -c "drop database ${DB}_c" >/dev/null
echo "ok         ejecutor de migraciones: orden, registro, falla sin aplicación parcial, huella, concurrencia, base existente y bloqueo remoto"
