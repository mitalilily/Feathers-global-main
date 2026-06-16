import axios, { type AxiosInstance } from 'axios'
import { HttpError } from '../../../utils/classes'
import {
  ShadowfaxConfig,
  getEffectiveCourierConfig,
} from '../courierCredentials.service'

type ShadowfaxForwardMode = 'marketplace' | 'warehouse'
type ShadowfaxServiceMode = 'regular' | 'surface'

type ShadowfaxServiceabilityResult = {
  serviceable: boolean
  services: string[]
  codAvailable: boolean
  prepaidAvailable: boolean
  tat: number | null
  mode?: ShadowfaxForwardMode
  raw: any
}

const DEFAULT_API_BASE = 'https://dale.shadowfax.in/api'
const DEFAULT_QR_BASE = 'https://saruman.shadowfax.in/api'

const normalizeBase = (value?: string | null, fallback = DEFAULT_API_BASE) =>
  String(value || fallback).trim().replace(/\/+$/, '')

const normalizeForwardMode = (value: unknown): ShadowfaxForwardMode => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (['warehouse', 'wh', 'warehouse_pickup', 'warehouse_forward'].includes(normalized)) {
    return 'warehouse'
  }

  return 'marketplace'
}

const normalizeForwardServiceMode = (value: unknown): ShadowfaxServiceMode | null => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (normalized === 'surface') return 'surface'
  if (normalized === 'regular') return 'regular'
  return null
}

const isShadowfaxReverseReference = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return false

  return (
    normalized.startsWith('r') ||
    normalized.includes('rev') ||
    normalized.includes('return') ||
    normalized.includes('rto')
  )
}

const sanitizePhone = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

const normalizePaymentMode = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'cod' ? 'COD' : 'Prepaid'
}

const normalizePincodeString = (value?: string | number | null) => String(value ?? '').trim()

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (normalized) return normalized
  }
  return ''
}

const isTruthyProviderValue = (value: unknown) => {
  if (value === true || value === 1) return true
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['1', 'true', 'success', 'successful', 'ok', 'yes', 'y', 'available'].includes(normalized)
}

const isFalseyProviderValue = (value: unknown) => {
  if (value === false || value === 0) return true
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['0', 'false', 'no', 'n', 'unavailable', 'not_available'].includes(normalized)
}

const extractServiceabilityRows = (payload: unknown): any[] => {
  const raw = payload as any
  const candidates = [
    raw,
    raw?.data,
    raw?.results,
    raw?.pincodes,
    raw?.serviceability,
    raw?.response,
    raw?.data?.results,
    raw?.data?.pincodes,
    raw?.data?.serviceability,
    raw?.response?.results,
    raw?.response?.pincodes,
    raw?.response?.serviceability,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    if (
      candidate.code ||
      candidate.pincode ||
      candidate.pin ||
      candidate.postal_code ||
      candidate.postalCode ||
      candidate.services ||
      candidate.serviceable !== undefined ||
      candidate.available !== undefined
    ) {
      return [candidate]
    }

    const nestedRows = Object.values(candidate).filter(
      (value) => value && typeof value === 'object',
    )
    if (
      nestedRows.length > 0 &&
      nestedRows.every(
        (value: any) =>
          value.code ||
          value.pincode ||
          value.pin ||
          value.postal_code ||
          value.postalCode ||
          value.services ||
          value.serviceable !== undefined ||
          value.available !== undefined,
      )
    ) {
      return nestedRows
    }
  }

  return []
}

const buildShadowfaxOriginDetails = (params: any) => {
  const pickupName =
    firstNonEmptyString(
      params.pickup?.name,
      params.pickup?.warehouse_name,
      params.pickup?.warehouseName,
      params.pickup_location_id,
      params.pickup_location_alias,
    ) || ''
  const pickupAddressLine1 =
    firstNonEmptyString(
      params.pickup?.address,
      params.pickup?.address_line_1,
      params.pickup?.warehouse_address,
      params.pickup?.warehouseAddress,
    ) || ''
  const pickupAddressLine2 =
    firstNonEmptyString(
      params.pickup?.address_2,
      params.pickup?.address_line_2,
      params.pickup?.warehouse_address_line_2,
      params.pickup?.warehouseAddressLine2,
    ) || ''
  const pickupCity = params.pickup?.city || ''
  const pickupState = params.pickup?.state || ''
  const pickupPincode = Number(params.pickup?.pincode || 0)
  const pickupContact = sanitizePhone(
    firstNonEmptyString(
      params.pickup?.phone,
      params.pickup?.contact,
      params.pickup?.mobile,
      params.pickup?.phone_number,
      params.pickup?.contact_number,
    ),
  )
  const pickupUniqueCode =
    params.pickup_location_id ||
    params.pickup_location_alias ||
    params.pickup?.addressNickname ||
    params.pickup?.warehouse_name ||
    params.pickup?.warehouseName

  return {
    name: pickupName || 'Warehouse',
    contact: pickupContact,
    address_line_1: pickupAddressLine1,
    address_line_2: pickupAddressLine2,
    city: pickupCity,
    state: pickupState,
    pincode: pickupPincode,
    latitude: '',
    longitude: '',
    unique_code: pickupUniqueCode,
  }
}

const findServiceabilityEntry = (payload: unknown, pincode: string | number) => {
  const normalizedPincode = normalizePincodeString(pincode)
  const rows = extractServiceabilityRows(payload)
  if (!Array.isArray(rows)) return null

  return (
    rows.find((entry: any) =>
      [
        entry?.code,
        entry?.pincode,
        entry?.pin,
        entry?.postal_code,
        entry?.postalCode,
      ].some((value) => normalizePincodeString(value) === normalizedPincode),
    ) ||
    (rows.length === 1 ? rows[0] : null)
  )
}

const extractServiceabilityServices = (entry: any): string[] => {
  if (Array.isArray(entry?.services)) {
    return entry.services.map((value: unknown) => String(value || '').trim()).filter(Boolean)
  }

  if (typeof entry?.services === 'string') {
    return entry.services
      .split(',')
      .map((value: string) => value.trim())
      .filter(Boolean)
  }

  for (const value of [entry?.service, entry?.service_type, entry?.serviceType]) {
    if (typeof value === 'string' && value.trim()) return [value.trim()]
  }

  return []
}

const normalizeServiceToken = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const normalizeShadowfaxServiceabilityToken = (value: unknown) => {
  const token = normalizeServiceToken(value)
  if (!token) return ''

  if (token === 'marketplace') return 'seller_pickup'
  if (token === 'dc_pickup') return 'warehouse_pickup'
  if (token === 'large_dc_pickup') return 'large_warehouse_pickup'

  return token
}

const getServiceabilityTokens = (entry: any) =>
  extractServiceabilityServices(entry).map(normalizeShadowfaxServiceabilityToken).filter(Boolean)

