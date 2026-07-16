import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm'
import { db } from '../client'
import { rto_events } from '../schema/rto'
import { b2c_orders } from '../schema/b2cOrders'
import { sendWebhookEvent } from '../../services/webhookDelivery.service'
import { buildCsv } from '../../utils/csv'

export const RTO_ELIGIBLE_ORDER_SQL = sql`
  ${b2c_orders.id} is not null
  and nullif(trim(coalesce(${b2c_orders.awb_number}, '')), '') is not null
  and nullif(trim(coalesce(${b2c_orders.courier_partner}, '')), '') is not null
  and lower(trim(coalesce(${b2c_orders.courier_partner}, ''))) not in ('shopify', 'woocommerce', 'woo commerce')
`

export const RTO_INELIGIBLE_IMPORTED_ORDER_SQL = sql`
  (
    lower(trim(coalesce(${b2c_orders.integration_type}, ''))) in ('shopify', 'woocommerce')
    or lower(trim(coalesce(${b2c_orders.courier_partner}, ''))) in ('shopify', 'woocommerce', 'woo commerce')
    or lower(trim(coalesce(${b2c_orders.order_id}, ''))) like 'shopify_%'
    or lower(trim(coalesce(${b2c_orders.order_id}, ''))) like 'woocommerce_%'
    or lower(trim(coalesce(${b2c_orders.provider_meta}->>'source', ''))) in ('shopify', 'woocommerce')
  )
  and (
    nullif(trim(coalesce(${b2c_orders.awb_number}, '')), '') is null
    or lower(trim(coalesce(${b2c_orders.courier_partner}, ''))) in ('shopify', 'woocommerce', 'woo commerce')
  )
`

const getRtoEligibilityWhere = (base: SQL | undefined) =>
  and(base || sql`true`, RTO_ELIGIBLE_ORDER_SQL)

const assertOrderCanReceiveRto = async (orderId: string) => {
  const [order] = await db
    .select({
      id: b2c_orders.id,
      awb_number: b2c_orders.awb_number,
      courier_partner: b2c_orders.courier_partner,
      integration_type: b2c_orders.integration_type,
    })
    .from(b2c_orders)
    .where(and(eq(b2c_orders.id, orderId), RTO_ELIGIBLE_ORDER_SQL))
    .limit(1)

  if (!order?.id) {
    throw new Error('RTO can be recorded only after the order is booked with a real courier AWB.')
  }
}

const rtoEventListSelect = {
  id: rto_events.id,
  order_id: rto_events.order_id,
  user_id: rto_events.user_id,
  awb_number: rto_events.awb_number,
  status: rto_events.status,
  reason: rto_events.reason,
  remarks: rto_events.remarks,
  rto_charges: rto_events.rto_charges,
  created_at: rto_events.created_at,
  updated_at: rto_events.updated_at,
}

export async function recordRtoEvent(params: {
  orderId: string
  userId: string
  awbNumber?: string | null
  status: string
  reason?: string | null
  remarks?: string | null
  rtoCharges?: number | null
  payload?: any
}) {
  const { orderId, userId, awbNumber, status, reason, remarks, rtoCharges, payload } = params
  await assertOrderCanReceiveRto(orderId)

  const values = {
    order_id: orderId,
    user_id: userId,
    awb_number: awbNumber || null,
    status,
    reason: reason || null,
    remarks: remarks || null,
    rto_charges: rtoCharges || null,
    payload: payload || null,
    updated_at: new Date(),
  }

  const existingWhere = awbNumber
    ? and(eq(rto_events.user_id, userId), eq(rto_events.awb_number, awbNumber))
    : and(eq(rto_events.user_id, userId), eq(rto_events.order_id, orderId))

  const [existing] = await db
    .select({ id: rto_events.id })
    .from(rto_events)
    .where(existingWhere)
    .orderBy(desc(rto_events.updated_at), desc(rto_events.created_at))
    .limit(1)

  const [inserted] = existing?.id
    ? await db.update(rto_events).set(values).where(eq(rto_events.id, existing.id)).returning()
    : await db.insert(rto_events).values(values).returning()

  // 🔔 Send webhook event for RTO
  sendWebhookEvent(userId, 'order.rto', {
    order_id: orderId,
    awb_number: awbNumber,
    status,
    reason,
    remarks,
    rto_charges: rtoCharges,
    created_at: inserted.created_at?.toISOString() || new Date().toISOString(),
  }).catch((err) => {
    console.error('Failed to send RTO webhook event:', err)
    // Don't fail the main flow if webhook fails
  })

  return inserted
}

