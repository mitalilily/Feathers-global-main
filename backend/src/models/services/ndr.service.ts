import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { b2c_orders } from '../schema/b2cOrders'
import { userProfiles } from '../schema/userProfile'
import { ndr_events } from '../schema/ndr'
import { tracking_events } from '../schema/trackingEvents'
import { sendWebhookEvent } from '../../services/webhookDelivery.service'

export async function recordNdrEvent(params: {
  orderId: string
  userId: string
  awbNumber?: string | null
  status: string
  reason?: string | null
  remarks?: string | null
  attemptNo?: string | null
  payload?: any
}) {
  const { orderId, userId, awbNumber, status, reason, remarks, attemptNo, payload } = params

  const values = {
    order_id: orderId,
    user_id: userId,
    awb_number: awbNumber || null,
    status,
    reason: reason || null,
    remarks: remarks || null,
    attempt_no: attemptNo || null,
    payload: payload || null,
    updated_at: new Date(),
  }

  const existingWhere = awbNumber
    ? and(eq(ndr_events.user_id, userId), eq(ndr_events.awb_number, awbNumber))
    : and(eq(ndr_events.user_id, userId), eq(ndr_events.order_id, orderId))

  const [existing] = await db
    .select({ id: ndr_events.id })
    .from(ndr_events)
    .where(existingWhere)
    .orderBy(desc(ndr_events.updated_at), desc(ndr_events.created_at))
    .limit(1)

  const [inserted] = existing?.id
    ? await db.update(ndr_events).set(values).where(eq(ndr_events.id, existing.id)).returning()
    : await db.insert(ndr_events).values(values).returning()

  // 🔔 Send webhook event for NDR
  sendWebhookEvent(userId, 'order.ndr', {
    order_id: orderId,
    awb_number: awbNumber,
    status,
    reason,
    remarks,
    attempt_no: attemptNo,
    created_at: inserted.created_at?.toISOString() || new Date().toISOString(),
  }).catch((err) => {
    console.error('Failed to send NDR webhook event:', err)
    // Don't fail the main flow if webhook fails
  })

  return inserted
}

export async function listNdrEvents(
  userId: string,
  orderId?: string,
  params?: { page?: number; limit?: number; search?: string; fromDate?: string; toDate?: string },
) {
  const { page = 1, limit = 20, search = '', fromDate, toDate } = params || {}
  const whereBase = orderId
    ? and(eq(ndr_events.user_id, userId), eq(ndr_events.order_id, orderId))
    : eq(ndr_events.user_id, userId)

  const searchWhere = search
    ? or(
        ilike(ndr_events.awb_number, `%${search}%`),
        // order_id is UUID → cast to text for ILIKE
        sql`(${ndr_events.order_id}::text) ILIKE ${`%${search}%`}`,
        ilike(b2c_orders.order_number, `%${search}%`),
        ilike(b2c_orders.buyer_name, `%${search}%`),
        ilike(b2c_orders.buyer_phone, `%${search}%`),
        ilike(ndr_events.reason, `%${search}%`),
        ilike(ndr_events.remarks, `%${search}%`),
      )
    : undefined

  const parsedFrom = fromDate ? new Date(fromDate) : undefined
  const parsedTo = toDate ? new Date(toDate) : undefined
  const hasValidFrom = parsedFrom && !isNaN(parsedFrom.getTime())
  const hasValidTo = parsedTo && !isNaN(parsedTo.getTime())
  const dateWhere = hasValidFrom || hasValidTo
    ? and(
        hasValidFrom ? gte(ndr_events.created_at, parsedFrom as Date) : sql`true`,
        hasValidTo ? lte(ndr_events.created_at, parsedTo as Date) : sql`true`,
      )
    : undefined

  const where =
    searchWhere || dateWhere
      ? and(whereBase, searchWhere || sql`true`, dateWhere || sql`true`)
      : whereBase

  const offset = (page - 1) * limit
  const countResult = (await db.execute(sql`
    WITH filtered AS (
      SELECT
        ${ndr_events.id} AS id,
        ${ndr_events.order_id} AS order_id,
        row_number() OVER (
          PARTITION BY ${ndr_events.order_id}
          ORDER BY ${ndr_events.created_at} DESC, ${ndr_events.id} DESC
        ) AS rn
      FROM ${ndr_events}
      LEFT JOIN ${b2c_orders} ON ${ndr_events.order_id} = ${b2c_orders.id}
      WHERE ${where}
    )
    SELECT COUNT(*)::int AS total
    FROM filtered
    WHERE rn = 1
  `)) as any

  const totalCount = Number(countResult.rows?.[0]?.total || 0)
  if (totalCount === 0) {
    return { rows: [], totalCount: 0 }
  }

  const rowsResult = (await db.execute(sql`
    WITH filtered AS (
      SELECT
        ${ndr_events.id} AS id,
        ${ndr_events.awb_number} AS awb_number,
        ${ndr_events.order_id} AS order_id,
        ${ndr_events.status} AS status,
        ${ndr_events.reason} AS reason,
        ${ndr_events.remarks} AS remarks,
        ${ndr_events.attempt_no} AS attempt_no,
        ${ndr_events.created_at} AS created_at,
        ${ndr_events.updated_at} AS last_event_time,
        ${b2c_orders.order_number} AS order_number,
        ${b2c_orders.buyer_name} AS buyer_name,
        ${b2c_orders.buyer_phone} AS buyer_phone,
        ${b2c_orders.courier_partner} AS courier_partner,
        ${b2c_orders.integration_type} AS integration_type,
        row_number() OVER (
          PARTITION BY ${ndr_events.order_id}
          ORDER BY ${ndr_events.created_at} DESC, ${ndr_events.id} DESC
        ) AS rn
      FROM ${ndr_events}
      LEFT JOIN ${b2c_orders} ON ${ndr_events.order_id} = ${b2c_orders.id}
      WHERE ${where}
    )
    SELECT
      id,
      awb_number,
      order_id,
      status,
      reason,
      remarks,
      attempt_no,
      created_at,
      last_event_time,
      order_number,
      buyer_name,
      buyer_phone,
      courier_partner,
      integration_type
    FROM filtered
    WHERE rn = 1
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `)) as any

  return { rows: rowsResult.rows || [], totalCount }
}

