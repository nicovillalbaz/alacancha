#!/usr/bin/env bash
set -euo pipefail

# Ensayo inicial de restauración en una base descartable. Ejecutar como root.
source /srv/torneos/production.env
[[ "$DATABASE_URL" == */torneos_prod ]] || { echo 'Base inesperada.' >&2; exit 1; }
RESTORE_URL="${DATABASE_URL%/torneos_prod}/torneos_restore_check"
BACKUP_FILE="/srv/torneos/backups/initial-$(date -u +%Y%m%dT%H%M%SZ).dump"
RESTORE_CREATED=0
cleanup() {
  if [[ "$RESTORE_CREATED" == 1 ]]; then
    sudo -u postgres dropdb --if-exists torneos_restore_check >/dev/null
  fi
}
trap cleanup EXIT

umask 077
pg_dump --format=custom --no-owner --file="$BACKUP_FILE" "$DATABASE_URL"
pg_restore --list "$BACKUP_FILE" >/dev/null
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='torneos_restore_check'" | grep -qx 1; then
  echo 'La base de ensayo ya existe; no se reemplazó.' >&2
  exit 1
fi
sudo -u postgres createdb --owner=torneos_app torneos_restore_check
RESTORE_CREATED=1
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$RESTORE_URL" "$BACKUP_FILE"
SOURCE_TABLES="$(psql "$DATABASE_URL" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
RESTORED_TABLES="$(psql "$RESTORE_URL" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")"
[[ "$SOURCE_TABLES" == "$RESTORED_TABLES" && "$SOURCE_TABLES" -gt 0 ]] || { echo 'La restauración no coincide.' >&2; exit 1; }
chown root:torneos "$BACKUP_FILE"
chmod 0640 "$BACKUP_FILE"
echo "Restauración inicial correcta: $SOURCE_TABLES tablas. Copia local: $BACKUP_FILE"
