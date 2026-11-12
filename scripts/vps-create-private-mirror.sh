#!/usr/bin/env bash
set -euo pipefail

# Create a private, isolated snapshot once. Never replace an existing mirror.
[[ "$(id -u)" == 0 ]] || { echo 'Ejecutar como root.' >&2; exit 1; }
source /srv/torneos/production.env
[[ "${DATABASE_URL:-}" == postgresql://torneos_app:*@127.0.0.1:5432/torneos_prod ]] || { echo 'Base principal inesperada.' >&2; exit 1; }
[[ "${NODE_ENV:-}" == production && "${API_HOST:-}" == 127.0.0.1 ]] || { echo 'Entorno principal inesperado.' >&2; exit 1; }
[[ -d /srv/torneos/media && ! -e /srv/torneos/staging.env && ! -e /srv/torneos/staging-media ]] || { echo 'El espejo ya existe o faltan los medios originales.' >&2; exit 1; }
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='torneos_stage'" | grep -qx 1; then
  echo 'La base del espejo ya existe; no se reemplazó.' >&2
  exit 1
fi
if ss -ltn | grep -q '127.0.0.1:4313 '; then
  echo 'El puerto privado 4313 está ocupado.' >&2
  exit 1
fi

umask 077
backup="/srv/torneos/backups/mirror-source-$(date -u +%Y%m%dT%H%M%SZ).dump"
stage_url="${DATABASE_URL%/torneos_prod}/torneos_stage"
pg_dump --format=custom --no-owner --file="$backup" "$DATABASE_URL"
pg_restore --list "$backup" >/dev/null
sudo -u postgres createdb --owner=torneos_app torneos_stage
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$stage_url" "$backup"

source_tables="$(psql "$DATABASE_URL" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
stage_tables="$(psql "$stage_url" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
[[ "$source_tables" == "$stage_tables" && "$source_tables" -gt 0 ]] || { echo 'La restauración no coincide; espejo detenido.' >&2; exit 1; }

# Cloned sessions and pending access links must not become valid in the mirror.
psql "$stage_url" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
UPDATE sessions SET revoked_at=now() WHERE revoked_at IS NULL;
UPDATE invitations SET revoked_at=now() WHERE revoked_at IS NULL AND used_at IS NULL;
COMMIT;
SQL

install -d -m 0700 -o torneos -g torneos /srv/torneos/staging-media
cp -a /srv/torneos/media/. /srv/torneos/staging-media/
chown -R torneos:torneos /srv/torneos/staging-media
chmod 0700 /srv/torneos/staging-media

# The same secret is required to read encrypted player data copied from production.
# Isolation comes from the separate database, loopback listener, and SSH tunnel.
cat > /srv/torneos/staging.env <<EOF
NODE_ENV=development
DATABASE_URL=$stage_url
APP_SECRET=$APP_SECRET
WEB_ORIGIN=http://127.0.0.1:4313
API_HOST=127.0.0.1
API_PORT=4313
MEDIA_DIR=/srv/torneos/staging-media
CHROME_PATH=${CHROME_PATH:-/usr/bin/chromium}
EOF
chown root:torneos /srv/torneos/staging.env "$backup"
chmod 0640 /srv/torneos/staging.env "$backup"
echo "Espejo creado: $stage_tables tablas, medios separados, acceso solo en 127.0.0.1:4313. Respaldo: $backup"
