# Postman Checks

Import these files into Postman:

- `amazon-shipping.postman_collection.json`
- `amazon-shipping.local.postman_environment.json`
- `ekart.postman_collection.json`
- `ekart.local.postman_environment.json`

Before running the collection, set:

- `baseUrl`
- `xApiKey`
- `amazonAccessToken` if you want to pass a direct one-hour access token

If Amazon credentials are already saved from the admin Courier Credentials page,
leave `amazonAccessToken` blank and the backend will generate the token from the
stored refresh token and LWA client credentials.

For end-to-end purchase flow:

1. Run `Get Rates`.
2. Copy `requestToken`, a selected `rateId`, and optionally `serviceId` from the
   Amazon response into the environment.
3. Run `Purchase Shipment` or `One Click Shipment`.
4. Copy returned `shipmentId`, `trackingId`, and `carrierId` before running
   documents, tracking, cancel, or NDR checks.

Per Amazon Shipping docs, `Access Points` is configured with
`AmazonShipping_UK`; `NDR Feedback` is configured with `AmazonShipping_IN`.

For the Ekart booking collection:

- Point `baseUrl` at the Shiplifi production or staging backend, not the local mock.
- Set `xApiKey` to a valid API key.
- Set `ekartClientId`, `ekartUsername`, and `ekartPassword` for the Ekart auth step.
- Run `Ekart Auth Token` first; it should return `200 OK` and store `ekartAccessToken`.
- Run `Ekart Serviceability` first to verify the lane.
- Use `Ekart Pair Serviceability` or `Backend Ekart Pair Serviceability` to hit the
  provider's pickup/drop pincode serviceability endpoint with the exact Ekart payload
  shape. The live provider returned `200 OK` for the sample payload in this collection,
  and the backend wrapper now forwards the same request.
- Use `Ekart Bulk Serviceability` or `Backend Ekart Bulk Serviceability` to fetch the
  provider's bulk pincode map for `NON_LARGE` or `LARGE`. The live provider returned
  `200 OK` for both `format=JSON` and `format=EXCEL`; the Excel mode returns a JSON
  payload with a downloadable storage URL.
- Use `Ekart Pincode Serviceability` or `Backend Ekart Pincode Serviceability` to
  check a single pincode directly against Ekart. The live provider returned `200 OK`
  for the sample pincode in this collection.
- Use `Ekart Pricing Estimate` when you want the live provider freight estimate.
  The production request requires `shippingDirection`; we default it to `FORWARD`
  in the backend proxy and the live provider returned `200 OK` for the sample
  payload in this collection.
- Register the Ekart tracking webhook at `EKART_WEBHOOK_URL` in your environment
  or use the generated backend URL `https://api.featherglobal.in/api/webhook/ekart/track`.
  The legacy alias `https://api.featherglobal.in/api/webhook/ekart` also remains enabled.
  The handler accepts signed payloads when `EKART_WEBHOOK_SECRET` is configured on the
  courier credentials row.
- Run `Create Ekart Order` to book the shipment. That endpoint should return `201 Created`.
- Use `Create Ekart Reverse Order` for customer-to-seller pickup shipments with
  `payment_type: reverse` and a `return_reason`.
- Use `Create Ekart Template Order` when you want Ekart to pick the packaging
  dimensions from the dashboard template name.
- If the shipment was created with `delayed_dispatch: true`, run `Set Ekart Dispatch Date`
  to push the preferred dispatch date to Ekart. That endpoint should return `200 OK`.
- After shipment creation, run `Update Ekart EWBN` with a 12-digit EWBN value.
  That endpoint should return `200 OK`.
- Use `Ekart Raw Track` or `Backend Ekart Raw Track` to read the raw WBN tracking payload.
- Use `Ekart Labels JSON` or `Backend Ekart Labels JSON` when you need the provider
  label payload in JSON form. The backend route also supports the PDF download mode
  when `json_only=false`.
- Use `Ekart Manifest JSON` or `Backend Ekart Manifest JSON` to generate the provider
  manifest payload for up to 100 waybill numbers.
- Use `Ekart Address JSON` or `Backend Ekart Address JSON` to register a warehouse
  address with Ekart. The live provider returned `200 OK` for the sample payload in
  this collection.
- Use `Ekart Address List` or `Backend Ekart Address List` to fetch the saved address
  array. The live provider returned `200 OK` and the response is a plain array.
- Use `Ekart NDR Re-Attempt`, `Backend Ekart NDR Re-Attempt`, `Ekart NDR RTO`, and
  `Backend Ekart NDR RTO` to submit provider NDR actions. The sample reattempt body
  auto-fills tomorrow's date in milliseconds before the request runs.
- Use `Cancel Ekart Shipment` only after you have a real `ekartAwbNumber`; the provider
  cancel endpoint returns `200 OK` when the shipment exists and cancellation is accepted.
- Use the returned `ekartOrderId` and `ekartAwbNumber` for tracking and cancellation checks.
- The backend order-create call is what ultimately triggers the live Ekart booking integration.
