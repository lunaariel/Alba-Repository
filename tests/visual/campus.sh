#!/usr/bin/env bash
# Alumna de ejemplo para las capturas del campus. SOLO en CI, sobre el Supabase local.
# Requiere API_URL y SERVICE_ROLE_KEY (de "supabase status -o env") y la base en el puerto 54322.
# Escribe en campus.env: CORREO, CLAVE y las rutas con identificadores generados.
set -euo pipefail
DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
CORREO="alumna.demo@albor.invalid"
CLAVE="clave-de-ejemplo-123"

curl -sf -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$CORREO\",\"password\":\"$CLAVE\",\"email_confirm\":true,
       \"user_metadata\":{\"nombre_completo\":\"Lucía Ramírez (ejemplo)\",\"confirma_mayoria_edad\":true,\"zona_horaria\":\"America/Guatemala\"}}" >/dev/null

psql "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
do $$
declare
  a uuid := (select id from auth.users where email = 'alumna.demo@albor.invalid');
  c1 uuid := 'c1000000-0000-0000-0000-000000000001';  -- comprado, avance parcial
  c2 uuid := 'c1000000-0000-0000-0000-000000000002';  -- completo, con certificado
  c3 uuid := 'c1000000-0000-0000-0000-000000000003';  -- lecciones completas, evaluación pendiente
  o uuid; r jsonb;
begin
  o := public.crear_orden(a, 'curso', c1);
  perform public.procesar_evento_pago('simulado', 'demo-evt-1', 'pago', '{}'::jsonb, o, 'demo-pago-1', 'aprobado', 4900);
  insert into public.accesos_curso (perfil_id, curso_id, origen, motivo) values
    (a, c2, 'concesion', 'Ejemplo para capturas'), (a, c3, 'concesion', 'Ejemplo para capturas');

  -- c1: primera lección completa, segunda visitada.
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en, ultima_visita_en)
  select a, l.id, case when l.orden = 0 and m.orden = 0 then now() end, now() - (l.orden || ' minutes')::interval
    from public.lecciones l join public.modulos m on m.id = l.modulo_id
   where m.curso_id = c1 and m.orden = 0;
  insert into public.recursos_leccion (leccion_id, titulo, ruta_almacenamiento, tipo_mime, tamano_bytes)
  select l.id, 'Guía para observar en casa', 'demo/guia.pdf', 'application/pdf', 480000
    from public.lecciones l join public.modulos m on m.id = l.modulo_id where m.curso_id = c1 and m.orden = 0 and l.orden = 0;

  -- c2 y c3: todas las lecciones completas.
  insert into public.progreso_leccion (perfil_id, leccion_id, completada_en)
  select a, l.id, now() from public.lecciones l join public.modulos m on m.id = l.modulo_id where m.curso_id in (c2, c3);

  -- c2: evaluación aprobada (por la función del servidor) y certificado.
  select jsonb_object_agg(p.id, jsonb_build_array(o2.id)) into r
    from public.preguntas p join public.evaluaciones e on e.id = p.evaluacion_id
    join public.opciones o2 on o2.pregunta_id = p.id and o2.es_correcta where e.curso_id = c2;
  perform public.corregir_evaluacion(a, (select id from public.evaluaciones where curso_id = c2), r);
  perform public.emitir_certificado(a, c2);

  -- Taller con enlace de videollamada.
  insert into public.inscripciones_taller (taller_id, perfil_id)
  select id, a from public.talleres where slug = 'demo-taller-limites';
  insert into public.reuniones (taller_id, proveedor, enlace_participante, enlace_anfitrion)
  select id, 'manual', 'https://meet.example.invalid/albor-demo', 'https://meet.example.invalid/anfitrion' from public.talleres where slug = 'demo-taller-limites';
end $$;
SQL

# Administradora de ejemplo y algo de actividad hecha "por ella" (para el registro de actividad).
ADMIN_CORREO="maestra.demo@albor.invalid"
ADMIN_CLAVE="clave-admin-de-ejemplo-123"
curl -sf -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_CORREO\",\"password\":\"$ADMIN_CLAVE\",\"email_confirm\":true,
       \"user_metadata\":{\"nombre_completo\":\"Maestra (ejemplo)\",\"confirma_mayoria_edad\":true}}" >/dev/null
psql "$DB" -v ON_ERROR_STOP=1 -q -v correo="'$ADMIN_CORREO'" -f scripts/asignar-admin.sql
ADMIN_ID=$(psql "$DB" -tA -c "select id from auth.users where email = '$ADMIN_CORREO'")
psql "$DB" -v ON_ERROR_STOP=1 -q <<SQL
begin;
set local request.jwt.claim.sub = '$ADMIN_ID';
update public.talleres set cupo = 25 where slug = 'demo-taller-limites';
update public.cursos set precio_centavos = 6500 where id = 'c1000000-0000-0000-0000-000000000003';
insert into public.cupones (codigo, tipo, valor) values ('BIENVENIDA10', 'porcentaje', 10);
update public.configuracion_academia set whatsapp = '+50200000000';
commit;
SQL

q() { psql "$DB" -tA -c "$1"; }
LECCION=$(q "select l.id from public.lecciones l join public.modulos m on m.id = l.modulo_id where m.curso_id = 'c1000000-0000-0000-0000-000000000001' order by m.orden, l.orden offset 1 limit 1")
ORDEN=$(q "select id from public.ordenes where estado = 'aprobada' limit 1")
CERT=$(q "select id from public.certificados limit 1")
CODIGO=$(q "select codigo_verificacion from public.certificados limit 1")
cat > campus.env <<EOF
CORREO=$CORREO
CLAVE=$CLAVE
ADMIN_CORREO=$ADMIN_CORREO
ADMIN_CLAVE=$ADMIN_CLAVE
LECCION=$LECCION
RUTAS_CAMPUS="/campus /campus/cursos/demo-montessori-en-casa /campus/cursos/demo-montessori-en-casa/lecciones/$LECCION /campus/cursos/demo-autonomia-0-3 /campus/cursos/demo-ambiente-3-6/evaluacion /campus/talleres /campus/compras /campus/compras/$ORDEN /campus/cuenta"
RUTAS_VERIFICAR="/verificar /verificar/$CODIGO /verificar/NOEXISTE0000"
CERTIFICADO=/campus/certificados/$CERT
EOF
cat campus.env
