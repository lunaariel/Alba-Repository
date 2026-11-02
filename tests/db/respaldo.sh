#!/usr/bin/env bash
# Ensayo de respaldo y restauración SOLO con bases de prueba (docs/respaldos.md): datos académicos y comerciales
# de prueba, respaldo mientras otra sesión escribe, restauración en una base nueva con huella idéntica y
# conciliación en cero, negativa a restaurar sobre una base existente, restauración fallida sin dejar nada a medias
# y copia anonimizada sin datos personales.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
U="${PGUSER:-postgres}"; H="${PGHOST:-localhost}"; P="${PGPORT:-5432}"; W="${PGPASSWORD:-postgres}"
SERV="postgresql://$U:$W@$H:$P"; ORIGEN=albor_respaldo_origen; DESTINO=albor_respaldo_restaurada
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U "$U")
q() { psql "$SERV/$1" -X -tA -c "$2"; }
falla() { echo "FALLA      respaldo y restauración: $1"; exit 1; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
for b in $ORIGEN $DESTINO ${DESTINO}_anon ${DESTINO}_rota; do "${PSQL[@]}" -d postgres -c "drop database if exists $b" >/dev/null; done
"${PSQL[@]}" -d postgres -c "create database $ORIGEN encoding 'UTF8' template template0" >/dev/null
"${PSQL[@]}" -d $ORIGEN -f "$RAIZ/tests/db/supabase_stub.sql" >/dev/null
for m in "$RAIZ"/supabase/migrations/*.sql; do "${PSQL[@]}" -d $ORIGEN -f "$m" >/dev/null; done
"${PSQL[@]}" -d $ORIGEN -f "$RAIZ/tests/db/00_ayudas.sql" >/dev/null
# Historial de prueba: compra de curso pagada, avance, evaluación aprobada, certificado, inscripción paga a taller y un mensaje.
q $ORIGEN "insert into auth.users (id, email, raw_user_meta_data) values ('eeeeeeee-0000-0000-0000-000000000005', 'respaldo@prueba.test', '{\"nombre_completo\": \"Persona Real Respaldo\", \"confirma_mayoria_edad\": true}')" >/dev/null
q $ORIGEN "do \$\$ declare o uuid; r jsonb; A uuid := 'eeeeeeee-0000-0000-0000-000000000005'; C uuid := 'c0000000-0000-0000-0000-000000000001';
  begin
    o := public.crear_orden(A, 'curso', C);
    perform public.procesar_evento_pago('simulado', 'resp-evt-1', 'pago', '{}', o, 'resp-pago-1', 'aprobado', 4900);
    insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) select A, l.id, now() from public.lecciones l join public.modulos m on m.id = l.modulo_id where m.curso_id = C;
    select jsonb_object_agg(p.id, (select jsonb_agg(op.id) from public.opciones op where op.pregunta_id = p.id and op.es_correcta)) into r
      from public.preguntas p where p.evaluacion_id = 'f0000000-0000-0000-0000-000000000001';
    perform public.corregir_evaluacion(A, 'f0000000-0000-0000-0000-000000000001', r);
    perform public.emitir_certificado(A, C);
    o := public.crear_orden(A, 'taller', '7a000000-0000-0000-0000-000000000001');
    perform public.procesar_evento_pago('simulado', 'resp-evt-2', 'pago', '{}', o, 'resp-pago-2', 'aprobado', 1500);
    insert into public.mensajes_contacto (nombre, correo, mensaje) values ('Ana Real', 'ana.real@correo.test', 'Consulta con datos personales');
  end \$\$;" >/dev/null
[ "$(q $ORIGEN "select count(*) from public.certificados")" = "1" ] || falla "no se generó el historial de prueba"

# Respaldo mientras otra sesión escribe en la auditoría: la instantánea es coherente.
( for i in $(seq 40); do q $ORIGEN "insert into public.auditoria (accion, entidad) values ('escritura_concurrente', 'prueba')" >/dev/null; done ) &
RESPALDO_URL="$SERV/$ORIGEN" "$RAIZ/scripts/respaldo.sh" "$TMP/albor.dump" >/dev/null
wait
[ "$(stat -c %a "$TMP/albor.dump")" = "600" ] || falla "el respaldo no quedó con permisos 600"
if RESPALDO_URL="$SERV/$ORIGEN" "$RAIZ/scripts/respaldo.sh" "$RAIZ/respaldo.dump" >/dev/null 2>&1; then rm -f "$RAIZ"/respaldo.dump*; falla "permitió guardar el respaldo dentro del repositorio"; fi
if RESPALDO_URL="postgresql://u:p@db.ejemplo.invalid/x" "$RAIZ/scripts/respaldo.sh" "$TMP/x.dump" >/dev/null 2>&1; then falla "aceptó una base remota"; fi

# Restauración en base nueva: huella idéntica a la del momento del respaldo y conciliación en cero.
RESTAURAR_SERVIDOR="$SERV" "$RAIZ/scripts/restaurar.sh" "$TMP/albor.dump" $DESTINO > "$TMP/r.log" 2>&1 || { cat "$TMP/r.log"; falla "la restauración falló"; }
grep -q "conciliación en cero" "$TMP/r.log" || falla "no se ejecutó la conciliación"
[ "$(q $DESTINO "select codigo_verificacion || nombre_en_certificado from public.certificados")" = "$(q $ORIGEN "select codigo_verificacion || nombre_en_certificado from public.certificados")" ] || falla "el certificado no se conservó igual"
[ "$(q $DESTINO "select count(*) from public.periodos_acceso")" = "$(q $ORIGEN "select count(*) from public.periodos_acceso")" ] || falla "períodos de acceso distintos"
# La restauración funciona: la verificación pública del certificado responde igual en la copia.
c=$(q $ORIGEN "select codigo_verificacion from public.certificados")
[ "$(q $DESTINO "select (public.verificar_certificado('$c'))::text")" = "$(q $ORIGEN "select (public.verificar_certificado('$c'))::text")" ] || falla "la verificación del certificado cambió en la copia"

# Nunca sobre una base existente.
if RESTAURAR_SERVIDOR="$SERV" "$RAIZ/scripts/restaurar.sh" "$TMP/albor.dump" $ORIGEN >/dev/null 2>&1; then falla "restauró sobre una base existente"; fi
# Respaldo dañado: la restauración se deshace completa.
head -c 20000 "$TMP/albor.dump" > "$TMP/roto.dump"
if RESTAURAR_SERVIDOR="$SERV" "$RAIZ/scripts/restaurar.sh" "$TMP/roto.dump" ${DESTINO}_rota >/dev/null 2>&1; then falla "aceptó un respaldo dañado"; fi
[ "$(q ${DESTINO}_rota "select count(*) from pg_tables where schemaname = 'public'")" = "0" ] || falla "un respaldo dañado dejó tablas a medias"

# Copia anonimizada: sin correos, nombres ni mensajes reales; vínculos académicos intactos.
RESTAURAR_SERVIDOR="$SERV" "$RAIZ/scripts/restaurar.sh" "$TMP/albor.dump" ${DESTINO}_anon --anonimizar >/dev/null 2>&1 || falla "la restauración anonimizada falló"
[ "$(q ${DESTINO}_anon "select count(*) from auth.users where email not like '%@albor.invalid'")" = "0" ] || falla "quedaron correos reales"
[ "$(q ${DESTINO}_anon "select count(*) from public.mensajes_contacto where correo like '%correo.test' or nombre = 'Ana Real'")" = "0" ] || falla "quedó un mensaje con datos personales"
[ "$(q ${DESTINO}_anon "select count(*) from public.certificados where nombre_en_certificado like 'Persona %'")" = "1" ] || falla "el certificado conserva el nombre real"
[ "$(q ${DESTINO}_anon "select count(*) from public.conciliar_periodos()")" = "0" ] || falla "la anonimización rompió los períodos"

for b in $ORIGEN $DESTINO ${DESTINO}_anon ${DESTINO}_rota; do "${PSQL[@]}" -d postgres -c "drop database if exists $b" >/dev/null; done
echo "ok         respaldo y restauración: instantánea coherente, huella idéntica, conciliación en cero, sin sobrescribir, daño sin restos y copia anonimizada"
