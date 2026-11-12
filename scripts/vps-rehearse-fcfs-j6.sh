#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
[[ "$BACKUP_FILE" == /srv/torneos/backups/*.dump && -f "$BACKUP_FILE" ]] || { echo 'Indicá un respaldo existente de /srv/torneos/backups.' >&2; exit 1; }
source /srv/torneos/production.env
[[ "$DATABASE_URL" == */torneos_prod ]] || { echo 'Base de origen inesperada.' >&2; exit 1; }
RESTORE_URL="${DATABASE_URL%/torneos_prod}/torneos_schedule_rehearsal"
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='torneos_schedule_rehearsal'" | grep -qx 1; then
  echo 'La base de ensayo ya existe; no se reemplazó.' >&2
  exit 1
fi
CREATED=0
cleanup(){ if [[ "$CREATED" == 1 ]]; then sudo -u postgres dropdb --if-exists torneos_schedule_rehearsal >/dev/null; fi; }
trap cleanup EXIT
sudo -u postgres createdb --owner=torneos_app torneos_schedule_rehearsal
CREATED=1
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$RESTORE_URL" "$BACKUP_FILE"
cd /srv/torneos/app
DATABASE_URL="$RESTORE_URL" /usr/local/bin/node --import tsx scripts/correct-fcfs-j6.ts --inspect fcfs-copacaacupe
DATABASE_URL="$RESTORE_URL" FCFS_J6_CORRECTION=apply /usr/local/bin/node --import tsx scripts/correct-fcfs-j6.ts --apply fcfs-copacaacupe
DATABASE_URL="$RESTORE_URL" /usr/local/bin/node --import tsx scripts/correct-fcfs-j6.ts --inspect fcfs-copacaacupe
echo 'Ensayo de corrección de fixture completado; base temporal descartada.'
