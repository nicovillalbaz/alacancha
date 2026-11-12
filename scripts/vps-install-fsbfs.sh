#!/usr/bin/env bash
set -euo pipefail

[[ "$(id -u)" == 0 ]] || { echo 'Ejecutar como root.' >&2; exit 1; }
BACKUP_FILE="${1:?Indicar respaldo ensayado previo a la carga}"
[[ "$BACKUP_FILE" == /srv/torneos/backups/initial-*.dump && -f "$BACKUP_FILE" ]] || { echo 'Respaldo inesperado.' >&2; exit 1; }
[[ -f /srv/torneos/backups/media-before-sanber-20261112.tar.gz ]] || { echo 'Falta respaldo de medios.' >&2; exit 1; }
source /srv/torneos/production.env
[[ "$DATABASE_URL" == */torneos_prod && "$WEB_ORIGIN" == https://alacancha.top ]] || { echo 'Destino de producción inesperado.' >&2; exit 1; }
PROD_URL="$DATABASE_URL"
REHEARSAL_URL="${PROD_URL%/torneos_prod}/torneos_fsbfs_rehearsal"
[[ "$(psql "$REHEARSAL_URL" -Atc "SELECT count(*) FROM organizations WHERE name='Federación San Bernardinense de Fútbol de Salón'")" == 1 ]] || { echo 'Falta el ensayo de Sanber.' >&2; exit 1; }
[[ "$(psql "$PROD_URL" -Atc "SELECT count(*) FROM organizations WHERE name='Federación San Bernardinense de Fútbol de Salón'")" == 0 ]] || { echo 'Sanber ya existe en producción; no se repite la instalación.' >&2; exit 1; }
cd /srv/torneos/app
runuser -u torneos -- env DATABASE_URL="$PROD_URL" /usr/local/bin/node --import tsx packages/db/src/migrate.ts
source /srv/torneos/staging.env
[[ "$DATABASE_URL" == */torneos_stage ]] || { echo 'Destino del espejo inesperado.' >&2; exit 1; }
runuser -u torneos -- env DATABASE_URL="$DATABASE_URL" /usr/local/bin/node --import tsx packages/db/src/migrate.ts
source /srv/torneos/production.env
runuser -u torneos -- /usr/local/bin/npm run build
runuser -u torneos -- env DATABASE_URL="$PROD_URL" APP_SECRET="$APP_SECRET" WEB_ORIGIN="$WEB_ORIGIN" MEDIA_DIR="$MEDIA_DIR" NODE_ENV=production FSBFS_IMPORT=production FSBFS_ASSET_DIR=/srv/torneos/app/img/FSBFS /usr/local/bin/node --import tsx scripts/import-fsbfs-production.ts
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
echo 'Producción FSBFS lista; Copa Caacupé y espejo no se importaron ni reemplazaron.'
