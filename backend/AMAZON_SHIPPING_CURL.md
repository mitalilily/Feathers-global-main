# Amazon Shipping V2 Curl Checks

Base local URL:

```bash
BASE_URL="http://localhost:4000/api/v1"
SHIPLIFI_API_KEY="replace-with-shiplifi-api-key"
AMAZON_ACCESS_TOKEN="Atza|replace-with-amazon-lwa-access-token"
```

## Get Rates

```bash
curl -X POST "$BASE_URL/amazon-shipping/rates" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SHIPLIFI_API_KEY" \
  -H "x-amz-access-token: $AMAZON_ACCESS_TOKEN" \
  -H "x-amzn-shipping-business-id: AmazonShipping_IN" \
  -d '{
    "channelDetails": {
      "channelType": "EXTERNAL"
    },
    "shipFrom": {
      "name": "Shiplifi Warehouse",
      "addressLine1": "Warehouse Address Line 1",
      "city": "Delhi",
      "stateOrRegion": "Delhi",
      "postalCode": "110001",
      "countryCode": "IN",
      "phoneNumber": "+919999999999",
      "email": "ops@example.com"
    },
    "shipTo": {
      "name": "Test Customer",
      "addressLine1": "Customer Address Line 1",
      "city": "Mumbai",
      "stateOrRegion": "Maharashtra",
      "postalCode": "400001",
      "countryCode": "IN",
      "phoneNumber": "+919888888888",
      "email": "customer@example.com"
    },
    "packages": [
      {
        "packageClientReferenceId": "PKG-1001",
        "dimensions": {
          "length": 10,
          "width": 10,
          "height": 10,
          "unit": "CENTIMETER"
        },
        "weight": {
          "value": 500,
          "unit": "GRAM"
        },
        "insuredValue": {
          "value": 999,
          "unit": "INR"
        },
        "items": [
          {
            "quantity": 1,
            "description": "Test item",
            "itemValue": {
              "value": 999,
              "unit": "INR"
            },
            "weight": {
              "value": 500,
              "unit": "GRAM"
            }
          }
        ]
      }
    ],
    "shipmentType": "FORWARD"
  }'
```

Use `data.payload.requestToken`, a selected `data.payload.rates[].rateId`, and one of that rate's `supportedDocumentSpecifications` for purchase.

## Purchase Shipment

```bash
curl -X POST "$BASE_URL/amazon-shipping/shipments" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SHIPLIFI_API_KEY" \
  -H "x-amz-access-token: $AMAZON_ACCESS_TOKEN" \
  -H "x-amzn-shipping-business-id: AmazonShipping_IN" \
  -H "x-amzn-IdempotencyKey: purchase-test-1001" \
  -d '{
    "requestToken": "replace-with-getRates-requestToken",
    "rateId": "replace-with-selected-rateId",
    "requestedDocumentSpecification": {
      "format": "PDF",
      "size": {
        "length": 6,
        "width": 4,
        "unit": "INCH"
      },
      "dpi": 203,
      "needFileJoining": false,
      "requestedDocumentTypes": ["LABEL"]
    }
  }'
```

## One-Click Shipment

Use this only when you want Amazon to purchase directly by `serviceSelection.serviceId` without the separate rate-token purchase flow.

```bash
curl -X POST "$BASE_URL/amazon-shipping/one-click-shipment" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SHIPLIFI_API_KEY" \
  -H "x-amz-access-token: $AMAZON_ACCESS_TOKEN" \
  -H "x-amzn-shipping-business-id: AmazonShipping_IN" \
  -d '{
    "channelDetails": {
      "channelType": "EXTERNAL"
    },
    "shipFrom": {
      "name": "Shiplifi Warehouse",
      "addressLine1": "Warehouse Address Line 1",
      "city": "Delhi",
      "stateOrRegion": "Delhi",
      "postalCode": "110001",
      "countryCode": "IN",
      "phoneNumber": "+919999999999",
      "email": "ops@example.com"
    },
    "shipTo": {
      "name": "Test Customer",
      "addressLine1": "Customer Address Line 1",
      "city": "Mumbai",
      "stateOrRegion": "Maharashtra",
      "postalCode": "400001",
      "countryCode": "IN",
      "phoneNumber": "+919888888888",
      "email": "customer@example.com"
    },
    "packages": [
      {
        "packageClientReferenceId": "PKG-1002",
        "dimensions": {
          "length": 10,
          "width": 10,
          "height": 10,
          "unit": "CENTIMETER"
        },
        "weight": {
          "value": 500,
          "unit": "GRAM"
        },
        "insuredValue": {
          "value": 999,
          "unit": "INR"
        },
        "items": [
          {
            "quantity": 1,
            "description": "Test item",
            "itemValue": {
              "value": 999,
              "unit": "INR"
            },
            "weight": {
              "value": 500,
              "unit": "GRAM"
            }
          }
        ]
      }
    ],
    "labelSpecifications": {
      "format": "PDF",
      "size": {
        "length": 6,
        "width": 4,
        "unit": "INCH"
      },
      "dpi": 203,
      "needFileJoining": false,
      "requestedDocumentTypes": ["LABEL"]
    },
    "serviceSelection": {
      "serviceId": "replace-with-amazon-serviceId"
    }
  }'
```

