import fs from 'node:fs'
import path from 'node:path'
import * as dotenv from 'dotenv'
import { sql } from 'drizzle-orm'

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

const parseLimit = () => {
  const raw = getArgValue('limit') || process.env.SHOPIFY_ORDER_SYNC_LIMIT || '100'
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 100
}

const main = async () => {
  const [{ db }, { users }, shopifyService] = await Promise.all([
    import('../models/client'),
    import('../models/schema/users'),
    import('../models/services/shopify.service'),
  ])

  const { syncShopifyOrdersForAllStores, syncShopifyOrdersForUser } = shopifyService
  const email = getArgValue('email')
  const userIdArg = getArgValue('user-id')
  const storeId = getArgValue('store-id')
  const limit = Math.min(Math.max(parseLimit(), 1), 250)

  if (hasArg('all')) {
    const summary = await syncShopifyOrdersForAllStores(limit)
    console.log('[Shopify Sync] Global refresh complete', summary)
    return
  }

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

  if (!userId) {
    throw new Error('Pass --email=<user@example.com>, --user-id=<uuid>, or --all')
  }

  const summary = await syncShopifyOrdersForUser(userId, limit, storeId)
  console.log('[Shopify Sync] User refresh complete', {
    userId,
    email: email || null,
    storeId: storeId || null,
    limit,
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
    console.error('[Shopify Sync] Failed', err?.message || err)
    const { db } = await import('../models/client')
    await db.$client.end().catch(() => undefined)
    process.exit(1)
  })
