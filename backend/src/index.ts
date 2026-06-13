import * as dotenv from 'dotenv'
import path from 'path'
import { server } from './app'
import { pool, testDatabaseConnection } from './models/client'
import { runDatabaseBootstrap } from './scripts/runAllMigrations'

// Determine environment
const env = process.env.NODE_ENV || 'development'
console.log('node env', env)

// Load correct .env file
dotenv.config({ path: path.resolve(__dirname, `../.env.${env}`) })

// Use PORT from env or fallback
const PORT = process.env.PORT || 4000
let shuttingDown = false

const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) return
  shuttingDown = true

  console.log(`[shutdown] Received ${signal}. Closing HTTP server and database pool...`)

  const forceExitTimer = setTimeout(() => {
    console.warn('[shutdown] Forced shutdown after timeout')
    process.exit(0)
  }, 10000)
  forceExitTimer.unref()

  server.close(async (err) => {
    const closeError = err as NodeJS.ErrnoException | undefined
    const failedToClose = Boolean(closeError && closeError.code !== 'ERR_SERVER_NOT_RUNNING')

    if (failedToClose) {
      console.error('[shutdown] HTTP server close failed:', closeError)
    }

    try {
      await pool.end()
      console.log('[shutdown] Database pool closed')
    } catch (poolError) {
      console.error('[shutdown] Database pool close failed:', poolError)
    }

    clearTimeout(forceExitTimer)
    process.exit(failedToClose ? 1 : 0)
  })
}

process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)

// Test database connection before starting server
async function startServer() {
  console.log('🧱 Running database bootstrap migrations...')
  await runDatabaseBootstrap()

  console.log('🔍 Testing database connection...')
  const dbConnected = await testDatabaseConnection()

  if (!dbConnected) {
    console.error('❌ Failed to connect to database. Server will not start.')
    process.exit(1)
  }

  await import('./crons')

  // Set server timeout to 3.5 minutes (210000ms) to allow for slow external API calls
  // Default Node.js server timeout is 2 minutes (120000ms)
  server.timeout = 210000 // 3.5 minutes

  server.listen(PORT, () => {
    const url =
      env === 'production'
        ? process.env.API_PUBLIC_URL || process.env.API_URL || 'https://api.featherglobal.in/api'
        : `http://localhost:${PORT}`
    console.log(`🚀 Server running on port ${PORT} in ${env} mode at ${url}`)
  })
}

startServer().catch((err) => {
  console.error('❌ Failed to start server:', err)
  process.exit(1)
})
