#!/usr/bin/env bash
set -euo pipefail

[[ "$(id -u)" == 0 ]] || { echo 'Ejecutar como root.' >&2; exit 1; }
[[ "$(readlink -f /srv/torneos/app)" == /srv/torneos/app ]] || { echo 'Checkout inesperado.' >&2; exit 1; }
BACKUP_FILE="${1:?Indicar respaldo reciente con restauración comprobada}"
[[ "$BACKUP_FILE" == /srv/torneos/backups/initial-*.dump && -f "$BACKUP_FILE" ]] || { echo 'Respaldo inesperado.' >&2; exit 1; }
source /srv/torneos/production.env
[[ "$DATABASE_URL" == */torneos_prod && "$WEB_ORIGIN" == https://alacancha.top ]] || { echo 'Producción inesperada.' >&2; exit 1; }
PROD_URL="$DATABASE_URL"
REHEARSAL_DB=torneos_release_20261116
REHEARSAL_URL="${PROD_URL%/torneos_prod}/$REHEARSAL_DB"
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$REHEARSAL_DB'" | grep -qx 1; then
  echo 'La base aislada ya existe; no se reemplazó.' >&2
  exit 1
fi
cd /srv/torneos/app
runuser -u torneos -- /usr/local/bin/npm run build
sudo -u postgres createdb --owner=torneos_app "$REHEARSAL_DB"
cleanup() { sudo -u postgres dropdb --if-exists "$REHEARSAL_DB" >/dev/null; }
trap cleanup EXIT
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$REHEARSAL_URL" "$BACKUP_FILE"
runuser -u torneos -- env DATABASE_URL="$REHEARSAL_URL" /usr/local/bin/node --import tsx packages/db/src/migrate.ts
[[ "$(psql "$REHEARSAL_URL" -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM schema_migrations WHERE name IN ('054_match_quick_players.sql','055_position_blueprint_group_size.sql')")" == 2 ]] || { echo 'Migraciones incompletas en el ensayo.' >&2; exit 1; }
[[ "$(psql "$REHEARSAL_URL" -v ON_ERROR_STOP=1 -Atc "SELECT is_nullable FROM information_schema.columns WHERE table_name='players' AND column_name='birth_date'")" == YES ]] || { echo 'Nacimiento obligatorio después del ensayo.' >&2; exit 1; }
[[ "$(psql "$REHEARSAL_URL" -v ON_ERROR_STOP=1 -Atc 'SELECT count(*) FROM fixture_position_blueprints WHERE group_size<>5')" == 0 ]] || { echo 'Plan existente alterado en el ensayo.' >&2; exit 1; }
runuser -u torneos -- env DATABASE_URL="$PROD_URL" /usr/local/bin/node --import tsx packages/db/src/migrate.ts
systemctl restart torneos-api torneos-worker
systemctl is-active torneos-api torneos-worker
ready=0
for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:4312/ready >/dev/null; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo 'API de producción no respondió /ready.' >&2; exit 1; }
echo 'Migraciones y despliegue de producción correctos.'
