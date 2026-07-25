import { sql } from 'drizzle-orm'
import { db } from '../models/client'
import { createWalletTransaction } from '../models/services/wallet.service'
import { computeB2CFreightForOrder } from '../models/services/shiprocket.service'

const REFUND_REASON_PREFIX = 'RTO freight included in forward freight refund'

const apply = process.argv.includes('--apply')
const onlyAwbArg = process.argv.find((arg) => arg.startsWith('--awb='))
const onlyAwb = onlyAwbArg ? onlyAwbArg.split('=').slice(1).join('=').trim() : ''

const toMoney = (value: unknown) => {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const normalizeWeightToGrams = (value: unknown) => {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return numeric > 50 ? Math.round(numeric) : Math.round(numeric * 1000)
}

const getPickupPincode = (pickupDetails: any) => {
  if (!pickupDetails || typeof pickupDetails !== 'object') return ''
  return String(pickupDetails.pincode || pickupDetails.pin || '').trim()
}

const hasPositiveRtoRateForOrder = async (order: any) => {
  const courierId = Number(order.courier_id ?? 0)
  const originPincode = getPickupPincode(order.pickup_details)
  const destinationPincode = String(order.pincode || '').trim()
  const weightG = normalizeWeightToGrams(order.weight)
  const lengthCm = Number(order.length ?? 0)
  const breadthCm = Number(order.breadth ?? 0)
  const heightCm = Number(order.height ?? 0)

  if (
    !order.user_id ||
    !courierId ||
    !originPincode ||
    !destinationPincode ||
    weightG <= 0 ||
    lengthCm <= 0 ||
    breadthCm <= 0 ||
    heightCm <= 0
  ) {
    return false
  }

  try {
    const computed = await computeB2CFreightForOrder({
      userId: order.user_id,
      courierId,
      serviceProvider: order.integration_type ?? null,
      mode: order.shipping_mode ?? null,
      selectedMaxSlabWeight: order.selected_max_slab_weight ?? null,
      originPincode,
      destinationPincode,
      weightG,
      lengthCm,
      breadthCm,
      heightCm,
      isReverse: true,
    })
    return toMoney(computed.freight) > 0
  } catch {
    return false
  }
}

const main = async () => {
  const result = await db.execute(sql`
    select distinct
      o.id,
      o.user_id,
      o.order_number,
      o.awb_number,
      o.order_type,
      o.order_status,
      o.courier_id,
      o.courier_partner,
      o.integration_type,
      o.shipping_mode,
      o.selected_max_slab_weight,
      o.pickup_details,
      o.pincode,
      o.weight,
      o.length,
      o.breadth,
      o.height,
      w.id as wallet_id,
      coalesce(w.currency, 'INR') as currency
    from b2c_orders o
    join wallets w on w."userId" = o.user_id
    join wallet_transactions rto_wt
      on rto_wt.wallet_id = w.id
      and rto_wt.type = 'debit'
      and rto_wt.reason ilike 'RTO freight -%'
      and (
        rto_wt.ref = o.id::text
        or o.awb_number = rto_wt.meta->>'awb'
        or o.awb_number = rto_wt.meta->>'awb_number'
        or (
          o.order_number is not null
          and rto_wt.reason ilike ('%' || o.order_number || '%')
        )
      )
    where
      (${onlyAwb || null}::text is null or o.awb_number = ${onlyAwb || null})
    order by o.order_number
  `)

  const unmatchedResult = await db.execute(sql`
    select count(*)::int as count, coalesce(sum(rto_wt.amount), 0)::numeric as amount
    from wallet_transactions rto_wt
    join wallets w on w.id = rto_wt.wallet_id
    where rto_wt.type = 'debit'
      and rto_wt.reason ilike 'RTO freight -%'
      and (${onlyAwb || null}::text is null or rto_wt.meta->>'awb' = ${onlyAwb || null} or rto_wt.meta->>'awb_number' = ${onlyAwb || null})
      and not exists (
        select 1
        from b2c_orders o
        where o.user_id = w."userId"
          and (
            rto_wt.ref = o.id::text
            or o.awb_number = rto_wt.meta->>'awb'
            or o.awb_number = rto_wt.meta->>'awb_number'
            or (
              o.order_number is not null
              and rto_wt.reason ilike ('%' || o.order_number || '%')
            )
          )
      )
  `)
  const unmatched = ((unmatchedResult as any).rows || [])[0] || {}

  const orders = ((result as any).rows || []) as any[]
  const summary = {
    dryRun: !apply,
    ordersChecked: orders.length,
    ordersRefunded: 0,
    refundTransactionsCreated: 0,
    refundAmount: 0,
    skippedHasSeparateRtoRate: 0,
    skippedAlreadyCorrected: 0,
    unmatchedRtoDebits: Number(unmatched.count || 0),
    unmatchedRtoDebitAmount: roundMoney(Number(unmatched.amount || 0)),
    details: [] as any[],
  }

  for (const order of orders) {
    const hasRtoRate = await hasPositiveRtoRateForOrder(order)
    if (hasRtoRate) {
      summary.skippedHasSeparateRtoRate += 1
      continue
    }

    await db.transaction(async (tx) => {
      const txResult = await tx.execute(sql`
        select id, wallet_id, type, amount, reason, ref, meta, created_at
        from wallet_transactions
        where wallet_id = ${order.wallet_id}
          and (
            ref = ${order.id}
            or meta->>'awb' = ${order.awb_number}
            or meta->>'awb_number' = ${order.awb_number}
            or reason ilike ${`%${order.order_number || ''}%`}
          )
        order by created_at asc, id asc
      `)
      const transactions = ((txResult as any).rows || []) as any[]
      const rtoDebits = transactions.filter(
        (transaction) =>
          transaction.type === 'debit' &&
          String(transaction.reason || '').toLowerCase().startsWith('rto freight -'),
      )
      const rtoDebitAmount = roundMoney(
        rtoDebits.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
      )
      const existingRtoFreightRefund = roundMoney(
        transactions
          .filter((transaction) => {
            if (transaction.type !== 'credit') return false
            const reason = String(transaction.reason || '').toLowerCase()
            return reason.includes('rto freight') && reason.includes('refund')
          })
          .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
      )
      const refundDue = roundMoney(Math.max(0, rtoDebitAmount - existingRtoFreightRefund))

      if (refundDue <= 0) {
        summary.skippedAlreadyCorrected += 1
        return
      }

      summary.ordersRefunded += 1
      summary.refundTransactionsCreated += 1
      summary.refundAmount = roundMoney(summary.refundAmount + refundDue)
      summary.details.push({
        order_number: order.order_number,
        awb_number: order.awb_number,
        courier_id: order.courier_id,
        courier_partner: order.courier_partner,
        refund_due: refundDue,
        rto_debit_amount: rtoDebitAmount,
        existing_rto_freight_refund: existingRtoFreightRefund,
        rto_debits: rtoDebits.map((transaction) => ({
          id: transaction.id,
          amount: Number(transaction.amount || 0),
          reason: transaction.reason,
          created_at: transaction.created_at,
        })),
      })

      if (apply) {
        await createWalletTransaction({
          walletId: order.wallet_id,
          amount: refundDue,
          type: 'credit',
          ref: order.id,
          reason: `${REFUND_REASON_PREFIX} (${order.order_number || 'unknown'})`,
          currency: order.currency || 'INR',
          meta: {
            source: 'refund_no_rto_rate_debits',
            order_id: order.id,
            order_number: order.order_number,
            awb_number: order.awb_number,
            courier_id: order.courier_id,
            courier_partner: order.courier_partner,
            explanation: 'No positive separate RTO rate card exists; RTO freight is included in forward freight.',
            refunded_rto_debits: rtoDebits.map((transaction) => ({
              id: transaction.id,
              amount: Number(transaction.amount || 0),
              reason: transaction.reason,
              created_at: transaction.created_at,
            })),
          },
          tx: tx as any,
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
