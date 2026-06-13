import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import dotenv from 'dotenv'
import { Client } from 'pg'

const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

const backendRoot = path.resolve(__dirname, '../..')
const migrationFiles = readdirSync(backendRoot)
  .filter((fileName) => /^migration_.*\.sql$/i.test(fileName))
  .filter((fileName) => fileName !== 'migration_remove_kyc_selfie_columns.sql')
  .sort((a, b) => a.localeCompare(b))

const runDrizzlePush = () => {
  console.log('[migrate] Bootstrapping current schema with drizzle-kit push...')

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(npmCmd, ['run', 'migrate'], {
    cwd: backendRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  })

  if (result.status !== 0) {
    throw new Error(`drizzle-kit push failed with exit code ${result.status ?? 'unknown'}`)
  }
}

const runSqlMigrations = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing')
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: env === 'production' ? { rejectUnauthorized: false } : false,
  })

  await client.connect()

  try {
    for (const fileName of migrationFiles) {
      const migrationPath = path.resolve(backendRoot, fileName)
      const sql = readFileSync(migrationPath, 'utf8').trim()

      if (!sql) {
        console.log(`[migrate] Skipping empty migration: ${fileName}`)
        continue
      }

      console.log(`[migrate] Applying ${fileName}...`)
      await client.query(sql)
      console.log(`[migrate] Applied ${fileName}`)
    }
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function main() {
  runDrizzlePush()
  await runSqlMigrations()
  console.log('[migrate] Database bootstrap complete')
}

main().catch((error) => {
  console.error('[migrate] Database bootstrap failed:', error)
  process.exit(1)
})
