#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-$(pwd -P)}"
CLIENT_DIR="$APP_ROOT/courier-cart-client"
export PM2_HOME="${PM2_HOME:-$HOME/.pm2}"
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"
APP_SLUG="$(basename "$APP_ROOT" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-')"
BUILD_SWAP_FILE="${BUILD_SWAP_FILE:-/swapfile-${APP_SLUG}-build}"
BUILD_SWAP_SIZE="${BUILD_SWAP_SIZE:-4G}"
DEPLOY_PUBLIC_API_URL="${DEPLOY_PUBLIC_API_URL:-https://api.fgship.in/api}"
DEPLOY_PUBLIC_SOCKET_URL="${DEPLOY_PUBLIC_SOCKET_URL:-https://api.fgship.in}"
PM2_BIN="${PM2_BIN:-$(command -v pm2 || true)}"
PM2_APP_NAME="${PM2_APP_NAME:-feathers-global-backend}"
LEGACY_PM2_APP_NAME="${LEGACY_PM2_APP_NAME:-shiplifi-backend}"

repair_pm2_install() {
  if ! command -v npm >/dev/null 2>&1; then
    return 1
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo env PATH="$PATH" bash -lc 'umask 022 && npm install -g pm2'
  else
    env PATH="$PATH" bash -lc 'umask 022 && npm install -g pm2'
  fi
}

if [ -z "$PM2_BIN" ]; then
  for candidate in /usr/bin/pm2 /usr/local/bin/pm2; do
    if [ -x "$candidate" ]; then
      PM2_BIN="$candidate"
      break
    fi
  done
fi

if [ -z "$PM2_BIN" ]; then
  echo "pm2 not found; attempting automatic install."
  repair_pm2_install || true
  PM2_BIN="$(command -v pm2 || true)"
fi

if [ -n "$PM2_BIN" ] && ! "$PM2_BIN" -v >/dev/null 2>&1; then
  echo "pm2 exists but is not runnable; attempting repair."
  repair_pm2_install || true
  PM2_BIN="$(command -v pm2 || true)"
fi

if [ -z "$PM2_BIN" ] || ! "$PM2_BIN" -v >/dev/null 2>&1; then
  echo "pm2 command not found in PATH or common install locations." >&2
  exit 127
fi

fresh_npm_ci() {
  rm -rf node_modules
  npm ci "$@"
}

publish_courier_client_build() {
  local staged_dist previous_dist

  staged_dist="$(mktemp -d "$CLIENT_DIR/.dist-build.XXXXXX")"
  previous_dist="$CLIENT_DIR/dist.previous"

  export VITE_API_URL="${VITE_API_URL:-$DEPLOY_PUBLIC_API_URL}"
  export VITE_APP_SOCKET_URL="${VITE_APP_SOCKET_URL:-$DEPLOY_PUBLIC_SOCKET_URL}"

  if ! ./node_modules/.bin/tsc -b; then
    rm -rf "$staged_dist"
    return 1
  fi

  if ! ./node_modules/.bin/vite build --outDir "$staged_dist" --emptyOutDir; then
    rm -rf "$staged_dist"
    return 1
  fi

  if [ ! -f "$staged_dist/index.html" ]; then
    echo "courier-cart-client build did not produce index.html" >&2
    rm -rf "$staged_dist"
    return 1
  fi

  if [ ! -d "$staged_dist/assets" ]; then
    echo "courier-cart-client build did not produce assets/" >&2
    rm -rf "$staged_dist"
    return 1
  fi

  sudo rm -rf "$previous_dist"

  if [ -e "$CLIENT_DIR/dist" ]; then
    sudo chown -R "$(id -u):$(id -g)" "$CLIENT_DIR/dist" || true
    mv "$CLIENT_DIR/dist" "$previous_dist"
  fi

  if ! mv "$staged_dist" "$CLIENT_DIR/dist"; then
    if [ -e "$previous_dist" ] && [ ! -e "$CLIENT_DIR/dist" ]; then
      mv "$previous_dist" "$CLIENT_DIR/dist"
    fi
    rm -rf "$staged_dist"
    return 1
  fi

  sudo chown -R "$(id -u):$(id -g)" "$CLIENT_DIR/dist"
  sudo chmod -R u+rwX,g+rwX,o+rX "$CLIENT_DIR/dist"
  sudo rm -rf "$previous_dist"
}

