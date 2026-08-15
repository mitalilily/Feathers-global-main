import dayjs from 'dayjs'
import { desc, eq } from 'drizzle-orm'
import { db } from '../models/client'
import { billingInvoices } from '../models/schema/billingInvoices'
import {
  findDuplicateInvoiceByOrderNumbers,
  findInvoiceForExactPeriod,
  generateInvoiceForUser,
  getBillableOrderNumbersForRange,
} from '../models/services/invoiceGeneration.service'
import { billingPreferences, users } from '../schema/schema'

type BillingFrequency = 'weekly' | 'monthly' | 'manual' | 'custom'

const getInvoiceTypeForFrequency = (frequency: BillingFrequency) =>
  frequency === 'weekly' ? 'weekly' : frequency === 'manual' ? 'manual' : 'monthly_summary'

const normalizeFrequency = (frequency?: string | null): BillingFrequency => {
  if (frequency === 'weekly' || frequency === 'manual' || frequency === 'custom') return frequency
  return 'monthly'
}

const getIntervalDays = (frequency: BillingFrequency, customFrequencyDays?: number | null) => {
  if (frequency === 'weekly') return 7
  if (frequency === 'custom') return customFrequencyDays || null
  return 30
}

const nextCompleteBillingPeriod = ({
  frequency,
  customFrequencyDays,
  lastBillingEnd,
  today,
  force,
}: {
  frequency: BillingFrequency
  customFrequencyDays?: number | null
  lastBillingEnd?: Date | string | null
  today: dayjs.Dayjs
  force: boolean
}) => {
  if (frequency === 'monthly') {
    if (lastBillingEnd) {
      const start = dayjs(lastBillingEnd).add(1, 'day').startOf('day')
      const naturalEnd = start.endOf('month')
      const canGenerate = today.isAfter(naturalEnd.startOf('day'))

      if (!canGenerate && !force) {
        return {
          shouldGenerate: false,
          reason: `next monthly billing period closes ${naturalEnd.format('DD MMM YYYY')}`,
        }
      }

      return {
        shouldGenerate: true,
        startDate: start.toDate(),
        endDate: (force ? today.endOf('day') : naturalEnd).toDate(),
      }
    }

    const previousMonth = today.subtract(1, 'month')
    return {
      shouldGenerate: true,
      startDate: previousMonth.startOf('month').toDate(),
      endDate: previousMonth.endOf('month').toDate(),
    }
  }

  const intervalDays = getIntervalDays(frequency, customFrequencyDays)
  if (!intervalDays || intervalDays <= 0) {
    return { shouldGenerate: false, reason: 'custom frequency has no valid day interval' }
  }

  if (lastBillingEnd) {
    const start = dayjs(lastBillingEnd).add(1, 'day').startOf('day')
    const naturalEnd = start.add(intervalDays - 1, 'day').endOf('day')
    const canGenerate = today.isAfter(naturalEnd.startOf('day'))

    if (!canGenerate && !force) {
      return {
        shouldGenerate: false,
        reason: `next ${frequency} billing period closes ${naturalEnd.format('DD MMM YYYY')}`,
      }
    }

    return {
      shouldGenerate: true,
      startDate: start.toDate(),
      endDate: (force ? today.endOf('day') : naturalEnd).toDate(),
    }
  }

  const end = today.subtract(1, 'day').endOf('day')
  const start = end.subtract(intervalDays - 1, 'day').startOf('day')
  return {
    shouldGenerate: true,
    startDate: start.toDate(),
    endDate: end.toDate(),
  }
}

// Runs every day at 2 AM.
export const generateAutoBillingInvoices = async ({ force = false } = {}) => {
  console.log('🧾 Running automated invoice generation cron:', new Date().toISOString())

  try {
    const allUsers = await db.select().from(users)

    for (const user of allUsers) {
      const userId = user.id

      const [pref] = await db
        .select()
        .from(billingPreferences)
        .where(eq(billingPreferences.userId, userId))
        .limit(1)

      const autoGenerate = pref?.autoGenerate ?? true
      const frequency = normalizeFrequency(pref?.frequency)
      const customFrequencyDays = pref?.customFrequencyDays ?? null

      if (!autoGenerate && !force) {
        console.log(`⏭️ Skipping user ${userId}: auto-generate disabled`)
        continue
      }

      if (frequency === 'manual' && !force) {
        console.log(`⏭️ Skipping user ${userId}: manual billing frequency`)
        continue
      }

      if (frequency === 'custom' && (!customFrequencyDays || customFrequencyDays <= 0)) {
        console.log(`⚠️ Skipping user ${userId}: invalid custom billing frequency`)
        continue
      }

      const [lastInvoice] = await db
        .select()
        .from(billingInvoices)
        .where(eq(billingInvoices.sellerId, userId))
        .orderBy(desc(billingInvoices.billingEnd))
        .limit(1)

      const period = nextCompleteBillingPeriod({
        frequency,
        customFrequencyDays,
        lastBillingEnd: lastInvoice?.billingEnd,
        today: dayjs().startOf('day'),
        force,
      })

      if (!period.shouldGenerate || !period.startDate || !period.endDate) {
        console.log(`⏭️ Skipping user ${userId}: ${period.reason || 'billing period not due yet'}`)
        continue
      }

      const orderNumbers = await getBillableOrderNumbersForRange(
        userId,
        period.startDate,
        period.endDate,
      )

      if (orderNumbers.length === 0) {
        console.log(
          `⚠️ Skipping user ${userId}: no billable orders in ${dayjs(period.startDate).format(
            'DD MMM YYYY',
          )} → ${dayjs(period.endDate).format('DD MMM YYYY')}`,
        )
        continue
      }

      const existingPeriodInvoice = await findInvoiceForExactPeriod(
        userId,
        period.startDate,
        period.endDate,
      )
      if (existingPeriodInvoice) {
        console.log(
          `⏭️ Skipping user ${userId}: invoice already exists for this period (${existingPeriodInvoice.invoiceNo})`,
        )
        continue
      }

      const duplicateByOrders = await findDuplicateInvoiceByOrderNumbers(userId, orderNumbers)
      if (duplicateByOrders) {
        console.log(
          `⏭️ Skipping user ${userId}: ${orderNumbers.length} candidate orders overlap invoice ${duplicateByOrders.invoiceNo} (${duplicateByOrders.overlapCount} overlap, e.g. ${duplicateByOrders.sampleOrderNumber})`,
        )
        continue
      }

      console.log(
        `🧾 Generating invoice for user ${userId} (${orderNumbers.length} orders, ${frequency}, period: ${dayjs(
          period.startDate,
        ).format('DD MMM YYYY')} → ${dayjs(period.endDate).format('DD MMM YYYY')})`,
      )

      await generateInvoiceForUser(userId, {
        startDate: period.startDate,
        endDate: period.endDate,
        invoiceType: getInvoiceTypeForFrequency(frequency),
      })
    }

    console.log('✅ Invoice generation cron completed successfully')
  } catch (err) {
    console.error('❌ Invoice cron failed:', err)
  }
}
