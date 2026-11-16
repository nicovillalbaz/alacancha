#!/usr/bin/env bash
set -euo pipefail

[[ "$(id -u)" == 0 ]] || { echo 'Ejecutar como root.' >&2; exit 1; }
[[ "$(readlink -f /srv/torneos/app)" == /srv/torneos/app ]] || { echo 'Checkout inesperado.' >&2; exit 1; }
BACKUP_FILE="${1:?Indicar respaldo reciente con restauración ensayada}"
[[ "$BACKUP_FILE" == /srv/torneos/backups/initial-*.dump && -f "$BACKUP_FILE" ]] || { echo 'Respaldo inesperado.' >&2; exit 1; }
source /srv/torneos/production.env
[[ "$DATABASE_URL" == */torneos_prod && "$WEB_ORIGIN" == https://alacancha.top ]] || { echo 'Producción inesperada.' >&2; exit 1; }
PROD_URL="$DATABASE_URL"
REHEARSAL_URL="${PROD_URL%/torneos_prod}/torneos_sanber_rules_rehearsal"
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='torneos_sanber_rules_rehearsal'" | grep -qx 1; then
  echo 'La base de ensayo ya existe; no se reemplazó.' >&2
  exit 1
fi

cd /srv/torneos/app
sudo -u postgres createdb --owner=torneos_app torneos_sanber_rules_rehearsal
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$REHEARSAL_URL" "$BACKUP_FILE"
runuser -u torneos -- env DATABASE_URL="$REHEARSAL_URL" APP_SECRET="$APP_SECRET" WEB_ORIGIN="$WEB_ORIGIN" MEDIA_DIR="$MEDIA_DIR" NODE_ENV=production FSBFS_RULES_TARGET=rehearsal /usr/local/bin/node --import tsx scripts/publish-sanber-rules.ts
runuser -u torneos -- /usr/local/bin/npm run build
runuser -u torneos -- env DATABASE_URL="$PROD_URL" APP_SECRET="$APP_SECRET" WEB_ORIGIN="$WEB_ORIGIN" MEDIA_DIR="$MEDIA_DIR" NODE_ENV=production FSBFS_RULES_TARGET=production /usr/local/bin/node --import tsx scripts/publish-sanber-rules.ts

systemctl restart torneos-api torneos-worker
systemctl is-active torneos-api torneos-worker
for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:4312/ready >/dev/null; then
    echo 'Reglamento Sanber publicado y API lista.'
    exit 0
  fi
  sleep 1
done
echo 'La API no respondió /ready.' >&2
exit 1
