import fs from 'fs'
import path from 'path'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, pool } from '../models/client'
import { plans } from '../models/schema/plans'
import { shippingRates } from '../models/schema/shippingRates'
import { zones } from '../models/schema/zones'
import {
  CSVRow,
  cell,
  importB2CSlabFormat,
  parseRateCardCsvText,
} from '../models/services/rateCardImport.service'

const TARGET_PROVIDER_NAMES = new Set(['amazon', 'delhivery'])
const TARGET_COURIER_IDS = [1, 66, 92, 93, 99, 100]

const usage = () =>
  [
    'Usage:',
    '  NODE_ENV=production ts-node src/scripts/syncBasicB2CAmazonDelhiveryRates.ts <basic-ratecard.csv> [plan-name]',
    '',
    'Defaults:',
    '  plan-name = Basic',
  ].join('\n')

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()

const rowMatchesTargetProvider = (row: CSVRow) => {
  const provider = normalizeText(cell(row, 'Service Provider'))
  const courierName = normalizeText(cell(row, 'Courier') || cell(row, 'Courier Name'))
  const courierId = Number(cell(row, 'Courier ID'))

  if (TARGET_PROVIDER_NAMES.has(provider)) return true
  if (courierName.includes('amazon') || courierName.includes('delhivery')) return true
  return Number.isFinite(courierId) && TARGET_COURIER_IDS.includes(courierId)
}

async function main() {
  const csvPathArg = process.argv[2]
  const planName = process.argv[3] || 'Basic'

  if (!csvPathArg) {
    throw new Error(usage())
  }

  const csvPath = path.resolve(csvPathArg)
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`)
  }

  const [plan] = await db
    .select()
    .from(plans)
    .where(sql`lower(${plans.name}) = ${planName.toLowerCase()}`)
    .limit(1)

  if (!plan) {
    throw new Error(`Plan not found: ${planName}`)
  }

  const b2cZones = await db
    .select({
      id: zones.id,
      name: zones.name,
      code: zones.code,
      region: zones.region,
    })
    .from(zones)
    .where(sql`lower(${zones.business_type}) = 'b2c'`)

  if (!b2cZones.length) {
    throw new Error('No B2C zones found. Cannot import B2C rate cards.')
  }

  const csvText = fs.readFileSync(csvPath, 'utf8')
  const parsed = parseRateCardCsvText(csvText)
  if (parsed.errors.length) {
    throw new Error(
      `CSV parse failed: ${parsed.errors
        .map((error) => `${error.code || 'parse'}: ${error.message}`)
        .join('; ')}`,
    )
  }

  const targetRows = parsed.data.filter(rowMatchesTargetProvider)
  if (!targetRows.length) {
    throw new Error('No Amazon or Delhivery rows found in the supplied Basic CSV.')
  }

  const existingRows = await db
    .select({ id: shippingRates.id })
    .from(shippingRates)
    .where(
      and(
        eq(shippingRates.plan_id, plan.id),
        eq(shippingRates.business_type, 'b2c'),
        inArray(shippingRates.courier_id, TARGET_COURIER_IDS),
      ),
    )

  if (existingRows.length) {
    await db
      .delete(shippingRates)
      .where(
        and(
          eq(shippingRates.plan_id, plan.id),
          eq(shippingRates.business_type, 'b2c'),
          inArray(shippingRates.courier_id, TARGET_COURIER_IDS),
        ),
      )
  }

  const savedRows = await importB2CSlabFormat(targetRows, plan.id, b2cZones)

  console.log(
    JSON.stringify(
      {
        plan: plan.name,
        csv: csvPath,
        targetRows: targetRows.length,
        deletedRows: existingRows.length,
        savedRows,
        zones: b2cZones.map((zone) => zone.code),
      },
      null,
      2,
    ),
  )
}

main()
  .catch((err) => {
    console.error(err?.message || err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end().catch(() => undefined)
  })