export async function listNdrEventsAdmin(
  orderId?: string,
  params?: {
    page?: number
    limit?: number
    search?: string
    fromDate?: string
    toDate?: string
    courier?: string
    integration_type?: string
    attempt_count?: number
    status?: string
  },
) {
  const {
    page = 1,
    limit = 20,
    search = '',
    fromDate,
    toDate,
    courier,
    integration_type,
    attempt_count,
    status,
  } = params || {}

  const base = orderId ? eq(ndr_events.order_id, orderId) : sql`true`

  const searchWhere = search
    ? or(
        ilike(ndr_events.awb_number, `%${search}%`),
        // order_id is UUID → cast to text for ILIKE
        sql`(${ndr_events.order_id}::text) ILIKE ${`%${search}%`}`,
        ilike(b2c_orders.order_number, `%${search}%`),
        ilike(b2c_orders.buyer_name, `%${search}%`),
        ilike(b2c_orders.buyer_phone, `%${search}%`),
        ilike(ndr_events.reason, `%${search}%`),
        ilike(ndr_events.remarks, `%${search}%`),
      )
    : undefined

  const parsedFromA = fromDate ? new Date(fromDate) : undefined
  const parsedToA = toDate ? new Date(toDate) : undefined
  const hasValidFromA = parsedFromA && !isNaN(parsedFromA.getTime())
  const hasValidToA = parsedToA && !isNaN(parsedToA.getTime())
  const dateWhere = hasValidFromA || hasValidToA
    ? and(
        hasValidFromA ? gte(ndr_events.created_at, parsedFromA as Date) : sql`true`,
        hasValidToA ? lte(ndr_events.created_at, parsedToA as Date) : sql`true`,
      )
    : undefined

  const statusWhere = status ? ilike(ndr_events.status, `%${status}%`) : undefined

  // Build join with orders to filter by courier/integration_type and to project columns
  const whereFinal = and(
    base,
    searchWhere || sql`true`,
    dateWhere || sql`true`,
    statusWhere || sql`true`,
  )

  const offset = (page - 1) * limit
  const scopedWhere = and(
    whereFinal,
    courier ? ilike(b2c_orders.courier_partner, `%${courier}%`) : sql`true`,
    integration_type ? ilike(b2c_orders.integration_type, `%${integration_type}%`) : sql`true`,
    attempt_count ? eq(ndr_events.attempt_no, String(attempt_count)) : sql`true`,
  )

  const countResult = (await db.execute(sql`
    WITH filtered AS (
      SELECT
        ${ndr_events.id} AS id,
        ${ndr_events.order_id} AS order_id,
        row_number() OVER (
          PARTITION BY ${ndr_events.order_id}
          ORDER BY ${ndr_events.created_at} DESC, ${ndr_events.id} DESC
        ) AS rn
      FROM ${ndr_events}
      LEFT JOIN ${b2c_orders} ON ${ndr_events.order_id} = ${b2c_orders.id}
      LEFT JOIN ${userProfiles} ON ${userProfiles.userId} = ${b2c_orders.user_id}
      WHERE ${scopedWhere}
    )
    SELECT COUNT(*)::int AS total
    FROM filtered
    WHERE rn = 1
  `)) as any

  const totalCount = Number(countResult.rows?.[0]?.total || 0)
  if (totalCount === 0) {
    return { rows: [], totalCount: 0 }
  }

  const rowsResult = (await db.execute(sql`
    WITH filtered AS (
      SELECT
        ${ndr_events.id} AS id,
        ${ndr_events.awb_number} AS awb_number,
        ${ndr_events.order_id} AS order_id,
        ${ndr_events.status} AS status,
        ${ndr_events.reason} AS reason,
        ${ndr_events.remarks} AS remarks,
        ${ndr_events.attempt_no} AS attempt_no,
        ${ndr_events.created_at} AS created_at,
        ${b2c_orders.order_number} AS order_number,
        ${b2c_orders.buyer_name} AS buyer_name,
        ${b2c_orders.buyer_phone} AS buyer_phone,
        ${b2c_orders.courier_partner} AS courier_partner,
        ${b2c_orders.integration_type} AS integration_type,
        ${b2c_orders.user_id} AS merchant_id,
        ${userProfiles.companyInfo} ->> 'companyName' AS merchant_name,
        ${ndr_events.updated_at} AS last_event_time,
        CASE
          WHEN ${ndr_events.payload} ->> 'source' = 'admin_manual' THEN 'admin'
          ELSE 'webhook'
        END AS source,
        row_number() OVER (
          PARTITION BY ${ndr_events.order_id}
          ORDER BY ${ndr_events.created_at} DESC, ${ndr_events.id} DESC
        ) AS rn
      FROM ${ndr_events}
      LEFT JOIN ${b2c_orders} ON ${ndr_events.order_id} = ${b2c_orders.id}
      LEFT JOIN ${userProfiles} ON ${userProfiles.userId} = ${b2c_orders.user_id}
      WHERE ${scopedWhere}
    )
    SELECT
      id,
      awb_number,
      order_id,
      status,
      reason,
      remarks,
      attempt_no,
      created_at,
      order_number,
      buyer_name,
      buyer_phone,
      courier_partner,
      integration_type,
      merchant_id,
      merchant_name,
      last_event_time,
      source
    FROM filtered
    WHERE rn = 1
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `)) as any

  return { rows: rowsResult.rows || [], totalCount }
}

