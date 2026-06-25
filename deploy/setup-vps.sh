#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${FEATHERS_DEPLOY_ROOT:-/srv/feathers-global/current}"
DEPLOY_ENV="$APP_ROOT/.deploy-env"
MARKER="$APP_ROOT/.feathers-global-deploy"
PGADMIN_ROOT="/srv/feathers-global/pgadmin"
PGADMIN_DATA="/srv/feathers-global/pgadmin-data"
PGADMIN_APP="$PGADMIN_ROOT/venv/lib/python3.10/site-packages/pgadmin4"

export DEBIAN_FRONTEND=noninteractive

if [ "$(id -u)" -ne 0 ]; then
  echo "setup-vps.sh must run as root because it installs system packages and configures Nginx." >&2
  exit 1
fi

mkdir -p "$APP_ROOT"

if [ -z "$(find "$APP_ROOT" -mindepth 1 -maxdepth 1 ! -name '.deploy-env' ! -name '.feathers-global-deploy' -print -quit 2>/dev/null)" ]; then
  touch "$MARKER"
elif [ ! -f "$MARKER" ]; then
  echo "$APP_ROOT is not empty and is missing $MARKER. Refusing to touch a possible existing project." >&2
  exit 1
fi

apt-get update
apt-get install -y curl ca-certificates openssl

rand_hex() {
  openssl rand -hex 24
}

public_host() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null && return
  fi
  hostname -I 2>/dev/null | awk '{print $1}'
}

if [ ! -f "$DEPLOY_ENV" ]; then
  FEATHERS_LANDING_PORT="${FEATHERS_LANDING_PORT:-8088}"
  FEATHERS_APP_PORT="${FEATHERS_APP_PORT:-8089}"
  FEATHERS_ADMIN_PORT="${FEATHERS_ADMIN_PORT:-8090}"
  FEATHERS_API_PORT="${FEATHERS_API_PORT:-8092}"
  FEATHERS_BACKEND_PORT="${FEATHERS_BACKEND_PORT:-5013}"
  FEATHERS_DB_PORT="${FEATHERS_DB_PORT:-5432}"
  FEATHERS_PGADMIN_PORT="${FEATHERS_PGADMIN_PORT:-5051}"
  FEATHERS_PGADMIN_PUBLIC_PORT="${FEATHERS_PGADMIN_PUBLIC_PORT:-8093}"
  FEATHERS_DB_NAME="${FEATHERS_DB_NAME:-feathers_global}"
  FEATHERS_DB_USER="${FEATHERS_DB_USER:-feathers_global}"
  FEATHERS_DB_PASSWORD="${FEATHERS_DB_PASSWORD:-$(rand_hex)}"
  PGADMIN_DEFAULT_EMAIL="${PGADMIN_DEFAULT_EMAIL:-admin@featherglobal.com}"
  PGADMIN_DEFAULT_PASSWORD="${PGADMIN_DEFAULT_PASSWORD:-$(rand_hex)}"
  PUBLIC_HOST="${FEATHERS_PUBLIC_HOST:-$(public_host)}"
  FEATHERS_LANDING_ORIGIN="${FEATHERS_LANDING_ORIGIN:-http://${PUBLIC_HOST}:${FEATHERS_LANDING_PORT}}"
  FEATHERS_APP_ORIGIN="${FEATHERS_APP_ORIGIN:-http://${PUBLIC_HOST}:${FEATHERS_APP_PORT}}"
  FEATHERS_ADMIN_ORIGIN="${FEATHERS_ADMIN_ORIGIN:-http://${PUBLIC_HOST}:${FEATHERS_ADMIN_PORT}}"
  FEATHERS_API_ORIGIN="${FEATHERS_API_ORIGIN:-http://${PUBLIC_HOST}:${FEATHERS_API_PORT}}"
  FEATHERS_PGADMIN_ORIGIN="${FEATHERS_PGADMIN_ORIGIN:-http://${PUBLIC_HOST}:${FEATHERS_PGADMIN_PUBLIC_PORT}}"

  umask 077
  cat > "$DEPLOY_ENV" <<EOF
