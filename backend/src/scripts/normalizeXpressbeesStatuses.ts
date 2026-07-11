import * as dotenv from 'dotenv'
import * as path from 'path'
import { and, desc, eq, ilike, or } from 'drizzle-orm'
import { db, pool } from '../models/client'
import { b2c_orders } from '../models/schema/b2cOrders'
import { tracking_events } from '../models/schema/trackingEvents'

const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

const normalizeText = (...parts: unknown[]) =>
  parts
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' | ')

const normalizeInternalStatus = (value: unknown) =>
  String(value || '').trim().toLowerCase().replace(/\s+/g, '_')

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
  if (
    status.includes('pickup') ||
    status.includes('manifest') ||
    status.includes('picked') ||
    status.includes('data received') ||
    status.includes('information received') ||
    status.includes('shipment created') ||
    status.includes('shipment booked') ||
    ['drc', 'pnd', 'pck', 'pku', 'pkd', 'manifested'].includes(status)
  ) {
    return 'pickup_initiated'
  }
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
    ['it', 'itran', 'rad', 'ship', 'shipped'].includes(status)
  ) {
    return 'in_transit'
  }

  return ''
}

const terminalStatuses = new Set(['cancelled', 'delivered', 'rto_delivered'])

async function main() {
  const targetAwb = process.argv
    .find((arg) => arg.startsWith('--awb='))
    ?.split('=')
    .slice(1)
    .join('=')
    .trim()

  const orders = await db
    .select()
    .from(b2c_orders)
    .where(
      and(
        targetAwb ? eq(b2c_orders.awb_number, targetAwb) : undefined,
        or(
          eq(b2c_orders.integration_type, 'xpressbees'),
          ilike(b2c_orders.courier_partner, '%xpress%'),
        ),
      ),
    )

  let checked = 0
  let updated = 0
  let skipped = 0

  for (const order of orders) {
    checked += 1
    const currentStatus = normalizeInternalStatus(order.order_status)
    if (terminalStatuses.has(currentStatus)) {
      skipped += 1
      continue
    }

    const [latestEvent] = await db
      .select()
      .from(tracking_events)
      .where(eq(tracking_events.order_id, order.id))
      .orderBy(desc(tracking_events.created_at))
      .limit(1)

    const mappedStatus = mapXpressbeesTrackingText(
      latestEvent?.status_text,
      latestEvent?.status_code,
      order.provider_last_status,
      order.delivery_message,
    )

    if (!mappedStatus) {
      skipped += 1
      continue
    }

    const isMismatchedTransit =
      currentStatus === 'in_transit' && ['booked', 'pickup_initiated'].includes(mappedStatus)
    const isMissingPickup =
      ['booked', 'shipment_created', 'pickup_initiated'].includes(mappedStatus) &&
      order.pickup_status !== 'pickup_initiated'

    if (!isMismatchedTransit && !isMissingPickup) {
      skipped += 1
      continue
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
    updated += 1

    console.log('Normalized Xpressbees order', {
      order_number: order.order_number,
      awb_number: order.awb_number,
      previous_status: currentStatus,
      normalized_status: updateData.order_status || currentStatus,
      latest_tracking_status: latestEvent?.status_text || latestEvent?.status_code || null,
    })
  }

  console.log({ checked, updated, skipped, targetAwb: targetAwb || null })
}

main()
  .catch((err) => {
    console.error('Failed to normalize Xpressbees statuses:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end().catch(() => undefined)
  })
