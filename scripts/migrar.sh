#!/usr/bin/env bash
# Ejecutor de migraciones con registro y bloqueo ante errores (docs/estrategia-migracion.md, D13).
#
# - Aplica supabase/migrations/*.sql en orden, cada una en UNA transacción (psql --single-transaction) junto con
#   su fila en albor_control.migraciones: o queda aplicada y registrada, o no queda nada (sin aplicaciones parciales).
# - Se detiene en la primera falla y no sigue con las posteriores.
# - Verifica la huella (sha256) de las migraciones ya aplicadas: si un archivo cambió después de aplicarse, se
#   niega a seguir.
# - Un bloqueo consultivo impide dos ejecuciones a la vez sobre la misma base.
# - SOLO bases locales o efímeras: con cualquier otro host se niega. Aplicar migraciones a una base real NO está
#   autorizado; cuando lo esté, el procedimiento lo indicará expresamente.
#
# Uso: MIGRAR_URL=postgresql://postgres:postgres@127.0.0.1:5432/base ./scripts/migrar.sh [--simular] [--hasta 0025]
#      [--registrar-existentes-hasta 0013]   (base que ya tiene esas migraciones aplicadas por otro medio)
#      [--directorio ruta]                    (para ensayos)
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
URL="${MIGRAR_URL:?Indique MIGRAR_URL}"
DIR="$RAIZ/supabase/migrations"; HASTA=""; SIMULAR=0; EXISTENTES=""
while [ $# -gt 0 ]; do
  case "$1" in
    --simular) SIMULAR=1 ;;
    --hasta) HASTA="$2"; shift ;;
    --registrar-existentes-hasta) EXISTENTES="$2"; shift ;;
    --directorio) DIR="$2"; shift ;;
    *) echo "opción desconocida: $1"; exit 2 ;;
  esac
  shift
done

host=$(python3 -c "import sys,urllib.parse as u; print(u.urlparse(sys.argv[1]).hostname or '')" "$URL")
case "$host" in 127.0.0.1|localhost|"") ;; *) echo "BLOQUEADO: $host no es una base local. Aplicar migraciones a una base real no está autorizado."; exit 3 ;; esac

export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
PSQL=(psql "$URL" -X -q -v ON_ERROR_STOP=1 -tA)
"${PSQL[@]}" >/dev/null <<'SQL'
begin;
select pg_advisory_xact_lock(hashtext('albor_migraciones'));  -- dos ejecuciones a la vez no chocan al crear el registro
create schema if not exists albor_control;
create table if not exists albor_control.migraciones (
  version text primary key,
  archivo text not null,
  sha256 text not null,
  aplicada_en timestamptz not null default now(),
  aplicada_por text not null default current_user,
  modo text not null default 'aplicada' check (modo in ('aplicada', 'registrada_existente'))
);
revoke all on schema albor_control from public;
commit;
SQL

version_de() { basename "$1" | sed -E 's/^[0-9]{8}([0-9]{6})_.*/\1/' | sed -E 's/^0+([0-9]{4})$/\1/'; }
num() { echo $((10#$1)); }
sha() { sha256sum "$1" | cut -d' ' -f1; }

pendientes=0; aplicadas=0
for f in "$DIR"/*.sql; do
  v=$(version_de "$f"); h=$(sha "$f"); a=$(basename "$f")
  [ -n "$HASTA" ] && [ "$(num "$v")" -gt "$(num "$HASTA")" ] && break
  registrada=$("${PSQL[@]}" -c "select sha256 from albor_control.migraciones where version = '$v'")
  if [ -n "$registrada" ]; then
    [ "$registrada" = "$h" ] || { echo "BLOQUEADO: $a cambió después de aplicarse (huella distinta). Revise antes de seguir."; exit 4; }
    continue
  fi
  if [ -n "$EXISTENTES" ] && [ "$(num "$v")" -le "$(num "$EXISTENTES")" ]; then
    [ $SIMULAR = 1 ] && { echo "registraría  $a (ya aplicada por otro medio)"; continue; }
    "${PSQL[@]}" -c "insert into albor_control.migraciones (version, archivo, sha256, modo) values ('$v', '$a', '$h', 'registrada_existente')" >/dev/null
    echo "registrada   $a"; continue
  fi
  pendientes=$((pendientes + 1))
  if [ $SIMULAR = 1 ]; then echo "pendiente    $a"; continue; fi
  inicio=$(date +%s%3N)
  if ! psql "$URL" -X -q -v ON_ERROR_STOP=1 --single-transaction \
        -c "select pg_advisory_xact_lock(hashtext('albor_migraciones'))" \
        -c "do \$\$ begin if exists (select 1 from albor_control.migraciones where version = '$v') then raise exception 'migracion_ya_aplicada_por_otra_ejecucion: $v'; end if; end \$\$" \
        -f "$f" \
        -c "insert into albor_control.migraciones (version, archivo, sha256) values ('$v', '$a', '$h')" >/tmp/albor_migrar.log 2>&1; then
    echo "FALLA        $a: se deshizo completa; no se aplican las siguientes"
    grep -m3 -E "ERROR|error" /tmp/albor_migrar.log | sed 's/^/             /'
    exit 1
  fi
  aplicadas=$((aplicadas + 1))
  echo "aplicada     $a ($(( $(date +%s%3N) - inicio )) ms)"
done
[ $SIMULAR = 1 ] && echo "simulación: $pendientes pendiente(s)" || echo "listo: $aplicadas aplicada(s)"
