import * as dotenv from 'dotenv'
import * as path from 'path'
import { asc, sql } from 'drizzle-orm'
import { db } from '../models/client'
import { couriers } from '../models/schema/couriers'
import forwardRateCardData from './forwardRateCardData.json'

type Provider = 'ekart' | 'shadowfax'

type RateCardRow = {
  id: number
  courier_name: string
  mode?: string
  type?: string
}

const loadEnv = () => {
  const env = process.env.NODE_ENV || 'development'
  dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })
}

const normalizeProvider = (name: string): Provider | null => {
  const lower = name.toLowerCase()
  if (lower.includes('ekart')) return 'ekart'
  if (lower.includes('shadowfax')) return 'shadowfax'
  return null
}

const isReverseCourier = (name: string) => name.toLowerCase().includes('reverse')

async function main() {
  loadEnv()

  const rows = forwardRateCardData as RateCardRow[]
  const seeds = new Map<string, { id: number; name: string; serviceProvider: Provider }>()

  for (const row of rows) {
    const provider = normalizeProvider(String(row.courier_name || ''))
    if (!provider) continue
    if (isReverseCourier(String(row.courier_name || ''))) continue
    if (!Number.isFinite(Number(row.id))) continue

    const key = `${provider}:${row.id}`
    if (!seeds.has(key)) {
      seeds.set(key, {
        id: Number(row.id),
        name: String(row.courier_name).trim(),
        serviceProvider: provider,
      })
    }
  }

  const providerCounts: Record<string, number> = { ekart: 0, shadowfax: 0 }

  for (const seed of seeds.values()) {
    await db
      .insert(couriers)
      .values({
        id: seed.id,
        name: seed.name,
        serviceProvider: seed.serviceProvider,
        isEnabled: true,
        businessType: ['b2c'],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .onConflictDoUpdate({
        target: [couriers.id, couriers.serviceProvider],
        set: {
          name: seed.name,
          isEnabled: true,
          updatedAt: new Date(),
        },
      })

    providerCounts[seed.serviceProvider] += 1
  }

  await db
    .update(couriers)
    .set({
      isEnabled: true,
      updatedAt: new Date(),
    })
    .where(sql`lower(${couriers.serviceProvider}) in ('ekart', 'shadowfax')`)

  const confirmed = await db
    .select({
      id: couriers.id,
      name: couriers.name,
      serviceProvider: couriers.serviceProvider,
      isEnabled: couriers.isEnabled,
      businessType: couriers.businessType,
    })
    .from(couriers)
    .where(sql`lower(${couriers.serviceProvider}) in ('ekart', 'shadowfax')`)
    .orderBy(asc(couriers.serviceProvider), asc(couriers.id))

  console.log(
    JSON.stringify(
      {
        seeded: providerCounts,
        totalSeedRows: seeds.size,
        confirmed,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error('Failed to seed Ekart and Shadowfax couriers:', error)
  process.exit(1)
})
