import * as dotenv from 'dotenv'
import * as path from 'path'
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm'
import { db, pool } from '../models/client'
import { b2c_orders } from '../models/schema/b2cOrders'
import { tracking_events } from '../models/schema/trackingEvents'
import { trackByAwbService } from '../models/services/shiprocket.service'

const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

const normalizeText = (...parts: unknown[]) =>
  parts
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' | ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const normalizeInternalStatus = (value: unknown) =>
  String(value || '').trim().toLowerCase().replace(/\s+/g, '_')

const hasStatusToken = (status: string, token: string) =>
  new RegExp(`(^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(status)

const isPickupStageStatus = (status: string) =>
  Boolean(status) &&
  (
    status.includes('pending pickup') ||
    status.includes('pickup scheduled') ||
    status.includes('pickup requested') ||
    status.includes('pickup assigned') ||
    status.includes('assigned for pickup') ||
    status.includes('out for pickup') ||
    status.includes('pickup booked') ||
    status.includes('manifest') ||
    status.includes('picked') ||
    status.includes('data received') ||
    status.includes('information received') ||
    status.includes('shipment created') ||
    status.includes('shipment booked') ||
    hasStatusToken(status, 'pp') ||
    hasStatusToken(status, 'drc') ||
    hasStatusToken(status, 'pnd') ||
    hasStatusToken(status, 'pck') ||
    hasStatusToken(status, 'pku') ||
    hasStatusToken(status, 'pkd')
  )

const mapXpressbeesTrackingText = (...parts: unknown[]) => {
  const status = normalizeText(...parts)
  if (!status || ['success', 'successful', 'ok', 'true', 'false'].includes(status)) return ''

  if (status.includes('cancel')) return 'cancelled'
  if (status.includes('ndr') || status.includes('undeliver') || status.includes('attempt')) return 'ndr'
  if (status.includes('rto delivered') || status.includes('return delivered')) return 'rto_delivered'
  if (status.includes('rto') || status.includes('return to origin') || status.includes('rts')) {
    return 'rto_in_transit'
  }
  if (status.includes('out for delivery') || status.includes('ofd')) return 'out_for_delivery'
  if (status.includes('delivered')) return 'delivered'
  if (isPickupStageStatus(status)) return 'pickup_initiated'
  if (status.includes('booked') || status.includes('created') || status.includes('order placed')) {
    return 'booked'
  }
  if (
    status.includes('in transit') ||
    status.includes('dispatched') ||
    status.includes('bagged') ||
    status.includes('reached at') ||
    status.includes('arrived at') ||
    status.includes('departed') ||
    hasStatusToken(status, 'it') ||
    hasStatusToken(status, 'itran') ||
    hasStatusToken(status, 'rad') ||
    hasStatusToken(status, 'ship') ||
    hasStatusToken(status, 'shipped')
  ) {
    return 'in_transit'
  }

  return ''
}

const terminalStatuses = new Set(['cancelled', 'delivered', 'rto_delivered'])

const parseTargetAwbs = () => {
  const values: string[] = []

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--awb=')) {
      values.push(...arg.split('=').slice(1).join('=').split(/[,\s]+/))
      continue
    }
    if (/^\d{8,}$/.test(arg)) values.push(arg)
  }

  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

async function fetchOrderById(id: string) {
  const [order] = await db.select().from(b2c_orders).where(eq(b2c_orders.id, id)).limit(1)
  return order
}

async function applyStoredTrackingFallback(order: typeof b2c_orders.$inferSelect) {
  const currentStatus = normalizeInternalStatus(order.order_status)
  if (terminalStatuses.has(currentStatus)) {
    return { action: 'skipped_terminal', status: currentStatus }
  }

  const [latestEvent] = await db
    .select()
    .from(tracking_events)
    .where(eq(tracking_events.order_id, order.id))
    .orderBy(desc(tracking_events.created_at))
    .limit(1)

  const statusText = normalizeText(
    latestEvent?.status_text,
    latestEvent?.status_code,
    order.provider_last_status,
    order.delivery_message,
  )
  const mappedStatus = mapXpressbeesTrackingText(statusText)

  if (!mappedStatus) {
    return { action: 'skipped_unmapped', status: currentStatus }
  }

  const isMismatchedTransit =
    currentStatus === 'in_transit' && mappedStatus === 'pickup_initiated' && isPickupStageStatus(statusText)
  const isMissingPickup =
    ['booked', 'shipment_created', 'pickup_initiated'].includes(mappedStatus) &&
    order.pickup_status !== 'pickup_initiated'

  if (!isMismatchedTransit && !isMissingPickup) {
    return { action: 'skipped_current', status: currentStatus }
  }

  const updateData: Record<string, unknown> = {
    pickup_status: 'pickup_initiated',
    pickup_error: null,
    manifest_error: null,
    updated_at: new Date(),
  }

  if (isMismatchedTransit) {
    updateData.order_status = mappedStatus
    updateData.provider_last_status = String(
      latestEvent?.status_text || latestEvent?.status_code || order.provider_last_status || mappedStatus,
    ).slice(0, 80)
  }

  await db.update(b2c_orders).set(updateData as any).where(eq(b2c_orders.id, order.id))

  return {
    action: 'stored_tracking_fallback_updated',
    status: String(updateData.order_status || currentStatus),
    latest_tracking_status: latestEvent?.status_text || latestEvent?.status_code || null,
  }
}

async function main() {
  const targetAwbs = parseTargetAwbs()

  const orders = await db
    .select()
    .from(b2c_orders)
    .where(
      and(
        targetAwbs.length ? inArray(b2c_orders.awb_number, targetAwbs) : undefined,
        or(
          eq(b2c_orders.integration_type, 'xpressbees'),
          ilike(b2c_orders.courier_partner, '%xpress%'),
        ),
      ),
    )

  let checked = 0
  let liveUpdated = 0
  let fallbackUpdated = 0
  let skipped = 0
  let failed = 0

  for (const order of orders) {
    checked += 1
    const beforeStatus = normalizeInternalStatus(order.order_status)
    const awb = String(order.awb_number || '').trim()

    if (!awb) {
      skipped += 1
      continue
    }

    try {
      await trackByAwbService(awb)
      const freshOrder = await fetchOrderById(order.id)
      const afterStatus = normalizeInternalStatus(freshOrder?.order_status)

      if (afterStatus && afterStatus !== beforeStatus) liveUpdated += 1
      else skipped += 1

      console.log('Live-normalized Xpressbees order', {
        order_number: order.order_number,
        awb_number: awb,
        previous_status: beforeStatus,
        normalized_status: afterStatus || beforeStatus,
        provider_last_status: freshOrder?.provider_last_status || null,
      })
      continue
    } catch (err: any) {
      console.warn('Live Xpressbees status fetch failed; trying stored tracking fallback', {
        order_number: order.order_number,
        awb_number: awb,
        error: err?.message || err,
      })
    }

    const fallbackResult = await applyStoredTrackingFallback(order)
    if (fallbackResult.action === 'stored_tracking_fallback_updated') fallbackUpdated += 1
    else if (fallbackResult.action.startsWith('skipped')) skipped += 1
    else failed += 1

    console.log('Stored-normalized Xpressbees order', {
      order_number: order.order_number,
      awb_number: awb,
      previous_status: beforeStatus,
      normalized_status: fallbackResult.status,
      action: fallbackResult.action,
      latest_tracking_status: fallbackResult.latest_tracking_status || null,
    })
  }

  console.log({
    checked,
    liveUpdated,
    fallbackUpdated,
    skipped,
    failed,
    targetAwbs: targetAwbs.length ? targetAwbs : null,
  })
}

main()
  .catch((err) => {
    console.error('Failed to normalize Xpressbees statuses:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end().catch(() => undefined)
  })
