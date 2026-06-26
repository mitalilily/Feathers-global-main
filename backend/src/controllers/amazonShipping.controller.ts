import { and, eq } from 'drizzle-orm'
import { Response } from 'express'
import {
  type AmazonShippingCredentials,
  buildAmazonShippingAddressFromWarehouse,
  cancelAmazonShipment,
  getAmazonAdditionalInputs,
  getAmazonAccessPoints,
  getAmazonShipmentDocuments,
  getAmazonShippingTracking,
  getAmazonShippingRates,
  oneClickAmazonShipment,
  purchaseAmazonShipment,
  submitAmazonNdrFeedback,
} from '../models/services/amazonShipping.service'
import {
  applyAmazonShippingCredentialsToEnv,
  getStoredAmazonShippingCredentials,
} from '../models/services/amazonShippingCredentials.service'
import { db } from '../models/client'
import { addresses, pickupAddresses } from '../models/schema/pickupAddresses'
import { HttpError } from '../utils/classes'

const INTERNAL_BODY_KEYS = new Set([
  'credentials',
  'amazonCredentials',
  'accessToken',
  'refreshToken',
  'lwaClientId',
  'lwaClientSecret',
  'clientId',
  'clientSecret',
  'endpoint',
  'region',
  'sandbox',
  'shippingBusinessId',
  'idempotencyKey',
  'lwaTokenUrl',
  'tokenUrl',
  'body',
  'request',
  'pickupId',
  'pickup_id',
  'warehouseId',
  'warehouse_id',
])

const normalize = (value?: unknown) => String(value ?? '').trim()

const truthy = (value: unknown) => {
  if (typeof value === 'boolean') return value
  return ['1', 'true', 'yes', 'sandbox'].includes(normalize(value).toLowerCase())
}

const optionalTruth = (value: unknown) => (value === undefined ? undefined : truthy(value))

const readCredentials = (req: any): AmazonShippingCredentials => {
  const bodyCredentials = req.body?.credentials || req.body?.amazonCredentials || {}

  const accessToken = normalize(
    req.headers?.['x-amz-access-token'] || bodyCredentials.accessToken || req.body?.accessToken,
  )

  return {
    accessToken,
    refreshToken: normalize(bodyCredentials.refreshToken || req.body?.refreshToken),
    lwaClientId: normalize(
      bodyCredentials.lwaClientId || bodyCredentials.clientId || req.body?.lwaClientId || req.body?.clientId,
    ),
    lwaClientSecret: normalize(
      bodyCredentials.lwaClientSecret ||
        bodyCredentials.clientSecret ||
        req.body?.lwaClientSecret ||
        req.body?.clientSecret,
    ),
    endpoint: normalize(bodyCredentials.endpoint || req.body?.endpoint),
    region: normalize(bodyCredentials.region || req.body?.region),
    sandbox:
      bodyCredentials.sandbox !== undefined
        ? optionalTruth(bodyCredentials.sandbox)
        : optionalTruth(req.body?.sandbox),
    shippingBusinessId: normalize(
      req.headers?.['x-amzn-shipping-business-id'] ||
        bodyCredentials.shippingBusinessId ||
        req.body?.shippingBusinessId,
    ),
    idempotencyKey: normalize(
      req.headers?.['x-amzn-idempotencykey'] ||
        req.headers?.['x-amzn-idempotency-key'] ||
        bodyCredentials.idempotencyKey ||
        req.body?.idempotencyKey,
    ),
    lwaTokenUrl: normalize(
      bodyCredentials.lwaTokenUrl ||
        bodyCredentials.tokenUrl ||
        req.body?.lwaTokenUrl ||
        req.body?.tokenUrl,
    ),
    useDirectAccessToken: Boolean(accessToken),
  }
}

const mergeCredentials = (
  storedCredentials: AmazonShippingCredentials,
  requestCredentials: AmazonShippingCredentials,
): AmazonShippingCredentials => {
  const merged: AmazonShippingCredentials = { ...storedCredentials }
  const secretKeys: Array<keyof AmazonShippingCredentials> = [
    'accessToken',
    'refreshToken',
    'lwaClientId',
    'lwaClientSecret',
    'endpoint',
    'region',
    'shippingBusinessId',
    'idempotencyKey',
    'lwaTokenUrl',
  ]

  secretKeys.forEach((key) => {
    const value = normalize(requestCredentials[key])
    if (value) {
      ;(merged as Record<string, unknown>)[key] = value
    }
  })

  if (requestCredentials.sandbox !== undefined) {
    merged.sandbox = requestCredentials.sandbox
  }
  if (requestCredentials.useDirectAccessToken !== undefined) {
    merged.useDirectAccessToken = requestCredentials.useDirectAccessToken
  }

  return merged
}

const getEffectiveAmazonCredentials = async (req: any): Promise<AmazonShippingCredentials> => {
  const storedCredentials = await getStoredAmazonShippingCredentials()
  applyAmazonShippingCredentialsToEnv(storedCredentials)
  return mergeCredentials(storedCredentials, readCredentials(req))
}

