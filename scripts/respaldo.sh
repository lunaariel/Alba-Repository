#!/usr/bin/env bash
# Respaldo consistente de una base de Albor (docs/respaldos.md). pg_dump toma una sola instantánea
# (transacción de solo lectura): el respaldo es coherente aunque haya escrituras mientras corre.
# Formato custom (-Fc), comprimido, con permisos 600. Junto al respaldo se guarda su huella de verificación
# (filas y md5 por tabla) para comprobar la restauración.
#   RESPALDO_URL=postgresql://… ./scripts/respaldo.sh /ruta/segura/albor-AAAAMMDD.dump
# SOLO bases locales o de prueba: con otro host se niega (las credenciales de producción no se usan aquí).
# El destino no puede estar dentro del repositorio (un respaldo contiene datos personales).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
URL="${RESPALDO_URL:?Indique RESPALDO_URL}"; DESTINO="${1:?Indique el archivo de destino}"
host=$(python3 -c "import sys,urllib.parse as u; print(u.urlparse(sys.argv[1]).hostname or '')" "$URL")
case "$host" in 127.0.0.1|localhost|"") ;; *) echo "BLOQUEADO: $host no es una base local o de prueba."; exit 3 ;; esac
case "$(realpath -m "$DESTINO")" in "$RAIZ"/*) echo "BLOQUEADO: el respaldo no se guarda dentro del repositorio."; exit 3 ;; esac
umask 077
# Una instantánea exportada: el respaldo y su huella ven exactamente los mismos datos.
coproc SESION { psql "$URL" -X -q -tA -v ON_ERROR_STOP=1; }
echo "begin isolation level repeatable read read only; select pg_export_snapshot();" >&"${SESION[1]}"
read -r -u "${SESION[0]}" INSTANTANEA
[[ "$INSTANTANEA" =~ ^[0-9A-F-]+$ ]] || { echo "no se pudo tomar la instantánea"; exit 1; }
pg_dump "$URL" -Fc --no-owner --no-privileges --schema=public --schema=auth --snapshot="$INSTANTANEA" --file "$DESTINO"
{ echo "begin isolation level repeatable read read only; set transaction snapshot '$INSTANTANEA';"; cat "$RAIZ/scripts/huella-base.sql"; echo "commit;"; } \
  | psql "$URL" -X -q -tA -v ON_ERROR_STOP=1 > "$DESTINO.huella"
echo "commit;" >&"${SESION[1]}"; exec {SESION[1]}>&-; wait "$SESION_PID" 2>/dev/null || true
chmod 600 "$DESTINO" "$DESTINO.huella"
echo "respaldo: $DESTINO ($(du -h "$DESTINO" | cut -f1)), huella de $(wc -l < "$DESTINO.huella") tablas"
