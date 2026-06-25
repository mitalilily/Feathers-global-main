#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_ENV="$APP_ROOT/.deploy-env"
MARKER="$APP_ROOT/.feathers-global-deploy"

if [ ! -f "$MARKER" ]; then
  echo "Missing $MARKER. Refusing to deploy into an unmarked directory." >&2
  exit 1
fi

if [ ! -f "$DEPLOY_ENV" ]; then
  echo "Missing $DEPLOY_ENV. Run deploy/setup-vps.sh once before release." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$DEPLOY_ENV"
set +a

: "${FEATHERS_LANDING_ORIGIN:=http://127.0.0.1:${FEATHERS_LANDING_PORT:-8088}}"

BACKEND_ENV="$APP_ROOT/backend/.env.production"
DATABASE_URL="postgresql://${FEATHERS_DB_USER}:${FEATHERS_DB_PASSWORD}@127.0.0.1:${FEATHERS_DB_PORT}/${FEATHERS_DB_NAME}"
API_BASE_URL="$FEATHERS_API_ORIGIN/api"
CORS_ORIGINS="$FEATHERS_LANDING_ORIGIN,$FEATHERS_APP_ORIGIN,$FEATHERS_ADMIN_ORIGIN"

set_env_value() {
  local key="$1"
  local value="$2"
  if [ -f "$BACKEND_ENV" ] && grep -q "^${key}=" "$BACKEND_ENV"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$BACKEND_ENV"
  else
    printf '%s=%s\n' "$key" "$value" >> "$BACKEND_ENV"
  fi
}

if [ ! -f "$BACKEND_ENV" ]; then
  umask 077
  touch "$BACKEND_ENV"
  set_env_value NODE_ENV production
  set_env_value ACCESS_TOKEN_SECRET "$(openssl rand -hex 32)"
  set_env_value REFRESH_TOKEN_SECRET "$(openssl rand -hex 32)"
  set_env_value JWT_SECRET "$(openssl rand -hex 32)"
  set_env_value COURIER_SECRET_KEY "$(openssl rand -hex 32)"
  set_env_value RAZORPAY_MODE live
  set_env_value PLATFORM_API_TIMEOUT_MS 15000
fi

set_env_value PORT "$FEATHERS_BACKEND_PORT"
set_env_value DATABASE_URL "$DATABASE_URL"
set_env_value PGSSLMODE disable
set_env_value API_URL "$FEATHERS_API_ORIGIN"
set_env_value API_PUBLIC_URL "$API_BASE_URL"
set_env_value EKART_WEBHOOK_URL "$API_BASE_URL/webhook/ekart/track"
set_env_value EKART_WEBHOOK_LEGACY_URL "$API_BASE_URL/webhook/ekart"
set_env_value EKART_WEBHOOK_BASE_URL "$FEATHERS_API_ORIGIN"
set_env_value CORS_ALLOWED_ORIGINS "$CORS_ORIGINS"
set_env_value CLIENT_URL "$FEATHERS_APP_ORIGIN"
set_env_value FRONTEND_URL "$FEATHERS_APP_ORIGIN"
set_env_value APP_URL "$FEATHERS_APP_ORIGIN"
set_env_value WEB_URL "$FEATHERS_APP_ORIGIN"

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

cd "$APP_ROOT/backend"
npm ci
NODE_ENV=production npm run migrate:bootstrap
NODE_ENV=production npm run seed:admin
NODE_ENV=production npm run seed:locations
NODE_ENV=production npm run seed:basic-provider-ratecards
npm run build
NODE_ENV=production PORT="$FEATHERS_BACKEND_PORT" pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

cd "$APP_ROOT/landing"
cat > .env.production <<EOF
VITE_CLIENT_APP_URL=$FEATHERS_APP_ORIGIN
VITE_AUTH_APP_URL=$FEATHERS_APP_ORIGIN/login
VITE_ADMIN_APP_URL=$FEATHERS_ADMIN_ORIGIN
VITE_ADMIN_AUTH_URL=$FEATHERS_ADMIN_ORIGIN/auth/signin
VITE_API_URL=$API_BASE_URL
EOF
npm ci
npm run build

cd "$APP_ROOT/courier-cart-client"
cat > .env.production <<EOF
VITE_API_URL=$API_BASE_URL
VITE_APP_SOCKET_URL=$FEATHERS_API_ORIGIN
VITE_GOOGLE_OAUTH_CLIENT_ID=${VITE_GOOGLE_OAUTH_CLIENT_ID:-}
VITE_PUBLIC_GEOAPIFY_KEY=${VITE_PUBLIC_GEOAPIFY_KEY:-}
EOF
npm ci
npm run build

cd "$APP_ROOT/admin-dashboard"
cat > .env.production <<EOF
REACT_APP_API_BASE_URL=$API_BASE_URL
REACT_APP_SOCKET_URL=$FEATHERS_API_ORIGIN
PUBLIC_URL=/
EOF
cp .env.production .env
cp .env.production .env.local
if [ -f package-lock.json ]; then
  npm ci --legacy-peer-deps --force
else
  npm install --legacy-peer-deps --force
fi
npm run build
latest_admin_js="$(find build/static/js -maxdepth 1 -type f -name 'main.*.js' ! -name '*.LICENSE.txt' | sort | tail -n 1)"
latest_admin_css="$(find build/static/css -maxdepth 1 -type f -name 'main.*.css' | sort | tail -n 1)"
if [ -n "$latest_admin_js" ]; then
  ln -sf "$(basename "$latest_admin_js")" build/static/js/main.latest.js
fi
if [ -n "$latest_admin_css" ]; then
  ln -sf "$(basename "$latest_admin_css")" build/static/css/main.latest.css
fi
find build/static/js -maxdepth 1 -type f -name '*.chunk.js' | while read -r chunk_file; do
  chunk_name="$(basename "$chunk_file")"
  chunk_id="${chunk_name%%.*}"
  case "$chunk_id" in
    ''|*[!0-9]*) continue ;;
  esac
  ln -sf "$chunk_name" "build/static/js/${chunk_id}.latest.chunk.js"
done
find build/static/css -maxdepth 1 -type f -name '*.chunk.css' | while read -r chunk_file; do
  chunk_name="$(basename "$chunk_file")"
  chunk_id="${chunk_name%%.*}"
  case "$chunk_id" in
    ''|*[!0-9]*) continue ;;
  esac
  ln -sf "$chunk_name" "build/static/css/${chunk_id}.latest.chunk.css"
done

nginx -t
systemctl reload nginx

echo "Release completed."
echo "Landing: $FEATHERS_LANDING_ORIGIN/"
echo "App: $FEATHERS_APP_ORIGIN/"
echo "Admin: $FEATHERS_ADMIN_ORIGIN/"
echo "API health: $FEATHERS_API_ORIGIN/api/health"
echo "pgAdmin: $FEATHERS_PGADMIN_ORIGIN/"