const stripInternalBodyKeys = (body: Record<string, any>) => {
  const cleanBody: Record<string, any> = {}
  Object.entries(body || {}).forEach(([key, value]) => {
    if (!INTERNAL_BODY_KEYS.has(key)) cleanBody[key] = value
  })
  return cleanBody
}

const readAmazonBody = (req: any) => {
  if (req.body?.body && typeof req.body.body === 'object') {
    return stripInternalBodyKeys(req.body.body)
  }
  if (req.body?.request && typeof req.body.request === 'object') {
    return stripInternalBodyKeys(req.body.request)
  }

  return stripInternalBodyKeys(req.body || {})
}

const readPickupWarehouseId = (req: any) => {
  const body = req.body || {}
  const nestedBody =
    body.body && typeof body.body === 'object'
      ? body.body
      : body.request && typeof body.request === 'object'
        ? body.request
        : {}

  return normalize(
    body.pickupId ||
      body.pickup_id ||
      body.warehouseId ||
      body.warehouse_id ||
      nestedBody.pickupId ||
      nestedBody.pickup_id ||
      nestedBody.warehouseId ||
      nestedBody.warehouse_id,
  )
}

const getRequestUserId = (req: any) =>
  normalize(req.user?.sub || req.userId || req.user?.id || req.auth?.sub)

const getAmazonShipFromForPickup = async (req: any) => {
  const pickupId = readPickupWarehouseId(req)
  if (!pickupId) return null

  const userId = getRequestUserId(req)
  if (!userId) throw new HttpError(401, 'User is required to use a saved Amazon warehouse')

  const [warehouse] = await db
    .select({
      pickupId: pickupAddresses.id,
      contactName: addresses.contactName,
      contactPhone: addresses.contactPhone,
      contactEmail: addresses.contactEmail,
      addressLine1: addresses.addressLine1,
      addressLine2: addresses.addressLine2,
      landmark: addresses.landmark,
      addressNickname: addresses.addressNickname,
      city: addresses.city,
      state: addresses.state,
      country: addresses.country,
      pincode: addresses.pincode,
      latitude: addresses.latitude,
      longitude: addresses.longitude,
    })
    .from(pickupAddresses)
    .innerJoin(addresses, eq(pickupAddresses.addressId, addresses.id))
    .where(
      and(
        eq(pickupAddresses.id, pickupId),
        eq(pickupAddresses.userId, userId),
        eq(pickupAddresses.isPickupEnabled, true),
      ),
    )
    .limit(1)

  if (!warehouse) throw new HttpError(404, 'Amazon Shipping pickup warehouse not found or inactive')

  return buildAmazonShippingAddressFromWarehouse({
    alias: warehouse.addressNickname || warehouse.contactName || 'Amazon Warehouse',
    contactName: warehouse.contactName,
    contactPhone: warehouse.contactPhone,
    contactEmail: warehouse.contactEmail,
    addressLine1: warehouse.addressLine1,
    addressLine2: warehouse.addressLine2,
    landmark: warehouse.landmark,
    city: warehouse.city,
    state: warehouse.state,
    country: warehouse.country,
    pincode: warehouse.pincode,
    latitude: warehouse.latitude,
    longitude: warehouse.longitude,
    companyName: warehouse.addressNickname || warehouse.contactName || 'Shiplifi',
  })
}

const readAmazonBodyWithWarehouse = async (req: any) => {
  const body = readAmazonBody(req)
  if (body.shipFrom) return body

  const shipFrom = await getAmazonShipFromForPickup(req)
  return shipFrom ? { ...body, shipFrom } : body
}

const sendProviderError = (res: Response, error: any, fallback: string) =>
  res.status(error?.statusCode || 500).json({
    success: false,
    error: fallback,
    message: error?.message || fallback,
    amazon: error?.details
      ? {
          requestId: error.details.requestId || null,
          rateLimit: error.details.rateLimit || null,
          errors: error.details.errors || undefined,
        }
      : undefined,
  })

export const getAmazonShippingRatesController = async (req: any, res: Response): Promise<any> => {
  try {
    const result = await getAmazonShippingRates(
      await readAmazonBodyWithWarehouse(req),
      await getEffectiveAmazonCredentials(req),
    )
    return res.status(200).json({
      success: true,
      message: 'Amazon Shipping rates fetched successfully',
      amazon: result.amazon,
      data: result.data,
    })
  } catch (error: any) {
    console.error('[AmazonShipping] getRates failed:', error)
    return sendProviderError(res, error, 'Failed to fetch Amazon Shipping rates')
  }
}

export const purchaseAmazonShipmentController = async (req: any, res: Response): Promise<any> => {
  try {
    const result = await purchaseAmazonShipment(
      readAmazonBody(req),
      await getEffectiveAmazonCredentials(req),
    )
    return res.status(200).json({
      success: true,
      message: 'Amazon shipment purchased successfully',
      amazon: result.amazon,
      data: result.data,
    })
  } catch (error: any) {
    console.error('[AmazonShipping] purchaseShipment failed:', error)
    return sendProviderError(res, error, 'Failed to purchase Amazon shipment')
  }
}

