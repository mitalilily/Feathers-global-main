import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import dotenv from 'dotenv'
import { Client } from 'pg'

const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })
const useSsl = env === 'production' || /render\.com/i.test(process.env.DATABASE_URL || '')

const backendRoot = path.resolve(__dirname, '../..')
const migrationFiles = readdirSync(backendRoot)
  .filter((fileName) => /^migration_.*\.sql$/i.test(fileName))
  .filter((fileName) => fileName !== 'migration_remove_kyc_selfie_columns.sql')
  .sort((a, b) => a.localeCompare(b))

const isIgnorableMigrationError = (error: any) => {
  const code = error?.code
  return (
    code === '42703' || // undefined_column
    code === '42P01' || // undefined_table
    code === '42704' || // undefined_object
    code === '42710' || // duplicate_object
    code === '42P07' || // duplicate_table
    code === '42701' // duplicate_column
  )
}

const shouldRunDrizzlePush = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing')
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  })

  await client.connect()

  try {
    const result = await client.query(`
      select count(*)::int as table_count
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
    `)

    return Number(result.rows[0]?.table_count ?? 0) === 0
  } finally {
    await client.end().catch(() => undefined)
  }
}

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
    ssl: useSsl ? { rejectUnauthorized: false } : false,
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
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('COMMIT')
        console.log(`[migrate] Applied ${fileName}`)
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)

        if (isIgnorableMigrationError(error)) {
          console.log(`[migrate] Skipping ${fileName}: ${error instanceof Error ? error.message : 'ignored migration mismatch'}`)
          continue
        }

        throw error
      }
    }
  } finally {
    await client.end().catch(() => undefined)
  }
}

export const runDatabaseBootstrap = async () => {
  const bootstrapRequired = await shouldRunDrizzlePush()

  if (bootstrapRequired) {
    runDrizzlePush()
  } else {
    console.log('[migrate] Skipping drizzle-kit push because the database already has tables')
  }

  await runSqlMigrations()
  console.log('[migrate] Database bootstrap complete')
}

if (require.main === module) {
  runDatabaseBootstrap().catch((error) => {
    console.error('[migrate] Database bootstrap failed:', error)
    process.exit(1)
  })
}