export async function getNdrTimeline(params: { awb?: string; orderId?: string }) {
  const { awb, orderId } = params

  let orderRow: { id: string; awb_number: string | null } | null = null

  if (orderId) {
    const [o] = await db
      .select({ id: b2c_orders.id, awb_number: b2c_orders.awb_number })
      .from(b2c_orders)
      .where(eq(b2c_orders.id, orderId))
      .limit(1)
    if (o) orderRow = o
  } else if (awb) {
    const [o] = await db
      .select({ id: b2c_orders.id, awb_number: b2c_orders.awb_number })
      .from(b2c_orders)
      .where(eq(b2c_orders.awb_number, awb))
      .limit(1)
    if (o) orderRow = o
  }

  const resolvedOrderId = orderRow?.id
  const resolvedAwb = orderRow?.awb_number || awb

  // NDR events timeline
  const ndr = await db
    .select({
      type: sql<string>`'ndr'`,
      at: ndr_events.created_at,
      status: ndr_events.status,
      remarks: ndr_events.remarks,
      reason: ndr_events.reason,
      attempt_no: ndr_events.attempt_no,
      raw: ndr_events.payload,
    })
    .from(ndr_events)
    .where(resolvedOrderId ? eq(ndr_events.order_id, resolvedOrderId) : sql`false`)

  // Tracking events timeline (optional)
  const tracking = resolvedAwb
    ? await db
        .select({
          type: sql<string>`'tracking'`,
          at: tracking_events.created_at,
          status: tracking_events.status_code,
          remarks: tracking_events.status_text,
          reason: sql<string>`null`,
          attempt_no: sql<string>`null`,
          raw: tracking_events.raw,
        })
        .from(tracking_events)
        .where(eq(tracking_events.awb_number, resolvedAwb))
    : []

  const combined = [...ndr, ...tracking].sort(
    (a, b) => new Date(a.at as any).getTime() - new Date(b.at as any).getTime(),
  )

  return { orderId: resolvedOrderId, awb: resolvedAwb, events: combined }
}
