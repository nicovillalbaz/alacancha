#!/usr/bin/env bash
set -euo pipefail

[[ "$(id -u)" == 0 ]] || { echo 'Ejecutar como root.' >&2; exit 1; }
BACKUP_FILE="${1:?Indicar respaldo de producción ya ensayado}"
[[ "$BACKUP_FILE" == /srv/torneos/backups/initial-*.dump && -f "$BACKUP_FILE" ]] || { echo 'Respaldo inesperado.' >&2; exit 1; }
source /srv/torneos/production.env
[[ "$DATABASE_URL" == */torneos_prod && "$WEB_ORIGIN" == https://alacancha.top ]] || { echo 'Origen o base inesperados.' >&2; exit 1; }
REHEARSAL_URL="${DATABASE_URL%/torneos_prod}/torneos_fsbfs_rehearsal"
MEDIA_DIR=/srv/torneos/fsbfs-rehearsal-media
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='torneos_fsbfs_rehearsal'" | grep -qx 1; then
  echo 'La base de ensayo ya existe; no se reemplaza.' >&2; exit 1
fi
[[ ! -e "$MEDIA_DIR" ]] || { echo 'Los medios de ensayo ya existen; no se reemplazan.' >&2; exit 1; }
sudo -u postgres createdb --owner=torneos_app torneos_fsbfs_rehearsal
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$REHEARSAL_URL" "$BACKUP_FILE"
install -d -o torneos -g torneos -m 0750 "$MEDIA_DIR"
cp -a /srv/torneos/media/. "$MEDIA_DIR/"
chown -R torneos:torneos "$MEDIA_DIR"
cd /srv/torneos/app
runuser -u torneos -- env DATABASE_URL="$REHEARSAL_URL" /usr/local/bin/node --import tsx packages/db/src/migrate.ts
runuser -u torneos -- env DATABASE_URL="$REHEARSAL_URL" APP_SECRET="$APP_SECRET" WEB_ORIGIN="$WEB_ORIGIN" MEDIA_DIR="$MEDIA_DIR" NODE_ENV=production FSBFS_IMPORT=rehearsal FSBFS_ASSET_DIR=/srv/torneos/app/img/FSBFS /usr/local/bin/node --import tsx scripts/import-fsbfs-production.ts
echo 'Ensayo FSBFS completado en base y medios aislados.'