FEATHERS_LANDING_PORT=$FEATHERS_LANDING_PORT
FEATHERS_APP_PORT=$FEATHERS_APP_PORT
FEATHERS_ADMIN_PORT=$FEATHERS_ADMIN_PORT
FEATHERS_API_PORT=$FEATHERS_API_PORT
FEATHERS_BACKEND_PORT=$FEATHERS_BACKEND_PORT
FEATHERS_DB_PORT=$FEATHERS_DB_PORT
FEATHERS_PGADMIN_PORT=$FEATHERS_PGADMIN_PORT
FEATHERS_PGADMIN_PUBLIC_PORT=$FEATHERS_PGADMIN_PUBLIC_PORT
FEATHERS_DB_NAME=$FEATHERS_DB_NAME
FEATHERS_DB_USER=$FEATHERS_DB_USER
FEATHERS_DB_PASSWORD=$FEATHERS_DB_PASSWORD
PGADMIN_DEFAULT_EMAIL=$PGADMIN_DEFAULT_EMAIL
PGADMIN_DEFAULT_PASSWORD=$PGADMIN_DEFAULT_PASSWORD
FEATHERS_LANDING_ORIGIN=$FEATHERS_LANDING_ORIGIN
FEATHERS_APP_ORIGIN=$FEATHERS_APP_ORIGIN
FEATHERS_ADMIN_ORIGIN=$FEATHERS_ADMIN_ORIGIN
FEATHERS_API_ORIGIN=$FEATHERS_API_ORIGIN
FEATHERS_PGADMIN_ORIGIN=$FEATHERS_PGADMIN_ORIGIN
EOF
fi

set -a
# shellcheck disable=SC1090
. "$DEPLOY_ENV"
set +a

if ! grep -q '^FEATHERS_LANDING_PORT=' "$DEPLOY_ENV"; then
  : "${FEATHERS_LANDING_PORT:=8088}"
  printf 'FEATHERS_LANDING_PORT=%s\n' "$FEATHERS_LANDING_PORT" >> "$DEPLOY_ENV"
fi

if ! grep -q '^FEATHERS_LANDING_ORIGIN=' "$DEPLOY_ENV"; then
  PUBLIC_HOST="${FEATHERS_PUBLIC_HOST:-$(public_host)}"
  : "${FEATHERS_LANDING_ORIGIN:=http://${PUBLIC_HOST}:${FEATHERS_LANDING_PORT}}"
  printf 'FEATHERS_LANDING_ORIGIN=%s\n' "$FEATHERS_LANDING_ORIGIN" >> "$DEPLOY_ENV"
fi

apt-get install -y nginx certbot python3-certbot-nginx curl ca-certificates gnupg build-essential gettext-base openssl \
  postgresql postgresql-contrib python3-venv python3-pip

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

systemctl enable --now postgresql

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$FEATHERS_DB_USER') THEN
    CREATE ROLE $FEATHERS_DB_USER LOGIN PASSWORD '$FEATHERS_DB_PASSWORD';
  ELSE
    ALTER ROLE $FEATHERS_DB_USER WITH LOGIN PASSWORD '$FEATHERS_DB_PASSWORD';
  END IF;
END
\$\$;
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$FEATHERS_DB_NAME'" | grep -q 1; then
  sudo -u postgres createdb -O "$FEATHERS_DB_USER" "$FEATHERS_DB_NAME"
fi

mkdir -p "$PGADMIN_ROOT" "$PGADMIN_DATA"/{sessions,storage,logs,azurecredentialcache}
if [ ! -x "$PGADMIN_ROOT/venv/bin/python" ]; then
  python3 -m venv "$PGADMIN_ROOT/venv"
fi

"$PGADMIN_ROOT/venv/bin/pip" install --upgrade pip wheel setuptools >/dev/null
"$PGADMIN_ROOT/venv/bin/pip" install pgadmin4 gunicorn >/dev/null

