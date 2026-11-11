#!/usr/bin/env bash
set -euo pipefail

# Ejecutar una sola vez como root en un VPS nuevo. Nunca imprime secretos.
ENV_FILE=/srv/torneos/production.env
if [[ -e "$ENV_FILE" ]]; then
  echo 'El entorno de producción ya existe; no se reemplazó.' >&2
  exit 1
fi

DB_PASSWORD="$(openssl rand -hex 32)"
APP_SECRET="$(openssl rand -hex 32)"

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='torneos_app'" | grep -qx 1; then
  echo 'El rol PostgreSQL ya existe; revisar manualmente antes de continuar.' >&2
  exit 1
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE torneos_app LOGIN PASSWORD '$DB_PASSWORD'"
sudo -u postgres createdb --owner=torneos_app torneos_prod

umask 077
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
DATABASE_URL=postgresql://torneos_app:${DB_PASSWORD}@127.0.0.1:5432/torneos_prod
APP_SECRET=${APP_SECRET}
WEB_ORIGIN=http://127.0.0.1:4312
API_HOST=127.0.0.1
API_PORT=4312
MEDIA_DIR=/srv/torneos/media
CHROME_PATH=/usr/bin/google-chrome-stable
EOF
chown root:torneos "$ENV_FILE"
chmod 0640 "$ENV_FILE"
echo 'Base y entorno privado creados. WEB_ORIGIN se actualizará al configurar HTTPS.'
