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
  const envName = path.basename(envFile).replace(/^\.env\.?/, '')
  if (envName && envName !== path.basename(envFile) && !process.env.NODE_ENV) {
    process.env.NODE_ENV = envName
  }
  dotenv.config({ path: envFile })
}

const hasArg = (name: string) => process.argv.includes(`--${name}`)

const main = async () => {
  const [{ cleanupImportedUnbookedNdrEvents }, { pool }] = await Promise.all([
    import('../models/services/ndr.service'),
    import('../models/client'),
  ])

  const apply = hasArg('apply')
  const result = await cleanupImportedUnbookedNdrEvents({ apply })

  console.log(
    apply
      ? `Deleted ${result.deleted} imported unbooked NDR event(s). Matched before delete: ${result.matched}.`
      : `Dry run matched ${result.matched} imported unbooked NDR event(s). Re-run with --apply to delete.`,
  )

  await pool.end()
}

main().catch((error) => {
  console.error('Failed to clean imported unbooked NDR events:', error)
  process.exit(1)
})
