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

# Períodos de acceso (0024): dos pagos confirmados a la vez del mismo curso para la misma persona (una orden
# vieja con su precio aceptado y la nueva). Uno otorga y el otro se encadena: una sola inscripción académica,
# dos períodos contiguos, sin incidencias de falla y una incidencia para que la admin decida.
Z='f1f1f1f1-0000-0000-0000-000000000001'
C='c0000000-0000-0000-0000-000000000001'
"${PSQL[@]}" -c "insert into auth.users (id, email, raw_user_meta_data) values ('$Z', 'periodos-conc@prueba.test', '{\"nombre_completo\": \"Concurrente\", \"confirma_mayoria_edad\": true}')" >/dev/null
OA=$("${PSQL[@]}" -c "select public.crear_orden('$Z', 'curso', '$C')")
"${PSQL[@]}" -c "update public.cursos set precio_centavos = 5900 where id = '$C'" >/dev/null
OB=$("${PSQL[@]}" -c "select public.crear_orden('$Z', 'curso', '$C')")
( "${PSQL[@]}" -c "begin; select public.procesar_evento_pago('simulado', 'conc-a', 'pago', '{}', '$OA', 'conc-a', 'aprobado', 4900); select pg_sleep(1.5); commit;" > /tmp/albor_pa 2>&1 ) &
sleep 0.3
( "${PSQL[@]}" -c "begin; select public.procesar_evento_pago('simulado', 'conc-b', 'pago', '{}', '$OB', 'conc-b', 'aprobado', 5900); commit;" > /tmp/albor_pb 2>&1 ) &
wait
"${PSQL[@]}" -c "update public.cursos set precio_centavos = 4900 where id = '$C'" >/dev/null
filas=$("${PSQL[@]}" -c "select count(*) from public.accesos_curso where perfil_id = '$Z'")
periodos=$("${PSQL[@]}" -c "select count(*) from public.periodos_acceso where perfil_id = '$Z' and estado = 'activo'")
contiguos=$("${PSQL[@]}" -c "select count(*) from public.periodos_acceso a join public.periodos_acceso b on b.perfil_id = a.perfil_id and b.id <> a.id and b.inicia_en = a.vence_en where a.perfil_id = '$Z'")
fallidas=$("${PSQL[@]}" -c "select count(*) from public.incidencias where perfil_id = '$Z' and tipo = 'otorgamiento_fallido'")
avisos=$("${PSQL[@]}" -c "select count(*) from public.incidencias where perfil_id = '$Z' and tipo = 'compra_con_acceso_vigente'")
concilia=$("${PSQL[@]}" -c "select count(*) from public.conciliar_periodos()")
if [ "$filas" = "1" ] && [ "$periodos" = "2" ] && [ "$contiguos" = "1" ] && [ "$fallidas" = "0" ] && [ "$avisos" = "1" ] && [ "$concilia" = "0" ]; then
  echo "ok         concurrencia: dos pagos simultáneos del mismo curso, un acceso y dos períodos encadenados"
else
  echo "FALLA      concurrencia de períodos: filas=$filas períodos=$periodos contiguos=$contiguos fallidas=$fallidas avisos=$avisos concilia=$concilia"
  cat /tmp/albor_pa /tmp/albor_pb; exit 1
fi

# El mismo aviso de pago procesado dos veces a la vez: uno procesa y el otro se reconoce como duplicado.
Z2='f1f1f1f1-0000-0000-0000-000000000002'
"${PSQL[@]}" -c "insert into auth.users (id, email, raw_user_meta_data) values ('$Z2', 'periodos-conc2@prueba.test', '{\"nombre_completo\": \"Concurrente 2\", \"confirma_mayoria_edad\": true}')" >/dev/null
OC=$("${PSQL[@]}" -c "select public.crear_orden('$Z2', 'curso', '$C')")
for n in 1 2; do
  ( "${PSQL[@]}" -c "begin; select public.procesar_evento_pago('simulado', 'conc-mismo', 'pago', '{}', '$OC', 'conc-mismo', 'aprobado', 4900); select pg_sleep(0.8); commit;" > /tmp/albor_mismo_$n 2>&1 ) &
done
wait
duplicados=$(cat /tmp/albor_mismo_1 /tmp/albor_mismo_2 | grep -c '^duplicado')
periodos=$("${PSQL[@]}" -c "select count(*) from public.periodos_acceso where perfil_id = '$Z2'")
if [ "$duplicados" = "1" ] && [ "$periodos" = "1" ]; then
  echo "ok         concurrencia: el mismo aviso dos veces a la vez, un solo período"
else
  echo "FALLA      concurrencia del mismo aviso: duplicados=$duplicados períodos=$periodos"; cat /tmp/albor_mismo_1 /tmp/albor_mismo_2; exit 1
fi

# Reembolsos parciales (0025): el mismo aviso dos veces a la vez se registra una sola vez; dos avisos distintos
# a la vez se registran los dos, acumulados en una sola incidencia, sin tocar el acceso.
for n in 1 2; do
  ( "${PSQL[@]}" -c "begin; select public.procesar_evento_pago('simulado', 'conc-parcial', 'reembolso', '{}', '$OC', 'conc-mismo', 'reembolsado', 1000); select pg_sleep(0.8); commit;" > /tmp/albor_parcial_$n 2>&1 ) &
done
wait
for n in 1 2; do
  ( "${PSQL[@]}" -c "begin; select public.procesar_evento_pago('simulado', 'conc-parcial-$n', 'reembolso', '{}', '$OC', 'conc-mismo', 'reembolsado', 500); select pg_sleep(0.5); commit;" > /tmp/albor_parcial_d$n 2>&1 ) &
done
wait
reembolsos=$("${PSQL[@]}" -c "select count(*) || ':' || sum(r.monto_centavos) from public.reembolsos r join public.pagos p on p.id = r.pago_id where p.id_externo = 'conc-mismo'")
incid=$("${PSQL[@]}" -c "select count(*) || ':' || max((detalle ->> 'reembolsado_centavos')::int) from public.incidencias where tipo = 'reembolso_parcial' and orden_id = '$OC'")
acceso=$("${PSQL[@]}" -c "select count(*) from public.periodos_acceso where perfil_id = '$Z2' and estado = 'activo'")
pago=$("${PSQL[@]}" -c "select estado || ':' || monto_centavos from public.pagos where id_externo = 'conc-mismo'")
if [ "$reembolsos" = "3:2000" ] && [ "$incid" = "1:2000" ] && [ "$acceso" = "1" ] && [ "$pago" = "aprobado:4900" ]; then
  echo "ok         concurrencia: reembolsos parciales simultáneos, registrados una vez cada uno y sin tocar el acceso"
else
  echo "FALLA      concurrencia de reembolsos parciales: reembolsos=$reembolsos incidencia=$incid acceso=$acceso pago=$pago"
  cat /tmp/albor_parcial_*; exit 1
fi
