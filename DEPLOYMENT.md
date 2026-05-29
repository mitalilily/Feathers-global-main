# Shiplifi deployment

This repository is set up to deploy:

- `landing/` as a static Vite site served by Nginx
- `courier-cart-client/` as the app frontend served on `app.shiplifi.com`
- `admin-dashboard/` as the admin frontend served on `admin.shiplifi.com`
- `backend/` as a Node.js API managed by PM2 on port `5003` and exposed on `api.shiplifi.com`

Key production files:

- `deploy/nginx/shiplifi.conf`
- `backend/ecosystem.config.cjs`

Expected VPS layout:

- `/srv/shiplifi/current/landing`
- `/srv/shiplifi/current/courier-cart-client`
- `/srv/shiplifi/current/admin-dashboard`
- `/srv/shiplifi/current/backend`

The backend reads `backend/.env.production`, which should stay on the server and not be committed to Git.
GitHub Actions deployment should preserve that file on the VPS.
