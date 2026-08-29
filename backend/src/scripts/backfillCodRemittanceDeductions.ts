import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { codRemittances } from '../models/schema/codRemittance'

/**
 * Corrects pending COD remittances created before booking charges were treated
 * as already debited. Only rows whose stored deduction exactly equals the
 * stored COD + freight components are changed; rows with other deductions are
 * left untouched for manual review.
 */
export async function backfillCodRemittanceDeductions() {
  const rows = await db.select().from(codRemittances)
  let corrected = 0
  let skipped = 0

  for (const row of rows) {
    if (row.status !== 'pending') {
      skipped++
      continue
    }

    const codAmount = Number(row.codAmount || 0)
    const codCharges = Number(row.codCharges || 0)
    const freightCharges = Number(row.shippingCharges || 0)
    const deductions = Number(row.deductions || 0)
    const expectedDoubleDeduction = codCharges + freightCharges

    // Idempotency and safety guards. Do not alter zero rows or rows containing
    // a deduction that cannot be explained by the booking components.
    if (
      deductions <= 0 ||
      expectedDoubleDeduction <= 0 ||
      Math.abs(deductions - expectedDoubleDeduction) > 0.01
    ) {
      skipped++
      continue
    }

    const note =
      `${row.notes || ''} Charges were already debited at booking; historical ` +
      `COD remittance backfill removed the duplicate deduction.`

    await db
      .update(codRemittances)
      .set({
        deductions: '0',
        remittableAmount: codAmount.toFixed(2),
        notes: note.slice(-4000),
        updatedAt: new Date(),
      })
      .where(eq(codRemittances.id, row.id))

    corrected++
    console.log(
      `Corrected ${row.orderNumber}: deduction ₹${deductions.toFixed(2)} -> ₹0.00; remittable ₹${codAmount.toFixed(2)}`,
    )
  }

  console.log(`COD remittance backfill complete: corrected=${corrected}, skipped=${skipped}`)
  return { corrected, skipped }
}

if (require.main === module) {
  backfillCodRemittanceDeductions()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('COD remittance backfill failed:', error)
      process.exit(1)
    })
}
