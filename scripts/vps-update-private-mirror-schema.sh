#!/usr/bin/env bash
set -euo pipefail
[[ "$(id -u)" == 0 ]] || { echo 'Ejecutar como root.' >&2; exit 1; }
[[ "$(readlink -f /srv/torneos/app)" == /srv/torneos/app ]] || { echo 'Checkout inesperado.' >&2; exit 1; }
source /srv/torneos/staging.env
[[ "$DATABASE_URL" == */torneos_stage ]] || { echo 'Espejo inesperado.' >&2; exit 1; }
cd /srv/torneos/app
runuser -u torneos -- env DATABASE_URL="$DATABASE_URL" /usr/local/bin/node --import tsx packages/db/src/migrate.ts
systemctl restart torneos-staging-api torneos-staging-worker
systemctl is-active torneos-staging-api torneos-staging-worker
ready=0
for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:4313/ready >/dev/null; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == 1 ]] || { echo 'API del espejo no respondió /ready.' >&2; exit 1; }
echo 'Esquema y servicios del espejo al día.'
