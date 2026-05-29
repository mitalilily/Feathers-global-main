#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/var/www/shiplifi"
BACKEND_DIR="$APP_ROOT/backend"
LANDING_DIR="$APP_ROOT/landing"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y nginx certbot python3-certbot-nginx curl build-essential

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

mkdir -p "$BACKEND_DIR" "$LANDING_DIR"

cp "$APP_ROOT/deploy/nginx/shiplifi.conf" /etc/nginx/sites-available/shiplifi
ln -sf /etc/nginx/sites-available/shiplifi /etc/nginx/sites-enabled/shiplifi
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl restart nginx

cd "$BACKEND_DIR"
npm ci
npm run build
pm2 startOrReload ecosystem.config.cjs
pm2 save

cd "$LANDING_DIR"
npm ci
npm run build

echo "Initial VPS setup complete."
echo "Next: run certbot --nginx -d shiplifi.com -d www.shiplifi.com"
