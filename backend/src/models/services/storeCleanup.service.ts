import { and, eq, inArray, like, or, sql } from 'drizzle-orm'

import { db } from '../client'
import { b2c_orders } from '../schema/b2cOrders'
import { codRemittances } from '../schema/codRemittance'
import { ndr_events } from '../schema/ndr'
import { rto_events } from '../schema/rto'
import { stores } from '../schema/stores'
import { tracking_events } from '../schema/trackingEvents'
import { weight_discrepancies } from '../schema/weightDiscrepancies'
import { xpressbeesAwbAllocations } from '../schema/xpressbeesAwb'

export const SHOPIFY_PLATFORM_ID = 1
export const WOOCOMMERCE_PLATFORM_ID = 2

type SupportedSalesChannel = 'shopify' | 'woocommerce'

type StoreCleanupRef = {
  id: string
  userId: string
  platformId: number
}

type OrderCandidateRow = {
  userId: string
  orderId: string | null
  tags: string | null
  providerMeta: Record<string, any> | null
}

type CleanupSummary = {
  channel: SupportedSalesChannel
  storeId: string
  userId: string
  orderIds: string[]
  ordersDeleted: number
  ndrDeleted: number
  rtoDeleted: number
  trackingDeleted: number
  codRemittancesDeleted: number
  xpressbeesAllocationsDeleted: number
  weightDiscrepanciesDeleted: number
}

export type OrphanCleanupSummary = {
  orphanedStores: number
  ordersDeleted: number
  ndrDeleted: number
  rtoDeleted: number
  trackingDeleted: number
  codRemittancesDeleted: number
  xpressbeesAllocationsDeleted: number
  weightDiscrepanciesDeleted: number
  stores: CleanupSummary[]
}

const SHOPIFY_STORE_TAG_PREFIX = 'shopify_store:'
const WOOCOMMERCE_STORE_TAG_PREFIX = 'woocommerce_store:'
const WOO_ORDER_ID_PATTERN = /^woo_(woo_[a-f0-9]{32})_.+$/i
const SHOPIFY_ORDER_ID_PATTERN = /^shopify_([^_]+)_.+$/i

const resolveSupportedSalesChannel = (platformId: number): SupportedSalesChannel | null => {
  if (platformId === SHOPIFY_PLATFORM_ID) return 'shopify'
  if (platformId === WOOCOMMERCE_PLATFORM_ID) return 'woocommerce'
  return null
}

const extractStoreIdFromTags = (tags: string | null | undefined, prefix: string) => {
  const rawTags = String(tags || '').trim()
  if (!rawTags) return ''

  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = rawTags.match(new RegExp(`${escapedPrefix}([^,\\s]+)`, 'i'))
  return String(match?.[1] || '').trim()
}

const buildStoreOrderPredicate = (storeRef: StoreCleanupRef) => {
  const channel = resolveSupportedSalesChannel(storeRef.platformId)
  if (!channel) return null

  const scopedUser = eq(b2c_orders.user_id, storeRef.userId)

  if (channel === 'shopify') {
    return and(
      scopedUser,
      or(
        like(b2c_orders.order_id, `shopify_${storeRef.id}_%`),
        like(b2c_orders.tags, `%${SHOPIFY_STORE_TAG_PREFIX}${storeRef.id}%`),
        sql`coalesce(${b2c_orders.provider_meta}->>'shopify_store_id', '') = ${storeRef.id}`,
      ),
    )
  }

  return and(
    scopedUser,
    or(
      like(b2c_orders.order_id, `woo_${storeRef.id}_%`),
      like(b2c_orders.tags, `%${WOOCOMMERCE_STORE_TAG_PREFIX}${storeRef.id}%`),
    ),
  )
}

const emptyCleanupSummary = (
  storeRef: StoreCleanupRef,
  channel: SupportedSalesChannel,
  orderIds: string[] = [],
): CleanupSummary => ({
  channel,
  storeId: storeRef.id,
  userId: storeRef.userId,
  orderIds,
  ordersDeleted: 0,
  ndrDeleted: 0,
  rtoDeleted: 0,
  trackingDeleted: 0,
  codRemittancesDeleted: 0,
  xpressbeesAllocationsDeleted: 0,
  weightDiscrepanciesDeleted: 0,
})