const isShadowfaxOriginServiceToken = (token: string) =>
  [
    'seller_pickup',
    'warehouse_pickup',
    'large_seller_pickup',
    'large_warehouse_pickup',
  ].includes(token)

const isShadowfaxDeliveryServiceToken = (token: string) =>
  token === 'customer_delivery' ||
  token.includes('regular') ||
  token.includes('surface') ||
  token.includes('large')

const isServiceabilityEntryAvailable = (entry: any) => {
  if (!entry) return false
  if (extractServiceabilityServices(entry).length > 0) return true

  return [
    entry?.serviceable,
    entry?.is_serviceable,
    entry?.isServiceable,
    entry?.available,
    entry?.is_available,
    entry?.isAvailable,
    entry?.status,
    entry?.success,
  ].some(isTruthyProviderValue)
}

const isCodServiceAvailable = (entry: any) => {
  const serviceSet = new Set(
    extractServiceabilityServices(entry).map((service) => service.toLowerCase()),
  )
  if (serviceSet.has('cod') || serviceSet.has('cash_on_delivery')) return true

  const codFields = [
    entry?.cod,
    entry?.cod_available,
    entry?.codAvailable,
    entry?.cash_on_delivery,
    entry?.cashOnDelivery,
  ].filter(
    (value) => value !== undefined && value !== null && String(value).trim() !== '',
  )

  if (codFields.length > 0) {
    if (codFields.some(isTruthyProviderValue)) return true
    if (codFields.some(isFalseyProviderValue)) return false
  }

  // Some Shadowfax serviceability responses only expose delivery serviceability
  // and do not return a separate COD flag. Do not hide Shadowfax COD rates unless
  // the provider explicitly says COD is unavailable.
  return true
}

const isForwardOriginAvailableForService = (
  entry: any,
  service: ShadowfaxServiceMode | null,
) => {
  if (!isServiceabilityEntryAvailable(entry)) return false
  if (!service) return true

  const services = getServiceabilityTokens(entry)
  if (!services.length) return service === 'regular'

  if (service === 'surface') {
    return services.some((item) => item.includes('surface') || isShadowfaxOriginServiceToken(item))
  }

  return services.some((item) =>
    item.includes('regular') ||
    item.includes('large') ||
    isShadowfaxOriginServiceToken(item),
  )
}

const isForwardDestinationAvailableForService = (
  entry: any,
  service: ShadowfaxServiceMode | null,
) => {
  if (!isServiceabilityEntryAvailable(entry)) return false
  if (!service) return true

  const services = getServiceabilityTokens(entry)
  if (!services.length) return service === 'regular'

  if (service === 'surface') {
    return services.some((item) => item.includes('surface') || isShadowfaxDeliveryServiceToken(item))
  }

  return services.some((item) =>
    item.includes('regular') ||
    item.includes('large') ||
    isShadowfaxDeliveryServiceToken(item),
  )
}

type ShadowfaxForwardServiceabilityAttempt = {
  mode: ShadowfaxForwardMode
  service: ShadowfaxServiceMode | null
  originService: string
  originResp: any
  destinationResp: any
  originEntry: any
  destinationEntry: any
  originAvailable: boolean
  destinationAvailable: boolean
  destinationCodAvailable: boolean
  serviceable: boolean
  destinationServices: string[]
}

const getObjectCandidate = (payload: any) => {
  const data = payload?.data
  if (Array.isArray(data)) return data[0] || {}
  if (data && typeof data === 'object') return data
  return payload && typeof payload === 'object' ? payload : {}
}

const normalizeForwardShipmentResponse = (payload: any) => {
  const candidate = getObjectCandidate(payload)
  const shipment = candidate?.shipment || candidate?.order || candidate?.data || {}
  const awbNumber = firstNonEmptyString(
    candidate?.awb_number,
    candidate?.awb,
    candidate?.AWB,
    candidate?.awb_no,
    candidate?.awbNo,
    candidate?.waybill,
    candidate?.tracking_number,
    shipment?.awb_number,
    shipment?.awb,
    shipment?.AWB,
    shipment?.awb_no,
    shipment?.awbNo,
    shipment?.waybill,
    shipment?.tracking_number,
  )

  if (!awbNumber || !payload || typeof payload !== 'object') return payload
  payload.awb_number = payload.awb_number || awbNumber

  if (Array.isArray(payload.data) && payload.data[0] && typeof payload.data[0] === 'object') {
    payload.data[0].awb_number = payload.data[0].awb_number || awbNumber
  } else if (payload.data && typeof payload.data === 'object') {
    payload.data.awb_number = payload.data.awb_number || awbNumber
  }

  return payload
}

const normalizeReverseShipmentResponse = (payload: any) => {
  const candidate = getObjectCandidate(payload)
  const request = candidate?.request || candidate?.shipment || candidate?.data || {}
  const requestId = firstNonEmptyString(
    candidate?.client_request_id,
    candidate?.request_id,
    candidate?.awb_number,
    candidate?.awb,
    candidate?.AWB,
    request?.client_request_id,
    request?.request_id,
    request?.awb_number,
    request?.awb,
    request?.AWB,
  )

  if (!requestId || !payload || typeof payload !== 'object') return payload
  payload.client_request_id = payload.client_request_id || requestId
  payload.awb_number = payload.awb_number || requestId

  if (Array.isArray(payload.data) && payload.data[0] && typeof payload.data[0] === 'object') {
    payload.data[0].client_request_id = payload.data[0].client_request_id || requestId
    payload.data[0].awb_number = payload.data[0].awb_number || requestId
  } else if (payload.data && typeof payload.data === 'object') {
    payload.data.client_request_id = payload.data.client_request_id || requestId
    payload.data.awb_number = payload.data.awb_number || requestId
  }

  return payload
}

const normalizeReversePickupDetailResponse = (payload: any, requestIds: string[] = []) => {
  if (!payload || typeof payload !== 'object') return payload

  const candidate = getObjectCandidate(payload) || payload
  const responseRows = (() => {
    const directCandidates = [
      candidate?.data,
      candidate?.results,
      candidate?.requests,
      candidate?.pickup_requests,
      candidate?.request_details,
    ]

    for (const entry of directCandidates) {
      if (Array.isArray(entry)) return entry
      if (entry && typeof entry === 'object') return [entry]
    }

    for (const requestId of requestIds) {
      const value = candidate?.[requestId] ?? payload?.[requestId]
      if (Array.isArray(value)) return value
      if (value && typeof value === 'object') return [value]
    }

    return []
  })()

  const normalizedRow = responseRows[0] || candidate
  const requestId = firstNonEmptyString(
    normalizedRow?.client_request_id,
    normalizedRow?.request_id,
    normalizedRow?.awb_number,
    requestIds[0],
  )

  if (requestId) {
    payload.client_request_id = payload.client_request_id || requestId
    payload.request_id = payload.request_id || requestId
    payload.awb_number = payload.awb_number || requestId
  }

  if (normalizedRow && typeof normalizedRow === 'object') {
    payload.data = responseRows.length <= 1 ? normalizedRow : responseRows
  }

  return payload
}

