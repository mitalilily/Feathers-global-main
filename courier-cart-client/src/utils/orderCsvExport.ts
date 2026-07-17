/* eslint-disable @typescript-eslint/no-explicit-any */

export type ClientOrderExportScope = 'all' | 'b2c' | 'b2b'

type CsvValue = string | number | boolean | Date | null | undefined
type ClientOrderExportRow = Record<string, any>

export const CLIENT_ORDER_BASE_HEADERS = [
  'Order #',
  'Type',
  'Buyer Name',
  'City',
  'State',
  'Amount',
  'Status',
  'Created At',
]

export const CLIENT_ORDER_ADDED_HEADERS = [
  'Order ID',
  'Seller Name',
  'SKU ID',
  'AWB Number',
  'Customer Phone',
  'Customer Email',
  'Order Type',
  'Courier Name',
  'Courier Partner',
  'Zone Name',
  'Order Date',
  'Pickup Date',
  'Delivery Date / Last Status',
  'Charged Weight (kg)',
  'Pincode',
  'Address',
  'Last Updated',
]

export const CLIENT_ORDER_EXPORT_HEADERS = [
  ...CLIENT_ORDER_BASE_HEADERS,
  ...CLIENT_ORDER_ADDED_HEADERS,
]

const getTrimmedString = (value: unknown) => {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

const toCsvValue = (value: unknown): CsvValue => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value
  if (['string', 'number', 'boolean'].includes(typeof value)) return value as CsvValue
  return getTrimmedString(value)
}

const firstPresent = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = getTrimmedString(value)
    if (normalized) return value
  }
  return ''
}

const parseJsonObject = (value: unknown) => {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, any>
  if (typeof value !== 'string') return {}

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : {}
  } catch {
    return {}
  }
}

