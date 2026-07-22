import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { Response } from 'express'
import { db } from '../models/client'
import { b2b_orders } from '../models/schema/b2bOrders'
import { b2c_orders } from '../models/schema/b2cOrders'
import { codRemittances } from '../models/schema/codRemittance'
import { locations } from '../models/schema/locations'
import { ndr_events } from '../models/schema/ndr'
import { b2bPincodes, zones } from '../models/schema/zones'
import { buildCsv } from '../utils/csv'

type SectionKey = 'orders' | 'shipment' | 'ndr'

const FIELD_LABELS: Record<string, string> = {
  order_number: 'order_number',
  order_date: 'order_date',
  order_amount: 'order_amount',
  order_type: 'order_type',
  buyer_name: 'buyer_name',
  buyer_phone: 'buyer_phone',
  buyer_email: 'buyer_email',
  address: 'address',
  city: 'city',
  state: 'state',
  pincode: 'pincode',
  weight: 'weight',
  length: 'length',
  height: 'height',
  breadth: 'breadth',
  order_status: 'order_status',
  freight_charges: 'freight_charges',
  gst_amount: 'gst_amount',
  total_deducted: 'total_deducted',
  discount: 'discount',
  sku_id: 'sku_id',
  products: 'products',
  shipment_date: 'shipment_date',
  awb_number: 'awb_number',
  courier_name: 'courier_name',
  shipment_status: 'shipment_status',
  remittance_id: 'remittance_id',
  pickup_time: 'pickup_time',
  delivered_time: 'delivered_time',
  charged_weight: 'charged_weight',
  zone: 'zone',
  zone_name: 'zone_name',
  last_status_updated: 'last_status_updated',
  ndr_attempts_info: 'ndr_attempts_info',
}

const DEFAULT_FIELDS = Object.keys(FIELD_LABELS)

const parseDate = (value?: string) => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const endOfDay = (d: Date) => {
  const out = new Date(d)
  out.setHours(23, 59, 59, 999)
  return out
}

const toNumber = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const toPositiveNumber = (v: unknown) => {
  const n = toNumber(v)
  return n > 0 ? n : 0
}

const toArray = (value: unknown): any[] => {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const formatProducts = (products: unknown) => {
  const productList = toArray(products)
  if (productList.length === 0) return ''
  return productList
    .map((p: any) => {
      const name = p?.name || p?.productName || p?.box_name || 'Item'
      const qty = p?.qty ?? p?.quantity ?? 1
      const price = toNumber(p?.price)
      return `${name} x${qty} (Rs. ${price.toFixed(2)})`
    })
    .join(' | ')
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

const extractSkuIds = (products: unknown, packages: unknown) => {
  const seen = new Set<string>()
  const addSku = (value: unknown) => {
    const normalized = String(value ?? '').trim()
    if (normalized) seen.add(normalized)
  }

  for (const product of toArray(products)) addSku(getSkuValue(product))
  for (const pkg of toArray(packages)) {
    for (const product of toArray(pkg?.products)) addSku(getSkuValue(product))
  }

  return Array.from(seen).join(' | ')
}

const parseObject = (value: unknown): Record<string, any> => {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
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

type ReportZoneMeta = {
  code: string
  name: string
}

type ReportLocationMeta = {
  pincode: string
  city: string | null
  state: string | null
  tags: unknown
}

const getCleanString = (value: unknown) => String(value ?? '').trim()

const normalizePincode = (value: unknown) => {
  const raw = getCleanString(value).replace(/\D/g, '')
  return raw || ''
}

const normalizeZoneCode = (value: unknown) => {
  const raw = getCleanString(value)
  if (!raw) return ''

  const upper = raw.toUpperCase().replace(/\s+/g, '_')
  const zoneLetter = upper.match(/^ZONE_?([A-Z])$/)?.[1]
  if (zoneLetter) return zoneLetter

  const suffixedLetter = upper.match(/^([A-Z])_(?:B2C|B2B)$/)?.[1]
  if (suffixedLetter) return suffixedLetter

  return upper
}

const formatZoneName = (code: unknown, fallbackName?: unknown) => {
  const normalizedCode = normalizeZoneCode(code)
  const fallback = getCleanString(fallbackName)

  if (/^[A-Z]$/.test(normalizedCode)) return `Zone ${normalizedCode}`
  if (fallback) {
    const fallbackCode = normalizeZoneCode(fallback)
    if (/^[A-Z]$/.test(fallbackCode)) return `Zone ${fallbackCode}`
    return fallback
  }
  return normalizedCode ? normalizedCode.replace(/_/g, ' ') : ''
}

const makeZoneMeta = (code: unknown, name?: unknown): ReportZoneMeta | null => {
  const normalizedCode = normalizeZoneCode(code || name)
  const zoneName = formatZoneName(normalizedCode, name)
  if (!normalizedCode && !zoneName) return null

  return {
    code: normalizedCode || zoneName,
    name: zoneName || normalizedCode,
  }
}

const getTagList = (tags: unknown): string[] => {
  if (Array.isArray(tags)) return tags.map((tag) => getCleanString(tag).toLowerCase()).filter(Boolean)
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags)
      if (Array.isArray(parsed)) {
        return parsed.map((tag) => getCleanString(tag).toLowerCase()).filter(Boolean)
      }
    } catch {
      return tags
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    }
  }
  return []
}

