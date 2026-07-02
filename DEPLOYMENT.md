# Feathers Global deployment

This repository is set up to deploy:

- `landing/` as a static Vite site served by Nginx
- `courier-cart-client/` as the app frontend served on `client.fgship.in`
- `admin-dashboard/` as the admin frontend served on the Feathers Global admin host
- `backend/` as a Node.js API managed by PM2 on port `5003` and exposed on `api.fgship.in`

Key production files:

- `deploy/nginx/feathers-global.conf`
- `backend/ecosystem.config.cjs`

Expected VPS layout:

- `/srv/feathers-global/current/landing`
- `/srv/feathers-global/current/courier-cart-client`
- `/srv/feathers-global/current/admin-dashboard`
- `/srv/feathers-global/current/backend`

The backend reads `backend/.env.production`, which should stay on the server and not be committed to Git.
GitHub Actions deployment should preserve that file on the VPS.

GitHub Actions deploy secrets should use Feathers Global naming only:

- `FGSHIP_HOST` or `FEATHERS_GLOBAL_HOST`
- `FGSHIP_USER` or `FEATHERS_GLOBAL_USER`
- `FGSHIP_SSH_PRIVATE_KEY` or `FEATHERS_GLOBAL_SSH_PRIVATE_KEY`
- `FGSHIP_PASSWORD` or `FEATHERS_GLOBAL_PASSWORD` as a fallback when the runner cannot load the SSH private key

The deploy workflow prefers a valid unencrypted OpenSSH private key, but it can fall back to password auth if the key secret is missing or malformed.
If you use a key, store the full private key with its original newlines, including the `BEGIN ... PRIVATE KEY` and `END ... PRIVATE KEY` lines.
If the secret was pasted as a single line with literal `\n` characters, the workflow will try to normalize that automatically before falling back to password auth.
Optional repository variable:

- `DEPLOY_RUNTIME_USER` defaults to `deploy` and controls which Linux user runs `deploy/release.sh` on the VPS

Shopify OAuth deployment needs these GitHub Actions secrets:

- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_SCOPES` optional; defaults to the Shiplifi order/product/webhook/fulfillment scopes
- `SHOPIFY_SEND_OAUTH_SCOPE` optional; defaults to `false` because Shopify app config manages scopes

The deploy workflow writes Shopify OAuth settings into `backend/.env.production` and keeps `SHOPIFY_USE_EXPIRING_OFFLINE_TOKENS=true` for the multi-merchant OAuth flow.
After the secrets are present, the workflow runs the backend Shopify OAuth smoke check to verify the production redirect URI, signed state, offline grant shape, and callback HMAC validation without printing secrets.

Razorpay live deployment can use these GitHub Actions secrets:

- `RAZORPAY_KEY_ID_PROD`
- `RAZORPAY_KEY_SECRET_PROD`
- `RAZORPAY_MERCHANT_ID_PROD` optional
- `RAZORPAY_WEBHOOK_SECRET_PROD` optional

When the key ID and key secret are present, the deploy workflow writes them into `backend/.env.production` and forces `RAZORPAY_MODE=live` on the VPS without committing payment secrets to git.