const normalizeShadowfaxOrderDetailsResponse = (payload: any) => {
  if (!payload || typeof payload !== 'object') return payload

  const candidate = getObjectCandidate(payload)
  const orderDetails = candidate?.order_details || candidate?.data?.order_details || {}
  const trackingDetails =
    candidate?.tracking_details || candidate?.data?.tracking_details || payload?.tracking_details || []
  const trackingRows = Array.isArray(trackingDetails) ? trackingDetails : [trackingDetails]
  const latestTracking = trackingRows[trackingRows.length - 1] || {}
  const awbNumber = firstNonEmptyString(
    candidate?.awb_number,
    candidate?.awb,
    candidate?.AWB,
    orderDetails?.awb_number,
    orderDetails?.awb,
    latestTracking?.awb_number,
  )
  const status = firstNonEmptyString(
    orderDetails?.status,
    candidate?.status,
    candidate?.current_status,
    latestTracking?.status_id,
    latestTracking?.status,
  )
  const statusDisplay = firstNonEmptyString(
    orderDetails?.status_display,
    candidate?.status_display,
    latestTracking?.status,
    status,
  )
  const qcSnapshot = (() => {
    const rawStatus = firstNonEmptyString(
      candidate?.qc_status,
      candidate?.data?.qc_status,
      orderDetails?.qc_status,
      latestTracking?.qc_status,
    )
    const rawRemarks = firstNonEmptyString(
      candidate?.qc_remarks,
      candidate?.data?.qc_remarks,
      orderDetails?.qc_remarks,
      latestTracking?.qc_remarks,
    )
    const rawPicked = firstNonEmptyString(
      candidate?.picked,
      candidate?.data?.picked,
      orderDetails?.picked,
      latestTracking?.picked,
    )
    const rawImages =
      candidate?.qc_images ||
      candidate?.data?.qc_images ||
      orderDetails?.qc_images ||
      latestTracking?.qc_images ||
      null

    return {
      status: rawStatus || null,
      remarks: rawRemarks || null,
      picked: rawPicked || null,
      images: rawImages || null,
    }
  })()

  if (awbNumber) {
    payload.awb_number = payload.awb_number || awbNumber
  }
  if (status) {
    payload.status = payload.status || status
  }
  if (statusDisplay) {
    payload.status_display = payload.status_display || statusDisplay
  }

  const normalizedData =
    payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data
      : {}
  if (awbNumber) normalizedData.awb_number = normalizedData.awb_number || awbNumber
  if (status) normalizedData.status = normalizedData.status || status
  if (statusDisplay) normalizedData.status_display = normalizedData.status_display || statusDisplay
  normalizedData.order_details = normalizedData.order_details || orderDetails
  normalizedData.tracking_details = normalizedData.tracking_details || trackingRows
  normalizedData.shadowfax_qc = normalizedData.shadowfax_qc || qcSnapshot
  if (qcSnapshot.status) normalizedData.qc_status = normalizedData.qc_status || qcSnapshot.status
  if (qcSnapshot.remarks) normalizedData.qc_remarks = normalizedData.qc_remarks || qcSnapshot.remarks
  if (qcSnapshot.images) normalizedData.qc_images = normalizedData.qc_images || qcSnapshot.images
  payload.data = normalizedData

  return payload
}

const normalizeShadowfaxCancelResponse = (payload: any) => {
  if (!payload || typeof payload !== 'object') return payload

  const responseCode = Number(
    payload?.responseCode ??
      payload?.code ??
      payload?.statusCode ??
      payload?.data?.responseCode ??
      payload?.data?.code ??
      0,
  )
  const message = firstNonEmptyString(
    payload?.responseMsg,
    payload?.message,
    payload?.detail,
    payload?.data?.responseMsg,
    payload?.data?.message,
  )

  if (message) {
    payload.message = payload.message || message
  }
  if (Number.isFinite(responseCode) && responseCode > 0) {
    payload.responseCode = payload.responseCode || responseCode
  }

  return payload
}

const normalizeShadowfaxEscalationResponse = (payload: any) => {
  if (!payload || typeof payload !== 'object') return payload

  const message = firstNonEmptyString(
    payload?.message,
    payload?.responseMsg,
    payload?.detail,
    payload?.data?.message,
    payload?.data?.responseMsg,
  )
  const status = firstNonEmptyString(
    payload?.status,
    payload?.responseCode,
    payload?.data?.status,
    payload?.data?.responseCode,
  )

  if (message) payload.message = payload.message || message
  if (status) payload.status = payload.status || status
  return payload
}

const normalizeShadowfaxPodResponse = (payload: any) => {
  if (!payload || typeof payload !== 'object') return payload

  const podDetails =
    payload?.pod_details ||
    payload?.data?.pod_details ||
    payload?.data ||
    payload?.response?.pod_details ||
    null

  if (podDetails && typeof podDetails === 'object') {
    payload.pod_details = payload.pod_details || podDetails
  }

  return payload
}

const hasMeaningfulValue = (value: unknown) => {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  return String(value).trim().length > 0
}

const buildShadowfaxOrderUpdateSection = (
  source: Record<string, any>,
  fieldMap: Record<string, string[]>,
) => {
  const section: Record<string, any> = {}
  for (const [targetKey, aliases] of Object.entries(fieldMap)) {
    for (const alias of aliases) {
      const value = source?.[alias]
      if (hasMeaningfulValue(value)) {
        section[targetKey] = targetKey.toLowerCase().includes('contact')
          ? sanitizePhone(value)
          : value
        break
      }
    }
  }
  return Object.keys(section).length > 0 ? section : null
}