publish_admin_dashboard_build() {
  local staged_build_relative staged_build previous_build

  staged_build_relative=".build-staged-$(date +%s)"
  staged_build="$APP_ROOT/admin-dashboard/${staged_build_relative}"
  previous_build="$APP_ROOT/admin-dashboard/build.previous"

  sudo rm -rf "$previous_build"
  rm -rf "$staged_build"

  BUILD_PATH="$staged_build_relative" npm run build

  if [ ! -f "$staged_build/index.html" ]; then
    echo "admin-dashboard build did not produce index.html" >&2
    rm -rf "$staged_build"
    return 1
  fi

  if [ ! -d "$staged_build/static" ]; then
    echo "admin-dashboard build did not produce static/" >&2
    rm -rf "$staged_build"
    return 1
  fi

  if [ -d build/static ]; then
    rsync -a --ignore-existing build/static/ "$staged_build/static/"
  fi

  if [ -e build ]; then
    sudo chown -R "$(id -u):$(id -g)" build || true
    mv build "$previous_build"
  fi

  if ! mv "$staged_build" build; then
    if [ -e "$previous_build" ] && [ ! -e build ]; then
      mv "$previous_build" build
    fi
    rm -rf "$staged_build"
    return 1
  fi

  sudo chown -R "$(id -u):$(id -g)" build
  sudo chmod -R u+rwX,g+rwX,o+rX build
  sudo rm -rf "$previous_build"
}

ensure_build_swap() {
  local swap_total_mb
  swap_total_mb="$(awk '/^SwapTotal:/ { print int($2 / 1024) }' /proc/meminfo)"

  if [ "$swap_total_mb" -ge 2048 ]; then
    echo "Build swap available: ${swap_total_mb}MB"
    return
  fi

  echo "Build swap is ${swap_total_mb}MB; ensuring ${BUILD_SWAP_SIZE} swap at ${BUILD_SWAP_FILE}."
  if [ ! -f "$BUILD_SWAP_FILE" ]; then
    sudo fallocate -l "$BUILD_SWAP_SIZE" "$BUILD_SWAP_FILE" || sudo dd if=/dev/zero of="$BUILD_SWAP_FILE" bs=1M count=4096
    sudo chmod 600 "$BUILD_SWAP_FILE"
    sudo mkswap "$BUILD_SWAP_FILE"
  fi

  if ! swapon --show=NAME --noheadings | grep -qx "$BUILD_SWAP_FILE"; then
    sudo swapon "$BUILD_SWAP_FILE"
  fi
}

ensure_build_swap

cd "$APP_ROOT/backend"
fresh_npm_ci
NODE_ENV=production node <<'NODE'
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { Client } = require('pg')

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') })

const migrationFiles = [
  'migration_add_previous_refresh_token.sql',
  'migration_add_password_reset_tokens.sql',
  'migration_add_shipping_rate_slabs.sql',
  'migration_add_courier_credentials_metadata.sql',
  'migration_seed_shadowfax_b2c_couriers.sql',
  'migration_seed_delhivery_b2c_couriers.sql',
  'migration_add_amazon_rate_token_cache.sql',
  'migration_add_gst_to_payment_options_and_b2c_orders.sql',
  'migration_add_pan_number_to_kyc.sql',
  'migration_allow_multiple_stores_per_user.sql',
  'migration_normalize_xpressbees_rate_provider.sql',
  'migration_add_xpressbees_manual_awb_ranges.sql',
]