const parseJsonArray = (value: unknown): any[] => {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const normalizeStatus = (value: unknown) =>
  getTrimmedString(value).toLowerCase().replace(/[\s-]+/g, '_')

const parseDate = (value: unknown) => {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const raw = getTrimmedString(value)
  if (!raw) return null

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatDateValue = (value: unknown) => {
  const parsed = parseDate(value)
  if (!parsed) return getTrimmedString(value)
  return parsed.toISOString()
}

const formatDisplayDate = (value: unknown) => {
  const parsed = parseDate(value)
  if (!parsed) return getTrimmedString(value)

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(parsed)
}

const formatCurrency = (value: unknown) => {
  if (value === null || value === undefined || value === '') return ''

  const numeric = Number(value)
  return Number.isFinite(numeric) ? `Rs ${numeric.toFixed(2)}` : getTrimmedString(value)
}

const formatWeight = (value: unknown, fallback?: unknown) => {
  const candidate = value ?? fallback
  if (candidate === null || candidate === undefined || candidate === '') return ''

  const numeric = Number(candidate)
  return Number.isFinite(numeric) ? numeric.toFixed(3) : getTrimmedString(candidate)
}

const csvEscape = (value: CsvValue) => {
  if (value === null || value === undefined) return ''
  const raw = value instanceof Date ? value.toISOString() : String(value)
  if (!raw) return ''

  const escaped = raw.replace(/"/g, '""')
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped
}

export const getClientOrderSellerName = (order: ClientOrderExportRow) => {
  const companyInfo = parseJsonObject(order.userProfile?.companyInfo ?? order.companyInfo)
  const pickupDetails = parseJsonObject(order.pickup_details)

  return getTrimmedString(
    firstPresent(
      order.merchantName,
      order.sellerName,
      order.seller_name,
      companyInfo.businessName,
      companyInfo.brandName,
      companyInfo.companyName,
      companyInfo.displayName,
      companyInfo.contactPerson,
      pickupDetails.warehouse_name,
      pickupDetails.warehouseName,
      pickupDetails.name,
      order.merchantEmail,
      order.user_id,
    ),
  )
}

export const getClientOrderPickupDate = (order: ClientOrderExportRow) => {
  const pickupDetails = parseJsonObject(order.pickup_details)

  return formatDateValue(
    firstPresent(
      order.pickup_date,
      order.pickupDate,
      pickupDetails.pickup_date,
      pickupDetails.pickupDate,
      pickupDetails.requested_pickup_date,
      pickupDetails.requestedPickupDate,
      pickupDetails.final_pickup_date,
      pickupDetails.finalPickupDate,
      pickupDetails.expected_pickup_date,
      pickupDetails.expectedPickupDate,
    ),
  )
}

export const getClientOrderDeliveryDateOrLastStatus = (order: ClientOrderExportRow) => {
  if (normalizeStatus(order.order_status) !== 'delivered') {
    return getTrimmedString(firstPresent(order.delivery_message, order.order_status))
  }

  return formatDateValue(
    firstPresent(
      order.delivered_at,
      order.deliveredAt,
      order.delivery_date,
      order.deliveryDate,
      order.delivered_time,
      order.deliveredTime,
      order.updated_at,
      order.updatedAt,
      order.created_at,
      order.createdAt,
    ),
  )
}

const getSkuValue = (item: any) =>
  item?.sku ??
  item?.sku_id ??
  item?.skuId ??
  item?.sellerSku ??
  item?.seller_sku ??
  item?.productSku ??
  item?.product_sku ??
  item?.itemSku ??
  item?.item_sku ??
  ''

export const getClientOrderSkuIds = (order: ClientOrderExportRow) => {
  const seen = new Set<string>()
  const addSku = (value: unknown) => {
    const normalized = getTrimmedString(value)
    if (normalized) seen.add(normalized)
  }

  for (const product of parseJsonArray(order.products)) addSku(getSkuValue(product))
  for (const pkg of parseJsonArray(order.packages)) {
    for (const product of parseJsonArray(pkg?.products)) addSku(getSkuValue(product))
  }

  return Array.from(seen).join(' | ')
}

export const getClientOrderZoneName = (order: ClientOrderExportRow) =>
  getTrimmedString(
    firstPresent(
      order.zone_name,
      order.zoneName,
      order.delivery_location,
      order.zone,
      order.zone_code,
    ),
  )

export const toClientOrderExportRow = (order: ClientOrderExportRow): CsvValue[] => [
  toCsvValue(firstPresent(order.order_number, order.order_id, order.id)),
  toCsvValue(firstPresent(order.type, order.order_type)),
  toCsvValue(order.buyer_name),
  toCsvValue(order.city),
  toCsvValue(order.state),
  formatCurrency(order.order_amount),
  toCsvValue(order.order_status),
  formatDisplayDate(firstPresent(order.created_at, order.createdAt)),
  toCsvValue(firstPresent(order.order_id, order.order_number, order.id)),
  getClientOrderSellerName(order),
  getClientOrderSkuIds(order),
  toCsvValue(order.awb_number),
  toCsvValue(order.buyer_phone),
  toCsvValue(order.buyer_email),
  toCsvValue(order.order_type),
  toCsvValue(order.courier_partner),
  toCsvValue(order.courier_partner),
  getClientOrderZoneName(order),
  toCsvValue(order.order_date),
  getClientOrderPickupDate(order),
  getClientOrderDeliveryDateOrLastStatus(order),
  formatWeight(order.charged_weight, order.weight),
  toCsvValue(order.pincode),
  toCsvValue(order.address),
  formatDateValue(firstPresent(order.updated_at, order.updatedAt, order.created_at, order.createdAt)),
]

export const buildClientOrderCsv = (orders: ClientOrderExportRow[]) => {
  const lines = [
    CLIENT_ORDER_EXPORT_HEADERS.map(csvEscape).join(','),
    ...orders.map((order) => toClientOrderExportRow(order).map(csvEscape).join(',')),
  ]

  return `\uFEFF${lines.join('\n')}`
}

export const getClientOrderExportFilename = (scope: ClientOrderExportScope) => {
  const prefix =
    scope === 'b2c' ? 'b2c-orders' : scope === 'b2b' ? 'b2b-orders' : 'all-orders'
  const date = new Date().toISOString().split('T')[0]
  return `${prefix}-${date}.csv`
}

export const downloadClientOrdersCsv = (
  orders: ClientOrderExportRow[],
  scope: ClientOrderExportScope,
) => {
  const csv = buildClientOrderCsv(orders)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = getClientOrderExportFilename(scope)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
