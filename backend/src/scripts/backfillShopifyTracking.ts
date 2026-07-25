import fs from 'node:fs'
import path from 'node:path'
import * as dotenv from 'dotenv'
import { and, eq, sql } from 'drizzle-orm'

const resolveEnvFile = () => {
  const explicitEnv = String(process.env.NODE_ENV || '').trim()
  const candidates = [
    explicitEnv ? path.resolve(__dirname, `../../.env.${explicitEnv}`) : '',
    path.resolve(__dirname, '../../.env.production'),
    path.resolve(__dirname, '../../.env.development'),
  ].filter(Boolean)

  return candidates.find((candidate) => fs.existsSync(candidate))
}

const envFile = resolveEnvFile()
if (envFile) dotenv.config({ path: envFile })

const getArgValue = (name: string) => {
  const prefix = `--${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length).trim() : undefined
}

const hasArg = (name: string) => process.argv.includes(`--${name}`)

const parseLimit = (value: unknown, fallback = 250, max = 1000) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.floor(parsed), max)
}

const text = (value: unknown) => String(value ?? '').trim()

const collectTrackingCandidates = (value: unknown, depth = 0): string[] => {
  if (depth > 5 || value === null || value === undefined) return []
  if (Array.isArray(value)) return value.flatMap((entry) => collectTrackingCandidates(entry, depth + 1))
  if (typeof value !== 'object') return []

  const candidates: string[] = []
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase()
    if (
      normalizedKey.includes('awb') ||
      normalizedKey.includes('waybill') ||
      normalizedKey.includes('tracking_number') ||
      normalizedKey.includes('trackingnumber') ||
      normalizedKey.includes('tracking_id') ||
      normalizedKey.includes('trackingid')
    ) {
      const candidate = text(nestedValue)
      if (candidate) candidates.push(candidate)
    }
    candidates.push(...collectTrackingCandidates(nestedValue, depth + 1))
  }
  return candidates
}

const looksLikeRealTrackingNumber = (candidate: string, order: any) => {
  const normalized = text(candidate)
  if (!normalized) return false
  if (normalized.startsWith('#')) return false
  if (normalized.length < 6 || normalized.length > 100) return false

  const blocked = [
    order?.id,
    order?.order_id,
    order?.order_number,
    order?.shipment_id,
    order?.provider_reference,
    order?.provider_request_id,
    order?.provider_meta?.shopify_order_id,
    order?.provider_meta?.shopify_store_id,
  ]
    .map((entry) => text(entry).toLowerCase())
    .filter(Boolean)

  return !blocked.includes(normalized.toLowerCase())
}

const resolveMetadataAwb = (order: any) =>
  collectTrackingCandidates(order?.provider_meta).find((candidate) =>
    looksLikeRealTrackingNumber(candidate, order),
  ) || ''

const safeProviderMeta = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, any>) } : {}

const main = async () => {
  const [{ db }, { b2c_orders }, { stores }, { tracking_events }, shopify] = await Promise.all([
    import('../models/client'),
    import('../models/schema/b2cOrders'),
    import('../models/schema/stores'),
    import('../models/schema/trackingEvents'),
    import('../models/services/shopify.service'),
  ])

  const storeId = getArgValue('store-id')
  const limit = parseLimit(getArgValue('limit') || process.env.SHOPIFY_TRACKING_BACKFILL_LIMIT, 250, 1000)
  const dryRun = hasArg('dry-run')

  const storeRows = await db
    .select()
    .from(stores)
    .where(
      storeId
        ? and(eq(stores.id, storeId), eq(stores.platformId, shopify.SHOPIFY_PLATFORM_ID))
        : eq(stores.platformId, shopify.SHOPIFY_PLATFORM_ID),
    )

  const summary = {
    stores: storeRows.length,
    orderRefresh: { created: 0, updated: 0, skipped: 0 },
    scannedMissingAwb: 0,
    repairedFromMetadata: 0,
    repairedFromTrackingEvents: 0,
    pushedToShopify: 0,
    pushFailed: 0,
    dryRun,
  }

  for (const store of storeRows) {
    const refreshed = await shopify.syncShopifyOrdersForUser(store.userId, Math.min(limit, 250), store.id, db)
    summary.orderRefresh.created += refreshed.created
    summary.orderRefresh.updated += refreshed.updated
    summary.orderRefresh.skipped += refreshed.skipped

    const missingAwbRows = await db
      .select()
      .from(b2c_orders)
      .where(sql`
        (
          ${b2c_orders.provider_meta}->>'shopify_store_id' = ${store.id}
          or ${b2c_orders.order_id} like ${`shopify_${store.id}_%`}
        )
        and coalesce(${b2c_orders.awb_number}, '') = ''
      `)
      .limit(limit)

    summary.scannedMissingAwb += missingAwbRows.length

    for (const order of missingAwbRows) {
      const [trackingEvent] = await db
        .select({ awb_number: tracking_events.awb_number })
        .from(tracking_events)
        .where(sql`${tracking_events.order_id} = ${order.id}::uuid and coalesce(${tracking_events.awb_number}, '') <> ''`)
        .orderBy(sql`${tracking_events.created_at} desc`)
        .limit(1)

      const metadataAwb = resolveMetadataAwb(order)
      const eventAwb = text(trackingEvent?.awb_number)
      const repairedAwb = metadataAwb || eventAwb
      if (!repairedAwb || !looksLikeRealTrackingNumber(repairedAwb, order)) continue

      if (!dryRun) {
        const providerMeta = safeProviderMeta(order.provider_meta)
        const currentStatus = text(order.order_status).toLowerCase()
        await db
          .update(b2c_orders)
          .set({
            awb_number: repairedAwb.slice(0, 100),
            order_status: ['pending', 'new', 'draft'].includes(currentStatus)
              ? 'booked'
              : order.order_status,
            provider_meta: {
              ...providerMeta,
              shopify_tracking_backfill: {
                repaired_at: new Date().toISOString(),
                source: metadataAwb ? 'provider_meta' : 'tracking_events',
                awb_number: repairedAwb.slice(0, 100),
              },
            },
            updated_at: new Date(),
          })
          .where(eq(b2c_orders.id, order.id))
      }

      if (metadataAwb) summary.repairedFromMetadata += 1
      else summary.repairedFromTrackingEvents += 1
    }

    const rowsToPush = await db
      .select()
      .from(b2c_orders)
      .where(sql`
        (
          ${b2c_orders.provider_meta}->>'shopify_store_id' = ${store.id}
          or ${b2c_orders.order_id} like ${`shopify_${store.id}_%`}
        )
        and coalesce(${b2c_orders.awb_number}, '') <> ''
      `)
      .limit(limit)

    for (const order of rowsToPush) {
      if (dryRun) {
        summary.pushedToShopify += 1
        continue
      }
      const result = await shopify.syncShopifyStatusForLocalOrder(order, db, {
        source: 'shopify-tracking-backfill',
      })
      if (result?.success === false) summary.pushFailed += 1
      else if (result?.attempted !== false) summary.pushedToShopify += 1
    }
  }

  console.log('[Shopify Tracking Backfill] Complete', summary)
}

main()
  .then(async () => {
    const { db } = await import('../models/client')
    await db.$client.end().catch(() => undefined)
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('[Shopify Tracking Backfill] Failed', err?.message || err)
    const { db } = await import('../models/client')
    await db.$client.end().catch(() => undefined)
    process.exit(1)
  })
