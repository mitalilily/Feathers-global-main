# Shopify Integration Runbook

This backend connects Shopify through the GraphQL Admin API.

- Store credentials are verified with the `shop` query.
- Orders are imported with the `orders` query.
- Order webhooks are registered with `webhookSubscriptionCreate`.
- Shipment updates use GraphQL mutations for fulfillment creation, order tags, cancellation, and mark-as-paid.

Official references:

- GraphQL Admin API: https://shopify.dev/docs/api/admin-graphql/latest
- Orders query: https://shopify.dev/docs/api/admin-graphql/latest/queries/orders
- Webhooks: https://shopify.dev/docs/apps/build/webhooks
- Access tokens: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens

## Required Scopes

Use the least privileges possible for the features you enable:

- `read_orders` to import recent orders.
- `write_orders` to update order tags, cancel orders, and mark COD orders as paid.
- `read_webhooks` and `write_webhooks` to list and auto-register webhook subscriptions.
- Fulfillment write scopes such as `write_merchant_managed_fulfillment_orders` when using Shopify fulfillment creation.
- `read_all_orders` only if older-than-60-days order import is required and approved by Shopify.

## Backend Configuration

For production webhook auto-registration, `API_URL` must be a public HTTPS backend URL Shopify can reach.

```bash
API_URL=https://api.shiplifi.com
SHOPIFY_STORE=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_API_SECRET=shpss_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_API_VERSION=2026-04
```

The app registers this webhook delivery URL:

```text
https://api.shiplifi.com/api/webhooks/shopify/order-created
```

Shopify signs webhook deliveries with the app secret. Pass one of these fields when connecting a store:

- `webhookSecret`
- `apiSecretKey`
- `apiSecret`
- `clientSecret`

If a store-level secret is not provided, the backend falls back to `SHOPIFY_API_SECRET` or `SHOPIFY_WEBHOOK_SECRET`.

## Admin Status

The admin dashboard API integration page can test and bind the env-backed custom app without exposing tokens.

- GET `/api/integrations/shopify/test-connection`
- POST `/api/integrations/shopify/connect-env`
- POST `/api/integrations/shopify/sync-orders`

## Connect Payload

POST `/api/integrations/shopify-auth` with the authenticated merchant session:

```json
{
  "storeUrl": "your-store.myshopify.com",
  "apiKey": "optional-client-id",
  "apiSecretKey": "shopify-app-secret",
  "adminApiAccessToken": "shpat_...",
  "settings": {
    "fulfillTrigger": "order_booked",
    "customerNotifyOnFulfill": "notify",
    "autoUpdateShipmentStatus": true,
    "autoCancelOrders": true,
    "markCodPaidOnDelivery": true,
    "orderTagsToFetch": "",
    "codTags": "cod",
    "prepaidTags": "prepaid"
  }
}
```

## Credential Check

Run the built-in mock proof:

```bash
npm run check:shopify-apis -- --mock
```

Run against a real Shopify store:

```bash
SHOPIFY_STORE_URL=your-store.myshopify.com \
SHOPIFY_STORE=your-store.myshopify.com \
SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
npm run check:shopify-apis
```

On PowerShell:

```powershell
$env:SHOPIFY_STORE_URL="your-store.myshopify.com"
$env:SHOPIFY_STORE="your-store.myshopify.com"
$env:SHOPIFY_ADMIN_API_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
$env:SHOPIFY_ACCESS_TOKEN="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
npm run check:shopify-apis
```

If the token does not have webhook scopes yet, run:

```bash
npm run check:shopify-apis -- --skip-webhooks
```