export async function listRtoEvents(
  userId: string,
  orderId?: string,
  params?: { page?: number; limit?: number; search?: string; fromDate?: string; toDate?: string },
) {
  const { page = 1, limit = 20, search = '', fromDate, toDate } = params || {}
  const whereBase = orderId
    ? and(eq(rto_events.user_id, userId), eq(rto_events.order_id, orderId))
    : eq(rto_events.user_id, userId)

  const searchWhere = search
    ? or(
        ilike(rto_events.awb_number, `%${search}%`),
        sql`(${rto_events.order_id}::text) ILIKE ${`%${search}%`}`,
        ilike(rto_events.reason, `%${search}%`),
        ilike(rto_events.remarks, `%${search}%`),
      )
    : undefined

  const dateWhere = fromDate || toDate
    ? and(
        fromDate ? gte(rto_events.created_at, new Date(fromDate)) : sql`true`,
        toDate ? lte(rto_events.created_at, new Date(toDate)) : sql`true`,
      )
    : undefined

  const where = searchWhere || dateWhere ? and(whereBase, searchWhere || sql`true`, dateWhere || sql`true`) : whereBase
  const eligibleWhere = getRtoEligibilityWhere(where)

  const offset = (page - 1) * limit

  const rows = await db
    .select(rtoEventListSelect)
    .from(rto_events)
    .leftJoin(b2c_orders, eq(b2c_orders.id, rto_events.order_id))
    .where(eligibleWhere)
    .orderBy(desc(rto_events.created_at))
    .limit(limit)
    .offset(offset)

  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)` })
    .from(rto_events)
    .leftJoin(b2c_orders, eq(b2c_orders.id, rto_events.order_id))
    .where(eligibleWhere)) as unknown as Array<{ count: number }>

  return { rows, totalCount: Number(count) || 0 }
}

export async function listRtoEventsAdmin(
  orderId?: string,
  params?: { page?: number; limit?: number; search?: string; fromDate?: string; toDate?: string },
) {
  const { page = 1, limit = 20, search = '', fromDate, toDate } = params || {}

  const whereBase = orderId ? eq(rto_events.order_id, orderId) : sql`true`
  const searchWhere = search
    ? or(
        ilike(rto_events.awb_number, `%${search}%`),
        sql`(${rto_events.order_id}::text) ILIKE ${`%${search}%`}`,
        ilike(rto_events.reason, `%${search}%`),
        ilike(rto_events.remarks, `%${search}%`),
      )
    : undefined

  const dateWhere = fromDate || toDate
    ? and(
        fromDate ? gte(rto_events.created_at, new Date(fromDate)) : sql`true`,
        toDate ? lte(rto_events.created_at, new Date(toDate)) : sql`true`,
      )
    : undefined

  const where = searchWhere || dateWhere ? and(whereBase, searchWhere || sql`true`, dateWhere || sql`true`) : whereBase
  const eligibleWhere = getRtoEligibilityWhere(where)

  const offset = (page - 1) * limit

  const rows = await db
    .select(rtoEventListSelect)
    .from(rto_events)
    .leftJoin(b2c_orders, eq(b2c_orders.id, rto_events.order_id))
    .where(eligibleWhere)
    .orderBy(desc(rto_events.created_at))
    .limit(limit)
    .offset(offset)

  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)` })
    .from(rto_events)
    .leftJoin(b2c_orders, eq(b2c_orders.id, rto_events.order_id))
    .where(eligibleWhere)) as unknown as Array<{ count: number }>

  return { rows, totalCount: Number(count) || 0 }
}

