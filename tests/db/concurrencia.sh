#!/usr/bin/env bash
# Dos personas intentan comprar el último lugar de un taller al mismo tiempo.
# Solo una puede obtener la reserva. Se corre después de probar-db.sh (usa sus datos fijos).
set -uo pipefail
DB="${DB_PRUEBAS:-albor_pruebas}"
PSQL=(psql -X -q -t -A -U "${PGUSER:-postgres}" -d "$DB")
T='7a000000-0000-0000-0000-000000000001'

limpiar() {
  "${PSQL[@]}" -c "delete from public.reservas_cupo where taller_id = '$T';
                   delete from public.items_orden where taller_id = '$T';
                   delete from public.ordenes where clave_producto = 'taller:$T';" >/dev/null
}
limpiar

intento() {  # $1 = perfil
  local salida
  salida=$("${PSQL[@]}" -c "begin; select public.crear_orden('$1', 'taller', '$T'); select pg_sleep(1.5); commit;" 2>&1)
  if [[ "$salida" == *sin_cupo* ]]; then echo rechazada; else echo reservada; fi
}

intento 'aaaaaaaa-0000-0000-0000-000000000001' > /tmp/albor_c1 &
sleep 0.3
intento 'bbbbbbbb-0000-0000-0000-000000000002' > /tmp/albor_c2 &
wait

r1=$(cat /tmp/albor_c1); r2=$(cat /tmp/albor_c2)
reservas=$("${PSQL[@]}" -c "select count(*) from public.reservas_cupo where taller_id = '$T' and liberada_en is null")
limpiar

if [ "$reservas" = "1" ] && { [ "$r1/$r2" = "reservada/rechazada" ] || [ "$r1/$r2" = "rechazada/reservada" ]; }; then
  echo "ok         concurrencia: último cupo (A: $r1, B: $r2)"
else
  echo "FALLA      concurrencia: A=$r1 B=$r2 reservas=$reservas"
  exit 1
fi