export const deleteSalesChannelOrdersForStore = async (
  storeRef: StoreCleanupRef,
  tx: any = db,
): Promise<CleanupSummary> => {
  const channel = resolveSupportedSalesChannel(storeRef.platformId)
  if (!channel) {
    return {
      channel: 'shopify',
      storeId: storeRef.id,
      userId: storeRef.userId,
      orderIds: [],
      ordersDeleted: 0,
      ndrDeleted: 0,
      rtoDeleted: 0,
      trackingDeleted: 0,
      codRemittancesDeleted: 0,
      xpressbeesAllocationsDeleted: 0,
      weightDiscrepanciesDeleted: 0,
    }
  }

  const predicate = buildStoreOrderPredicate(storeRef)
  if (!predicate) return emptyCleanupSummary(storeRef, channel)

  const rows = await tx
    .select({ id: b2c_orders.id })
    .from(b2c_orders)
    .where(predicate)

  const orderIds = rows.map((row: { id: string }) => row.id).filter(Boolean)
  const summary = emptyCleanupSummary(storeRef, channel, orderIds)

  if (orderIds.length === 0) {
    return summary
  }

  const deletedXpressbeesAllocations = await tx
    .delete(xpressbeesAwbAllocations)
    .where(inArray(xpressbeesAwbAllocations.localOrderId, orderIds))
    .returning({ id: xpressbeesAwbAllocations.id })

  const deletedCodRemittances = await tx
    .delete(codRemittances)
    .where(and(eq(codRemittances.orderType, 'b2c'), inArray(codRemittances.orderId, orderIds)))
    .returning({ id: codRemittances.id })

  const deletedNdr = await tx
    .delete(ndr_events)
    .where(inArray(ndr_events.order_id, orderIds))
    .returning({ id: ndr_events.id })

  const deletedRto = await tx
    .delete(rto_events)
    .where(inArray(rto_events.order_id, orderIds))
    .returning({ id: rto_events.id })

  const deletedTracking = await tx
    .delete(tracking_events)
    .where(inArray(tracking_events.order_id, orderIds))
    .returning({ id: tracking_events.id })

  const deletedWeightDiscrepancies = await tx
    .delete(weight_discrepancies)
    .where(inArray(weight_discrepancies.b2c_order_id, orderIds))
    .returning({ id: weight_discrepancies.id })

  const deletedOrders = await tx
    .delete(b2c_orders)
    .where(inArray(b2c_orders.id, orderIds))
    .returning({ id: b2c_orders.id })

  return {
    ...summary,
    ordersDeleted: deletedOrders.length,
    ndrDeleted: deletedNdr.length,
    rtoDeleted: deletedRto.length,
    trackingDeleted: deletedTracking.length,
    codRemittancesDeleted: deletedCodRemittances.length,
    xpressbeesAllocationsDeleted: deletedXpressbeesAllocations.length,
    weightDiscrepanciesDeleted: deletedWeightDiscrepancies.length,
  }
}

const deriveDisconnectedStoreRef = (row: OrderCandidateRow): StoreCleanupRef | null => {
  const userId = String(row.userId || '').trim()
  if (!userId) return null

  const orderId = String(row.orderId || '').trim()
  const providerMeta =
    row.providerMeta && typeof row.providerMeta === 'object' && !Array.isArray(row.providerMeta)
      ? row.providerMeta
      : {}

  const providerStoreId = String(providerMeta.shopify_store_id || '').trim()
  if (providerStoreId) {
    return {
      id: providerStoreId,
      userId,
      platformId: SHOPIFY_PLATFORM_ID,
    }
  }

  const shopifyTagStoreId = extractStoreIdFromTags(row.tags, SHOPIFY_STORE_TAG_PREFIX)
  if (shopifyTagStoreId) {
    return {
      id: shopifyTagStoreId,
      userId,
      platformId: SHOPIFY_PLATFORM_ID,
    }
  }

  const wooTagStoreId = extractStoreIdFromTags(row.tags, WOOCOMMERCE_STORE_TAG_PREFIX)
  if (wooTagStoreId) {
    return {
      id: wooTagStoreId,
      userId,
      platformId: WOOCOMMERCE_PLATFORM_ID,
    }
  }

  const wooMatch = orderId.match(WOO_ORDER_ID_PATTERN)
  if (wooMatch?.[1]) {
    return {
      id: wooMatch[1],
      userId,
      platformId: WOOCOMMERCE_PLATFORM_ID,
    }
  }

  const shopifyMatch = orderId.match(SHOPIFY_ORDER_ID_PATTERN)
  if (shopifyMatch?.[1]) {
    return {
      id: shopifyMatch[1],
      userId,
      platformId: SHOPIFY_PLATFORM_ID,
    }
  }

  return null
}

