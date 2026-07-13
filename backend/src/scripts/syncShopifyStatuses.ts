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
if (envFile) {
  dotenv.config({ path: envFile })
}

const hasArg = (name: string) => process.argv.includes(`--${name}`)

const getArgValue = (name: string) => {
  const prefix = `--${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length).trim() : undefined
}

const parsePositiveInt = (value: unknown, fallback: number, max: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.floor(parsed), max)
}

const main = async () => {
  const [{ db }, { b2c_orders }, { users }, { syncShopifyStatusForLocalOrder }] = await Promise.all([
    import('../models/client'),
    import('../models/schema/b2cOrders'),
    import('../models/schema/users'),
    import('../models/services/shopify.service'),
  ])

  const email = getArgValue('email')
  const userIdArg = getArgValue('user-id')
  const storeId = getArgValue('store-id')
  const limit = parsePositiveInt(getArgValue('limit') || process.env.SHOPIFY_STATUS_SYNC_LIMIT, 500, 5000)
  const recentDays = getArgValue('recent-days')
  const source = getArgValue('source') || 'manual-status-resync'

  let userId = String(userIdArg || '').trim()
  if (!userId && email) {
    const normalizedEmail = email.trim().toLowerCase()
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1)

    if (!user?.id) {
      throw new Error(`User not found for email ${email}`)
    }

    userId = user.id
  }

  if (!hasArg('all') && !userId && !storeId) {
    throw new Error('Pass --all, --email=<user@example.com>, --user-id=<uuid>, or --store-id=<shopify-store-id>')
  }

  const filters: any[] = [
    sql`
      (
        ${b2c_orders.order_id} like 'shopify_%'
        or ${b2c_orders.provider_meta}->>'source' = 'shopify'
        or coalesce(${b2c_orders.provider_meta}->>'shopify_order_id', '') <> ''
      )
    `,
    sql`
      lower(coalesce(${b2c_orders.order_status}, '')) in (
        'booked',
        'shipment_created',
        'pickup_initiated',
        'pickup_scheduled',
        'picked',
        'picked_up',
        'in_transit',
        'out_for_delivery',
        'ndr',
        'undelivered',
        'delivery_attempted',
        'rto',
        'rto_in_transit',
        'delivered',
        'rto_delivered',
        'cancelled',
        'cancellation_requested'
      )
    `,
  ]

  if (userId) filters.push(eq(b2c_orders.user_id, userId))
  if (storeId) {
    filters.push(sql`
      (
        ${b2c_orders.provider_meta}->>'shopify_store_id' = ${storeId}
        or ${b2c_orders.order_id} like ${`shopify_${storeId}_%`}
      )
    `)
  }

  const recentDaysValue = recentDays ? parsePositiveInt(recentDays, 45, 3650) : null
  if (recentDaysValue) {
    filters.push(sql`${b2c_orders.updated_at} >= now() - (${recentDaysValue}::text || ' days')::interval`)
  }

  const orders = await db
    .select()
    .from(b2c_orders)
    .where(and(...filters))
    .orderBy(sql`${b2c_orders.updated_at} desc`)
    .limit(limit)

  const summary = {
    selected: orders.length,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  }

  for (const order of orders) {
    try {
      const result = await syncShopifyStatusForLocalOrder(order, db, { source })
      if (result?.attempted === false) {
        summary.skipped += 1
      } else {
        summary.attempted += 1
      }

      if (result?.success === false) {
        summary.failed += 1
        console.warn('[Shopify Status Sync] Failed', {
          orderId: order.id,
          orderNumber: order.order_number,
          awb: order.awb_number,
          status: order.order_status,
          reason: result?.reason,
          error: result?.error,
        })
      } else if (result?.attempted !== false) {
        summary.succeeded += 1
      }
    } catch (err: any) {
      summary.attempted += 1
      summary.failed += 1
      console.warn('[Shopify Status Sync] Failed', {
        orderId: order.id,
        orderNumber: order.order_number,
        awb: order.awb_number,
        status: order.order_status,
        error: err?.message || err,
      })
    }
  }

  console.log('[Shopify Status Sync] Complete', {
    all: hasArg('all'),
    userId: userId || null,
    email: email || null,
    storeId: storeId || null,
    limit,
    recentDays: recentDaysValue,
    source,
    ...summary,
  })
}

main()
  .then(async () => {
    const { db } = await import('../models/client')
    await db.$client.end().catch(() => undefined)
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('[Shopify Status Sync] Failed', err?.message || err)
    const { db } = await import('../models/client')
    await db.$client.end().catch(() => undefined)
    process.exit(1)
  })
