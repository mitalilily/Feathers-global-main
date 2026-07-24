import { sql } from 'drizzle-orm'
import { db } from '../models/client'
import { createWalletTransaction } from '../models/services/wallet.service'

const COD_RTO_REFUND_REASON_PREFIX = 'RTO COD service charge refund'
const DUPLICATE_RTO_REFUND_REASON_PREFIX = 'Duplicate RTO freight refund'

const apply = process.argv.includes('--apply')
const onlyAwbArg = process.argv.find((arg) => arg.startsWith('--awb='))
const onlyAwb = onlyAwbArg ? onlyAwbArg.split('=').slice(1).join('=').trim() : ''

const toMoney = (value: unknown) => {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const resolveCodRtoRefundAmount = (transaction: any) => {
  const meta = transaction?.meta || {}
  const totalWalletDebit = toMoney(meta.total_wallet_debit) || toMoney(transaction?.amount)
  const freightCharges = toMoney(meta.freight_charges)
  const otherCharges = toMoney(meta.other_charges)
  const gstPercent = toMoney(meta.gst_percent)
  const forwardFreightWithGst = roundMoney((freightCharges + otherCharges) * (1 + gstPercent / 100))
  const codComponentFromTotal =
    totalWalletDebit > 0 && forwardFreightWithGst > 0
      ? roundMoney(totalWalletDebit - forwardFreightWithGst)
      : 0
  if (codComponentFromTotal > 0) return codComponentFromTotal

  const codCharges = toMoney(meta.cod_charges)
  const razorpayCharge = toMoney(meta.razorpay_charge_amount)
  const codBase = codCharges + razorpayCharge
  return codBase > 0 ? roundMoney(codBase * (1 + gstPercent / 100)) : 0
}

const main = async () => {
  const ordersResult = await db.execute(sql`
    select distinct
      o.id,
      o.user_id,
      o.order_number,
      o.awb_number,
      o.order_type,
      o.order_status,
      w.id as wallet_id,
      coalesce(w.currency, 'INR') as currency
    from b2c_orders o
    join wallets w on w."userId" = o.user_id
    where
      (${onlyAwb || null}::text is null or o.awb_number = ${onlyAwb || null})
      and (
        lower(coalesce(o.order_status, '')) like 'rto%'
        or exists (select 1 from rto_events r where r.order_id = o.id)
      )
      and (
        exists (
          select 1
          from wallet_transactions wt
          where wt.ref = o.id::text
            and wt.wallet_id = w.id
            and wt.type = 'debit'
            and wt.reason = 'B2C COD Service Charges'
        )
        or (
          select count(*)
          from wallet_transactions wt
          where wt.ref = o.id::text
            and wt.wallet_id = w.id
            and wt.type = 'debit'
            and wt.reason ilike 'RTO freight -%'
        ) > 1
      )
    order by o.order_number
  `)

  const orders = (ordersResult as any).rows || []
  const summary = {
    dryRun: !apply,
    ordersChecked: orders.length,
    codRefundsCreated: 0,
    duplicateRtoRefundsCreated: 0,
    codRefundAmount: 0,
    duplicateRtoRefundAmount: 0,
    skippedAlreadyCorrected: 0,
    details: [] as any[],
  }

  for (const order of orders) {
    await db.transaction(async (tx) => {
      const txResult = await tx.execute(sql`
        select id, wallet_id, type, amount, reason, ref, meta, created_at
        from wallet_transactions
        where wallet_id = ${order.wallet_id}
          and ref = ${order.id}
        order by created_at asc, id asc
      `)
      const transactions = ((txResult as any).rows || []) as any[]
      const credits = transactions.filter((transaction) => transaction.type === 'credit')
      const debits = transactions.filter((transaction) => transaction.type === 'debit')

      const originalCodDebit = debits.find(
        (transaction) => String(transaction.reason || '') === 'B2C COD Service Charges',
      )
      const codRefundTarget =
        String(order.order_type || '').toLowerCase() === 'cod' && originalCodDebit
          ? resolveCodRtoRefundAmount(originalCodDebit)
          : 0
      const existingCodRefund = credits
        .filter((transaction) => {
          const reason = String(transaction.reason || '').toLowerCase()
          return reason.includes('cod') && reason.includes('refund')
        })
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
      const codRefundDue = roundMoney(Math.max(0, codRefundTarget - existingCodRefund))

      const rtoDebits = debits.filter((transaction) =>
        String(transaction.reason || '').toLowerCase().startsWith('rto freight -'),
      )
      const duplicateRtoDebitAmount = rtoDebits
        .slice(1)
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
      const existingDuplicateRtoRefund = credits
        .filter((transaction) => {
          const reason = String(transaction.reason || '').toLowerCase()
          return reason.includes('rto freight') && reason.includes('refund')
        })
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
      const duplicateRtoRefundDue = roundMoney(
        Math.max(0, duplicateRtoDebitAmount - existingDuplicateRtoRefund),
      )

      if (codRefundDue <= 0 && duplicateRtoRefundDue <= 0) {
        summary.skippedAlreadyCorrected += 1
      }

      if (codRefundDue > 0) {
        summary.codRefundsCreated += 1
        summary.codRefundAmount = roundMoney(summary.codRefundAmount + codRefundDue)
        if (apply) {
          await createWalletTransaction({
            walletId: order.wallet_id,
            amount: codRefundDue,
            type: 'credit',
            ref: order.id,
            reason: `${COD_RTO_REFUND_REASON_PREFIX} (${order.order_number || 'unknown'})`,
            currency: order.currency || 'INR',
            meta: {
              source: 'rto_wallet_correction_backfill',
              order_id: order.id,
              order_number: order.order_number,
              awb_number: order.awb_number,
              original_debit_id: originalCodDebit?.id || null,
              original_debit_amount: Number(originalCodDebit?.amount || 0),
              original_debit_meta: originalCodDebit?.meta || null,
            },
            tx: tx as any,
          })
        }
      }

      if (duplicateRtoRefundDue > 0) {
        summary.duplicateRtoRefundsCreated += 1
        summary.duplicateRtoRefundAmount = roundMoney(
          summary.duplicateRtoRefundAmount + duplicateRtoRefundDue,
        )
        if (apply) {
          await createWalletTransaction({
            walletId: order.wallet_id,
            amount: duplicateRtoRefundDue,
            type: 'credit',
            ref: order.id,
            reason: `${DUPLICATE_RTO_REFUND_REASON_PREFIX} (${order.order_number || 'unknown'})`,
            currency: order.currency || 'INR',
            meta: {
              source: 'rto_wallet_correction_backfill',
              order_id: order.id,
              order_number: order.order_number,
              awb_number: order.awb_number,
              duplicate_rto_debits: rtoDebits.slice(1).map((transaction) => ({
                id: transaction.id,
                amount: Number(transaction.amount || 0),
                reason: transaction.reason,
                created_at: transaction.created_at,
              })),
            },
            tx: tx as any,
          })
        }
      }

      if (codRefundDue > 0 || duplicateRtoRefundDue > 0) {
        summary.details.push({
          order_number: order.order_number,
          awb_number: order.awb_number,
          cod_refund_due: codRefundDue,
          duplicate_rto_refund_due: duplicateRtoRefundDue,
          rto_debits_found: rtoDebits.length,
        })
      }
    })
  }

  console.log(JSON.stringify(summary, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await (db as any).$client?.end?.().catch?.(() => undefined)
  })
