import { sql } from 'drizzle-orm'
import { db } from '../models/client'
import { createWalletTransaction } from '../models/services/wallet.service'
import { computeB2CFreightForOrder } from '../models/services/shiprocket.service'

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

const computeRtoFreightFromOrder = async (row: any) => {
  const courierId = Number(row.courier_id ?? 0)
  const originPincode = getPickupPincode(row.pickup_details)
  const destinationPincode = String(row.pincode || '').trim()
  const weightG = normalizeWeightToGrams(row.charged_weight ?? row.weight)
  const lengthCm = Number(row.length ?? 0)
  const breadthCm = Number(row.breadth ?? 0)
  const heightCm = Number(row.height ?? 0)

  if (
    !row.user_id ||
    !courierId ||
    !originPincode ||
    !destinationPincode ||
    weightG <= 0 ||
    lengthCm <= 0 ||
    breadthCm <= 0 ||
    heightCm <= 0
  ) {
    return { amount: 0, reason: 'missing_required_shipment_fields' }
  }

  try {
    const computed = await computeB2CFreightForOrder({
      userId: row.user_id,
      courierId,
      serviceProvider: row.integration_type ?? row.rto_debit_meta?.integration_type ?? null,
      mode: row.shipping_mode ?? row.provider_mode ?? row.provider_service ?? null,
      selectedMaxSlabWeight: row.selected_max_slab_weight ?? null,
      originPincode,
      destinationPincode,
      weightG,
      lengthCm,
      breadthCm,
      heightCm,
      isReverse: false,
      isRto: true,
    })
    return { amount: toMoney(computed.freight), reason: 'order_rate_card' }
  } catch (err: any) {
    return { amount: 0, reason: err?.message || 'no_matching_rto_rate' }
  }
}

const computeUniformRtoFreightFallback = async (row: any) => {
  const courierName = String(
    row.original_debit_meta?.courier_name || row.rto_courier || row.rto_debit_meta?.courier_partner || '',
  ).trim()
  if (!row.user_id || !courierName) {
    return { amount: 0, reason: 'missing_courier_name_for_uniform_rate_fallback' }
  }

  const result = await db.execute(sql`
    with active_plan as (
      select up.plan_id
      from user_plans up
      where up."userId" = ${row.user_id}
        and up.is_active = true
      limit 1
    )
    select
      count(*)::int as rows,
      min(sr.rate::numeric) as min_rate,
      max(sr.rate::numeric) as max_rate,
      array_agg(distinct sr.rate::text order by sr.rate::text) as rates
    from shipping_rates sr
    join active_plan ap on ap.plan_id = sr.plan_id
    where sr.business_type = 'b2c'
      and sr.type = 'rto'
      and lower(sr.courier_name) = lower(${courierName})
  `)

  const rateRow = (((result as any).rows || [])[0] || {}) as any
  const rows = Number(rateRow.rows || 0)
  const minRate = toMoney(rateRow.min_rate)
  const maxRate = toMoney(rateRow.max_rate)
  if (!rows || minRate <= 0 || maxRate <= 0) return { amount: 0, reason: 'no_positive_rto_rate' }
  if (roundMoney(minRate) !== roundMoney(maxRate)) {
    return {
      amount: 0,
      reason: 'rto_rate_varies_by_zone_missing_pickup_pincode',
      rates: rateRow.rates || [],
    }
  }
  return { amount: roundMoney(minRate), reason: 'uniform_rto_rate_fallback' }
}

const expectedRtoFreight = async (row: any) => {
  const byOrder = await computeRtoFreightFromOrder(row)
  if (byOrder.amount > 0 || byOrder.reason !== 'missing_required_shipment_fields') return byOrder
  return computeUniformRtoFreightFallback(row)
}

