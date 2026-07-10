// @ts-nocheck
import { and, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { b2c_orders } from '../schema/b2cOrders'
import { ndr_events } from '../schema/ndr'
import { b2bPincodes, zones } from '../schema/zones'

const MS_PER_DAY = 1000 * 60 * 60 * 24

const createBaseStats = () => ({
  orders: 0,
  delivered: 0,
  rto: 0,
  codOrders: 0,
  codDelivered: 0,
  codRto: 0,
  prepaidOrders: 0,
  prepaidDelivered: 0,
  prepaidRto: 0,
  deliveryDays: [] as number[],
  dispatchDays: [] as number[],
})

const getOrCreate = <T>(map: Map<string, T>, key: string, factory: () => T) => {
  let value = map.get(key)
  if (!value) {
    value = factory()
    map.set(key, value)
  }
  return value
}

const getOrCreateRecord = <T>(record: Record<string, T>, key: string, factory: () => T) => {
  let value = record[key]
  if (!value) {
    value = factory()
    record[key] = value
  }
  return value
}

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const parseDate = (value: unknown) => {
  if (!value) return null
  const parsed = new Date(value as any)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const toStartOfDay = (value: string | Date) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

const toEndOfDay = (value: string | Date) => {
  const date = new Date(value)
  date.setHours(23, 59, 59, 999)
  return date
}

const normalizeText = (value: unknown) => String(value ?? '').trim()
const lower = (value: unknown) => normalizeText(value).toLowerCase()

const capitalizeWords = (value: string) =>
  value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')

const daysBetween = (start: Date | null, end: Date | null) => {
  if (!start || !end) return null
  const diff = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)
  return Number.isFinite(diff) ? Math.max(diff, 0) : null
}

const canonicalZoneLabel = (zoneCode: string, zoneName: string, state?: string) => {
  const source = `${zoneCode} ${zoneName} ${state ?? ''}`.toLowerCase()
  if (/\bne\b/.test(zoneCode.toLowerCase()) || source.includes('north east')) return 'NE'
  if (source.includes('west')) return 'West'
  if (source.includes('south')) return 'South'
  if (source.includes('north')) return 'North'
  if (source.includes('east')) return 'East'
  return capitalizeWords(zoneName || zoneCode || 'Unknown')
}

const getCourierLabel = (value: unknown) => {
  const courier = normalizeText(value)
  if (!courier) return 'Unknown'
  const lowerCourier = courier.toLowerCase()
  if (lowerCourier.includes('delhivery')) return 'Delhivery'
  if (lowerCourier.includes('xpressbees')) return 'Xpressbees'
  if (lowerCourier.includes('shadowfax')) return 'Shadowfax'
  if (lowerCourier.includes('ekart')) return 'Ekart'
  if (lowerCourier.includes('ecom')) return 'Ecom'
  if (lowerCourier.includes('amazon')) return 'Amazon'
  return capitalizeWords(courier)
}

const getWeightValue = (row: any) => toNumber(row.actualWeight ?? row.chargedWeight ?? row.weight)

const getDispatchDays = (row: any) => {
  const created = row.createdAt ?? parseDate(row.orderDate)
  const updated = row.updatedAt
  if (!created || !updated) return null
  const status = lower(row.orderStatus)
  if (['pending', 'booked', 'cancelled'].includes(status)) return null
  return daysBetween(created, updated)
}

const getDeliveryDays = (row: any) => {
  const created = row.createdAt ?? parseDate(row.orderDate)
  const updated = row.updatedAt
  if (!created || !updated) return null
  const status = lower(row.orderStatus)
  if (status !== 'delivered') return null
  return daysBetween(created, updated)
}

const detectColor = (productName: string, sku: string) => {
  const text = `${productName} ${sku ?? ''}`.toLowerCase()
  const colors = [
    'black',
    'white',
    'beige',
    'olive',
    'blue',
    'red',
    'green',
    'pink',
    'yellow',
    'brown',
    'grey',
    'gray',
    'navy',
    'maroon',
    'purple',
  ]

  return colors.find((color) => new RegExp(`\\b${color}\\b`, 'i').test(text)) || 'Other'
}

const detectSize = (productName: string, sku: string) => {
  const text = `${productName} ${sku ?? ''}`.toLowerCase()
  const orderedSizes = ['4xl', '3xl', '2xl', 'xl', 'xs', 'l', 'm', 's']
  return orderedSizes.find((size) => new RegExp(`\\b${size}\\b`, 'i').test(text))?.toUpperCase() || 'Other'
}

const detectCategory = (productName: string) => {
  const text = productName.toLowerCase()
  if (text.includes('kurta')) return "Women's Kurta"
  if (text.includes('pant')) return 'Cotton Pant'
  if (text.includes('saree')) return 'Saree'
  if (text.includes('footwear') || text.includes('shoe')) return 'Footwear'
  if (text.includes('electronic') || text.includes('phone') || text.includes('watch')) return 'Electronics'
  return capitalizeWords(productName.split(' ')[0] || 'Other')
}

const detectPriceRange = (amount: number) => {
  if (amount < 500) return 'Rs 0-499'
  if (amount < 1000) return 'Rs 500-999'
  if (amount < 1500) return 'Rs 1000-1499'
  return 'Rs 1500+'
}

const detectWeightSlab = (weight: number) => {
  if (weight <= 500) return '0-500 gm'
  if (weight <= 1000) return '501-1000 gm'
  if (weight <= 2000) return '1001-2000 gm'
  return '2000+ gm'
}

const normalizeProductList = (products: unknown) => {
  if (Array.isArray(products)) return products
  if (typeof products === 'string') {
    try {
      const parsed = JSON.parse(products)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

const applyOrderStats = (stats: any, row: any) => {
  const status = lower(row.orderStatus)
  const orderType = lower(row.orderType) || 'prepaid'
  stats.orders += 1
  if (status === 'delivered') stats.delivered += 1
  if (status.includes('rto') || status === 'returned_to_origin') stats.rto += 1

  if (orderType === 'cod') {
    stats.codOrders += 1
    if (status === 'delivered') stats.codDelivered += 1
    if (status.includes('rto') || status === 'returned_to_origin') stats.codRto += 1
  } else {
    stats.prepaidOrders += 1
    if (status === 'delivered') stats.prepaidDelivered += 1
    if (status.includes('rto') || status === 'returned_to_origin') stats.prepaidRto += 1
  }

  const deliveryDays = getDeliveryDays(row)
  if (deliveryDays !== null) stats.deliveryDays.push(deliveryDays)
  const dispatchDays = getDispatchDays(row)
  if (dispatchDays !== null) stats.dispatchDays.push(dispatchDays)
}

const finalizeBaseStats = (stats: any) => {
  const avg = (values: number[]) =>
    values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0

  return {
    orders: stats.orders,
    delivered: stats.delivered,
    rto: stats.rto,
    codOrders: stats.codOrders,
    codDelivered: stats.codDelivered,
    codRto: stats.codRto,
    prepaidOrders: stats.prepaidOrders,
    prepaidDelivered: stats.prepaidDelivered,
    prepaidRto: stats.prepaidRto,
    deliveryRate: stats.orders ? Number(((stats.delivered / stats.orders) * 100).toFixed(1)) : 0,
    rtoRate: stats.orders ? Number(((stats.rto / stats.orders) * 100).toFixed(1)) : 0,
    codDeliveryRate: stats.codOrders ? Number(((stats.codDelivered / stats.codOrders) * 100).toFixed(1)) : 0,
    codRtoRate: stats.codOrders ? Number(((stats.codRto / stats.codOrders) * 100).toFixed(1)) : 0,
    prepaidDeliveryRate: stats.prepaidOrders
      ? Number(((stats.prepaidDelivered / stats.prepaidOrders) * 100).toFixed(1))
      : 0,
    prepaidRtoRate: stats.prepaidOrders
      ? Number(((stats.prepaidRto / stats.prepaidOrders) * 100).toFixed(1))
      : 0,
    avgDeliveryDays: avg(stats.deliveryDays),
    avgDispatchDays: avg(stats.dispatchDays),
  }
}

const finalizeDimensionStats = (label: string, stats: any) => ({
  label,
  ...finalizeBaseStats(stats),
})

const buildPairMap = (map: Map<string, any>) =>
  Array.from(map.entries())
    .map(([label, stats]) => finalizeDimensionStats(label, stats))
    .sort((a, b) => b.orders - a.orders || b.deliveryRate - a.deliveryRate)

const emptyZoneStats = (label: string, rawZoneName: string, rawZoneCode: string) => ({
  ...createBaseStats(),
  label,
  rawZoneName,
  rawZoneCode,
  courierStats: {} as Record<string, any>,
})

const emptyPincodeStats = (pincode: string, city: string, state: string) => ({
  ...createBaseStats(),
  pincode,
  city,
  state,
  courierStats: {} as Record<string, any>,
})

const toSafeArray = (value: unknown) => (Array.isArray(value) ? value : [])

const resolveZoneIndex = async (orders: any[]) => {
  const uniquePincodes = Array.from(
    new Set(
      orders
        .map((row) => normalizeText(row.pincode).trim())
        .filter(Boolean),
    ),
  )

  const [pincodeRows, zoneRows] = await Promise.all([
    uniquePincodes.length
      ? db
          .select({
            pincode: b2bPincodes.pincode,
            zoneCode: zones.code,
            zoneName: zones.name,
            zoneStates: zones.states,
          })
          .from(b2bPincodes)
          .innerJoin(zones, eq(zones.id, b2bPincodes.zone_id))
          .where(inArray(b2bPincodes.pincode, uniquePincodes))
      : Promise.resolve([]),
    db
      .select({
        code: zones.code,
        name: zones.name,
        states: zones.states,
      })
      .from(zones)
      .where(eq(zones.business_type, 'B2B')),
  ])

  const pincodeMap = new Map<string, any>()
  const stateMap = new Map<string, any>()

  for (const row of pincodeRows as any[]) {
    const zoneCode = normalizeText(row.zoneCode)
    const zoneName = normalizeText(row.zoneName)
    const label = canonicalZoneLabel(zoneCode, zoneName)
    pincodeMap.set(normalizeText(row.pincode).toLowerCase(), { label, zoneCode, zoneName })
  }

  for (const row of zoneRows as any[]) {
    const zoneCode = normalizeText(row.code)
    const zoneName = normalizeText(row.name)
    const label = canonicalZoneLabel(zoneCode, zoneName)
    for (const state of toSafeArray(row.states)) {
      const stateKey = normalizeText(state).toLowerCase()
      if (stateKey) stateMap.set(stateKey, { label, zoneCode, zoneName })
    }
  }

  return { pincodeMap, stateMap }
}

const pickZone = (row: any, zoneIndex: any) =>
  zoneIndex.pincodeMap.get(normalizeText(row.pincode).toLowerCase()) ||
  zoneIndex.stateMap.get(normalizeText(row.state).toLowerCase()) || {
    label: 'Unknown',
    zoneCode: 'Unknown',
    zoneName: 'Unknown',
  }

const topByOrders = (values: any[], limit = 5) =>
  [...values]
    .sort((a, b) => b.orders - a.orders || (b.deliveryRate || 0) - (a.deliveryRate || 0))
    .slice(0, limit)

const topByRisk = (values: any[], limit = 5) =>
  [...values]
    .sort((a, b) => (b.rtoRate || 0) - (a.rtoRate || 0) || b.orders - a.orders)
    .slice(0, limit)

const detectColorFromRow = (row: any) => {
  const products = normalizeProductList(row.products)
  const first = products.find((item: any) => item && typeof item === 'object')
  const productName = normalizeText(first?.productName || first?.name || row.buyerName || 'Unknown')
  const sku = normalizeText(first?.sku || first?.skuCode || '')
  const colors = ['black', 'white', 'beige', 'olive', 'blue', 'red', 'green', 'pink', 'yellow', 'brown', 'grey', 'gray', 'navy', 'maroon', 'purple']
  const text = `${productName} ${sku}`.toLowerCase()
  return colors.find((color) => text.includes(color)) || 'Other'
}

const collectProductTokens = (products: unknown) => {
  const productSet = new Set<string>()
  const categorySet = new Set<string>()
  const skuSet = new Set<string>()
  const sizeSet = new Set<string>()
  const colorSet = new Set<string>()
  const skuProductMap = new Map<string, string>()

  for (const item of normalizeProductList(products)) {
    if (!item || typeof item !== 'object') continue
    const record: any = item
    const productName = normalizeText(record.productName || record.name || record.title || 'Unknown')
    const sku = normalizeText(record.sku || record.skuCode || '')
    const size = normalizeText(record.size || detectSize(productName, sku))
    const color = normalizeText(record.color || detectColor(productName, sku))

    productSet.add(productName)
    categorySet.add(detectCategory(productName))
    if (sku) skuSet.add(sku)
    if (sku && !skuProductMap.has(sku)) skuProductMap.set(sku, productName)
    if (size) sizeSet.add(size.toUpperCase())
    if (color) colorSet.add(color)
  }

  return {
    products: Array.from(productSet),
    categories: Array.from(categorySet),
    skus: Array.from(skuSet),
    sizes: Array.from(sizeSet),
    colors: Array.from(colorSet),
    skuProducts: Array.from(skuProductMap.entries()).map(([sku, product]) => ({ sku, product })),
  }
}

const zoneOrderIndex = (value: string) => {
  const label = value.toLowerCase()
  if (label === 'west') return 1
  if (label === 'south') return 2
  if (label === 'north') return 3
  if (label === 'east') return 4
  if (label === 'ne') return 5
  return 99
}

const dispatchOrder = (label: string) => {
  const lowerLabel = label.toLowerCase()
  if (lowerLabel === 'same day') return 0
  if (lowerLabel === '1 day') return 1
  if (lowerLabel === '2 days') return 2
  return 3
}

const buildZoneOverview = (zoneStats: Map<string, any>) =>
  Array.from(zoneStats.entries())
    .map(([label, stats]) => ({
      zone: label,
      label,
      ...finalizeBaseStats(stats),
      rawZoneName: stats.rawZoneName,
      rawZoneCode: stats.rawZoneCode,
      bestCourier:
        Object.entries(stats.courierStats)
          .map(([courier, courierStats]) => ({
            courier,
            ...finalizeBaseStats(courierStats),
          }))
          .sort(
            (a, b) =>
              a.avgDeliveryDays - b.avgDeliveryDays ||
              b.deliveryRate - a.deliveryRate ||
              b.orders - a.orders,
          )[0]?.courier || 'Unknown',
    }))
    .sort((a, b) => zoneOrderIndex(a.label) - zoneOrderIndex(b.label) || b.orders - a.orders)

export const getAdminOpsAnalytics = async (filters: any = {}) => {
  const conditions: any[] = [sql`true`]

  if (filters.userId) conditions.push(eq(b2c_orders.user_id, filters.userId))
  if (filters.fromDate) conditions.push(gte(b2c_orders.created_at, toStartOfDay(filters.fromDate)))
  if (filters.toDate) conditions.push(lte(b2c_orders.created_at, toEndOfDay(filters.toDate)))
  if (filters.courier) {
    const courierPattern = `%${filters.courier.trim()}%`
    conditions.push(
      or(ilike(b2c_orders.courier_partner, courierPattern), ilike(b2c_orders.integration_type, courierPattern)),
    )
  }

  if (filters.search) {
    const searchPattern = `%${filters.search.trim()}%`
    conditions.push(
      or(
        ilike(b2c_orders.order_number, searchPattern),
        ilike(b2c_orders.awb_number, searchPattern),
        ilike(b2c_orders.buyer_name, searchPattern),
        ilike(b2c_orders.buyer_phone, searchPattern),
        ilike(b2c_orders.city, searchPattern),
        ilike(b2c_orders.state, searchPattern),
        ilike(b2c_orders.pincode, searchPattern),
      ),
    )
  }

  const orders = await db
    .select({
      id: b2c_orders.id,
      userId: b2c_orders.user_id,
      orderNumber: b2c_orders.order_number,
      orderDate: b2c_orders.order_date,
      orderAmount: b2c_orders.order_amount,
      orderType: b2c_orders.order_type,
      orderStatus: b2c_orders.order_status,
      buyerName: b2c_orders.buyer_name,
      city: b2c_orders.city,
      state: b2c_orders.state,
      pincode: b2c_orders.pincode,
      products: b2c_orders.products,
      weight: b2c_orders.weight,
      actualWeight: b2c_orders.actual_weight,
      chargedWeight: b2c_orders.charged_weight,
      courierPartner: b2c_orders.courier_partner,
      integrationType: b2c_orders.integration_type,
      createdAt: b2c_orders.created_at,
      updatedAt: b2c_orders.updated_at,
      awbNumber: b2c_orders.awb_number,
      freightCharges: b2c_orders.freight_charges,
      shippingCharges: b2c_orders.shipping_charges,
    })
    .from(b2c_orders)
    .where(and(...conditions))

  const zoneIndex = await resolveZoneIndex(orders as any[])

  const normalizedOrders = (orders as any[])
    .map((row) => ({
      ...row,
      courierLabel: getCourierLabel(row.courierPartner || row.integrationType),
      orderAmountNumber: toNumber(row.orderAmount),
      weightNumber: getWeightValue(row),
      dispatchDays: getDispatchDays(row),
      zone: pickZone(row, zoneIndex),
    }))
    .filter((row) => {
      if (!filters.zone) return true
      const zoneFilter = filters.zone.trim().toLowerCase()
      return (
        row.zone.label.toLowerCase().includes(zoneFilter) ||
        row.zone.zoneCode.toLowerCase().includes(zoneFilter) ||
        row.zone.zoneName.toLowerCase().includes(zoneFilter)
      )
    })

  const overallStats = createBaseStats()
  const courierStats = new Map<string, any>()
  const zoneStats = new Map<string, any>()
  const pincodeStats = new Map<string, any>()
  const courierWeightStats = new Map<string, any>()
  const pincodeCourierStats = new Map<string, any>()
  const zoneCourierStats = new Map<string, any>()
  const weightStats = new Map<string, any>()
  const colorStats = new Map<string, any>()
  const priceStats = new Map<string, any>()
  const productStats = new Map<string, any>()
  const categoryStats = new Map<string, any>()
  const skuStats = new Map<string, any>()
  const skuProductMap = new Map<string, string>()
  const sizeStats = new Map<string, any>()
  const dispatchStats = new Map<string, any>()
  const ndrOrderIds = normalizedOrders.map((row) => row.id)

  for (const row of normalizedOrders) {
    applyOrderStats(overallStats, row)
    const courierKey = row.courierLabel || 'Unknown'
    const zoneKey = row.zone.label
    const pincodeKey = normalizeText(row.pincode).toLowerCase() || 'unknown'
    const weightKey = detectWeightSlab(row.weightNumber)
    const priceKey = detectPriceRange(row.orderAmountNumber)
    const dispatchKey =
      row.dispatchDays == null
        ? null
        : row.dispatchDays <= 0
          ? 'Same Day'
          : row.dispatchDays === 1
            ? '1 Day'
            : row.dispatchDays === 2
              ? '2 Days'
              : '3+ Days'

    applyOrderStats(getOrCreate(courierStats, courierKey, createBaseStats), row)

    const zoneBucket = getOrCreate(zoneStats, zoneKey, () =>
      emptyZoneStats(zoneKey, row.zone.zoneName, row.zone.zoneCode),
    )
    applyOrderStats(zoneBucket, row)

    const pincodeBucket = getOrCreate(pincodeStats, pincodeKey, () =>
      emptyPincodeStats(normalizeText(row.pincode) || 'Unknown', normalizeText(row.city) || 'Unknown', normalizeText(row.state) || 'Unknown'),
    )
    applyOrderStats(pincodeBucket, row)

    const zoneCourierBucket = getOrCreate(zoneCourierStats, zoneKey, () => ({}))
    const zoneCourierStat = getOrCreateRecord(zoneCourierBucket, courierKey, createBaseStats)
    applyOrderStats(zoneCourierStat, row)
    zoneBucket.courierStats[courierKey] = zoneCourierStat

    const pincodeCourierBucket = getOrCreate(pincodeCourierStats, pincodeKey, () => ({}))
    const pincodeCourierStat = getOrCreateRecord(pincodeCourierBucket, courierKey, createBaseStats)
    applyOrderStats(pincodeCourierStat, row)
    pincodeBucket.courierStats[courierKey] = pincodeCourierStat

    applyOrderStats(getOrCreate(weightStats, weightKey, createBaseStats), row)
    applyOrderStats(getOrCreate(priceStats, priceKey, createBaseStats), row)

    const courierWeightBucket = getOrCreate(courierWeightStats, courierKey, () => ({}))
    applyOrderStats(getOrCreateRecord(courierWeightBucket, weightKey, createBaseStats), row)

    if (dispatchKey) applyOrderStats(getOrCreate(dispatchStats, dispatchKey, createBaseStats), row)

    const tokens = collectProductTokens(row.products)
    for (const skuProduct of tokens.skuProducts || []) {
      if (!skuProductMap.has(skuProduct.sku)) skuProductMap.set(skuProduct.sku, skuProduct.product)
    }
    for (const product of tokens.products) applyOrderStats(getOrCreate(productStats, product, createBaseStats), row)
    for (const category of tokens.categories) applyOrderStats(getOrCreate(categoryStats, category, createBaseStats), row)
    for (const sku of tokens.skus) applyOrderStats(getOrCreate(skuStats, sku, createBaseStats), row)
    for (const size of tokens.sizes) applyOrderStats(getOrCreate(sizeStats, size, createBaseStats), row)
    for (const color of tokens.colors) applyOrderStats(getOrCreate(colorStats, color, createBaseStats), row)
    if (tokens.colors.length === 0) applyOrderStats(getOrCreate(colorStats, detectColorFromRow(row), createBaseStats), row)
  }

  const ndrReasonRows = ndrOrderIds.length
    ? await db
        .select({
          reason: ndr_events.reason,
          status: ndr_events.status,
          orderId: ndr_events.order_id,
        })
        .from(ndr_events)
        .where(inArray(ndr_events.order_id, ndrOrderIds))
    : []

  const ndrReasonStats = new Map<string, any>()
  for (const row of ndrReasonRows as any[]) {
    const reason = normalizeText(row.reason) || capitalizeWords(normalizeText(row.status) || 'Unknown')
    const order = normalizedOrders.find((item) => item.id === row.orderId)
    if (!order) continue
    applyOrderStats(getOrCreate(ndrReasonStats, reason, createBaseStats), order)
  }

  const zoneOverview = buildZoneOverview(zoneStats)
  const zoneNames = zoneOverview.map((item) => item.label)
  const topCouriers = topByOrders(buildPairMap(courierStats), 4)
  const matrixCouriers = topCouriers.map((item) => item.label)
  const courierZoneMatrix = matrixCouriers.map((courier) => ({
    courier,
    zones: zoneNames.map((zone) => {
      const stats = zoneCourierStats.get(zone)?.[courier]
      return {
        zone,
        deliveryRate: stats ? finalizeBaseStats(stats).deliveryRate : 0,
        orders: stats ? stats.orders : 0,
      }
    }),
  }))

  const zoneRtoAnalytics = zoneOverview.map((zone) => {
    const stats = zoneStats.get(zone.label)
    const finalized = stats ? finalizeBaseStats(stats) : finalizeBaseStats(createBaseStats())
    return { zone: zone.label, codRto: finalized.codRtoRate, prepaidRto: finalized.prepaidRtoRate }
  })

  const zoneSpeed = zoneOverview.map((zone) => {
    const couriers = Object.entries(zoneCourierStats.get(zone.label) || {})
      .map(([courier, stats]) => ({ courier, ...finalizeBaseStats(stats) }))
      .sort((a: any, b: any) => a.avgDeliveryDays - b.avgDeliveryDays || b.deliveryRate - a.deliveryRate || b.orders - a.orders)

    const bestCourier = couriers[0]
    return { zone: zone.label, bestCourier: bestCourier?.courier || 'Unknown', avgDays: bestCourier?.avgDeliveryDays || 0 }
  })

  const ndrAnalytics = buildPairMap(ndrReasonStats).slice(0, 5).map((item) => ({
    reason: item.label,
    count: item.orders,
    share: overallStats.orders ? Number(((item.orders / overallStats.orders) * 100).toFixed(1)) : 0,
  }))

  const courierPerformance = buildPairMap(courierStats).map((item) => ({
    courier: item.label,
    orders: item.orders,
    delivered: item.delivered,
    deliveryRate: item.deliveryRate,
    avgDeliveryDays: item.avgDeliveryDays,
    rtoRate: item.rtoRate,
  }))

  const highRiskPincodes = topByRisk(
    Array.from(pincodeStats.values()).map((stats: any) => ({
      pincode: stats.pincode,
      orders: stats.orders,
      rtoRate: finalizeBaseStats(stats).rtoRate,
    })),
    8,
  )

  const pincodeCourierComparison = Array.from(pincodeCourierStats.entries())
    .flatMap(([pincode, courierMap]: any) =>
      Object.entries(courierMap).map(([courier, stats]: any) => ({
        pincode,
        courier,
        ...finalizeBaseStats(stats),
      })),
    )
    .sort((a: any, b: any) => b.orders - a.orders || b.deliveryRate - a.deliveryRate)
    .slice(0, 8)

  const codFriendlyPincodes = Array.from(pincodeStats.values())
    .map((stats: any) => {
      const finalized = finalizeBaseStats(stats)
      return { pincode: stats.pincode, codDelivery: finalized.codDeliveryRate, codRto: finalized.codRtoRate }
    })
    .filter((item: any) => item.codDelivery > 0)
    .sort((a: any, b: any) => b.codDelivery - a.codDelivery || a.codRto - b.codRto)
    .slice(0, 6)

  const prepaidRecommendedPincodes = Array.from(pincodeStats.values())
    .map((stats: any) => ({ pincode: stats.pincode, codRto: finalizeBaseStats(stats).codRtoRate }))
    .sort((a: any, b: any) => b.codRto - a.codRto)
    .slice(0, 6)

  const weightDistribution = buildPairMap(weightStats).map((item) => ({
    label: item.label,
    orders: item.orders,
    share: overallStats.orders ? Number(((item.orders / overallStats.orders) * 100).toFixed(1)) : 0,
  }))

  const colorWiseRto = buildPairMap(colorStats)
    .map((item) => ({ color: item.label, rto: item.rtoRate }))
    .sort((a, b) => b.rto - a.rto)

  const priceWiseRto = buildPairMap(priceStats)
    .map((item) => ({ priceRange: item.label, rto: item.rtoRate }))
    .sort((a, b) => b.rto - a.rto)

  const courierRtoByWeight = matrixCouriers.map((courier) => {
    const buckets = courierWeightStats.get(courier) || {}
    return {
      courier,
      ...Object.fromEntries(
        Object.entries(buckets).map(([slab, stats]: any) => [slab, finalizeBaseStats(stats).rtoRate]),
      ),
    }
  })

  const productWiseRto = buildPairMap(productStats)
    .map((item) => ({
      product: item.label,
      orders: item.orders,
      delivered: item.delivered,
      rto: item.rto,
      rtoRate: item.rtoRate,
    }))
    .slice(0, 8)

  const categoryWiseRto = buildPairMap(categoryStats)
    .map((item) => ({ category: item.label, rtoRate: item.rtoRate }))
    .sort((a, b) => b.rtoRate - a.rtoRate)

  const skuWiseRto = buildPairMap(skuStats)
    .map((item) => ({
      sku: item.label,
      product: skuProductMap.get(item.label) || item.label,
      rtoRate: item.rtoRate,
    }))
    .slice(0, 8)

  const sizeOrder = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Other']
  const sizeWiseRto = buildPairMap(sizeStats)
    .map((item) => ({ size: item.label, rtoRate: item.rtoRate }))
    .sort((a, b) => sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size))

  const dispatchDelay = buildPairMap(dispatchStats)
    .map((item) => ({
      dispatchTime: item.label,
      orders: item.orders,
      deliveryRate: item.deliveryRate,
      rtoRate: item.rtoRate,
    }))
    .sort((a, b) => dispatchOrder(a.dispatchTime) - dispatchOrder(b.dispatchTime))

  const bestZone = zoneOverview[0] || null
  const worstZone =
    [...zoneOverview].sort((a, b) => a.deliveryRate - b.deliveryRate || b.rtoRate - a.rtoRate)[0] || null
  const bestCourier = topCouriers[0] || null
  const overallFinalized = finalizeBaseStats(overallStats)

  return {
    success: true,
    data: {
      summary: {
        totalOrders: overallStats.orders,
        deliveredOrders: overallStats.delivered,
        deliveryRate: overallFinalized.deliveryRate,
        rtoRate: overallFinalized.rtoRate,
        avgDeliveryDays: overallFinalized.avgDeliveryDays,
        avgDispatchDays: overallFinalized.avgDispatchDays,
        bestZone,
        worstZone,
        bestCourier,
      },
      zoneOverview,
      zoneCourierMatrix: {
        zones: zoneNames,
        couriers: matrixCouriers,
        rows: courierZoneMatrix,
      },
      zoneRtoAnalytics,
      zoneSpeed,
      ndrAnalytics,
      courierPerformance,
      highRiskPincodes,
      pincodeCourierComparison,
      codFriendlyPincodes,
      prepaidRecommendedPincodes,
      weightDistribution,
      colorWiseRto,
      priceWiseRto,
      courierRtoByWeight,
      productWiseRto,
      categoryWiseRto,
      skuWiseRto,
      sizeWiseRto,
      dispatchDelay,
      guidance: ['West India -> Delhivery Best', 'South India -> Ecom Best'],
      filtersApplied: {
        fromDate: filters.fromDate ?? null,
        toDate: filters.toDate ?? null,
        userId: filters.userId ?? null,
        accountId: filters.accountId ?? null,
        courier: filters.courier ?? null,
        zone: filters.zone ?? null,
        search: filters.search ?? null,
      },
    },
  }
}
