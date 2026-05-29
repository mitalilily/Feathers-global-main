import assert from 'assert'
import axios from 'axios'
import {
  cancelAmazonShipment,
  createAmazonShippingWarehouse,
  getAmazonAccessPoints,
  getAmazonAdditionalInputs,
  getAmazonShipmentDocuments,
  getAmazonShippingAccessToken,
  getAmazonShippingRates,
  getAmazonShippingTracking,
  oneClickAmazonShipment,
  purchaseAmazonShipment,
  submitAmazonNdrFeedback,
  type AmazonShippingCredentials,
} from '../models/services/amazonShipping.service'
import {
  applyAmazonShippingCredentialsToEnv,
  mergeAmazonShippingCredentialsWithEnv,
} from '../models/services/amazonShippingCredentials.service'

type CapturedRequest = {
  method?: string
  url?: string
  params?: Record<string, unknown>
  headers?: Record<string, unknown>
  data?: unknown
}

const originalRequest = axios.request
const originalPost = axios.post
const capturedRequests: CapturedRequest[] = []
const capturedTokenRequests: Array<{ url: string; data: string }> = []
let injectedS900RateFailure = false

const sampleAddress = {
  name: 'Test User',
  addressLine1: '123 Test Street',
  city: 'London',
  stateOrRegion: 'London',
  postalCode: 'SW1A 1AA',
  countryCode: 'GB',
  phoneNumber: '+441234567890',
  email: 'test@example.com',
}

const samplePackage = {
  packageClientReferenceId: 'PKG-POSTMAN-1',
  dimensions: {
    length: 10,
    width: 10,
    height: 10,
    unit: 'CENTIMETER',
  },
  weight: {
    value: 500,
    unit: 'GRAM',
  },
  insuredValue: {
    value: 999,
    unit: 'GBP',
  },
  items: [
    {
      quantity: 1,
      description: 'Test item',
      itemValue: {
        value: 999,
        unit: 'GBP',
      },
      weight: {
        value: 500,
        unit: 'GRAM',
      },
    },
  ],
}

const getRatesBody = {
  channelDetails: {
    channelType: 'EXTERNAL',
  },
  shipFrom: sampleAddress,
  shipTo: sampleAddress,
  packages: [samplePackage],
  shipmentType: 'FORWARD',
}

const labelSpecification = {
  format: 'PDF',
  size: {
    length: 6,
    width: 4,
    unit: 'INCH',
  },
  dpi: 203,
  needFileJoining: false,
  requestedDocumentTypes: ['LABEL'],
}

const baseCredentials: AmazonShippingCredentials = {
  accessToken: 'Atza|direct-token',
  endpoint: 'https://sandbox.sellingpartnerapi-eu.amazon.com',
  shippingBusinessId: 'AmazonShipping_IN',
}

const ukCredentials: AmazonShippingCredentials = {
  ...baseCredentials,
  shippingBusinessId: 'AmazonShipping_UK',
}

const assertLastRequest = (method: string, path: string) => {
  const request = capturedRequests[capturedRequests.length - 1]
  assert(request, 'Expected an Amazon request to be captured')
  assert.equal(request.method, method)
  assert(request.url?.endsWith(path), `Expected ${request.url} to end with ${path}`)
  assert.equal(request.headers?.['x-amz-access-token'], 'Atza|direct-token')
  return request
}

const assertHttpError = async (fn: () => Promise<unknown>, statusCode: number, message: string) => {
  let thrown: any
  try {
    await fn()
  } catch (error) {
    thrown = error
  }

  assert(thrown, 'Expected operation to throw')
  assert.equal(thrown.statusCode, statusCode)
  assert(
    String(thrown.message || '').includes(message),
    `Expected "${thrown.message}" to include "${message}"`,
  )
}