const buildShadowfaxOrderUpdatePayload = (params: any) => {
  const source = params && typeof params === 'object' ? params : {}
  const awbNumber = firstNonEmptyString(
    source.awb_number,
    source.awb,
    source.order?.awb_number,
    source.order?.awb,
    source.order?.provider_request_id,
    source.order?.provider_reference,
  )

  const deliverySource = {
    ...(source.delivery_details || {}),
    contact: source.delivery_details?.contact || source.contact,
    alternate_contact: source.delivery_details?.alternate_contact || source.alternate_contact,
    customer_address:
      source.delivery_details?.customer_address ||
      source.delivery_details?.address_line_1 ||
      source.delivery_details?.address ||
      source.customer_address ||
      source.address_line_1 ||
      source.address,
    pincode: source.delivery_details?.pincode || source.delivery_pincode || source.pincode,
    latitude: source.delivery_details?.latitude || source.latitude,
    longitude: source.delivery_details?.longitude || source.longitude,
  }

  const pickupSource = {
    ...(source.pickup_details || {}),
    contact: source.pickup_details?.contact || source.pickup_contact,
    alternate_contact: source.pickup_details?.alternate_contact || source.pickup_alternate_contact,
    customer_address:
      source.pickup_details?.customer_address ||
      source.pickup_details?.address_line_1 ||
      source.pickup_details?.address ||
      source.pickup_address ||
      source.address_line_1,
    pincode: source.pickup_details?.pincode || source.pickup_pincode,
    latitude: source.pickup_details?.latitude || source.pickup_latitude,
    longitude: source.pickup_details?.longitude || source.pickup_longitude,
  }

  const returnSource = {
    ...(source.return_details || {}),
    contact: source.return_details?.contact || source.return_contact,
    email: source.return_details?.email || source.return_email,
    return_address:
      source.return_details?.return_address ||
      source.return_details?.customer_address ||
      source.return_details?.address_line_1 ||
      source.return_details?.address ||
      source.return_address ||
      source.address_line_1,
    pincode: source.return_details?.pincode || source.return_pincode,
    latitude: source.return_details?.latitude || source.return_latitude,
    longitude: source.return_details?.longitude || source.return_longitude,
    capture_delivery_image:
      source.return_details?.capture_delivery_image ?? source.capture_delivery_image,
  }

  const orderSource = {
    ...(source.order_details || {}),
    cod_amount: source.order_details?.cod_amount ?? source.cod_amount,
    eway_bill_number: source.order_details?.eway_bill_number ?? source.eway_bill_number,
    invoice_number: source.order_details?.invoice_number ?? source.invoice_number,
    return_eway_bill_number:
      source.order_details?.return_eway_bill_number ?? source.return_eway_bill_number,
    actual_weight: source.order_details?.actual_weight ?? source.actual_weight,
    volumetric_weight: source.order_details?.volumetric_weight ?? source.volumetric_weight,
  }

  const statusValue =
    source.status_update?.status ??
    source.status ??
    source.order_status ??
    source.order_details?.status ??
    null

  const payload: Record<string, any> = {
    awb_number: awbNumber || source.awb_number || source.awb || undefined,
  }

  const deliveryDetails = buildShadowfaxOrderUpdateSection(deliverySource, {
    contact: ['contact', 'phone', 'phone_number', 'mobile'],
    alternate_contact: ['alternate_contact', 'alternatePhone', 'alternate_phone', 'alt_contact'],
    customer_address: ['customer_address', 'address_line_1', 'address', 'delivery_address'],
    pincode: ['pincode', 'delivery_pincode'],
    latitude: ['latitude'],
    longitude: ['longitude'],
    email: ['email'],
  })
  const pickupDetails = buildShadowfaxOrderUpdateSection(pickupSource, {
    contact: ['contact', 'phone', 'phone_number', 'mobile'],
    alternate_contact: ['alternate_contact', 'alternatePhone', 'alternate_phone', 'alt_contact'],
    customer_address: ['customer_address', 'address_line_1', 'address', 'pickup_address'],
    pincode: ['pincode', 'pickup_pincode'],
    latitude: ['latitude'],
    longitude: ['longitude'],
    email: ['email'],
  })
  const returnDetails = buildShadowfaxOrderUpdateSection(returnSource, {
    contact: ['contact', 'phone', 'phone_number', 'mobile'],
    alternate_contact: ['alternate_contact', 'alternatePhone', 'alternate_phone', 'alt_contact'],
    return_address: ['return_address', 'customer_address', 'address_line_1', 'address'],
    pincode: ['pincode', 'return_pincode'],
    latitude: ['latitude'],
    longitude: ['longitude'],
    email: ['email'],
    capture_delivery_image: ['capture_delivery_image'],
  })
  const orderDetails = buildShadowfaxOrderUpdateSection(orderSource, {
    cod_amount: ['cod_amount'],
    eway_bill_number: ['eway_bill_number', 'ewaybill_number', 'ewb', 'ewbn'],
    invoice_number: ['invoice_number', 'invoice_no'],
    return_eway_bill_number: ['return_eway_bill_number'],
    actual_weight: ['actual_weight', 'weight'],
    volumetric_weight: ['volumetric_weight', 'volumetricWeight'],
  })

  if (deliveryDetails) payload.delivery_details = deliveryDetails
  if (pickupDetails) payload.pickup_details = pickupDetails
  if (returnDetails) payload.return_details = returnDetails
  if (orderDetails) payload.order_details = orderDetails
  if (hasMeaningfulValue(statusValue) || Object.prototype.hasOwnProperty.call(source, 'status_update')) {
    payload.status_update = { status: statusValue ?? null }
  }

  return payload
}

const buildShadowfaxReverseOrderUpdatePayload = (params: any) => {
  const source = params && typeof params === 'object' ? params : {}
  const reference = firstNonEmptyString(
    source.request_id,
    source.client_request_id,
    source.awb_number,
    source.order?.provider_request_id,
    source.order?.provider_reference,
    source.order?.awb_number,
  )

  const customerDetailsSource = {
    ...(source.customer_details || {}),
    ...(source.pickup_details || {}),
    contact:
      source.customer_details?.contact ||
      source.pickup_details?.contact ||
      source.contact ||
      source.alternate_contact,
    alternate_contact:
      source.customer_details?.alternate_contact ||
      source.pickup_details?.alternate_contact ||
      source.alternate_contact ||
      source.contact,
    customer_address:
      source.customer_details?.customer_address ||
      source.customer_details?.address ||
      source.customer_details?.address_line_1 ||
      source.pickup_details?.customer_address ||
      source.pickup_details?.address ||
      source.pickup_details?.address_line_1 ||
      source.customer_address ||
      source.address ||
      source.address_line_1,
    pincode:
      source.customer_details?.pincode ||
      source.pickup_details?.pincode ||
      source.pincode,
    latitude:
      source.customer_details?.latitude ||
      source.pickup_details?.latitude ||
      source.latitude,
    longitude:
      source.customer_details?.longitude ||
      source.pickup_details?.longitude ||
      source.longitude,
  }

  const payload: Record<string, any> = {
    request_id: reference || source.request_id || undefined,
    client_request_id: reference || source.client_request_id || undefined,
    awb_number: reference || source.awb_number || undefined,
  }

  if (hasMeaningfulValue(source.action)) {
    payload.action = source.action
  }

  const pickupDetails = buildShadowfaxOrderUpdateSection(customerDetailsSource, {
    contact: ['contact', 'phone', 'phone_number', 'mobile'],
    alternate_contact: ['alternate_contact', 'alternatePhone', 'alternate_phone', 'alt_contact'],
    customer_address: ['customer_address', 'address_line_1', 'address', 'delivery_address'],
    pincode: ['pincode'],
    latitude: ['latitude'],
    longitude: ['longitude'],
    email: ['email'],
  })

  if (pickupDetails) {
    payload.pickup_details = pickupDetails
  }

  if (source.order_details && typeof source.order_details === 'object') {
    const reverseOrderDetails = buildShadowfaxOrderUpdateSection(source.order_details, {
      cod_amount: ['cod_amount'],
      payment_mode: ['payment_mode'],
      eway_bill_number: ['eway_bill_number', 'ewaybill_number', 'ewb', 'ewbn'],
      invoice_number: ['invoice_number', 'invoice_no'],
      return_eway_bill_number: ['return_eway_bill_number'],
      actual_weight: ['actual_weight', 'weight'],
      volumetric_weight: ['volumetric_weight', 'volumetricWeight'],
    })
    if (reverseOrderDetails) payload.order_details = reverseOrderDetails
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'status') || payload.status === undefined) {
    payload.status = null
  }

  return payload
}

