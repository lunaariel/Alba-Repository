#!/usr/bin/env bash
# Crea una base de pruebas desde cero, aplica todas las migraciones y corre las pruebas SQL.
# Requiere un PostgreSQL 16 local. Variables: PGHOST, PGPORT, PGUSER (por defecto postgres).
set -euo pipefail

DB="${DB_PRUEBAS:-albor_pruebas}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U "${PGUSER:-postgres}")

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB encoding 'UTF8' template template0" >/dev/null

"${PSQL[@]}" -d "$DB" -f "$RAIZ/tests/db/supabase_stub.sql" >/dev/null
for m in "$RAIZ"/supabase/migrations/*.sql; do
  echo "migración  $(basename "$m")"
  "${PSQL[@]}" -d "$DB" -f "$m" >/dev/null
done

fallos=0
for t in "$RAIZ"/tests/db/[0-9]*.sql; do
  if "${PSQL[@]}" -d "$DB" -f "$t" >/tmp/albor_prueba.log 2>&1; then
    echo "ok         $(basename "$t")"
  else
    echo "FALLA      $(basename "$t")"
    sed 's/^/           /' /tmp/albor_prueba.log | tail -5
    fallos=$((fallos + 1))
  fi
done

DB_PRUEBAS="$DB" "$RAIZ/tests/db/concurrencia.sh" || fallos=$((fallos + 1))
"$RAIZ/tests/db/migracion_0014.sh" || fallos=$((fallos + 1))
"$RAIZ/tests/db/reversion_0015_0016.sh" || fallos=$((fallos + 1))

if [ "$fallos" -gt 0 ]; then echo "$fallos archivo(s) de prueba fallaron"; exit 1; fi
echo "todas las pruebas de base de datos pasaron"