const loadGroups = async () => {
  const result = await db.execute(sql`
    with rto_debits as (
      select
        wt.wallet_id,
        min(wt.ref) as ref,
        coalesce(wt.meta->>'awb', wt.meta->>'awb_number') as awb_number,
        coalesce(wt.meta->>'order_number', substring(wt.reason from '\\((#[^)]+)\\)')) as order_number,
        max(coalesce(wt.meta->>'courier_partner', regexp_replace(wt.reason, '^RTO freight -\\s*([^()]+)\\s*\\(.*$', '\\1'))) as rto_courier,
        sum(wt.amount)::numeric as debit_amount,
        count(*)::int as debit_count,
        json_agg(json_build_object('id', wt.id, 'amount', wt.amount, 'reason', wt.reason, 'created_at', wt.created_at) order by wt.created_at) as debit_transactions,
        (array_agg(wt.meta order by wt.created_at))[1] as rto_debit_meta
      from wallet_transactions wt
      where wt.type = 'debit'
        and (
          wt.reason ilike 'RTO freight -%'
          or wt.reason ilike 'RTO freight undercharge correction%'
        )
        and (${onlyAwb || null}::text is null or wt.meta->>'awb' = ${onlyAwb || null} or wt.meta->>'awb_number' = ${onlyAwb || null})
      group by wt.wallet_id, awb_number, order_number
    )
    select
      rd.*,
      coalesce(w.currency, 'INR') as currency,
      o.id as order_id,
      coalesce(o.user_id, w."userId") as user_id,
      o.courier_id,
      o.courier_partner,
      o.integration_type,
      o.shipping_mode,
      o.provider_mode,
      o.provider_service,
      o.selected_max_slab_weight,
      o.pickup_details,
      o.pincode,
      o.charged_weight,
      o.weight,
      o.length,
      o.breadth,
      o.height,
      coalesce(corrections.credit_amount, 0)::numeric as correction_credit_amount,
      corrections.credit_transactions,
      original_wt.meta as original_debit_meta
    from rto_debits rd
    join wallets w on w.id = rd.wallet_id
    left join b2c_orders o
      on o.user_id = w."userId"
      and (
        rd.ref = o.id::text
        or rd.awb_number = o.awb_number
        or rd.order_number = o.order_number
      )
    left join lateral (
      select
        sum(wtc.amount)::numeric as credit_amount,
        json_agg(json_build_object('id', wtc.id, 'amount', wtc.amount, 'reason', wtc.reason, 'created_at', wtc.created_at) order by wtc.created_at) as credit_transactions
      from wallet_transactions wtc
      where wtc.wallet_id = rd.wallet_id
        and wtc.type = 'credit'
        and (
          wtc.reason ilike 'Duplicate RTO freight refund%'
          or wtc.reason ilike 'RTO freight no rate-card refund%'
          or wtc.reason ilike 'RTO freight included in forward freight refund%'
          or wtc.reason ilike 'RTO freight overcharge refund%'
        )
        and (
          wtc.ref = rd.ref
          or wtc.meta->>'awb' = rd.awb_number
          or wtc.meta->>'awb_number' = rd.awb_number
          or wtc.meta->>'order_number' = rd.order_number
          or wtc.reason ilike ('%' || rd.order_number || '%')
        )
    ) corrections on true
    left join lateral (
      select wt.meta
      from wallet_transactions wt
      where wt.wallet_id = rd.wallet_id
        and wt.type = 'debit'
        and wt.reason not ilike 'RTO freight%'
        and (
          wt.ref = rd.ref
          or wt.meta->>'awb' = rd.awb_number
          or wt.meta->>'awb_number' = rd.awb_number
          or wt.meta->>'order_number' = rd.order_number
          or wt.reason ilike ('%' || rd.order_number || '%')
        )
      order by wt.created_at asc
      limit 1
    ) original_wt on true
    order by rd.order_number, rd.awb_number
  `)

  return ((result as any).rows || []) as any[]
}