const run = async () => {
  ;(axios as any).request = async (config: CapturedRequest) => {
    capturedRequests.push(config)
    const isRatesRequest = config.url?.endsWith('/shipping/v2/shipments/rates')
    const packageReference = (config.data as any)?.packages?.[0]?.packageClientReferenceId
    if (isRatesRequest && packageReference === 'PKG-RETRY-S900' && !injectedS900RateFailure) {
      injectedS900RateFailure = true
      const error: any = new Error('S-900')
      error.response = {
        status: 400,
        data: {
          errors: [
            {
              code: 'InvalidInput',
              message: 'Invalid input',
              details: 'Internal service error. Please contact support for assistance. (S-900)',
            },
          ],
        },
        headers: {
          'x-amzn-requestid': 'amzn-s900-request-id',
          'x-amzn-ratelimit-limit': '5',
        },
      }
      throw error
    }

    return {
      status: 200,
      data: isRatesRequest
        ? {
            payload: {
              requestToken: 'request-token',
              rates: [
                {
                  rateId: 'rate-id',
                  carrierId: 'AMZN_IN',
                  carrierName: 'Amazon Shipping',
                  serviceId: 'amazon-standard',
                },
              ],
            },
          }
        : {
            ok: true,
          },
      headers: {
        'x-amzn-requestid': 'amzn-request-id',
        'x-amzn-ratelimit-limit': '5',
      },
    }
  }

  ;(axios as any).post = async (url: string, data: string) => {
    capturedTokenRequests.push({ url, data })
    if (data.includes('bad-refresh-token')) {
      const error: any = new Error('invalid_grant')
      error.response = {
        status: 400,
        data: {
          error: 'invalid_grant',
          error_description:
            "The request has an invalid grant parameter : refresh_token. User may have revoked or didn't grant the permission.",
        },
      }
      throw error
    }

    return {
      status: 200,
      data: {
        access_token: 'Atza|fresh-token',
      },
      headers: {},
    }
  }

  const ratesResult = await getAmazonShippingRates(getRatesBody, baseCredentials)
  assertLastRequest('POST', '/shipping/v2/shipments/rates')
  assert.equal((ratesResult.data as any).payload.rates[0].courier_id, 'AMZN_IN')
  assert.equal((ratesResult.data as any).payload.rates[0].courier_name, 'Amazon Shipping')
  assert.equal((ratesResult.data as any).payload.rates[0].courierId, 'AMZN_IN')
  assert.equal((ratesResult.data as any).payload.rates[0].courierName, 'Amazon Shipping')

  const retryStartCount = capturedRequests.length
  const retriedRatesResult = await getAmazonShippingRates(
    {
      ...getRatesBody,
      packages: [
        {
          ...samplePackage,
          packageClientReferenceId: 'PKG-RETRY-S900',
        },
      ],
    },
    baseCredentials,
  )
  assert.equal(capturedRequests.length - retryStartCount, 2)
  assert.equal((retriedRatesResult.data as any).payload.rates[0].courier_id, 'AMZN_IN')

  const warehouse = createAmazonShippingWarehouse({
    alias: 'Main Warehouse',
    contactName: 'Warehouse Manager',
    contactPhone: '9876543210',
    contactEmail: 'ops@example.com',
    addressLine1:
      'A very long pickup address line that should be split safely for Amazon Shipping',
    addressLine2: 'Industrial Area Phase 1',
    city: 'Jaipur',
    state: 'Rajasthan',
    country: 'India',
    pincode: '302001',
    latitude: '26.9124',
    longitude: '75.7873',
  })
  assert.equal(warehouse.provider, 'amazon')
  assert.equal(warehouse.shipFrom.countryCode, 'IN')
  assert.equal(warehouse.shipFrom.postalCode, '302001')
  assert.equal(warehouse.shipFrom.phoneNumber, '+919876543210')
  assert(warehouse.shipFrom.addressLine1.length <= 60)
  assert(warehouse.shipFrom.addressLine2 && warehouse.shipFrom.addressLine2.length <= 60)
  assert.equal(warehouse.shipFrom.geocode?.latitude, '26.9124')

  await purchaseAmazonShipment(
    {
      requestToken: 'request-token',
      rateId: 'rate-id',
      requestedDocumentSpecification: labelSpecification,
    },
    { ...baseCredentials, idempotencyKey: 'purchase-test' },
  )
  const purchaseRequest = assertLastRequest('POST', '/shipping/v2/shipments')
  assert.equal(purchaseRequest.headers?.['x-amzn-IdempotencyKey'], 'purchase-test')

  await oneClickAmazonShipment(
    {
      ...getRatesBody,
      labelSpecifications: labelSpecification,
      serviceSelection: {
        serviceId: 'service-id',
      },
    },
    baseCredentials,
  )
  assertLastRequest('POST', '/shipping/v2/oneClickShipment')

  await getAmazonShippingTracking(
    {
      trackingId: 'tracking-id',
      carrierId: 'carrier-id',
    },
    baseCredentials,
  )
  const trackingRequest = assertLastRequest('GET', '/shipping/v2/tracking')
  assert.equal(trackingRequest.params?.trackingId, 'tracking-id')
  assert.equal(trackingRequest.params?.carrierId, 'carrier-id')

  await getAmazonShipmentDocuments(
    {
      shipmentId: 'shipment-id',
      packageClientReferenceId: 'PKG-POSTMAN-1',
      format: 'PDF',
      dpi: 203,
    },
    baseCredentials,
  )
  const documentsRequest = assertLastRequest(
    'GET',
    '/shipping/v2/shipments/shipment-id/documents',
  )
  assert.equal(documentsRequest.params?.packageClientReferenceId, 'PKG-POSTMAN-1')

  await cancelAmazonShipment({ shipmentId: 'shipment-id' }, baseCredentials)
  assertLastRequest('PUT', '/shipping/v2/shipments/shipment-id/cancel')

  await getAmazonAccessPoints(
    {
      accessPointTypes: ['HELIX', 'CORE_LOCKER'],
      countryCode: 'gb',
      postalCode: 'SW1A 1AA',
    },
    ukCredentials,
  )
  const accessPointsRequest = assertLastRequest('GET', '/shipping/v2/accessPoints')
  assert.equal(accessPointsRequest.params?.accessPointTypes, 'HELIX,CORE_LOCKER')
  assert.equal(accessPointsRequest.params?.countryCode, 'GB')

  await submitAmazonNdrFeedback(
    {
      trackingId: 'tracking-id',
      ndrAction: 'reschedule',
      ndrRequestData: {
        rescheduleDate: '2026-05-12T10:00:00.000Z',
      },
    },
    baseCredentials,
  )
  const ndrRequest = assertLastRequest('POST', '/shipping/v2/ndrFeedback')
  assert.equal((ndrRequest.data as any)?.ndrAction, 'RESCHEDULE')

  await getAmazonAdditionalInputs(
    {
      requestToken: 'request-token',
      rateId: 'rate-id',
    },
    baseCredentials,
  )
  const additionalInputsRequest = assertLastRequest(
    'GET',
    '/shipping/v2/shipments/additionalInputs/schema',
  )
  assert.equal(additionalInputsRequest.params?.requestToken, 'request-token')
  assert.equal(additionalInputsRequest.params?.rateId, 'rate-id')

  const refreshedToken = await getAmazonShippingAccessToken({
    accessToken: 'Atza|stale-stored-token',
    refreshToken: 'Atzr|refresh-token',
    lwaClientId: 'lwa-client-id',
    lwaClientSecret: 'lwa-client-secret',
    shippingBusinessId: 'AmazonShipping_UK',
  })
  assert.equal(refreshedToken, 'Atza|fresh-token')
  assert.equal(capturedTokenRequests[capturedTokenRequests.length - 1].url, 'https://api.amazon.co.uk/auth/o2/token')

  const fallbackTokenRequestCount = capturedTokenRequests.length
  const fallbackToken = await getAmazonShippingAccessToken({
    accessToken: 'Atza|fallback-token',
    refreshToken: 'Atzr|bad-refresh-token',
    lwaClientId: 'lwa-client-id',
    lwaClientSecret: 'lwa-client-secret',
    shippingBusinessId: 'AmazonShipping_UK',
  })
  assert.equal(fallbackToken, 'Atza|fallback-token')
  assert.equal(capturedTokenRequests.length, fallbackTokenRequestCount + 1)

  await assertHttpError(
    () =>
      getAmazonShippingAccessToken({
        refreshToken: 'Atzr|bad-refresh-token',
        lwaClientId: 'lwa-client-id',
        lwaClientSecret: 'lwa-client-secret',
        shippingBusinessId: 'AmazonShipping_UK',
      }),
    400,
    'Re-authorize Amazon Shipping',
  )

  const envMergedCredentials = mergeAmazonShippingCredentialsWithEnv(
    {
      refreshToken: 'Atzr|db-refresh-token',
      lwaClientId: 'db-client-id',
      lwaClientSecret: 'db-client-secret',
      shippingBusinessId: 'AmazonShipping_IN',
    },
    {
      AMAZON_SHIPPING_REFRESH_TOKEN: 'Atzr|env-refresh-token',
      AMAZON_SHIPPING_LWA_CLIENT_ID: 'env-client-id',
      AMAZON_SHIPPING_LWA_CLIENT_SECRET: 'env-client-secret',
      AMAZON_SHIPPING_BUSINESS_ID: 'AmazonShipping_IN',
      AMAZON_SHIPPING_REGION: 'eu',
      AMAZON_SHIPPING_SANDBOX: 'false',
    },
  )
  assert.equal(envMergedCredentials.refreshToken, 'Atzr|env-refresh-token')
  assert.equal(envMergedCredentials.lwaClientId, 'env-client-id')
  assert.equal(envMergedCredentials.lwaClientSecret, 'env-client-secret')

  const originalEnvRefreshToken = process.env.AMAZON_SHIPPING_REFRESH_TOKEN
  try {
    process.env.AMAZON_SHIPPING_REFRESH_TOKEN = 'Atzr|env-refresh-token'
    applyAmazonShippingCredentialsToEnv({ refreshToken: 'Atzr|db-refresh-token' })
    assert.equal(process.env.AMAZON_SHIPPING_REFRESH_TOKEN, 'Atzr|env-refresh-token')
    applyAmazonShippingCredentialsToEnv(
      { refreshToken: 'Atzr|admin-updated-refresh-token' },
      { overwriteExisting: true },
    )
    assert.equal(process.env.AMAZON_SHIPPING_REFRESH_TOKEN, 'Atzr|admin-updated-refresh-token')
  } finally {
    if (originalEnvRefreshToken === undefined) {
      delete process.env.AMAZON_SHIPPING_REFRESH_TOKEN
    } else {
      process.env.AMAZON_SHIPPING_REFRESH_TOKEN = originalEnvRefreshToken
    }
  }

  const tokenRequestCount = capturedTokenRequests.length
  const directTokenRatesResult = await getAmazonShippingRates(getRatesBody, {
    ...baseCredentials,
    refreshToken: 'Atzr|refresh-token',
    lwaClientId: 'lwa-client-id',
    lwaClientSecret: 'lwa-client-secret',
    useDirectAccessToken: true,
  })
  assert.equal(capturedTokenRequests.length, tokenRequestCount)
  assertLastRequest('POST', '/shipping/v2/shipments/rates')
  assert.equal((directTokenRatesResult.data as any).payload.rates[0].courier_id, 'AMZN_IN')

  await assertHttpError(
    () =>
      getAmazonAccessPoints(
        {
          accessPointTypes: ['HELIX'],
          countryCode: 'IN',
          postalCode: '110001',
        },
        baseCredentials,
      ),
    400,
    'AmazonShipping_UK',
  )

  await assertHttpError(
    () =>
      submitAmazonNdrFeedback(
        {
          trackingId: 'tracking-id',
          ndrAction: 'RTO',
        },
        ukCredentials,
      ),
    400,
    'AmazonShipping_IN',
  )

  console.log('Amazon Shipping API flow checks passed.')
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    ;(axios as any).request = originalRequest
    ;(axios as any).post = originalPost
  })