cat > "$PGADMIN_APP/config_local.py" <<PYCFG
SERVER_MODE = True
DEFAULT_SERVER = '127.0.0.1'
DATA_DIR = '$PGADMIN_DATA'
LOG_FILE = '$PGADMIN_DATA/logs/pgadmin4.log'
SQLITE_PATH = '$PGADMIN_DATA/pgadmin4.db'
SESSION_DB_PATH = '$PGADMIN_DATA/sessions'
STORAGE_DIR = '$PGADMIN_DATA/storage'
AZURE_CREDENTIAL_CACHE_DIR = '$PGADMIN_DATA/azurecredentialcache'
PYCFG

if [ ! -f "$PGADMIN_DATA/pgadmin4.db" ]; then
  cd "$PGADMIN_APP"
  printf '%s\n%s\n%s\n' "$PGADMIN_DEFAULT_EMAIL" "$PGADMIN_DEFAULT_PASSWORD" "$PGADMIN_DEFAULT_PASSWORD" |
    "$PGADMIN_ROOT/venv/bin/python" setup.py setup-db
fi

cat > /etc/systemd/system/feathers-global-pgadmin.service <<UNIT
[Unit]
Description=Feathers Global pgAdmin
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=$PGADMIN_APP
Environment=PYTHONUNBUFFERED=1
ExecStart=$PGADMIN_ROOT/venv/bin/gunicorn --bind 127.0.0.1:$FEATHERS_PGADMIN_PORT --workers 1 --threads 25 --timeout 300 pgAdmin4:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now feathers-global-pgadmin

if ss -ltn | awk '{print $4}' | grep -Eq "(:|\\])(${FEATHERS_LANDING_PORT}|${FEATHERS_APP_PORT}|${FEATHERS_ADMIN_PORT}|${FEATHERS_API_PORT}|${FEATHERS_PGADMIN_PUBLIC_PORT})$" &&
  ! grep -R "feathers-global/current" /etc/nginx/sites-enabled /etc/nginx/sites-available >/dev/null 2>&1; then
  echo "One of the Feathers public ports is already in use by another service. Set FEATHERS_*_PORT and rerun." >&2
  exit 1
fi

export FEATHERS_LANDING_PORT FEATHERS_APP_PORT FEATHERS_ADMIN_PORT FEATHERS_API_PORT FEATHERS_BACKEND_PORT FEATHERS_PGADMIN_PORT FEATHERS_PGADMIN_PUBLIC_PORT
envsubst '${FEATHERS_LANDING_PORT} ${FEATHERS_APP_PORT} ${FEATHERS_ADMIN_PORT} ${FEATHERS_API_PORT} ${FEATHERS_BACKEND_PORT} ${FEATHERS_PGADMIN_PORT} ${FEATHERS_PGADMIN_PUBLIC_PORT}' \
  < "$APP_ROOT/deploy/nginx/feathers-global.conf.template" \
  > /etc/nginx/sites-available/feathers-global

ln -sf /etc/nginx/sites-available/feathers-global /etc/nginx/sites-enabled/feathers-global
nginx -t
systemctl enable nginx
systemctl reload nginx || systemctl restart nginx

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "${FEATHERS_LANDING_PORT}/tcp"
  ufw allow "${FEATHERS_APP_PORT}/tcp"
  ufw allow "${FEATHERS_ADMIN_PORT}/tcp"
  ufw allow "${FEATHERS_API_PORT}/tcp"
  ufw allow "${FEATHERS_PGADMIN_PUBLIC_PORT}/tcp"
fi

echo "VPS setup complete for Feathers Global."
echo "Deploy root: $APP_ROOT"
echo "Landing: $FEATHERS_LANDING_ORIGIN/"
echo "App: $FEATHERS_APP_ORIGIN/"
echo "Admin: $FEATHERS_ADMIN_ORIGIN/"
echo "API: $FEATHERS_API_ORIGIN/"
echo "pgAdmin: $FEATHERS_PGADMIN_ORIGIN/"
echo "pgAdmin email: $PGADMIN_DEFAULT_EMAIL"
echo "pgAdmin password is stored in $DEPLOY_ENV"
