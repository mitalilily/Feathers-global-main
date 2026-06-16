import * as dotenv from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import path from 'path'

const env = process.env.NODE_ENV || 'development'
const shouldUseSsl = env === 'production' || /render\.com/i.test(process.env.DATABASE_URL || '')
const databaseUrl = process.env.DATABASE_URL!
const parsedUrl = new URL(databaseUrl)

// Always load from inside backend/ (works locally + VPS)
const envFile = path.resolve(__dirname, `.env.${env}`)

dotenv.config({ path: envFile })

if (!process.env.DATABASE_URL) {
  throw new Error(`DATABASE_URL is not defined in ${envFile}`)
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/schema.ts',
  out: './src/drizzle/migrations',
  dbCredentials: {
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : 5432,
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    database: parsedUrl.pathname.replace(/^\//, ''),
    ssl: shouldUseSsl ? 'require' : undefined,
  },
})