export async function adminRtoKpis(params?: {
  search?: string
  fromDate?: string
  toDate?: string
}) {
  const { search = '', fromDate, toDate } = params || {}

  const searchWhere = search
    ? or(
        ilike(rto_events.awb_number, `%${search}%`),
        sql`(${rto_events.order_id}::text) ILIKE ${`%${search}%`}`,
        ilike(rto_events.reason, `%${search}%`),
        ilike(rto_events.remarks, `%${search}%`),
      )
    : sql`true`

  const dateWhere = fromDate || toDate
    ? and(
        fromDate ? gte(rto_events.created_at, new Date(fromDate)) : sql`true`,
        toDate ? lte(rto_events.created_at, new Date(toDate)) : sql`true`,
      )
    : sql`true`

  const eligibleWhere = getRtoEligibilityWhere(and(searchWhere, dateWhere))

  // Totals
  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)` })
    .from(rto_events)
    .leftJoin(b2c_orders, eq(b2c_orders.id, rto_events.order_id))
    .where(eligibleWhere)) as unknown as Array<{ total: number }>

  // By status
  const byStatus = await db
    .select({ status: rto_events.status, count: sql<number>`count(*)` })
    .from(rto_events)
    .leftJoin(b2c_orders, eq(b2c_orders.id, rto_events.order_id))
    .where(eligibleWhere)
    .groupBy(rto_events.status)

  // Sum charges
  const [{ sumCharges }] = (await db
    .select({ sumCharges: sql<number>`coalesce(sum(${rto_events.rto_charges}), 0)` })
    .from(rto_events)
    .leftJoin(b2c_orders, eq(b2c_orders.id, rto_events.order_id))
    .where(eligibleWhere)) as unknown as Array<{ sumCharges: number }>

  // By courier (join orders)
  const byCourier = await db
    .select({
      courier: b2c_orders.courier_partner,
      count: sql<number>`count(*)`,
    })
    .from(rto_events)
    .leftJoin(b2c_orders, eq(b2c_orders.id, rto_events.order_id))
    .where(eligibleWhere)
    .groupBy(b2c_orders.courier_partner)

  return {
    total: Number(total) || 0,
    totalCharges: Number(sumCharges) || 0,
    byStatus: byStatus.map((r: any) => ({ status: r.status, count: Number(r.count) || 0 })),
    byCourier: byCourier.map((r: any) => ({ courier: r.courier || 'Unknown', count: Number(r.count) || 0 })),
  }
}

export async function adminRtoExport(params?: {
  search?: string
  fromDate?: string
  toDate?: string
}) {
  const { search = '', fromDate, toDate } = params || {}

  const searchWhere = search
    ? or(
        ilike(rto_events.awb_number, `%${search}%`),
        sql`(${rto_events.order_id}::text) ILIKE ${`%${search}%`}`,
        ilike(rto_events.reason, `%${search}%`),
        ilike(rto_events.remarks, `%${search}%`),
      )
    : sql`true`

  const dateWhere = fromDate || toDate
    ? and(
        fromDate ? gte(rto_events.created_at, new Date(fromDate)) : sql`true`,
        toDate ? lte(rto_events.created_at, new Date(toDate)) : sql`true`,
      )
    : sql`true`

  const eligibleWhere = getRtoEligibilityWhere(and(searchWhere, dateWhere))

  const rows = await db
    .select({
      created_at: rto_events.created_at,
      awb_number: rto_events.awb_number,
      order_id: rto_events.order_id,
      status: rto_events.status,
      reason: rto_events.reason,
      remarks: rto_events.remarks,
      rto_charges: rto_events.rto_charges,
      courier_partner: b2c_orders.courier_partner,
    })
    .from(rto_events)
    .leftJoin(b2c_orders, eq(b2c_orders.id, rto_events.order_id))
    .where(eligibleWhere)
    .orderBy(desc(rto_events.created_at))

  // Build CSV
  const headers = [
    'Created At',
    'AWB',
    'Order ID',
    'Status',
    'Reason',
    'Remarks',
    'RTO Charges',
    'Courier',
  ]
  const rowsData = (rows as any[]).map((r) => [
    r.created_at ? new Date(r.created_at).toISOString() : '',
    r.awb_number || '',
    r.order_id || '',
    r.status || '',
    r.reason || '',
    r.remarks || '',
    r.rto_charges != null ? Number(r.rto_charges) : '',
    r.courier_partner || '',
  ])

  return buildCsv(headers, rowsData)
}

export async function cleanupImportedUnbookedRtoEvents({ apply = false } = {}) {
  const countResult = (await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM ${rto_events}
    INNER JOIN ${b2c_orders} ON ${rto_events.order_id} = ${b2c_orders.id}
    WHERE ${RTO_INELIGIBLE_IMPORTED_ORDER_SQL}
  `)) as any

  const total = Number(countResult.rows?.[0]?.total || 0)
  if (!apply || total === 0) {
    return { deleted: 0, matched: total, dryRun: !apply }
  }

  const deleteResult = (await db.execute(sql`
    DELETE FROM ${rto_events}
    USING ${b2c_orders}
    WHERE ${rto_events.order_id} = ${b2c_orders.id}
      AND ${RTO_INELIGIBLE_IMPORTED_ORDER_SQL}
    RETURNING ${rto_events.id}
  `)) as any

  return {
    deleted: Number(deleteResult.rowCount ?? deleteResult.rows?.length ?? 0),
    matched: total,
    dryRun: false,
  }
}
