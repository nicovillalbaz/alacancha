#!/usr/bin/env bash
set -euo pipefail

[[ "$(id -u)" == 0 ]] || { echo 'Ejecutar como root.' >&2; exit 1; }
[[ "$(readlink -f /srv/torneos/app)" == /srv/torneos/app ]] || { echo 'Checkout inesperado.' >&2; exit 1; }
BACKUP_FILE="${1:?Indicar respaldo reciente con restauración ensayada}"
[[ "$BACKUP_FILE" == /srv/torneos/backups/initial-*.dump && -f "$BACKUP_FILE" ]] || { echo 'Respaldo inesperado.' >&2; exit 1; }
source /srv/torneos/production.env
[[ "$DATABASE_URL" == */torneos_prod && "$WEB_ORIGIN" == https://alacancha.top ]] || { echo 'Producción inesperada.' >&2; exit 1; }
PROD_URL="$DATABASE_URL"
REHEARSAL_URL="${PROD_URL%/torneos_prod}/torneos_sanber_fixture_rehearsal"
if sudo -u postgres psql -lqt | grep -q '^ torneos_sanber_fixture_rehearsal '; then
  echo 'La base aislada ya existe; no se reemplazó.' >&2
  exit 1
fi
cd /srv/torneos/app
sudo -u postgres createdb --owner=torneos_app torneos_sanber_fixture_rehearsal
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$REHEARSAL_URL" "$BACKUP_FILE"
runuser -u torneos -- env DATABASE_URL="$REHEARSAL_URL" /usr/local/bin/node --import tsx packages/db/src/migrate.ts
runuser -u torneos -- env DATABASE_URL="$REHEARSAL_URL" APP_SECRET="$APP_SECRET" WEB_ORIGIN="$WEB_ORIGIN" MEDIA_DIR="$MEDIA_DIR" NODE_ENV=production FSBFS_FIXTURE_TARGET=rehearsal /usr/local/bin/node --import tsx scripts/publish-sanber-fixture.ts
runuser -u torneos -- /usr/local/bin/npm run build
runuser -u torneos -- env DATABASE_URL="$PROD_URL" /usr/local/bin/node --import tsx packages/db/src/migrate.ts
runuser -u torneos -- env DATABASE_URL="$PROD_URL" APP_SECRET="$APP_SECRET" WEB_ORIGIN="$WEB_ORIGIN" MEDIA_DIR="$MEDIA_DIR" NODE_ENV=production FSBFS_FIXTURE_TARGET=production /usr/local/bin/node --import tsx scripts/publish-sanber-fixture.ts
source /srv/torneos/staging.env
[[ "$DATABASE_URL" == */torneos_stage ]] || { echo 'Espejo inesperado.' >&2; exit 1; }
runuser -u torneos -- env DATABASE_URL="$DATABASE_URL" /usr/local/bin/node --import tsx packages/db/src/migrate.ts
systemctl restart torneos-api torneos-worker torneos-staging-api torneos-staging-worker
systemctl is-active torneos-api torneos-worker torneos-staging-api torneos-staging-worker
for port in 4312 4313; do
  ready=0
  for attempt in {1..20}; do
    if curl --fail --silent "http://127.0.0.1:${port}/ready" >/dev/null; then ready=1; break; fi
    sleep 1
  done
  [[ "$ready" == 1 ]] || { echo "API ${port} no respondió /ready." >&2; exit 1; }
done
echo 'Fixture Sanber publicado y servicios listos.'