export const oneClickAmazonShipmentController = async (req: any, res: Response): Promise<any> => {
  try {
    const result = await oneClickAmazonShipment(
      await readAmazonBodyWithWarehouse(req),
      await getEffectiveAmazonCredentials(req),
    )
    return res.status(200).json({
      success: true,
      message: 'Amazon one-click shipment purchased successfully',
      amazon: result.amazon,
      data: result.data,
    })
  } catch (error: any) {
    console.error('[AmazonShipping] oneClickShipment failed:', error)
    return sendProviderError(res, error, 'Failed to purchase Amazon one-click shipment')
  }
}

export const getAmazonShippingTrackingController = async (req: any, res: Response): Promise<any> => {
  try {
    const result = await getAmazonShippingTracking(
      {
        trackingId: normalize(req.query?.trackingId || req.body?.trackingId),
        carrierId: normalize(req.query?.carrierId || req.body?.carrierId),
      },
      await getEffectiveAmazonCredentials(req),
    )

    return res.status(200).json({
      success: true,
      message: 'Amazon Shipping tracking fetched successfully',
      amazon: result.amazon,
      data: result.data,
    })
  } catch (error: any) {
    console.error('[AmazonShipping] getTracking failed:', error)
    return sendProviderError(res, error, 'Failed to fetch Amazon Shipping tracking')
  }
}

export const getAmazonShipmentDocumentsController = async (req: any, res: Response): Promise<any> => {
  try {
    const result = await getAmazonShipmentDocuments(
      {
        shipmentId: normalize(req.params?.shipmentId || req.query?.shipmentId || req.body?.shipmentId),
        packageClientReferenceId: normalize(
          req.query?.packageClientReferenceId || req.body?.packageClientReferenceId,
        ),
        format: normalize(req.query?.format || req.body?.format),
        dpi: req.query?.dpi || req.body?.dpi,
      },
      await getEffectiveAmazonCredentials(req),
    )

    return res.status(200).json({
      success: true,
      message: 'Amazon shipment documents fetched successfully',
      amazon: result.amazon,
      data: result.data,
    })
  } catch (error: any) {
    console.error('[AmazonShipping] getShipmentDocuments failed:', error)
    return sendProviderError(res, error, 'Failed to fetch Amazon shipment documents')
  }
}

export const cancelAmazonShipmentController = async (req: any, res: Response): Promise<any> => {
  try {
    const result = await cancelAmazonShipment(
      {
        shipmentId: normalize(req.params?.shipmentId || req.query?.shipmentId || req.body?.shipmentId),
      },
      await getEffectiveAmazonCredentials(req),
    )

    return res.status(200).json({
      success: true,
      message: 'Amazon shipment cancelled successfully',
      amazon: result.amazon,
      data: result.data,
    })
  } catch (error: any) {
    console.error('[AmazonShipping] cancelShipment failed:', error)
    return sendProviderError(res, error, 'Failed to cancel Amazon shipment')
  }
}

export const getAmazonAccessPointsController = async (req: any, res: Response): Promise<any> => {
  try {
    const result = await getAmazonAccessPoints(
      {
        accessPointTypes: req.query?.accessPointTypes || req.body?.accessPointTypes,
        countryCode: normalize(req.query?.countryCode || req.body?.countryCode),
        postalCode: normalize(req.query?.postalCode || req.body?.postalCode),
      },
      await getEffectiveAmazonCredentials(req),
    )

    return res.status(200).json({
      success: true,
      message: 'Amazon access points fetched successfully',
      amazon: result.amazon,
      data: result.data,
    })
  } catch (error: any) {
    console.error('[AmazonShipping] getAccessPoints failed:', error)
    return sendProviderError(res, error, 'Failed to fetch Amazon access points')
  }
}

export const submitAmazonNdrFeedbackController = async (req: any, res: Response): Promise<any> => {
  try {
    const result = await submitAmazonNdrFeedback(
      readAmazonBody(req),
      await getEffectiveAmazonCredentials(req),
    )

    res.setHeader('X-Amzn-RequestId', result.amazon.requestId || '')
    if (result.amazon.rateLimit) res.setHeader('X-Amzn-RateLimit-Limit', result.amazon.rateLimit)
    return res.status(204).send()
  } catch (error: any) {
    console.error('[AmazonShipping] submitNdrFeedback failed:', error)
    return sendProviderError(res, error, 'Failed to submit Amazon NDR feedback')
  }
}

export const getAmazonAdditionalInputsController = async (req: any, res: Response): Promise<any> => {
  try {
    const result = await getAmazonAdditionalInputs(
      {
        requestToken: normalize(req.query?.requestToken || req.body?.requestToken),
        rateId: normalize(req.query?.rateId || req.body?.rateId),
      },
      await getEffectiveAmazonCredentials(req),
    )

    return res.status(200).json({
      success: true,
      message: 'Amazon additional inputs schema fetched successfully',
      amazon: result.amazon,
      data: result.data,
    })
  } catch (error: any) {
    console.error('[AmazonShipping] getAdditionalInputs failed:', error)
    return sendProviderError(res, error, 'Failed to fetch Amazon additional inputs schema')
  }
}