export const cleanupDisconnectedStoreOrders = async (tx: any = db): Promise<OrphanCleanupSummary> => {
  const candidateRows = (await tx
    .select({
      userId: b2c_orders.user_id,
      orderId: b2c_orders.order_id,
      tags: b2c_orders.tags,
      providerMeta: b2c_orders.provider_meta,
    })
    .from(b2c_orders)
    .where(
      or(
        like(b2c_orders.order_id, 'shopify_%'),
        like(b2c_orders.order_id, 'woo_%'),
        like(b2c_orders.tags, `%${SHOPIFY_STORE_TAG_PREFIX}%`),
        like(b2c_orders.tags, `%${WOOCOMMERCE_STORE_TAG_PREFIX}%`),
        sql`${b2c_orders.provider_meta}->>'shopify_store_id' is not null`,
      ),
    )) as OrderCandidateRow[]

  const storeRefs = new Map<string, StoreCleanupRef>()
  for (const row of candidateRows) {
    const ref = deriveDisconnectedStoreRef(row)
    if (!ref) continue
    storeRefs.set(`${ref.platformId}:${ref.userId}:${ref.id}`, ref)
  }

  if (storeRefs.size === 0) {
    return {
      orphanedStores: 0,
      ordersDeleted: 0,
      ndrDeleted: 0,
      rtoDeleted: 0,
      trackingDeleted: 0,
      codRemittancesDeleted: 0,
      xpressbeesAllocationsDeleted: 0,
      weightDiscrepanciesDeleted: 0,
      stores: [],
    }
  }

  const refs = Array.from(storeRefs.values())
  const activeStores = await tx
    .select({
      id: stores.id,
      userId: stores.userId,
      platformId: stores.platformId,
    })
    .from(stores)
    .where(inArray(stores.id, refs.map((ref) => ref.id)))

  const activeStoreKeys = new Set(
    activeStores.map(
      (store: { id: string; userId: string; platformId: number }) =>
        `${store.platformId}:${store.userId}:${store.id}`,
    ),
  )

  const orphanedRefs = refs.filter((ref) => !activeStoreKeys.has(`${ref.platformId}:${ref.userId}:${ref.id}`))
  const summaries: CleanupSummary[] = []

  for (const ref of orphanedRefs) {
    summaries.push(await deleteSalesChannelOrdersForStore(ref, tx))
  }

  return {
    orphanedStores: orphanedRefs.length,
    ordersDeleted: summaries.reduce((sum, item) => sum + item.ordersDeleted, 0),
    ndrDeleted: summaries.reduce((sum, item) => sum + item.ndrDeleted, 0),
    rtoDeleted: summaries.reduce((sum, item) => sum + item.rtoDeleted, 0),
    trackingDeleted: summaries.reduce((sum, item) => sum + item.trackingDeleted, 0),
    codRemittancesDeleted: summaries.reduce((sum, item) => sum + item.codRemittancesDeleted, 0),
    xpressbeesAllocationsDeleted: summaries.reduce((sum, item) => sum + item.xpressbeesAllocationsDeleted, 0),
    weightDiscrepanciesDeleted: summaries.reduce((sum, item) => sum + item.weightDiscrepanciesDeleted, 0),
    stores: summaries,
  }
}
