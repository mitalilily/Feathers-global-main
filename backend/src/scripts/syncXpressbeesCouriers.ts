import { and, eq } from 'drizzle-orm'
import { db } from '../models/client'
import { couriers } from '../models/schema/couriers'
import { XpressbeesService } from '../models/services/couriers/xpressbees.service'

const SERVICE_PROVIDER = 'xpressbees'

type XpressbeesCourierRow = {
  id: string
  name: string
  mode?: string
  business_service?: string
}

async function main() {
  const xpressbees = new XpressbeesService()
  const response = await xpressbees.listCouriers()
  const rows = xpressbees.extractCourierCatalogRecords(response) as XpressbeesCourierRow[]

  if (!rows.length) {
    throw new Error('No Xpressbees courier records could be extracted from the live response')
  }

  let created = 0
  let updated = 0
  let skipped = 0
  let reverseCount = 0
  let stressedCount = 0

  for (const row of rows) {
    const courierId = Number(String(row?.id || '').trim())
    const courierName = String(row?.name || '').trim()
    const normalizedName = courierName.toLowerCase()

    if (normalizedName.includes('reverse')) reverseCount += 1
    if (normalizedName.includes('stressed')) stressedCount += 1

    if (!Number.isFinite(courierId) || !courierName) {
      skipped += 1
      console.warn('Skipping invalid Xpressbees courier row:', row)
      continue
    }

    const [existing] = await db
      .select()
      .from(couriers)
      .where(and(eq(couriers.id, courierId), eq(couriers.serviceProvider, SERVICE_PROVIDER)))
      .limit(1)

    if (existing) {
      const shouldUpdate = existing.name !== courierName

      if (shouldUpdate) {
        await db
          .update(couriers)
          .set({
            name: courierName,
            updatedAt: new Date(),
          } as any)
          .where(and(eq(couriers.id, courierId), eq(couriers.serviceProvider, SERVICE_PROVIDER)))
        updated += 1
        console.log(`Updated Xpressbees courier ${courierId} ${courierName}`)
      } else {
        skipped += 1
      }
      continue
    }

    await db
      .insert(couriers)
      .values({
        id: courierId,
        name: courierName,
        serviceProvider: SERVICE_PROVIDER,
        businessType: ['b2c'],
        isEnabled: false,
      } as any)

    created += 1
    console.log(`Inserted Xpressbees courier ${courierId} ${courierName}`)
  }

  console.log(
    `Xpressbees courier sync complete. created=${created} updated=${updated} skipped=${skipped} reverse=${reverseCount} stressed=${stressedCount}`,
  )
}

main().catch((error) => {
  console.error('Xpressbees courier sync failed:', error)
  process.exit(1)
})
