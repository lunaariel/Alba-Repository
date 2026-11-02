#!/usr/bin/env bash
# Restauración verificable en una base NUEVA (docs/respaldos.md). Nunca restaura sobre una base existente:
# si la base de destino ya existe, se niega. Restaura en una sola transacción (--single-transaction
# --exit-on-error): o queda completa, o no queda nada. Después compara la huella con la del respaldo y
# ejecuta la conciliación académica y comercial.
#   RESTAURAR_SERVIDOR=postgresql://postgres:postgres@127.0.0.1:5432 ./scripts/restaurar.sh respaldo.dump base_nueva [--anonimizar]
# Con --anonimizar, reemplaza los datos personales antes de entregarla (para entornos de prueba menos seguros).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
SERVIDOR="${RESTAURAR_SERVIDOR:?Indique RESTAURAR_SERVIDOR}"; ARCHIVO="${1:?respaldo}"; BASE="${2:?base nueva}"; ANON="${3:-}"
host=$(python3 -c "import sys,urllib.parse as u; print(u.urlparse(sys.argv[1]).hostname or '')" "$SERVIDOR")
case "$host" in 127.0.0.1|localhost|"") ;; *) echo "BLOQUEADO: solo se restaura en servidores locales o de prueba."; exit 3 ;; esac
[[ "$BASE" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "nombre de base inválido"; exit 2; }
export PGOPTIONS="-c client_min_messages=warning"
if [ "$(psql "$SERVIDOR/postgres" -X -tA -c "select count(*) from pg_database where datname = '$BASE'")" != "0" ]; then
  echo "BLOQUEADO: la base $BASE ya existe. La restauración se hace siempre en una base nueva."; exit 3
fi
psql "$SERVIDOR/postgres" -X -q -c "create database $BASE encoding 'UTF8' template template0"
URL="$SERVIDOR/$BASE"
# Base vacía: el respaldo trae su propio esquema public.
psql "$URL" -X -q -v ON_ERROR_STOP=1 -c "drop schema public cascade"
# Roles de Supabase que las políticas mencionan (en Supabase ya existen).
psql "$URL" -X -q -v ON_ERROR_STOP=1 -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if; end \$\$;"
if ! pg_restore --dbname "$URL" --no-owner --no-privileges --single-transaction --exit-on-error "$ARCHIVO" 2>/tmp/albor_restaurar.log; then
  echo "FALLA: la restauración se deshizo completa"; head -5 /tmp/albor_restaurar.log; exit 1
fi
# Verificación: misma huella que el respaldo, claves foráneas validadas y conciliación en cero.
psql "$URL" -X -q -tA -v ON_ERROR_STOP=1 -f "$RAIZ/scripts/huella-base.sql" > "/tmp/albor_huella_$BASE"
if [ -f "$ARCHIVO.huella" ]; then
  diff -q "$ARCHIVO.huella" "/tmp/albor_huella_$BASE" >/dev/null || { echo "FALLA: la huella restaurada no coincide"; diff "$ARCHIVO.huella" "/tmp/albor_huella_$BASE" | head; exit 1; }
fi
psql "$URL" -X -q -tA -v ON_ERROR_STOP=1 -f "$RAIZ/scripts/conciliar-restauracion.sql"
if [ "$ANON" = "--anonimizar" ]; then psql "$URL" -X -q -v ON_ERROR_STOP=1 -f "$RAIZ/scripts/anonimizar.sql"; echo "datos personales reemplazados"; fi
echo "restauración verificada: $BASE"