const existingMigrations = migrationFiles
  .map((fileName) => path.resolve(process.cwd(), fileName))
  .filter((migrationPath) => fs.existsSync(migrationPath))

if (!existingMigrations.length) {
  console.log('No release migrations found, skipping.')
  process.exit(0)
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing; cannot apply courier credentials metadata migration')
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

;(async () => {
  try {
    await client.connect()
    for (const migrationPath of existingMigrations) {
      await client.query(fs.readFileSync(migrationPath, 'utf8'))
      console.log(`${path.basename(migrationPath)} applied.`)
    }
  } finally {
    await client.end().catch(() => undefined)
  }
})().catch((error) => {
  console.error('Failed to apply courier credentials metadata migration:', error)
  process.exit(1)
})
NODE
NODE_ENV=production npm run seed:basic-provider-ratecards
if ! NODE_ENV=production npm run sync:xpressbees-couriers; then
  echo "Warning: Xpressbees courier sync failed during release; continuing with existing courier records." >&2
fi
npm run build
BACKEND_PORT="$(
  node -e "require('dotenv').config({ path: '.env.production' }); process.stdout.write(process.env.PORT || '5003')"
)"
if [ "$LEGACY_PM2_APP_NAME" != "$PM2_APP_NAME" ] && "$PM2_BIN" describe "$LEGACY_PM2_APP_NAME" >/dev/null 2>&1; then
  echo "Removing legacy PM2 app ${LEGACY_PM2_APP_NAME} before starting ${PM2_APP_NAME}"
  "$PM2_BIN" delete "$LEGACY_PM2_APP_NAME" || true
fi
echo "Starting backend on port ${BACKEND_PORT} as ${PM2_APP_NAME}"
NODE_ENV=production PORT="$BACKEND_PORT" PM2_APP_NAME="$PM2_APP_NAME" "$PM2_BIN" startOrReload ecosystem.config.cjs --update-env
"$PM2_BIN" save

cd "$APP_ROOT/landing"
fresh_npm_ci
npm run build

cd "$APP_ROOT/courier-cart-client"
fresh_npm_ci
node <<'NODE'
const fs = require('fs')
const path = require('path')

const packagePath = path.resolve(process.cwd(), 'node_modules/typescript/package.json')
const es2023Path = path.resolve(process.cwd(), 'node_modules/typescript/lib/lib.es2023.d.ts')

if (!fs.existsSync(packagePath)) {
  throw new Error('courier-cart-client TypeScript package is missing after npm ci')
}

const typescriptPackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
if (!fs.existsSync(es2023Path)) {
  throw new Error(
    `courier-cart-client TypeScript ${typescriptPackage.version} is missing lib.es2023.d.ts after npm ci`,
  )
}

console.log('courier-cart-client TypeScript install verified', {
  version: typescriptPackage.version,
  es2023Lib: true,
})
NODE
publish_courier_client_build

cd "$APP_ROOT/admin-dashboard"
if [ -f package-lock.json ]; then
  npm ci --legacy-peer-deps --force
else
  rm -rf node_modules
  npm install --legacy-peer-deps --force
fi
cat > .env.production <<'EOF'
REACT_APP_API_BASE_URL=__DEPLOY_PUBLIC_API_URL__
REACT_APP_SOCKET_URL=__DEPLOY_PUBLIC_SOCKET_URL__
EOF
sed -i "s#__DEPLOY_PUBLIC_API_URL__#${DEPLOY_PUBLIC_API_URL}#g" .env.production
sed -i "s#__DEPLOY_PUBLIC_SOCKET_URL__#${DEPLOY_PUBLIC_SOCKET_URL}#g" .env.production
cp .env.production .env
cp .env.production .env.local
if [ -z "${NODE_OPTIONS:-}" ]; then
  export NODE_OPTIONS="--max-old-space-size=2048"
fi
echo "Admin build NODE_OPTIONS=${NODE_OPTIONS}"
publish_admin_dashboard_build

sudo nginx -t
sudo systemctl reload nginx

echo "Release completed."
