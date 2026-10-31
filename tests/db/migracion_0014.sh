#!/usr/bin/env bash
# Ensayo de la migración 0014 sobre datos existentes:
#  1) base con las migraciones hasta 0013 y datos académicos reales de prueba (avance, intentos,
#     certificado, lección retirada, curso archivado con alumno);
#  2) huella de esos datos; 3) migración 0014; 4) informe de conciliación (todo en cero) y huella igual;
#  5) reglas del campus iguales que antes; 6) reversión y huella igual otra vez.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${DB_MIGRACION:-albor_migracion}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U "${PGUSER:-postgres}")
q() { "${PSQL[@]}" -d "$DB" -tA -c "$1"; }

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$RAIZ/tests/db/supabase_stub.sql" >/dev/null
for m in "$RAIZ"/supabase/migrations/*.sql; do
  case "$(basename "$m")" in 20261031000014_*|2026103100001[5-9]_*) continue;; esac
  "${PSQL[@]}" -d "$DB" -f "$m" >/dev/null
done

# Datos previos: los de las pruebas, más historial académico completo.
"${PSQL[@]}" -d "$DB" -f "$RAIZ/tests/db/00_ayudas.sql" >/dev/null
"${PSQL[@]}" -d "$DB" >/dev/null <<'SQL'
do $$
declare
  A constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  B constant uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  c2 uuid; m uuid; l uuid; e uuid;
begin
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values
    (A, 'e0000000-0000-0000-0000-000000000001', now()), (A, 'e0000000-0000-0000-0000-000000000002', now());
  perform public.corregir_evaluacion(A, 'f0000000-0000-0000-0000-000000000001', jsonb_build_object(
    'a1000000-0000-0000-0000-000000000001', jsonb_build_array('a2000000-0000-0000-0000-000000000012'),
    'a1000000-0000-0000-0000-000000000002', jsonb_build_array('a2000000-0000-0000-0000-000000000021')));
  perform public.corregir_evaluacion(A, 'f0000000-0000-0000-0000-000000000001', jsonb_build_object(
    'a1000000-0000-0000-0000-000000000001', jsonb_build_array('a2000000-0000-0000-0000-000000000011'),
    'a1000000-0000-0000-0000-000000000002', jsonb_build_array('a2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000022')));
  perform public.emitir_certificado(A, 'c0000000-0000-0000-0000-000000000001');
  -- Una lección agregada y retirada después (no debe exigirse a nadie).
  insert into public.lecciones (modulo_id, titulo, orden, retirada) values ('d0000000-0000-0000-0000-000000000001', 'Retirada', 5, true);
  -- Segundo curso, publicado y luego archivado, con una alumna a mitad de camino.
  insert into public.cursos (slug, titulo, precio_centavos) values ('archivado', 'Curso archivado', 3900) returning id into c2;
  insert into public.modulos (curso_id, titulo, orden) values (c2, 'M', 0) returning id into m;
  insert into public.lecciones (modulo_id, titulo, orden) values (m, 'L1', 0) returning id into l;
  insert into public.lecciones (modulo_id, titulo, orden) values (m, 'L2', 1);
  insert into public.evaluaciones (curso_id) values (c2) returning id into e;
  perform public.guardar_pregunta(e, null, '¿?', 'unica', null, '[{"texto":"a","es_correcta":true},{"texto":"b","es_correcta":false}]');
  update public.cursos set estado = 'publicado' where id = c2;
  insert into public.accesos_curso (perfil_id, curso_id, origen, motivo) values (B, c2, 'concesion', 'Beca de prueba');
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en) values (B, l, now());
  update public.cursos set estado = 'archivado' where id = c2;
end $$;
SQL

huella() {
  q "select md5(string_agg(x, '|' order by x)) from (
       select 'a'||id||perfil_id||curso_id||origen||estado||coalesce(item_orden_id::text,'') x from public.accesos_curso
       union all select 'p'||id||perfil_id||leccion_id||coalesce(completada_en::text,'') from public.progreso_leccion
       union all select 'i'||id||perfil_id||evaluacion_id||numero||puntaje||aprobado||entregado_en from public.intentos_evaluacion
       union all select 'r'||id||intento_id||pregunta_id||opciones_elegidas::text||correcta from public.respuestas_intento
       union all select 'c'||id||perfil_id||curso_id||intento_id||codigo_verificacion||nombre_en_certificado||titulo_curso||emitido_en from public.certificados) t"
}
pendientes() {
  q "select string_agg(perfil_id||':'||curso_id||'='||n, ',' order by perfil_id, curso_id) from (
       select a.perfil_id, a.curso_id, (select count(*) from public.lecciones l join public.modulos mo on mo.id = l.modulo_id
         where mo.curso_id = a.curso_id and not l.retirada and not mo.retirado
           and not exists (select 1 from public.progreso_leccion p where p.leccion_id = l.id and p.perfil_id = a.perfil_id and p.completada_en is not null)) n
       from public.accesos_curso a where a.estado = 'activo') t"
}

ANTES=$(huella)
PEND_ANTES=$(pendientes)
CERT_ANTES=$(q "select id from public.certificados")
echo "ensayo de migración 0014"
echo "  antes: $(q "select count(*) from public.accesos_curso") accesos, $(q "select count(*) from public.progreso_leccion") avances, $(q "select count(*) from public.intentos_evaluacion") intentos, $(q "select count(*) from public.certificados") certificados"

"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/migrations/20261031000014_versionado.sql" >/dev/null

INFORME=$(q "select public.conciliar_versionado()")
echo "  conciliación: $INFORME"
falla=0
for clave in accesos_alterados accesos_sin_version progreso_alterado intentos_alterados respuestas_alteradas certificados_alterados pendientes_distintos; do
  v=$(q "select (public.conciliar_versionado() ->> '$clave')::int")
  if [ "$v" != "0" ]; then echo "  FALLA: $clave = $v"; falla=1; fi
done
iguales=$(q "select bool_and((v ->> 'antes') = (v ->> 'despues')) from jsonb_each(public.conciliar_versionado()) e(k, v) where jsonb_typeof(v) = 'object'")
[ "$iguales" = "t" ] || { echo "  FALLA: cantidades distintas"; falla=1; }
[ "$(huella)" = "$ANTES" ] || { echo "  FALLA: la huella de los datos académicos cambió"; falla=1; }
VERSIONES=$(q "select count(*) from public.versiones_curso")
[ "$VERSIONES" = "2" ] || { echo "  FALLA: se esperaban 2 versiones 1 (curso publicado y curso archivado), hay $VERSIONES"; falla=1; }
# Las reglas del campus dan lo mismo que antes: pendientes por alumno y certificado existente.
PEND_DESPUES=$(q "select string_agg(perfil_id||':'||curso_id||'='||n, ',' order by perfil_id, curso_id) from (
  select a.perfil_id, a.curso_id, (select count(*) from public.lecciones_de_version(a.version_id) v(id)
    where not exists (select 1 from public.progreso_leccion p where p.leccion_id = v.id and p.perfil_id = a.perfil_id and p.completada_en is not null)) n
  from public.accesos_curso a where a.estado = 'activo') t")
[ "$PEND_DESPUES" = "$PEND_ANTES" ] || { echo "  FALLA: lecciones pendientes distintas ($PEND_ANTES → $PEND_DESPUES)"; falla=1; }
[ "$(q "select public.emitir_certificado('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001')")" = "$CERT_ANTES" ] \
  || { echo "  FALLA: emitir el certificado no devolvió el ya emitido"; falla=1; }
q "set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002'; select 1" >/dev/null
echo "  después: huella igual, $VERSIONES versiones 1 creadas, pendientes iguales ($PEND_DESPUES)"

# Reversión (sin versiones 2 todavía): los datos académicos vuelven idénticos.
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/rollback/20261031000014_versionado_down.sql" >/dev/null
[ "$(huella)" = "$ANTES" ] || { echo "  FALLA: la huella cambió tras la reversión"; falla=1; }
[ "$(pendientes)" = "$PEND_ANTES" ] || { echo "  FALLA: pendientes distintos tras la reversión"; falla=1; }
[ "$(q "select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'versiones_curso'")" = "0" ] \
  || { echo "  FALLA: quedaron tablas del versionado"; falla=1; }
[ "$(q "select public.emitir_certificado('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001')")" = "$CERT_ANTES" ] \
  || { echo "  FALLA: las funciones anteriores no responden igual tras la reversión"; falla=1; }

echo "  reversión: datos idénticos al estado previo y funciones anteriores restauradas"

# Con una versión 2 publicada, la reversión se niega (no se afirma reversibilidad que no existe).
# (Para volver a migrar se descarta el respaldo de la primera pasada, ya verificado.)
q "drop schema respaldo_0014 cascade" >/dev/null 2>&1
"${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/migrations/20261031000014_versionado.sql" >/dev/null
q "select public.publicar_version('c0000000-0000-0000-0000-000000000001', 'Segunda versión de prueba')" >/dev/null
if "${PSQL[@]}" -d "$DB" -f "$RAIZ/supabase/rollback/20261031000014_versionado_down.sql" >/dev/null 2>/tmp/albor_rev.log; then
  echo "  FALLA: la reversión se aplicó con una versión 2"; falla=1
else
  grep -q "reversion_imposible" /tmp/albor_rev.log && echo "  con una versión 2, la reversión se niega como corresponde" || { echo "  FALLA: error inesperado"; cat /tmp/albor_rev.log; falla=1; }
fi

if [ "$falla" -ne 0 ]; then echo "FALLA      migración 0014"; exit 1; fi
echo "ok         migración 0014: conciliación en cero, datos idénticos, reversión probada"
