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

const isPrePickupEkartReverseStatus = (...parts: unknown[]) => {
  const status = normalizeText(...parts)
  if (!status) return true

  return (
    status.includes('order placed') ||
    status.includes('created') ||
    status.includes('shipment created') ||
    status.includes('manifest') ||
    status.includes('manifested') ||
    status.includes('consignment manifested') ||
    status === 'pickup_initiated'
  )
}

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
        eq(b2c_orders.order_type, 'reverse'),
        or(eq(b2c_orders.integration_type, 'ekart'), ilike(b2c_orders.courier_partner, '%ekart%')),
      ),
    )

  let checked = 0
  let updated = 0
  let skipped = 0

  for (const order of orders) {
    checked += 1
    const currentStatus = normalizeInternalStatus(order.order_status)
    if (['cancelled', 'delivered', 'rto_delivered'].includes(currentStatus)) {
      skipped += 1
      continue
    }

    const [latestEvent] = await db
      .select()
      .from(tracking_events)
      .where(eq(tracking_events.order_id, order.id))
      .orderBy(desc(tracking_events.created_at))
      .limit(1)

    const prePickup = isPrePickupEkartReverseStatus(
      latestEvent?.status_text,
      latestEvent?.status_code,
      order.provider_last_status,
      order.delivery_message,
    )

    if (!prePickup || currentStatus !== 'pickup_initiated') {
      skipped += 1
      continue
    }

    await db
      .update(b2c_orders)
      .set({
        order_status: 'booked',
        pickup_status: 'pending',
        provider_last_status: String(
          latestEvent?.status_text || latestEvent?.status_code || order.provider_last_status || 'booked',
        ).slice(0, 80),
        updated_at: new Date(),
      } as any)
      .where(eq(b2c_orders.id, order.id))

    updated += 1
    console.log('Normalized Ekart reverse order', {
      order_number: order.order_number,
      awb_number: order.awb_number,
      previous_status: currentStatus,
      normalized_status: 'booked',
      latest_tracking_status: latestEvent?.status_text || latestEvent?.status_code || null,
    })
  }

  console.log({ checked, updated, skipped, targetAwb: targetAwb || null })
}

main()
  .catch((err) => {
    console.error('Failed to normalize Ekart reverse statuses:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end().catch(() => undefined)
  })
