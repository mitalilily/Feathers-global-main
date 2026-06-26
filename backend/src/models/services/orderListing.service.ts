import { inArray, sql, SQL } from 'drizzle-orm'
import { db } from '../client'
import { b2b_orders } from '../schema/b2bOrders'
import { b2c_orders } from '../schema/b2cOrders'
import { userProfiles } from '../schema/userProfile'
import { users } from '../schema/users'
import { b2bOrderListSelect, b2cOrderListSelect } from './orderListSelects'

export interface CombinedOrderFilters {
  userId?: string
  status?: string | string[]
  fromDate?: string
  toDate?: string
  search?: string
  pickupAlert?: 'pending_for_pickup' | 'not_scheduled' | string
  sortOrder?: 'asc' | 'desc'
}

type CombinedOrderType = 'b2c' | 'b2b'

type CombinedOrderPageRow = {
  id: string
  type: CombinedOrderType
  user_id: string
  created_at: Date | null
}

const DEFAULT_PAGE_LIMIT = 10

const toSqlDateStart = (value: string) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

const toSqlDateEnd = (value: string) => {
  const date = new Date(value)
  date.setHours(23, 59, 59, 999)
  return date
}

const buildStatusCondition = (qualifiedColumn: string, status?: string | string[]) => {
  if (!status) return null

  if (Array.isArray(status)) {
    const normalized = status.map((value) => String(value || '').trim()).filter(Boolean)
    if (normalized.length === 0) return null
    return sql`${sql.raw(qualifiedColumn)} IN (${sql.join(
      normalized.map((value) => sql`${value}`),
      sql`, `,
    )})`
  }

  return sql`${sql.raw(qualifiedColumn)} = ${String(status).trim()}`
}

const buildSearchCondition = (alias: 'b2c' | 'b2b', search?: string) => {
  const trimmed = String(search || '').trim()
  if (!trimmed) return null

  const pattern = `%${trimmed}%`
  return sql`(
    COALESCE(${sql.raw(`${alias}.order_number`)}, '') ILIKE ${pattern}
    OR COALESCE(${sql.raw(`${alias}.buyer_name`)}, '') ILIKE ${pattern}
    OR COALESCE(${sql.raw(`${alias}.buyer_phone`)}, '') ILIKE ${pattern}
    OR COALESCE(${sql.raw(`${alias}.awb_number`)}, '') ILIKE ${pattern}
    OR COALESCE(${sql.raw(`${alias}.provider_reference`)}, '') ILIKE ${pattern}
    OR COALESCE(${sql.raw(`${alias}.provider_request_id`)}, '') ILIKE ${pattern}
  )`
}

const buildPickupAlertCondition = (alias: 'b2c' | 'b2b', pickupAlert?: string) => {
  const normalizedAlert = String(pickupAlert || '').trim()
  if (!normalizedAlert) return null

  const orderStatus = sql`lower(coalesce(${sql.raw(`${alias}.order_status`)}, ''))`
  const activeShipmentCondition = sql`(
    coalesce(${sql.raw(`${alias}.awb_number`)}, '') <> ''
    OR coalesce(${sql.raw(`${alias}.shipment_id`)}, '') <> ''
  ) AND ${orderStatus} NOT IN (
    'in_transit',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'rto',
    'rto_in_transit',
    'rto_delivered'
  )`
  const missingPickupSlotCondition = sql`(
    coalesce(${sql.raw(`${alias}.pickup_details`)} ->> 'pickup_date', '') = ''
    AND coalesce(${sql.raw(`${alias}.pickup_details`)} ->> 'pickupDate', '') = ''
    AND coalesce(${sql.raw(`${alias}.pickup_details`)} ->> 'requested_pickup_date', '') = ''
    AND coalesce(${sql.raw(`${alias}.pickup_details`)} ->> 'requestedPickupDate', '') = ''
    AND coalesce(${sql.raw(`${alias}.pickup_details`)} ->> 'expected_pickup_date', '') = ''
    AND coalesce(${sql.raw(`${alias}.pickup_details`)} ->> 'expectedPickupDate', '') = ''
  )`

  if (normalizedAlert === 'pending_for_pickup') {
    if (alias === 'b2c') {
      const pickupStatus = sql`lower(coalesce(${sql.raw(`${alias}.pickup_status`)}, ''))`
      return sql`${activeShipmentCondition} AND (
        ${orderStatus} IN ('shipment_created', 'pickup_initiated', 'booked')
        OR ${pickupStatus} IN ('pending', 'scheduled', 'pickup_scheduled', 'pickup_initiated')
      )`
    }

    return sql`${activeShipmentCondition} AND ${orderStatus} IN (
      'shipment_created',
      'pickup_initiated',
      'booked',
      'pending'
    )`
  }

  if (normalizedAlert === 'not_scheduled') {
    if (alias === 'b2c') {
      const pickupStatus = sql`lower(coalesce(${sql.raw(`${alias}.pickup_status`)}, ''))`
      return sql`${activeShipmentCondition} AND (
        coalesce(${sql.raw(`${alias}.pickup_error`)}, '') <> ''
        OR ${pickupStatus} IN ('', 'pending', 'failed', 'not_scheduled')
        OR ${missingPickupSlotCondition}
      )`
    }

    return sql`${activeShipmentCondition} AND ${missingPickupSlotCondition}`
  }

  return null
}