const hasTag = (location: ReportLocationMeta | null | undefined, tag: string) =>
  getTagList(location?.tags).includes(tag.toLowerCase())

const determineB2CZoneKey = (
  origin: ReportLocationMeta | null,
  destination: ReportLocationMeta | null,
) => {
  if (!origin || !destination) return 'ROI'

  if (
    hasTag(origin, 'special_zones') ||
    hasTag(origin, 'special_zone') ||
    hasTag(destination, 'special_zones') ||
    hasTag(destination, 'special_zone') ||
    hasTag(origin, 'special') ||
    hasTag(destination, 'special')
  ) {
    return 'SPECIAL_ZONE'
  }

  const originCity = getCleanString(origin.city).toLowerCase()
  const destinationCity = getCleanString(destination.city).toLowerCase()
  const originState = getCleanString(origin.state).toLowerCase()
  const destinationState = getCleanString(destination.state).toLowerCase()

  if (originCity && destinationCity && originState && destinationState && originCity === destinationCity && originState === destinationState) {
    return 'WITHIN_CITY'
  }

  if (originState && destinationState && originState === destinationState && originCity !== destinationCity) {
    return 'WITHIN_STATE'
  }

  if (hasTag(origin, 'metros') && hasTag(destination, 'metros') && originCity !== destinationCity) {
    return 'METRO_TO_METRO'
  }

  for (const region of ['north', 'south', 'east', 'west']) {
    if (hasTag(origin, region) && hasTag(destination, region)) return 'WITHIN_REGION'
  }

  return 'ROI'
}

const B2C_ZONE_CANDIDATES: Record<string, string[]> = {
  METRO_TO_METRO: ['METRO_TO_METRO', 'A_B2C', 'A', 'ZONE_A', 'ZONE A'],
  WITHIN_CITY: ['WITHIN_CITY', 'A_B2C', 'A', 'ZONE_A', 'ZONE A'],
  WITHIN_STATE: ['WITHIN_STATE', 'B_B2C', 'B', 'ZONE_B', 'ZONE B'],
  WITHIN_REGION: ['WITHIN_REGION', 'C_B2C', 'C', 'ZONE_C', 'ZONE C'],
  ROI: ['ROI', 'D_B2C', 'E_B2C', 'D', 'E', 'ZONE_D', 'ZONE_E', 'ZONE D', 'ZONE E'],
  SPECIAL_ZONE: ['SPECIAL_ZONE', 'SPECIAL_B2C', 'SPECIAL', 'E_B2C', 'E', 'ZONE_E', 'ZONE E'],
}

