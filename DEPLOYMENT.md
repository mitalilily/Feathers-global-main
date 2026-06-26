# Feathers Global deployment

This repository is set up to deploy:

- `landing/` as a static Vite site served by Nginx
- `courier-cart-client/` as the app frontend served on `client.fgship.in`
- `admin-dashboard/` as the admin frontend served on the Feathers Global admin host
- `backend/` as a Node.js API managed by PM2 on port `5003` and exposed on `api.fgship.in`

Key production files:

- `deploy/nginx/shiplifi.conf`
- `backend/ecosystem.config.cjs`

Expected VPS layout:

- `/srv/feathers-global/current/landing`
- `/srv/feathers-global/current/courier-cart-client`
- `/srv/feathers-global/current/admin-dashboard`
- `/srv/feathers-global/current/backend`

The backend reads `backend/.env.production`, which should stay on the server and not be committed to Git.
GitHub Actions deployment should preserve that file on the VPS.

GitHub Actions deploy secrets can use either the Feathers Global names or the legacy Shiplifi names:

- `FGSHIP_HOST` or `FEATHERS_GLOBAL_HOST` or `SHIPLIFI_HOST`
- `FGSHIP_USER` or `FEATHERS_GLOBAL_USER` or `SHIPLIFI_USER`
- `FGSHIP_SSH_PRIVATE_KEY` or `FEATHERS_GLOBAL_SSH_PRIVATE_KEY` or `SHIPLIFI_SSH_PRIVATE_KEY`

Shopify OAuth deployment needs these GitHub Actions secrets:

- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_SCOPES` optional; defaults to the Shiplifi order/product/webhook/fulfillment scopes
- `SHOPIFY_SEND_OAUTH_SCOPE` optional; defaults to `false` because Shopify app config manages scopes

The deploy workflow writes Shopify OAuth settings into `backend/.env.production` and keeps `SHOPIFY_USE_EXPIRING_OFFLINE_TOKENS=true` for the multi-merchant OAuth flow.
After the secrets are present, the workflow runs the backend Shopify OAuth smoke check to verify the production redirect URI, signed state, offline grant shape, and callback HMAC validation without printing secrets.
