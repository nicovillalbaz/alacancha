#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
[[ "$mode" == rehearsal || "$mode" == production ]] || { echo 'Usá rehearsal o production.' >&2; exit 1; }
[[ "$(id -un)" == torneos ]] || { echo 'Ejecutar como usuario torneos.' >&2; exit 1; }
cd /srv/torneos/app
set -a
source /srv/torneos/production.env
set +a
[[ "$DATABASE_URL" == */torneos_prod ]] || { echo 'Base principal inesperada.' >&2; exit 1; }
if [[ "$mode" == rehearsal ]]; then
  DATABASE_URL="${DATABASE_URL%/torneos_prod}/torneos_import_rehearsal"
  MEDIA_DIR=/srv/torneos/media-rehearsal
  mkdir -p "$MEDIA_DIR"
fi
export DATABASE_URL MEDIA_DIR NODE_ENV=production FCFS_PRODUCTION_IMPORT="$mode"
/usr/local/bin/node --import tsx scripts/import-fcfs-production.ts