const getFallbackZoneFromOrder = (order: any): ReportZoneMeta | null =>
  makeZoneMeta(
    order.zone_code || order.zone || order.provider_meta?.zone_code || order.provider_meta?.zone,
    order.zone_name || order.zoneName || order.delivery_location || order.provider_meta?.zone_name,
  )

const buildReportZoneResolver = async (b2cRows: any[], b2bRows: any[]) => {
  const pickupPincodes = new Set<string>()
  const destinationPincodes = new Set<string>()

  for (const order of b2cRows) {
    const pickupDetails = parseObject(order.pickup_details)
    const pickupPincode = normalizePincode(
      pickupDetails.pincode || pickupDetails.pickup_pincode || pickupDetails.source_pincode,
    )
    const destinationPincode = normalizePincode(order.pincode)
    if (pickupPincode) pickupPincodes.add(pickupPincode)
    if (destinationPincode) destinationPincodes.add(destinationPincode)
  }

  for (const order of b2bRows) {
    const destinationPincode = normalizePincode(order.pincode)
    if (destinationPincode) destinationPincodes.add(destinationPincode)
  }

  const allLocationPincodes = Array.from(new Set([...pickupPincodes, ...destinationPincodes]))
  const [locationRows, b2cZoneRows, b2bZoneRows] = await Promise.all([
    allLocationPincodes.length
      ? db
          .select({
            pincode: locations.pincode,
            city: locations.city,
            state: locations.state,
            tags: locations.tags,
          })
          .from(locations)
          .where(inArray(locations.pincode, allLocationPincodes))
      : Promise.resolve([] as any[]),
    db
      .select({ id: zones.id, code: zones.code, name: zones.name })
      .from(zones)
      .where(sql`upper(${zones.business_type}) = 'B2C'`),
    destinationPincodes.size
      ? db
          .select({
            pincode: b2bPincodes.pincode,
            code: zones.code,
            name: zones.name,
          })
          .from(b2bPincodes)
          .leftJoin(zones, eq(b2bPincodes.zone_id, zones.id))
          .where(inArray(b2bPincodes.pincode, Array.from(destinationPincodes)))
      : Promise.resolve([] as any[]),
  ])

  const locationByPincode = new Map<string, ReportLocationMeta>()
  for (const row of locationRows) {
    const pincode = normalizePincode(row.pincode)
    if (!pincode || locationByPincode.has(pincode)) continue
    locationByPincode.set(pincode, {
      pincode,
      city: row.city || null,
      state: row.state || null,
      tags: row.tags,
    })
  }

  const b2cZoneByCandidate = new Map<string, ReportZoneMeta>()
  for (const row of b2cZoneRows) {
    const meta = makeZoneMeta(row.code, row.name)
    if (!meta) continue
    for (const candidate of [row.code, row.name, meta.code, meta.name]) {
      const key = normalizeZoneCode(candidate)
      if (key && !b2cZoneByCandidate.has(key)) b2cZoneByCandidate.set(key, meta)
    }
  }

  const b2bZoneByPincode = new Map<string, ReportZoneMeta>()
  for (const row of b2bZoneRows) {
    const pincode = normalizePincode(row.pincode)
    const meta = makeZoneMeta(row.code, row.name)
    if (pincode && meta && !b2bZoneByPincode.has(pincode)) {
      b2bZoneByPincode.set(pincode, meta)
    }
  }

  const getB2CZone = (order: any): ReportZoneMeta | null => {
    const fallback = getFallbackZoneFromOrder(order)
    const pickupDetails = parseObject(order.pickup_details)
    const pickupPincode = normalizePincode(
      pickupDetails.pincode || pickupDetails.pickup_pincode || pickupDetails.source_pincode,
    )
    const destinationPincode = normalizePincode(order.pincode)
    const originLocation = locationByPincode.get(pickupPincode) || null
    const destinationLocation = locationByPincode.get(destinationPincode) || null
    if (!originLocation || !destinationLocation) return fallback

    const zoneKey = determineB2CZoneKey(originLocation, destinationLocation)

    for (const candidate of B2C_ZONE_CANDIDATES[zoneKey] || []) {
      const meta = b2cZoneByCandidate.get(normalizeZoneCode(candidate))
      if (meta) return meta
    }

    return fallback
  }

  const getB2BZone = (order: any): ReportZoneMeta | null => {
    const pincode = normalizePincode(order.pincode)
    return b2bZoneByPincode.get(pincode) || getFallbackZoneFromOrder(order)
  }

  return (order: any): ReportZoneMeta | null => (order._type === 'b2b' ? getB2BZone(order) : getB2CZone(order))
}

