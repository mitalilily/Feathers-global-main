import fs from 'node:fs'
import path from 'node:path'
import * as dotenv from 'dotenv'

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

const main = async () => {
  const [{ db }, cleanupService] = await Promise.all([
    import('../models/client'),
    import('../models/services/storeCleanup.service'),
  ])

  const summary = await db.transaction(async (tx) => cleanupService.cleanupDisconnectedStoreOrders(tx))

  console.log('[Store Cleanup] Disconnected store cleanup complete', summary)
}

main()
  .then(async () => {
    const { db } = await import('../models/client')
    await db.$client.end().catch(() => undefined)
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('[Store Cleanup] Failed', err?.message || err)
    const { db } = await import('../models/client')
    await db.$client.end().catch(() => undefined)
    process.exit(1)
  })