const normalizeBoolString = (value: unknown, fallback = 'False') => {
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) return 'True'
  if (['false', '0', 'no', 'n'].includes(normalized)) return 'False'
  return fallback
}

const parseShadowfaxError = (error: any, fallback: string) => {
  const responseData = error?.response?.data
  const responseMessage = responseData?.message
  const responseMsg = responseData?.responseMsg
  const nestedErrors = responseData?.errors
  const nestedDetail = responseData?.detail

  const providerMessage =
    (typeof responseMessage === 'string' &&
    ['failure', 'failed', 'error'].includes(responseMessage.trim().toLowerCase())
      ? responseMsg || nestedErrors || nestedDetail || responseMessage
      : responseMessage || responseMsg || nestedErrors || nestedDetail) ||
    error?.message ||
    fallback

  if (Array.isArray(providerMessage)) {
    return providerMessage.map((item) => String(item)).join(', ')
  }
  if (typeof providerMessage === 'object' && providerMessage) {
    return JSON.stringify(providerMessage)
  }
  return String(providerMessage || fallback)
}

const extractShadowfaxProviderFailure = (payload: any) => {
  if (!payload || typeof payload !== 'object') return null

  const message = String(payload?.message || '').trim()
  const errors = payload?.errors ?? payload?.error ?? payload?.detail ?? payload?.responseMsg
  const failed =
    payload?.success === false ||
    payload?.status === false ||
    ['failure', 'failed', 'error'].includes(message.toLowerCase()) ||
    (errors !== undefined && errors !== null && String(errors).trim().length > 0)

  if (!failed) return null

  if (Array.isArray(errors)) return errors.map((item) => String(item)).join(', ')
  if (errors && typeof errors === 'object') return JSON.stringify(errors)
  return String(errors || message || 'Shadowfax rejected the shipment request')
}

export class ShadowfaxService {
  private static cachedConfig: ShadowfaxConfig | null | undefined
  private apiBase = DEFAULT_API_BASE
  private qrBase = DEFAULT_QR_BASE
  private apiToken = process.env.SHADOWFAX_API_TOKEN || process.env.SHADOWFAX_API_KEY || ''
  private clientName = process.env.SHADOWFAX_CLIENT_NAME || ''
  private webhookSecret = process.env.SHADOWFAX_WEBHOOK_SECRET || ''

  static clearCachedConfig() {
    ShadowfaxService.cachedConfig = undefined
  }

  private async ensureConfigLoaded() {
    if (ShadowfaxService.cachedConfig === undefined) {
      ShadowfaxService.cachedConfig = await getEffectiveCourierConfig<ShadowfaxConfig>(
        'shadowfax',
        'b2c',
      )
    }

    const cfg = ShadowfaxService.cachedConfig
    if (cfg) {
      const resolvedApiBase = normalizeBase(
        process.env.SHADOWFAX_API_BASE || cfg.apiBase,
        this.apiBase,
      )
      this.apiBase = resolvedApiBase
      this.qrBase = normalizeBase(
        process.env.SHADOWFAX_QR_BASE || resolvedApiBase,
        this.qrBase,
      ).replace(/\/dale(\.staging)?/i, (m) =>
        m.includes('staging') ? '/saruman.staging' : '/saruman',
      )
      this.apiToken = process.env.SHADOWFAX_API_TOKEN || process.env.SHADOWFAX_API_KEY || cfg.apiToken || this.apiToken
      this.clientName = process.env.SHADOWFAX_CLIENT_NAME || cfg.clientName || this.clientName
      this.webhookSecret = process.env.SHADOWFAX_WEBHOOK_SECRET || cfg.webhookSecret || this.webhookSecret
    } else {
      this.apiBase = normalizeBase(process.env.SHADOWFAX_API_BASE, this.apiBase)
      this.qrBase = normalizeBase(process.env.SHADOWFAX_QR_BASE, this.qrBase)
    }
  }

  get configuredWebhookSecret() {
    return this.webhookSecret
  }

  private logRequest(stage: 'request' | 'response' | 'error', method: string, path: string, meta?: any) {
    const payload = {
      provider: 'shadowfax',
      stage,
      method,
      path,
      ...(meta && typeof meta === 'object' ? meta : {}),
    }

    if (stage === 'error') {
      console.error('[Shadowfax]', payload)
      return
    }

    console.log('[Shadowfax]', payload)
  }

