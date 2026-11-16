#!/usr/bin/env bash
set -euo pipefail

[[ "$(id -u)" == 0 ]] || { echo 'Ejecutar como root.' >&2; exit 1; }
BACKUP_FILE="${1:?Indicar respaldo reciente con restauración ensayada}"
[[ "$BACKUP_FILE" == /srv/torneos/backups/initial-*.dump && -f "$BACKUP_FILE" ]] || { echo 'Respaldo inesperado.' >&2; exit 1; }
[[ "$(readlink -f /srv/torneos/app)" == /srv/torneos/app ]] || { echo 'Checkout inesperado.' >&2; exit 1; }

source /srv/torneos/production.env
[[ "$DATABASE_URL" == */torneos_prod && "$WEB_ORIGIN" == https://alacancha.top ]] || { echo 'Producción inesperada.' >&2; exit 1; }
PROD_URL="$DATABASE_URL"
REHEARSAL_URL="${PROD_URL%/torneos_prod}/torneos_sanber_fixture_rehearsal"
sudo -u postgres psql -lqt | grep -q '^ torneos_sanber_fixture_rehearsal ' || { echo 'Falta la base de ensayo restaurada.' >&2; exit 1; }

cd /srv/torneos/app
runuser -u torneos -- env DATABASE_URL="$REHEARSAL_URL" APP_SECRET="$APP_SECRET" WEB_ORIGIN="$WEB_ORIGIN" MEDIA_DIR="$MEDIA_DIR" NODE_ENV=production FSBFS_FIXTURE_TARGET=rehearsal /usr/local/bin/node --import tsx scripts/publish-sanber-fixture.ts
runuser -u torneos -- /usr/local/bin/npm run build
runuser -u torneos -- env DATABASE_URL="$PROD_URL" APP_SECRET="$APP_SECRET" WEB_ORIGIN="$WEB_ORIGIN" MEDIA_DIR="$MEDIA_DIR" NODE_ENV=production FSBFS_FIXTURE_TARGET=production /usr/local/bin/node --import tsx scripts/publish-sanber-fixture.ts

systemctl restart torneos-api torneos-worker
systemctl is-active torneos-api torneos-worker
for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:4312/ready >/dev/null; then
    echo 'Sanber actualizado y API lista.'
    exit 0
  fi
  sleep 1
done
echo 'La API no respondió /ready.' >&2
exit 1
