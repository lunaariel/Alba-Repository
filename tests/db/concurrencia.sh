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

# Taller gratuito con 1 lugar: cinco personas se inscriben a la vez. Una sola entra.
G='7a000000-0000-0000-0000-0000000000f1'
"${PSQL[@]}" -c "
  insert into auth.users (id, email, raw_user_meta_data)
  select ('f0f0f0f0-0000-0000-0000-00000000000' || n)::uuid, 'conc' || n || '@prueba.test', '{\"nombre_completo\": \"Concurrente\", \"confirma_mayoria_edad\": true}'
    from generate_series(1, 5) n on conflict do nothing;
  insert into public.talleres (id, slug, titulo, descripcion, inicia_en, termina_en, cupo, precio_centavos, estado)
  values ('$G', 'gratis-concurrencia', 'Gratis', 'Prueba de concurrencia.', now() + interval '2 days', now() + interval '2 days 1 hour', 1, 0, 'publicado')
  on conflict do nothing;" >/dev/null
for n in 1 2 3 4 5; do
  ( "${PSQL[@]}" -c "begin; select set_config('request.jwt.claim.sub', 'f0f0f0f0-0000-0000-0000-00000000000$n', true);
                     select public.inscribirme_gratis('$G'); select pg_sleep(0.8); commit;" >/dev/null 2>&1 && echo dentro || echo fuera ) > /tmp/albor_g$n &
done
wait
dentro=$(cat /tmp/albor_g{1,2,3,4,5} | grep -c dentro)
confirmadas=$("${PSQL[@]}" -c "select count(*) from public.inscripciones_taller where taller_id = '$G' and estado = 'confirmada'")

# Recordatorios: dos procesos a la vez no duplican.
"${PSQL[@]}" -c "insert into public.reuniones (taller_id, proveedor, enlace_participante) values ('$G', 'manual', 'https://reunion.test/g')" >/dev/null
for k in 1 2; do
  "${PSQL[@]}" -c "begin; select public.procesar_recordatorios((select inicia_en from public.talleres where id = '$G') - interval '30 minutes'); select pg_sleep(0.5); commit;" > /tmp/albor_r$k 2>&1 &
done
wait
envios=$("${PSQL[@]}" -c "select count(*) from public.envios_recordatorio e join public.recordatorios r on r.id = e.recordatorio_id where r.taller_id = '$G'")
"${PSQL[@]}" -c "delete from public.notificaciones where taller_id = '$G'; delete from public.envios_recordatorio where recordatorio_id in (select id from public.recordatorios where taller_id = '$G');
                 delete from public.inscripciones_taller where taller_id = '$G'; delete from public.reuniones where taller_id = '$G'; delete from public.talleres where id = '$G';" >/dev/null

if [ "$dentro" = "1" ] && [ "$confirmadas" = "1" ]; then
  echo "ok         concurrencia: taller gratuito, 5 a la vez por 1 lugar (entró $dentro)"
else
  echo "FALLA      concurrencia gratuita: dentro=$dentro confirmadas=$confirmadas"
  exit 1
fi
# A 30 minutos del inicio vencieron los dos recordatorios (24 h y 1 h): exactamente 2 envíos, no 4.
if [ "$envios" = "2" ]; then
  echo "ok         concurrencia: dos procesos de recordatorios en paralelo, sin duplicados ($envios envíos)"
else
  echo "FALLA      concurrencia de recordatorios: $envios envíos"
  exit 1
fi

# Reprogramación: dos respuestas simultáneas de la misma persona (aceptar y no asistir). Solo una cuenta.
R='7a000000-0000-0000-0000-0000000000f2'
A='aaaaaaaa-0000-0000-0000-000000000001'
"${PSQL[@]}" -c "
  insert into public.talleres (id, slug, titulo, descripcion, inicia_en, termina_en, cupo, precio_centavos)
  values ('$R', 'reprog-concurrencia', 'Reprog', 'Prueba de concurrencia.', now() + interval '3 days', now() + interval '3 days 1 hour', 5, 0);
  update public.talleres set estado = 'publicado' where id = '$R';
  select set_config('request.jwt.claim.sub', '$A', false);
  select public.inscribirme_gratis('$R');
  select set_config('request.jwt.claim.sub', 'adadadad-0000-0000-0000-000000000003', false);
  select public.reprogramar_taller('$R', now() + interval '6 days', now() + interval '6 days 1 hour', 'Motivo suficiente para la prueba.');" >/dev/null
for resp in aceptada no_asiste; do
  ( "${PSQL[@]}" -c "begin; select set_config('request.jwt.claim.sub', '$A', true);
                     select public.responder_reprogramacion('$R', '$resp', 'Respuesta de prueba concurrente.'); select pg_sleep(0.8); commit;" >/dev/null 2>&1 \
    && echo ok || echo rechazada ) > /tmp/albor_resp_$resp &
done
wait
exitos=$(cat /tmp/albor_resp_aceptada /tmp/albor_resp_no_asiste | grep -c '^ok')
respuestas=$("${PSQL[@]}" -c "select count(*) from public.respuestas_reprogramacion r join public.inscripciones_taller i on i.id = r.inscripcion_id where i.taller_id = '$R'")
"${PSQL[@]}" -c "delete from public.respuestas_reprogramacion where inscripcion_id in (select id from public.inscripciones_taller where taller_id = '$R');
                 delete from public.notificaciones where taller_id = '$R';
                 delete from public.inscripciones_taller where taller_id = '$R'; delete from public.reprogramaciones_taller where taller_id = '$R';
                 delete from public.talleres where id = '$R';" >/dev/null
if [ "$exitos" = "1" ] && [ "$respuestas" = "1" ]; then
  echo "ok         concurrencia: dos respuestas simultáneas a una reprogramación, se registra una sola"
else
  echo "FALLA      concurrencia de respuestas: éxitos=$exitos respuestas=$respuestas"
  exit 1
fi