const main = async () => {
  const groups = await loadGroups()
  const summary = {
    dryRun: !apply,
    groupsChecked: groups.length,
    groupsToCredit: 0,
    groupsToDebit: 0,
    creditAmount: 0,
    debitAmount: 0,
    creditsCreated: 0,
    debitsCreated: 0,
    skipped: 0,
    details: [] as any[],
  }

  for (const row of groups) {
    const expected = await expectedRtoFreight(row)
    const debitAmount = roundMoney(Number(row.debit_amount || 0))
    const correctionCreditAmount = roundMoney(Number(row.correction_credit_amount || 0))
    const currentNet = roundMoney(debitAmount - correctionCreditAmount)
    const expectedAmount = roundMoney(expected.amount)
    const creditDue = roundMoney(currentNet - expectedAmount)
    const debitDue = roundMoney(expectedAmount - currentNet)

    if (
      expected.amount <= 0 &&
      ['rto_rate_varies_by_zone_missing_pickup_pincode', 'missing_courier_name_for_uniform_rate_fallback'].includes(
        expected.reason,
      )
    ) {
      summary.skipped += 1
      summary.details.push({
        awb_number: row.awb_number,
        order_number: row.order_number,
        courier: row.rto_courier,
        action: 'skipped',
        reason: expected.reason,
        expected_rto_freight: expectedAmount,
        current_net_rto_freight: currentNet,
      })
      continue
    }

    if (creditDue <= 0) {
      if (debitDue > 0 && expectedAmount > 0) {
        summary.groupsToDebit += 1
        summary.debitAmount = roundMoney(summary.debitAmount + debitDue)

        if (!apply) {
          summary.details.push({
            awb_number: row.awb_number,
            order_number: row.order_number,
            courier: row.rto_courier,
            action: 'would_debit',
            amount: debitDue,
            expected_rto_freight: expectedAmount,
            current_net_rto_freight: currentNet,
            original_rto_debit_amount: debitAmount,
            existing_correction_credit_amount: correctionCreditAmount,
            rate_reason: expected.reason,
            debit_count: Number(row.debit_count || 0),
          })
          continue
        }

        const created = await createWalletTransaction({
          walletId: row.wallet_id,
          amount: debitDue,
          type: 'debit',
          currency: row.currency || 'INR',
          ref: row.order_id || row.ref || row.awb_number || null,
          reason: `RTO freight undercharge correction (${row.order_number || row.awb_number || 'unknown'})`,
          meta: {
            source: 'rto_freight_reconciliation',
            awb: row.awb_number,
            awb_number: row.awb_number,
            order_number: row.order_number,
            order_id: row.order_id,
            courier_partner: row.rto_courier,
            expected_rto_freight: expectedAmount,
            current_net_rto_freight: currentNet,
            original_rto_debit_amount: debitAmount,
            existing_correction_credit_amount: correctionCreditAmount,
            rate_reason: expected.reason,
            rto_debit_transactions: row.debit_transactions || [],
            rto_correction_transactions: row.credit_transactions || [],
          },
        })

        summary.debitsCreated += 1
        summary.details.push({
          awb_number: row.awb_number,
          order_number: row.order_number,
          courier: row.rto_courier,
          action: 'debited',
          amount: debitDue,
          transaction_id: created?.[0]?.id ?? null,
          expected_rto_freight: expectedAmount,
          current_net_rto_freight: currentNet,
          rate_reason: expected.reason,
        })
        continue
      }

      summary.skipped += 1
      summary.details.push({
        awb_number: row.awb_number,
        order_number: row.order_number,
        courier: row.rto_courier,
        action: 'skipped',
        reason: 'already_correct',
        expected_rto_freight: expectedAmount,
        current_net_rto_freight: currentNet,
        rate_reason: expected.reason,
      })
      continue
    }

    summary.groupsToCredit += 1
    summary.creditAmount = roundMoney(summary.creditAmount + creditDue)

    if (!apply) {
      summary.details.push({
        awb_number: row.awb_number,
        order_number: row.order_number,
        courier: row.rto_courier,
        action: 'would_credit',
        amount: creditDue,
        expected_rto_freight: expectedAmount,
        current_net_rto_freight: currentNet,
        original_rto_debit_amount: debitAmount,
        existing_correction_credit_amount: correctionCreditAmount,
        rate_reason: expected.reason,
        debit_count: Number(row.debit_count || 0),
      })
      continue
    }

    const created = await createWalletTransaction({
      walletId: row.wallet_id,
      amount: creditDue,
      type: 'credit',
      currency: row.currency || 'INR',
      ref: row.order_id || row.ref || row.awb_number || null,
      reason: `RTO freight overcharge refund (${row.order_number || row.awb_number || 'unknown'})`,
      meta: {
        source: 'rto_freight_reconciliation',
        awb_number: row.awb_number,
        order_number: row.order_number,
        order_id: row.order_id,
        courier_partner: row.rto_courier,
        expected_rto_freight: expectedAmount,
        current_net_rto_freight: currentNet,
        original_rto_debit_amount: debitAmount,
        existing_correction_credit_amount: correctionCreditAmount,
        rate_reason: expected.reason,
        rto_debit_transactions: row.debit_transactions || [],
        rto_correction_transactions: row.credit_transactions || [],
      },
    })

    summary.creditsCreated += 1
    summary.details.push({
      awb_number: row.awb_number,
      order_number: row.order_number,
      courier: row.rto_courier,
      action: 'credited',
      amount: creditDue,
      transaction_id: created?.[0]?.id ?? null,
      expected_rto_freight: expectedAmount,
      current_net_rto_freight: currentNet,
      rate_reason: expected.reason,
    })
  }

  console.log(JSON.stringify(summary, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