  private async client(baseURL?: string): Promise<AxiosInstance> {
    await this.ensureConfigLoaded()
    if (!this.apiToken) {
      throw new HttpError(
        400,
        'Shadowfax API token is not configured. Save the Shadowfax API key in courier credentials or set SHADOWFAX_API_TOKEN.',
      )
    }

    return axios.create({
      baseURL: baseURL || this.apiBase,
      timeout: 30000,
      headers: {
        Authorization: `Token ${this.apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  private async get<T = any>(path: string, params?: Record<string, any>, baseURL?: string): Promise<T> {
    try {
      this.logRequest('request', 'GET', path, { params: params || null })
      const http = await this.client(baseURL)
      const response = await http.get(path, { params })
      this.logRequest('response', 'GET', path, { status: response.status })
      return response.data as T
    } catch (error: any) {
      const statusCode = error?.statusCode || error?.response?.status || 502
      this.logRequest('error', 'GET', path, {
        status: statusCode,
        message: parseShadowfaxError(error, 'Shadowfax GET request failed'),
      })
      throw new HttpError(statusCode, parseShadowfaxError(error, 'Shadowfax GET request failed'))
    }
  }

  private async post<T = any>(path: string, data?: Record<string, any>, baseURL?: string): Promise<T> {
    try {
      this.logRequest('request', 'POST', path, { bodyKeys: Object.keys(data || {}) })
      const http = await this.client(baseURL)
      const response = await http.post(path, data || {})
      this.logRequest('response', 'POST', path, { status: response.status })
      return response.data as T
    } catch (error: any) {
      const statusCode = error?.statusCode || error?.response?.status || 502
      const providerMessage = parseShadowfaxError(error, 'Shadowfax POST request failed')
      this.logRequest('error', 'POST', path, {
        status: statusCode,
        message: providerMessage,
        responseData: error?.response?.data || null,
      })
      const httpError: any = new HttpError(statusCode, providerMessage)
      httpError.response = {
        status: error?.response?.status || null,
        data: error?.response?.data || null,
      }
      throw httpError
    }
  }

  private async put<T = any>(path: string, data?: Record<string, any>): Promise<T> {
    try {
      this.logRequest('request', 'PUT', path, { bodyKeys: Object.keys(data || {}) })
      const http = await this.client()
      const response = await http.put(path, data || {})
      this.logRequest('response', 'PUT', path, { status: response.status })
      return response.data as T
    } catch (error: any) {
      const statusCode = error?.statusCode || error?.response?.status || 502
      this.logRequest('error', 'PUT', path, {
        status: statusCode,
        message: parseShadowfaxError(error, 'Shadowfax PUT request failed'),
      })
      throw new HttpError(statusCode, parseShadowfaxError(error, 'Shadowfax PUT request failed'))
    }
  }

  async listServiceablePincodes(service: string, pincodes: Array<string | number>) {
    const joined = pincodes.map((value) => String(value).trim()).filter(Boolean).join(',')
    return this.get<any[]>('/v1/clients/serviceability/', {
      service,
      page: 1,
      count: Math.max(1, pincodes.length || 1),
      pincodes: joined,
    })
  }

  async checkForwardServiceability(params: {
    origin: string
    destination: string
    paymentType?: string | null
    mode?: ShadowfaxForwardMode | string
    service?: ShadowfaxServiceMode | string | null
  }): Promise<ShadowfaxServiceabilityResult> {
    const requestedPayment = String(params.paymentType || 'prepaid').trim().toLowerCase()
    const requestedMode = normalizeForwardMode(params.mode)
    const requestedService = normalizeForwardServiceMode(params.service)
    const candidateModes: ShadowfaxForwardMode[] =
      requestedMode === 'warehouse' ? ['warehouse', 'marketplace'] : ['marketplace', 'warehouse']

    const attemptMode = async (
      forwardMode: ShadowfaxForwardMode,
    ): Promise<ShadowfaxForwardServiceabilityAttempt> => {
      const originService = forwardMode === 'warehouse' ? 'warehouse_pickup' : 'seller_pickup'
      const [originResp, destinationResp] = await Promise.all([
        this.listServiceablePincodes(originService, [params.origin]),
        this.listServiceablePincodes('customer_delivery', [params.destination]),
      ])

      const originEntry = findServiceabilityEntry(originResp, params.origin)
      const destinationEntry = findServiceabilityEntry(destinationResp, params.destination)
      const destinationServices = extractServiceabilityServices(destinationEntry)
      const originAvailable = isForwardOriginAvailableForService(originEntry, requestedService)
      const destinationAvailable = isForwardDestinationAvailableForService(
        destinationEntry,
        requestedService,
      )
      const destinationCodAvailable = isCodServiceAvailable(destinationEntry)
      const serviceable =
        originAvailable &&
        destinationAvailable &&
        (requestedPayment !== 'cod' || destinationCodAvailable)

      console.log('[Shadowfax] Forward serviceability resolution', {
        origin: params.origin,
        destination: params.destination,
        mode: forwardMode,
        service: requestedService,
        originService,
        originAvailable,
        destinationAvailable,
        destinationCodAvailable,
        originEntry,
        destinationEntry,
        originResp,
        destinationResp,
      })

      return {
        mode: forwardMode,
        service: requestedService,
        originService,
        originResp,
        destinationResp,
        originEntry,
        destinationEntry,
        originAvailable,
        destinationAvailable,
        destinationCodAvailable,
        serviceable,
        destinationServices,
      }
    }

    const attempts: ShadowfaxForwardServiceabilityAttempt[] = []
    for (const mode of candidateModes) {
      const attempt = await attemptMode(mode)
      attempts.push(attempt)
      if (attempt.serviceable) {
        return {
          serviceable: true,
          services: attempt.destinationServices,
          codAvailable: attempt.destinationCodAvailable,
          prepaidAvailable: true,
          tat: null,
          mode: attempt.mode,
          raw: { attempts, selected: attempt.mode },
        }
      }
    }

    const fallbackAttempt = attempts[0]

    return {
      serviceable: false,
      services: fallbackAttempt?.destinationServices || [],
      codAvailable: false,
      prepaidAvailable: false,
      tat: null,
      mode: fallbackAttempt?.mode || requestedMode,
      raw: { attempts, selected: null },
    }
  }

  async checkReverseServiceability(params: { origin: string; destination: string }): Promise<ShadowfaxServiceabilityResult> {
    const [originResp, destinationResp] = await Promise.all([
      this.listServiceablePincodes('customer_pickup', [params.origin]),
      this.listServiceablePincodes('warehouse_return', [params.destination]),
    ])

    const originEntry = findServiceabilityEntry(originResp, params.origin)
    const destinationEntry = findServiceabilityEntry(destinationResp, params.destination)
    const originAvailable = isServiceabilityEntryAvailable(originEntry)
    const destinationAvailable = isServiceabilityEntryAvailable(destinationEntry)
    const serviceable = originAvailable && destinationAvailable

    console.log('[Shadowfax] Reverse serviceability resolution', {
      origin: params.origin,
      destination: params.destination,
      originAvailable,
      destinationAvailable,
      originEntry,
      destinationEntry,
      originResp,
      destinationResp,
    })

    return {
      serviceable,
      services: extractServiceabilityServices(originEntry),
      codAvailable: false,
      prepaidAvailable: serviceable,
      tat: null,
      raw: { origin: originResp, destination: destinationResp },
    }
  }

  async generateForwardAwb(count = 1) {
    return this.post('/v3/clients/generate_marketplace_awb/', { count })
  }

  async generateReverseAwb(count = 1) {
    return this.post('/v3/clients/orders/generate_awb/', { count })
  }

  private buildForwardPayload(params: any, mode: ShadowfaxForwardMode, service: ShadowfaxServiceMode) {
    const paymentMode = normalizePaymentMode(params.payment_type)
    const orderItems = Array.isArray(params.order_items) ? params.order_items : []
    const totalProductValue = orderItems.reduce((sum: number, item: any) => {
      const qty = Number(item?.qty ?? item?.quantity ?? 1)
      const price = Number(item?.price ?? 0)
      return sum + price * qty
    }, 0)
    const totalTax = orderItems.reduce((sum: number, item: any) => {
      const qty = Number(item?.qty ?? item?.quantity ?? 1)
      const price = Number(item?.price ?? 0)
      const discount = Number(item?.discount ?? 0)
      const taxRate = Number(item?.tax_rate ?? 0)
      return sum + Math.max(0, price * qty - discount) * (taxRate / 100)
    }, 0)

    const originDetails = buildShadowfaxOriginDetails(params)

    return {
      order_type: mode,
      order_details: {
        client_order_id: params.order_number,
        awb_number: params.awb_number || undefined,
        actual_weight: Number(params.package_weight ?? params.weight ?? 0),
        volumetric_weight: Number(params.volumetricWeight ?? 0),
        product_value: Number(totalProductValue || params.order_amount || 0),
        payment_mode: paymentMode,
        cod_amount: paymentMode === 'COD' ? Number(params.order_amount ?? 0) : 0,
        promised_delivery_date: params.preferred_dispatch_date || undefined,
        total_amount: Number(params.order_amount ?? totalProductValue + totalTax),
        eway_bill:
          params.ewbn ||
          params.ewb ||
          params.ewbn_number ||
          params.ewaybill_number ||
          undefined,
        gstin_number: params.company?.gst || params.pickup?.gst_number || undefined,
        order_service: service,
      },
      customer_details: {
        name:
          firstNonEmptyString(
            params.consignee?.name,
            params.consignee?.full_name,
            params.consignee?.contact_name,
          ) || undefined,
        contact: sanitizePhone(
          firstNonEmptyString(
            params.consignee?.phone,
            params.consignee?.contact,
            params.consignee?.mobile,
            params.consignee?.phone_number,
          ),
        ),
        address_line_1:
          firstNonEmptyString(
            params.consignee?.address,
            params.consignee?.address_line_1,
            params.consignee?.delivery_address,
          ) || undefined,
        address_line_2: firstNonEmptyString(
          params.consignee?.address_2,
          params.consignee?.address_line_2,
          params.consignee?.delivery_address_2,
        ),
        city: params.consignee?.city || params.consignee?.town || undefined,
        state: params.consignee?.state || params.consignee?.province || undefined,
        pincode: Number(params.consignee?.pincode),
        alternate_contact: sanitizePhone(
          firstNonEmptyString(
            params.consignee?.alternate_contact,
            params.consignee?.alternatePhone,
            params.consignee?.phone,
            params.consignee?.contact,
          ),
        ),
        latitude: '',
        longitude: '',
        ...(mode === 'warehouse' ? { location_type: params.address_type || 'residential' } : {}),
      },
      pickup_details: {
        ...originDetails,
      },
      ...(mode === 'warehouse'
        ? {
            warehouse_name: originDetails.name,
            warehouse_address: originDetails.address_line_1,
            warehouse_address_line_2: originDetails.address_line_2,
            warehouse_city: originDetails.city,
            warehouse_state: originDetails.state,
            warehouse_pincode: originDetails.pincode,
            warehouse_contact: originDetails.contact,
            warehouse_contact_number: originDetails.contact,
            warehouse_unique_code: originDetails.unique_code,
            warehouse_details: {
              ...originDetails,
              warehouse_name: originDetails.name,
              warehouse_address: originDetails.address_line_1,
            },
            origin_details: {
              ...originDetails,
              location_type: 'warehouse',
            },
          }
        : {}),
      rto_details: {
        name:
          firstNonEmptyString(
            params.rto?.name,
            params.rto?.warehouse_name,
            params.pickup?.name,
            params.pickup?.warehouse_name,
          ) || 'RTO',
        contact: sanitizePhone(
          firstNonEmptyString(
            params.rto?.phone,
            params.rto?.contact,
            params.pickup?.phone,
            params.pickup?.contact,
          ),
        ),
        address_line_1:
          firstNonEmptyString(
            params.rto?.address,
            params.rto?.address_line_1,
            params.pickup?.address,
            params.pickup?.address_line_1,
          ) || undefined,
        address_line_2: firstNonEmptyString(
          params.rto?.address_2,
          params.rto?.address_line_2,
          params.pickup?.address_2,
          params.pickup?.address_line_2,
        ),
        city: params.rto?.city || params.pickup?.city || undefined,
        state: params.rto?.state || params.pickup?.state || undefined,
        pincode: Number(params.rto?.pincode || params.pickup?.pincode),
        email: params.rto?.email || params.consignee?.email || undefined,
        latitude: '',
        longitude: '',
        unique_code:
          params.return_location_alias ||
          params.rto?.addressNickname ||
          params.pickup_location_id ||
          params.pickup?.warehouse_name ||
          params.pickup?.warehouseName,
      },
      product_details: orderItems.map((item: any) => {
        const qty = Number(item?.qty ?? item?.quantity ?? 1)
        const price = Number(item?.price ?? 0)
        const taxRate = Number(item?.tax_rate ?? 0)
        const taxAmount = Number(((price * qty) * (taxRate / 100)).toFixed(2))
        return {
          hsn_code: item?.hsn || item?.hsnCode || '',
          invoice_no: params.invoice_number || '',
          sku_name: item?.name || 'Item',
          sku_id: item?.sku || '',
          category: '',
          price,
          seller_details: {
            seller_name:
              firstNonEmptyString(
                params.company?.name,
                params.pickup?.warehouse_name,
                params.pickup?.warehouseName,
              ) || '',
            seller_address:
              firstNonEmptyString(
                params.pickup?.address,
                params.pickup?.address_line_1,
                params.pickup?.warehouse_address,
              ) || '',
            seller_state: params.pickup?.state || '',
            gstin_number: params.company?.gst || params.pickup?.gst_number || '',
          },
          taxes: {
            cgst: taxRate > 0 ? taxAmount / 2 : 0,
            sgst: taxRate > 0 ? taxAmount / 2 : 0,
            igst: 0,
            total_tax: taxAmount,
          },
          additional_details: {
            requires_extra_care: normalizeBoolString(params.fragile_shipment, 'False'),
            type_extra_care: params.fragile_shipment ? 'Fragile' : '',
            quantity: qty,
          },
        }
      }),
    }
  }

  async createForwardShipment(params: any, options: { mode: ShadowfaxForwardMode; service?: ShadowfaxServiceMode }) {
    const service = options.service || 'surface'
    const payload = this.buildForwardPayload(params, options.mode, service)
    console.log('[Shadowfax] Forward booking payload', {
      order_number: params.order_number,
      mode: options.mode,
      service,
      pickup_details: payload.pickup_details,
      warehouse_details: (payload as any).warehouse_details || null,
      origin_details: (payload as any).origin_details || null,
      customer_details: payload.customer_details,
      rto_details: payload.rto_details,
    })
    const response = await this.post('/v3/clients/orders/', payload)
    const providerFailure = extractShadowfaxProviderFailure(response)
    if (providerFailure) {
      throw new HttpError(400, providerFailure)
    }
    return normalizeForwardShipmentResponse(response)
  }

  private buildReversePayload(params: any) {
    const orderItems = Array.isArray(params.order_items) ? params.order_items : []
    return {
      client_order_number: params.order_number,
      client_request_id: params.order_number,
      warehouse_name: params.pickup?.warehouse_name || this.clientName || 'Warehouse',
      warehouse_address: params.pickup?.address || '',
      destination_pincode: Number(params.rto?.pincode || params.pickup?.pincode),
      unique_code:
        params.return_location_alias ||
        params.pickup_location_id ||
        params.pickup?.addressNickname ||
        params.pickup?.warehouse_name,
      total_amount: Number(params.order_amount ?? 0),
      price: Number(params.order_amount ?? 0),
      eway_bill:
        params.ewbn ||
        params.ewb ||
        params.ewbn_number ||
        params.ewaybill_number ||
        undefined,
      pickup_type: params.transport_speed === 'surface' ? 'surface' : 'regular',
      address_attributes: {
        address_line: params.consignee?.address,
        city: params.consignee?.city,
        country: params.consignee?.country || 'India',
        pincode: Number(params.consignee?.pincode),
        name: params.consignee?.name,
        phone_number: sanitizePhone(params.consignee?.phone),
        alternate_contact: sanitizePhone(params.consignee?.phone),
        sms_contact: sanitizePhone(params.consignee?.phone),
        latitude: '',
        longitude: '',
        location_accuracy: 'L',
        location_type: params.address_type || 'residential',
      },
      weight_details: {
        actual_weight: Number(params.package_weight ?? params.weight ?? 0),
        volumetric_weight: Number(params.volumetricWeight ?? 0),
      },
      skus_attributes: orderItems.map((item: any) => {
        const qty = Number(item?.qty ?? item?.quantity ?? 1)
        const price = Number(item?.price ?? 0)
        const taxRate = Number(item?.tax_rate ?? 0)
        const totalTaxAmount = Number(((price * qty) * (taxRate / 100)).toFixed(2))
        return {
          name: item?.name || 'Item',
          client_sku_id: item?.sku || '',
          price,
          brand: '',
          category: '',
          return_reason: '',
          qc_required: normalizeBoolString(params.qc_details?.required ?? true, 'True').toLowerCase(),
          qc_rules: Array.isArray(params.qc_details?.rules) ? params.qc_details.rules : [],
          seller_details: {
            regd_name: params.company?.name || params.pickup?.warehouse_name || 'Seller',
            regd_address: params.pickup?.address || '',
            state: params.pickup?.state || '',
            gstin: params.company?.gst || params.pickup?.gst_number || '',
          },
          taxes: {
            cgst_amount: taxRate > 0 ? totalTaxAmount / 2 : 0,
            sgst_amount: taxRate > 0 ? totalTaxAmount / 2 : 0,
            igst_amount: 0,
            total_tax_amount: totalTaxAmount,
          },
          hsn_code: item?.hsn || item?.hsnCode || '',
          invoice_id: params.invoice_number || params.order_number,
          additional_details: {
            color: '',
            size: '',
            sku_images: [],
            quantity_value: qty,
            quantity: qty,
            quantity_unit: 'EA',
          },
        }
      }),
    }
  }

  async createReverseShipment(params: any) {
    const payload = this.buildReversePayload(params)
    const response = await this.post('/v3/clients/requests', payload)
    const providerFailure = extractShadowfaxProviderFailure(response)
    if (providerFailure) {
      throw new HttpError(400, providerFailure)
    }
    return normalizeReverseShipmentResponse(response)
  }

  async createRegularPickupRequest(params: any) {
    return this.createReverseShipment(params)
  }

  async trackShipment(awbNumber: string) {
    return this.get(`/v4/clients/orders/${encodeURIComponent(awbNumber)}/track/`)
  }

  async bulkTrackShipments(awbNumbers: string[]) {
    return this.post('/v4/clients/bulk_track/', { awb_numbers: awbNumbers })
  }

  async getOrderDetails(awbNumber: string) {
    const response = await this.trackShipment(awbNumber)
    return normalizeShadowfaxOrderDetailsResponse(response)
  }

  async getMultipleOrderDetails(awbNumbers: string[]) {
    return this.bulkTrackShipments(awbNumbers)
  }

  async trackReverseShipment(requestId: string) {
    try {
      const response = await this.get(`/v4/clients/requests/${encodeURIComponent(requestId)}`)
      return normalizeReversePickupDetailResponse(response, [requestId])
    } catch (error: any) {
      const message = firstNonEmptyString(
        error?.message,
        error?.response?.data?.message,
        error?.response?.data?.responseMsg,
      ).toLowerCase()
      if (!message.includes('invalid awb')) {
        throw error
      }

      const fallback = await this.bulkTrackReverseShipments([requestId])
      return normalizeReversePickupDetailResponse(fallback, [requestId])
    }
  }

  async bulkTrackReverseShipments(requestIds: string[]) {
    const response = await this.post('/v4/clients/requests/bulk_query', { request_ids: requestIds })
    return normalizeReversePickupDetailResponse(response, requestIds)
  }

  async getPickupRequestDetails(requestId: string) {
    return this.trackReverseShipment(requestId)
  }

  async getBulkPickupRequestDetails(requestIds: string[]) {
    return this.bulkTrackReverseShipments(requestIds)
  }

  async updateForwardOrder(payload: Record<string, any>) {
    return this.post('/v3/clients/order_update/', payload)
  }

  async updateOrderData(payload: Record<string, any>) {
    return this.post('/v3/clients/order_update/', buildShadowfaxOrderUpdatePayload(payload))
  }

  async updateReverseOrder(payload: Record<string, any>) {
    return this.post('/v1/clients/order_update/', buildShadowfaxReverseOrderUpdatePayload(payload))
  }

  async updatePickupRequestData(payload: Record<string, any>) {
    return this.updateReverseOrder(payload)
  }

  async updatePickupCustomerDetails(payload: Record<string, any>) {
    return this.updateReverseOrder(payload)
  }

  async updateReverseQcFlag(payload: { awb_number: string; qc_flag: boolean; sku_id?: string }) {
    return this.put('/v2/clients/requests/update_qc/', payload)
  }

  async cancelShipment(requestId: string, remarks = 'Cancelled By Customer') {
    console.log('[Shadowfax] Cancel shipment request', {
      requestId,
      remarks,
      reverse: isShadowfaxReverseReference(requestId),
    })
    if (isShadowfaxReverseReference(requestId)) {
      const response = await this.post('/v2/clients/requests/mark_cancel', {
        request_id: requestId,
        cancel_remarks: remarks,
      })
      return normalizeShadowfaxCancelResponse(response)
    }
    const response = await this.post('/v3/clients/orders/cancel/', {
      request_id: requestId,
      cancel_remarks: remarks,
    })
    return normalizeShadowfaxCancelResponse(response)
  }

  async cancelPickupRequest(requestId: string, remarks = 'Cancelled By Customer') {
    return this.cancelShipment(requestId, remarks)
  }

  async createEscalation(payload: { awb_number: string; issue_category: number }) {
    const response = await this.post('/v1/clients/support/issue/', payload)
    return normalizeShadowfaxEscalationResponse(response)
  }

  async getPodDetails(awbNumbers: string[], reverse = false) {
    const response = await this.post(
      '/v1/clients/pod_details/',
      reverse ? { request_ids: awbNumbers } : { awb_numbers: awbNumbers },
    )
    return normalizeShadowfaxPodResponse(response)
  }

  async generateQrCode(payload: Record<string, any>) {
    return this.post('/v2/clients/qr_code/generate/', payload, this.qrBase)
  }
}
