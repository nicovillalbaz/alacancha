#!/usr/bin/env bash
set -euo pipefail

[[ "$(id -u)" == 0 ]] || { echo 'Ejecutar como root.' >&2; exit 1; }
MODE="${1:?Usar rehearsal o production}"
source /srv/torneos/production.env
[[ "$DATABASE_URL" == */torneos_prod && "$WEB_ORIGIN" == https://alacancha.top ]] || { echo 'Destino inesperado.' >&2; exit 1; }
PROD_URL="$DATABASE_URL"
BACKUP=/srv/torneos/backups/initial-20261112T193724Z.dump
MEDIA_BACKUP=/srv/torneos/backups/media-before-sanber-logo-refresh-20261112.tar.gz
[[ -f "$BACKUP" && -f "$MEDIA_BACKUP" ]] || { echo 'Falta respaldo previo.' >&2; exit 1; }
cd /srv/torneos/app

if [[ "$MODE" == rehearsal ]]; then
  REHEARSAL_URL="${PROD_URL%/torneos_prod}/torneos_fsbfs_logo_rehearsal"
  REHEARSAL_MEDIA=/srv/torneos/fsbfs-logo-rehearsal-media
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='torneos_fsbfs_logo_rehearsal'" | grep -qx 1; then
    echo 'La base de ensayo ya existe; no se reemplaza.' >&2; exit 1
  fi
  [[ ! -e "$REHEARSAL_MEDIA" ]] || { echo 'Los medios de ensayo ya existen; no se reemplazan.' >&2; exit 1; }
  sudo -u postgres createdb --owner=torneos_app torneos_fsbfs_logo_rehearsal
  pg_restore --no-owner --no-privileges --exit-on-error --dbname="$REHEARSAL_URL" "$BACKUP"
  install -d -o torneos -g torneos -m 0750 "$REHEARSAL_MEDIA"
  cp -a /srv/torneos/media/. "$REHEARSAL_MEDIA/"
  chown -R torneos:torneos "$REHEARSAL_MEDIA"
  runuser -u torneos -- env DATABASE_URL="$REHEARSAL_URL" APP_SECRET="$APP_SECRET" WEB_ORIGIN="$WEB_ORIGIN" MEDIA_DIR="$REHEARSAL_MEDIA" NODE_ENV=production FSBFS_LOGO_REFRESH=rehearsal /usr/local/bin/node --import tsx scripts/refresh-fsbfs-logos.ts
elif [[ "$MODE" == production ]]; then
  REHEARSAL_URL="${PROD_URL%/torneos_prod}/torneos_fsbfs_logo_rehearsal"
  [[ "$(psql "$REHEARSAL_URL" -Atc "SELECT count(*) FROM teams t JOIN media m ON m.id=t.shield_id AND m.organization_id=t.organization_id WHERE t.organization_id='7a8be048-ffce-4e14-9213-cb0d902e326d' AND m.content_type='image/png'")" == 10 ]] || { echo 'El ensayo no contiene diez escudos PNG.' >&2; exit 1; }
  runuser -u torneos -- env DATABASE_URL="$PROD_URL" APP_SECRET="$APP_SECRET" WEB_ORIGIN="$WEB_ORIGIN" MEDIA_DIR="$MEDIA_DIR" NODE_ENV=production FSBFS_LOGO_REFRESH=production /usr/local/bin/node --import tsx scripts/refresh-fsbfs-logos.ts
else
  echo 'Modo desconocido.' >&2; exit 1
fi
