#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/srv/shiplifi/current"

cd "$APP_ROOT/backend"
npm ci
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
npm ci
npm run build

cd "$APP_ROOT/courier-cart-client"
npm ci
npm run build

cd "$APP_ROOT/admin-dashboard"
if [ -f package-lock.json ]; then
  npm ci --legacy-peer-deps --force
else
  npm install --legacy-peer-deps --force
fi
cat > .env.production <<'EOF'
REACT_APP_API_BASE_URL=https://api.shiplifi.com/api
REACT_APP_SOCKET_URL=https://api.shiplifi.com
EOF
cp .env.production .env
cp .env.production .env.local
npm run build

sudo nginx -t
sudo systemctl reload nginx

echo "Release completed."
