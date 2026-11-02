#!/usr/bin/env bash
# Réplica local del trabajo «capturas» de CI: datos de ejemplo, compilación, servidor y recorridos.
# SOLO para el Supabase local (Docker), nunca para una base real. Requiere `npx supabase start` hecho
# con supabase/config.toml preparado por scripts/supabase-local.sh (TOTP habilitado).
# Uso: ./scripts/verificar-e2e.sh [--sin-compilar | --dev]
#   --dev  usa `next dev` (React sin minificar): las advertencias de hidratación y de HTML mal anidado
#          aparecen completas en la consola y los recorridos las cuentan como fallas.
set -uo pipefail
cd "$(dirname "$0")/.."
DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
case "$DB" in *127.0.0.1*|*localhost*) ;; *) echo "solo base local"; exit 2;; esac

npx supabase db reset >/dev/null 2>&1 || { echo "no se pudo reiniciar la base local"; exit 1; }
npx supabase status -o env > supabase.env 2>/dev/null
psql "$DB" -v ON_ERROR_STOP=1 -q -f tests/visual/demo.sql
set -a; . ./supabase.env; set +a
./tests/visual/campus.sh
export NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export NEXT_PUBLIC_URL_SITIO=http://localhost:3000
export PROCESOS_CLAVE=clave-de-procesos-solo-para-ci-0123456789
MODO="${1:-}"
pkill -f "next-server|next start|next dev" 2>/dev/null; sleep 1
if [ "$MODO" = "--dev" ]; then
  (npx next dev -p 3000 > servidor.log 2>&1 &)
else
  [ "$MODO" = "--sin-compilar" ] || npm run build >build.log 2>&1 || { tail -30 build.log; exit 1; }
  (npm start > servidor.log 2>&1 &)
fi
for i in $(seq 120); do curl -sf -o /dev/null http://localhost:3000 && break; sleep 1; done

mkdir -p capturas
set -a; . ./campus.env; set +a
fallo=0
correr() { echo "--- $1" | tee -a capturas/informe.txt; shift; "$@" 2>&1 | tee -a capturas/informe.txt || fallo=1; }
: > capturas/informe.txt
correr "sitio público" env -u CORREO -u CLAVE npm run -s capturas -- / /cursos /cursos/demo-montessori-en-casa /talleres /talleres/demo-taller-ambiente /la-maestra /contacto /ingresar /registro $RUTAS_VERIFICAR
correr "campus" env DESCARGAR="$CERTIFICADO" npm run -s capturas -- $RUTAS_CAMPUS
correr "recorrido del campus" node scripts/recorrido-campus.mjs
correr "panel" env CORREO="$ADMIN_CORREO" CLAVE="$ADMIN_CLAVE" npm run -s capturas -- $RUTAS_ADMIN
correr "recorrido del panel" node scripts/recorrido-admin.mjs
correr "cursos en el panel" node scripts/recorrido-cursos.mjs
correr "talleres" node scripts/recorrido-talleres.mjs
correr "evaluaciones" node scripts/recorrido-evaluaciones.mjs
correr "vencimientos" node scripts/recorrido-vencimientos.mjs
correr "renovaciones" node scripts/recorrido-renovaciones.mjs
correr "panel de cursos" node scripts/recorrido-panel-cursos.mjs
correr "perfil" node scripts/recorrido-perfil.mjs
correr "acciones protegidas" node scripts/acciones-protegidas.mjs
correr "acciones sensibles" node scripts/acciones-sensibles.mjs
correr "seguridad: segundo factor, verificación reforzada y recuperación" node scripts/recorrido-mfa.mjs
for extra in ${RECORRIDOS_EXTRA:-}; do correr "$extra" node "scripts/$extra"; done
pkill -f "next-server|next start|next dev" 2>/dev/null
echo "comprobaciones ok: $(grep -cE '^ok ' capturas/informe.txt) · fallas: $(grep -cE '^FALLA' capturas/informe.txt)"
exit $fallo
