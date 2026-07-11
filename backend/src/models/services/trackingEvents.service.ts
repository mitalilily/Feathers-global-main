import { db } from '../client'
import { tracking_events } from '../schema/trackingEvents'
import { and, desc, eq } from 'drizzle-orm'

export async function logTrackingEvent(params: {
  orderId: string
  userId: string
  awbNumber?: string | null
  courier?: string | null
  statusCode?: string | null
  statusText?: string | null
  location?: string | null
  raw?: any
}) {
  const { orderId, userId, awbNumber, courier, statusCode, statusText, location, raw } = params

  const existingWhere = awbNumber
    ? and(eq(tracking_events.user_id, userId), eq(tracking_events.awb_number, awbNumber))
    : and(eq(tracking_events.user_id, userId), eq(tracking_events.order_id, orderId))

  const [existing] = await db
    .select({ id: tracking_events.id })
    .from(tracking_events)
    .where(existingWhere)
    .orderBy(desc(tracking_events.created_at))
    .limit(1)

  const values = {
    order_id: orderId,
    user_id: userId,
    awb_number: awbNumber || null,
    courier: courier || null,
    status_code: statusCode || null,
    status_text: statusText || null,
    location: location || null,
    raw: raw || null,
  }

  if (existing?.id) {
    await db.update(tracking_events).set(values).where(eq(tracking_events.id, existing.id))
    return
  }

  await db.insert(tracking_events).values(values)
}