const stringifyDate = (v: unknown) => {
  if (!v) return ''
  const d = new Date(v as any)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toISOString()
}

const getNdrAttemptSummary = (events: Array<{ attempt_no: string | null; status: string; reason: string | null }>) => {
  if (!events.length) return ''
  const latest = events[events.length - 1]
  const attempts = Array.from(
    new Set(events.map((e) => e.attempt_no).filter((x): x is string => !!x && x.trim() !== '')),
  )
  const attemptsText = attempts.length ? attempts.join('/') : String(events.length)
  return `Attempts: ${attemptsText}; Latest: ${latest.status}${latest.reason ? ` (${latest.reason})` : ''}`
}

export const exportCustomReportCsvController = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const {
      fromDate,
      toDate: toDateStr,
      selectedFields,
    }: {
      fromDate?: string
      toDate?: string
      sections?: SectionKey[]
      selectedFields?: string[]
    } = req.body || {}

    const from = parseDate(fromDate)
    const to = parseDate(toDateStr)

    if (!from || !to) {
      return res.status(400).json({ success: false, message: 'Valid fromDate and toDate are required' })
    }

    const fields =
      Array.isArray(selectedFields) && selectedFields.length
        ? selectedFields.filter((f) => FIELD_LABELS[f])
        : DEFAULT_FIELDS

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'At least one field must be selected' })
    }

    const dateClauseB2C = and(
      eq(b2c_orders.user_id, userId),
      gte(b2c_orders.created_at, from),
      lte(b2c_orders.created_at, endOfDay(to)),
    )
    const dateClauseB2B = and(
      eq(b2b_orders.user_id, userId),
      gte(b2b_orders.created_at, from),
      lte(b2b_orders.created_at, endOfDay(to)),
    )

    const [b2cRows, b2bRows] = await Promise.all([
      db.select().from(b2c_orders).where(dateClauseB2C).orderBy(asc(b2c_orders.created_at)),
      db.select().from(b2b_orders).where(dateClauseB2B).orderBy(asc(b2b_orders.created_at)),
    ])

    const b2cIds = b2cRows.map((r) => r.id)
    const allOrderRefs = [
      ...b2cRows.map((r) => ({ orderId: r.id, orderType: 'b2c' as const })),
      ...b2bRows.map((r) => ({ orderId: r.id, orderType: 'b2b' as const })),
    ]

    const [ndrRows, remRows] = await Promise.all([
      b2cIds.length
        ? db
            .select({
              order_id: ndr_events.order_id,
              attempt_no: ndr_events.attempt_no,
              status: ndr_events.status,
              reason: ndr_events.reason,
              created_at: ndr_events.created_at,
            })
            .from(ndr_events)
            .where(inArray(ndr_events.order_id, b2cIds))
            .orderBy(asc(ndr_events.created_at))
        : Promise.resolve([] as any[]),
      allOrderRefs.length
        ? db
            .select({
              id: codRemittances.id,
              orderId: codRemittances.orderId,
              orderType: codRemittances.orderType,
            })
            .from(codRemittances)
            .where(
              and(
                eq(codRemittances.userId, userId),
                inArray(codRemittances.orderId, allOrderRefs.map((r) => r.orderId)),
              ),
            )
        : Promise.resolve([] as any[]),
    ])

    const ndrMap = new Map<string, any[]>()
    for (const ndr of ndrRows) {
      const arr = ndrMap.get(ndr.order_id) || []
      arr.push(ndr)
      ndrMap.set(ndr.order_id, arr)
    }

    const remMap = new Map<string, string>()
    for (const rem of remRows) {
      remMap.set(`${rem.orderType}:${rem.orderId}`, rem.id)
    }

    const resolveReportZone = await buildReportZoneResolver(b2cRows, b2bRows)

    const unifiedRows = [
      ...b2cRows.map((o) => ({ ...o, _type: 'b2c' as const })),
      ...b2bRows.map((o) => ({ ...o, _type: 'b2b' as const })),
    ].sort((a, b) => new Date(a.created_at as any).getTime() - new Date(b.created_at as any).getTime())

    const headers = fields.map((f) => FIELD_LABELS[f])
    const rows = unifiedRows.map((order: any) => {
      const ndrInfo = order._type === 'b2c' ? getNdrAttemptSummary(ndrMap.get(order.id) || []) : ''
      const remittanceId = remMap.get(`${order._type}:${order.id}`) || ''
      const deliveredTime =
        String(order.order_status || '').toLowerCase() === 'delivered'
          ? stringifyDate(order.updated_at || order.created_at)
          : ''

      const pickupTimeFromDetails = order?.pickup_details?.pickup_time || order?.pickup_details?.pickupTime
      const shipmentDate = stringifyDate(order.created_at)
      const freightCharges = toNumber(order.freight_charges)
      const gstAmount = toNumber(order.gst_amount)
      const zoneMeta = resolveReportZone(order)
      const storedWalletDebit = toPositiveNumber(order.wallet_debit_amount)
      const totalDeducted =
        storedWalletDebit ||
        freightCharges +
          toNumber(order.other_charges) +
          toNumber(order.cod_charges) +
          toNumber(order.razorpay_charge_amount) +
          gstAmount
      const rowMap: Record<string, string | number> = {
        order_number: order.order_number || '',
        order_date: order.order_date || '',
        order_amount: toNumber(order.order_amount).toFixed(2),
        order_type: order.order_type || '',
        buyer_name: order.buyer_name || '',
        buyer_phone: order.buyer_phone || '',
        buyer_email: order.buyer_email || '',
        address: order.address || '',
        city: order.city || '',
        state: order.state || '',
        pincode: order.pincode || '',
        weight: toNumber(order.weight).toFixed(3),
        length: toNumber(order.length).toFixed(2),
        height: toNumber(order.height).toFixed(2),
        breadth: toNumber(order.breadth).toFixed(2),
        order_status: order.order_status || '',
        freight_charges: freightCharges.toFixed(2),
        gst_amount: gstAmount.toFixed(2),
        total_deducted: totalDeducted.toFixed(2),
        discount: toNumber(order.discount).toFixed(2),
        sku_id: extractSkuIds(order.products, order.packages),
        products: formatProducts(order.products),
        shipment_date: shipmentDate,
        awb_number: order.awb_number || '',
        courier_name: order.courier_partner || '',
        shipment_status: order.order_status || '',
        remittance_id: remittanceId,
        pickup_time: pickupTimeFromDetails || '',
        delivered_time: deliveredTime,
        charged_weight: toNumber(order.charged_weight || order.weight).toFixed(3),
        zone: zoneMeta?.code || '',
        zone_name: zoneMeta?.name || '',
        last_status_updated: stringifyDate(order.updated_at || order.created_at),
        ndr_attempts_info: ndrInfo,
      }

      return fields.map((f) => rowMap[f] ?? '')
    })

    const csv = buildCsv(headers, rows)
    const filename = `custom_report_${fromDate}_to_${toDateStr}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.status(200).send(csv)
  } catch (error: any) {
    console.error('[exportCustomReportCsvController] Error:', error)
    return res.status(500).json({ success: false, message: error?.message || 'Failed to export report' })
  }
}
