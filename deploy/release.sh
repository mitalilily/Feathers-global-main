#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-$(pwd -P)}"
export PM2_HOME="${PM2_HOME:-$HOME/.pm2}"
APP_SLUG="$(basename "$APP_ROOT" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-')"
BUILD_SWAP_FILE="${BUILD_SWAP_FILE:-/swapfile-${APP_SLUG}-build}"
BUILD_SWAP_SIZE="${BUILD_SWAP_SIZE:-4G}"
DEPLOY_PUBLIC_API_URL="${DEPLOY_PUBLIC_API_URL:-https://api.fgship.in/api}"
DEPLOY_PUBLIC_SOCKET_URL="${DEPLOY_PUBLIC_SOCKET_URL:-https://api.fgship.in}"

fresh_npm_ci() {
  rm -rf node_modules
  npm ci "$@"
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
npm run build
NODE_ENV=production PORT=5003 pm2 startOrReload ecosystem.config.cjs
pm2 save

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
npm run build

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
npm run build

sudo nginx -t
sudo systemctl reload nginx

echo "Release completed."
