# Feather Global Shopify public app review checklist

## Architecture and production isolation

- The new public app identity is used only by the new `/shopify/install` entry flow.
- The existing production app identity remains valid for its embedded sessions, token refresh, and webhooks.
- Each store remains bound to the app client ID that issued its token; installation never migrates a live store automatically.
- Removal of the existing app is deferred until approval and a controlled merchant migration.

## Minimum access scopes

- `read_orders`: import orders and their shipping fields.
- `write_orders`: update order tags, cancellation, and payment state where enabled.
- `read_merchant_managed_fulfillment_orders`: read open fulfillment orders at merchant locations.
- `write_merchant_managed_fulfillment_orders`: create fulfillments for merchant-managed locations.
- `write_fulfillments`: attach tracking and create fulfillment delivery events.

Customers, products, all-orders history, app proxy, themes, inventory, draft orders, assigned fulfillment-service orders, third-party fulfillment orders, and webhook-management scopes are not requested. Webhooks are app-configured subscriptions.

## Authentication, webhooks, and privacy

- App Bridge ID tokens are fetched fresh and never persisted.
- The backend validates signature, audience, issuer, destination shop, expiry, and store/account binding.
- New installs receive expiring offline tokens; new access and refresh tokens are encrypted at rest.
- OAuth state and bootstrap tokens are signed, short-lived, and timing-safe validated.
- Order topics: `orders/create`, `orders/updated`, `orders/cancelled`.
- Compliance topics: `customers/data_request`, `customers/redact`, `shop/redact`.
- Lifecycle topic: `app/uninstalled`.
- Webhooks use raw bodies and return `401` for invalid HMAC signatures.
- Customer exports are queued with encrypted payloads; redaction and uninstall handlers are present.

## Test status

- Backend TypeScript build: passed.
- Client TypeScript and production Vite build: passed.
- OAuth/HMAC/expiring-token smoke test: passed.
- Development-store install and end-to-end order/fulfillment/tracking tests: pending live configuration.
- Invalid-HMAC, reinstall, uninstall, and privacy webhook tests: pending live configuration.
- Browser console/network review for 404, 500, CSP, cookie, and App Bridge errors: pending.

## Shopify submission items

- Protected customer data approval for buyer name, email, phone, shipping address, and billing address.
- Listing copy, icon, screenshots, pricing explanation, support contact, policies, and reviewer instructions.
- Final automated checks and Shopify manual review.

Shopify retains sole discretion over approval. Passing this checklist improves review readiness but cannot guarantee approval.

## Official references

- https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- https://shopify.dev/docs/apps/launch/app-store-review/review-process
- https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens
- https://shopify.dev/docs/api/usage/access-scopes
- https://shopify.dev/docs/apps/build/webhooks/get-started
- https://shopify.dev/docs/apps/build/privacy-law-compliance
