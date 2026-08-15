import dayjs from 'dayjs'
import { sql } from 'drizzle-orm'
import { db } from '../models/client'
import { billingInvoices } from '../models/schema/billingInvoices'
import { sendBillingInvoiceReadyNotification } from '../models/services/invoiceGeneration.service'

export const retryFailedBillingInvoiceEmails = async () => {
  const batchSize = Number(process.env.BILLING_INVOICE_EMAIL_RETRY_BATCH_SIZE || 25)
  const retryAfterMinutes = Number(process.env.BILLING_INVOICE_EMAIL_RETRY_AFTER_MINUTES || 60)
  const cutoff = dayjs().subtract(retryAfterMinutes, 'minute').toDate()

  const pending = await db
    .select({
      id: billingInvoices.id,
      invoiceNo: billingInvoices.invoiceNo,
    })
    .from(billingInvoices)
    .where(
      sql`${billingInvoices.emailSentAt} IS NULL
        AND (${billingInvoices.emailLastAttemptAt} IS NULL OR ${billingInvoices.emailLastAttemptAt} < ${cutoff})
        AND COALESCE(${billingInvoices.emailError}, '') <> 'Seller email not available'`,
    )
    .limit(batchSize)

  if (pending.length === 0) return { attempted: 0, sent: 0, failed: 0 }

  let sent = 0
  let failed = 0

  for (const invoice of pending) {
    try {
      const result = await sendBillingInvoiceReadyNotification(invoice.id)
      if (result.sent) sent += 1
      else failed += 1
    } catch (err) {
      failed += 1
      console.error(
        `[Cron] Failed billing invoice email retry for ${invoice.invoiceNo}:`,
        (err as any)?.message || err,
      )
    }
  }

  return { attempted: pending.length, sent, failed }
}