## Tracking

Use the `trackingId` returned by shipment purchase and the `carrierId` from the selected rate.

```bash
curl -G "$BASE_URL/amazon-shipping/tracking" \
  -H "x-api-key: $SHIPLIFI_API_KEY" \
  -H "x-amz-access-token: $AMAZON_ACCESS_TOKEN" \
  -H "x-amzn-shipping-business-id: AmazonShipping_IN" \
  --data-urlencode "trackingId=replace-with-tracking-id" \
  --data-urlencode "carrierId=replace-with-carrier-id"
```

## Shipment Documents

Use the `shipmentId` returned by shipment purchase and the same package reference id used in the original package request.

```bash
curl -G "$BASE_URL/amazon-shipping/shipments/replace-with-shipment-id/documents" \
  -H "x-api-key: $SHIPLIFI_API_KEY" \
  -H "x-amz-access-token: $AMAZON_ACCESS_TOKEN" \
  -H "x-amzn-shipping-business-id: AmazonShipping_IN" \
  --data-urlencode "packageClientReferenceId=PKG-1001" \
  --data-urlencode "format=PDF" \
  --data-urlencode "dpi=203"
```

## Cancel Shipment

```bash
curl -X PUT "$BASE_URL/amazon-shipping/shipments/replace-with-shipment-id/cancel" \
  -H "x-api-key: $SHIPLIFI_API_KEY" \
  -H "x-amz-access-token: $AMAZON_ACCESS_TOKEN" \
  -H "x-amzn-shipping-business-id: AmazonShipping_IN"
```

## Access Points

`accessPointTypes` is sent to Amazon as a CSV query value.

```bash
curl -G "$BASE_URL/amazon-shipping/access-points" \
  -H "x-api-key: $SHIPLIFI_API_KEY" \
  -H "x-amz-access-token: $AMAZON_ACCESS_TOKEN" \
  -H "x-amzn-shipping-business-id: AmazonShipping_UK" \
  --data-urlencode "accessPointTypes=HELIX,CORE_LOCKER" \
  --data-urlencode "countryCode=GB" \
  --data-urlencode "postalCode=SW1A 1AA"
```

## NDR Feedback

For `RESCHEDULE`, include `ndrRequestData.rescheduleDate`. For `REATTEMPT`, include `ndrRequestData.additionalAddressNotes`. `RTO` does not need extra request data.

```bash
curl -X POST "$BASE_URL/amazon-shipping/ndr-feedback" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SHIPLIFI_API_KEY" \
  -H "x-amz-access-token: $AMAZON_ACCESS_TOKEN" \
  -H "x-amzn-shipping-business-id: AmazonShipping_IN" \
  -d '{
    "trackingId": "replace-with-tracking-id",
    "ndrAction": "RESCHEDULE",
    "ndrRequestData": {
      "rescheduleDate": "2026-05-08T10:00:00.000Z"
    }
  }'
```

## Additional Inputs Schema

Call this when a selected rate from getRates has `requiresAdditionalInputs: true`.

```bash
curl -G "$BASE_URL/amazon-shipping/additional-inputs/schema" \
  -H "x-api-key: $SHIPLIFI_API_KEY" \
  -H "x-amz-access-token: $AMAZON_ACCESS_TOKEN" \
  -H "x-amzn-shipping-business-id: AmazonShipping_IN" \
  --data-urlencode "requestToken=replace-with-getRates-requestToken" \
  --data-urlencode "rateId=replace-with-selected-rateId"
```

## Backend-Managed LWA Token

Instead of sending `x-amz-access-token`, configure these environment variables:

```bash
AMAZON_SHIPPING_REFRESH_TOKEN="Atzr|..."
AMAZON_SHIPPING_LWA_CLIENT_ID="amzn1.application-oa2-client..."
AMAZON_SHIPPING_LWA_CLIENT_SECRET="..."
AMAZON_SHIPPING_BUSINESS_ID="AmazonShipping_IN"
AMAZON_SHIPPING_REGION="eu"
AMAZON_SHIPPING_SANDBOX="false"
AMAZON_SHIPPING_LWA_TOKEN_URL="https://api.amazon.com/auth/o2/token"
```

Then call the same endpoints without the `x-amz-access-token` header.