const buildOrderConditions = (alias: 'b2c' | 'b2b', filters: CombinedOrderFilters) => {
  const conditions: SQL[] = [sql`true`]

  if (filters.userId) {
    conditions.push(sql`${sql.raw(`${alias}.user_id`)} = ${filters.userId}`)
  }

  const statusCondition = buildStatusCondition(`${alias}.order_status`, filters.status)
  if (statusCondition) {
    conditions.push(statusCondition)
  }

  if (filters.fromDate) {
    conditions.push(sql`${sql.raw(`${alias}.created_at`)} >= ${toSqlDateStart(filters.fromDate)}`)
  }

  if (filters.toDate) {
    conditions.push(sql`${sql.raw(`${alias}.created_at`)} <= ${toSqlDateEnd(filters.toDate)}`)
  }

  const searchCondition = buildSearchCondition(alias, filters.search)
  if (searchCondition) {
    conditions.push(searchCondition)
  }

  const pickupAlertCondition = buildPickupAlertCondition(alias, filters.pickupAlert)
  if (pickupAlertCondition) {
    conditions.push(pickupAlertCondition)
  }

  return conditions
}

const fetchCombinedOrderPageRows = async ({
  page = 1,
  limit = DEFAULT_PAGE_LIMIT,
  filters,
}: {
  page?: number
  limit?: number
  filters: CombinedOrderFilters
}) => {
  const safePage = Math.max(page, 1)
  const safeLimit = Math.max(limit, 1)
  const offset = (safePage - 1) * safeLimit
  const sortOrder = filters.sortOrder === 'asc' ? sql`ASC` : sql`DESC`

  const b2cConditions = buildOrderConditions('b2c', filters)
  const b2bConditions = buildOrderConditions('b2b', filters)

  const countResult = (await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM (
      SELECT b2c.id
      FROM b2c_orders AS b2c
      WHERE ${sql.join(b2cConditions, sql` AND `)}
      UNION ALL
      SELECT b2b.id
      FROM b2b_orders AS b2b
      WHERE ${sql.join(b2bConditions, sql` AND `)}
    ) AS combined_orders
  `)) as any

  const totalCount = Number(countResult.rows?.[0]?.total ?? 0)
  if (totalCount === 0) {
    return {
      totalCount: 0,
      totalPages: 0,
      pageRows: [] as CombinedOrderPageRow[],
    }
  }

  const pageResult = (await db.execute(sql`
    SELECT id, type, user_id, created_at
    FROM (
      SELECT b2c.id, 'b2c'::text AS type, b2c.user_id, b2c.created_at
      FROM b2c_orders AS b2c
      WHERE ${sql.join(b2cConditions, sql` AND `)}
      UNION ALL
      SELECT b2b.id, 'b2b'::text AS type, b2b.user_id, b2b.created_at
      FROM b2b_orders AS b2b
      WHERE ${sql.join(b2bConditions, sql` AND `)}
    ) AS combined_orders
    ORDER BY created_at ${sortOrder}
    LIMIT ${safeLimit}
    OFFSET ${offset}
  `)) as any

  return {
    totalCount,
    totalPages: Math.ceil(totalCount / safeLimit),
    pageRows: (pageResult.rows || []) as CombinedOrderPageRow[],
  }
}

export const fetchCombinedOrdersPage = async ({
  page = 1,
  limit = DEFAULT_PAGE_LIMIT,
  filters = {},
}: {
  page?: number
  limit?: number
  filters?: CombinedOrderFilters
}) => {
  const { pageRows, totalCount, totalPages } = await fetchCombinedOrderPageRows({
    page,
    limit,
    filters,
  })

  if (pageRows.length === 0) {
    return { orders: [] as any[], totalCount, totalPages }
  }

  const b2cIds = pageRows.filter((row) => row.type === 'b2c').map((row) => row.id)
  const b2bIds = pageRows.filter((row) => row.type === 'b2b').map((row) => row.id)

  const [b2cRows, b2bRows] = await Promise.all([
    b2cIds.length
      ? db.select(b2cOrderListSelect).from(b2c_orders).where(inArray(b2c_orders.id, b2cIds))
      : Promise.resolve([]),
    b2bIds.length
      ? db.select(b2bOrderListSelect).from(b2b_orders).where(inArray(b2b_orders.id, b2bIds))
      : Promise.resolve([]),
  ])

  const b2cMap = new Map(b2cRows.map((row) => [row.id, { ...row, type: 'b2c' as const }]))
  const b2bMap = new Map(b2bRows.map((row) => [row.id, { ...row, type: 'b2b' as const }]))

  const orderedRows = pageRows
    .map((row) => (row.type === 'b2c' ? b2cMap.get(row.id) : b2bMap.get(row.id)))
    .filter(Boolean)

  return {
    orders: orderedRows,
    totalCount,
    totalPages,
  }
}

export const fetchOrderUserMetadata = async (userIds: string[]) => {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
  if (uniqueUserIds.length === 0) {
    return {
      userProfilesMap: new Map<string, any>(),
      usersMap: new Map<string, any>(),
    }
  }

  const [profileRows, usersRows] = await Promise.all([
    db
      .select({
        userId: userProfiles.userId,
        companyInfo: userProfiles.companyInfo,
        gstDetails: userProfiles.gstDetails,
        businessType: userProfiles.businessType,
        approved: userProfiles.approved,
        onboardingComplete: userProfiles.onboardingComplete,
      })
      .from(userProfiles)
      .where(inArray(userProfiles.userId, uniqueUserIds)),
    db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(inArray(users.id, uniqueUserIds)),
  ])

  const userProfilesMap = new Map(profileRows.map((row) => [row.userId, row]))
  const usersMap = new Map(usersRows.map((row) => [row.id, row]))

  return { userProfilesMap, usersMap }
}
