#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/feathers-global/current}"
BACKEND_DIR="$APP_ROOT/backend"
LANDING_DIR="$APP_ROOT/landing"
CLIENT_DIR="$APP_ROOT/courier-cart-client"
ADMIN_DIR="$APP_ROOT/admin-dashboard"
DEPLOY_USER="${DEPLOY_USER:-deploy}"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y nginx certbot python3-certbot-nginx curl build-essential rsync sudo

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi

install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 2775 "$APP_ROOT" "$BACKEND_DIR" "$LANDING_DIR" "$CLIENT_DIR" "$ADMIN_DIR"
cat > "/etc/sudoers.d/$DEPLOY_USER" <<EOF
$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL
EOF
chmod 440 "/etc/sudoers.d/$DEPLOY_USER"

cp "$APP_ROOT/deploy/nginx/feathers-global.conf" /etc/nginx/sites-available/feathers-global
ln -sf /etc/nginx/sites-available/feathers-global /etc/nginx/sites-enabled/feathers-global
if [ -f /etc/nginx/sites-available/shiplifi ] && grep -q "/srv/feathers-global/current" /etc/nginx/sites-available/shiplifi; then
  rm -f /etc/nginx/sites-enabled/shiplifi /etc/nginx/sites-available/shiplifi
fi
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl restart nginx

sudo -u "$DEPLOY_USER" -H bash -lc "export APP_ROOT='$APP_ROOT' PM2_HOME='/home/$DEPLOY_USER/.pm2'; cd '$APP_ROOT' && chmod +x deploy/release.sh && ./deploy/release.sh"

echo "Initial VPS setup complete."
echo "Next: run certbot --nginx -d fgship.in -d www.fgship.in -d client.fgship.in -d admin.fgship.in -d api.fgship.in"
