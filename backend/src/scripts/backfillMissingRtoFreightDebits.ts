import { sql } from 'drizzle-orm'
import { db } from '../models/client'
import { createWalletTransaction } from '../models/services/wallet.service'
import { computeB2CFreightForOrder } from '../models/services/shiprocket.service'

const apply = process.argv.includes('--apply')
const onlyAwbArg = process.argv.find((arg) => arg.startsWith('--awb='))
const onlyAwb = onlyAwbArg ? onlyAwbArg.split('=').slice(1).join('=').trim() : ''
const recentDaysArg = process.argv.find((arg) => arg.startsWith('--recent-days='))
const recentDays = recentDaysArg ? Number(recentDaysArg.split('=').slice(1).join('=')) : 0

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

const computeRtoFreight = async (order: any) => {
  const courierId = Number(order.courier_id ?? 0)
  const originPincode = getPickupPincode(order.pickup_details)
  const destinationPincode = String(order.pincode || '').trim()
  const weightG = normalizeWeightToGrams(order.charged_weight ?? order.weight)
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
    return { amount: 0, reason: 'missing_required_shipment_fields' }
  }

  try {
    const computed = await computeB2CFreightForOrder({
      userId: order.user_id,
      courierId,
      serviceProvider: order.integration_type ?? null,
      mode: order.shipping_mode ?? order.provider_mode ?? order.provider_service ?? null,
      selectedMaxSlabWeight: order.selected_max_slab_weight ?? null,
      originPincode,
      destinationPincode,
      weightG,
      lengthCm,
      breadthCm,
      heightCm,
      isReverse: false,
      isRto: true,
    })

    return { amount: toMoney(computed.freight), reason: 'ok' }
  } catch (err: any) {
    return { amount: 0, reason: err?.message || 'no_matching_rto_rate' }
  }
}

const computeUniformRtoFreightFallback = async (order: any) => {
  const courierName = String(
    order.original_debit_meta?.courier_name || order.courier_partner || order.integration_type || '',
  ).trim()
  if (!order.user_id || !courierName) {
    return { amount: 0, reason: 'missing_courier_name_for_uniform_rate_fallback' }
  }

  const mode = String(
    order.shipping_mode ||
      order.provider_mode ||
      order.provider_service ||
      order.original_debit_meta?.shipping_mode ||
      order.original_debit_meta?.provider_mode ||
      order.original_debit_meta?.provider_service ||
      '',
  ).trim()

  const result = await db.execute(sql`
    with active_plan as (
      select up.plan_id
      from user_plans up
      where up."userId" = ${order.user_id}
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
      and (${mode || null}::text is null or lower(sr.mode) = lower(${mode || null}))
  `)

  const row = (((result as any).rows || [])[0] || {}) as any
  const rows = Number(row.rows || 0)
  const minRate = toMoney(row.min_rate)
  const maxRate = toMoney(row.max_rate)

  if (!rows || minRate <= 0 || maxRate <= 0) {
    return { amount: 0, reason: 'no_positive_rto_rate' }
  }
  if (roundMoney(minRate) !== roundMoney(maxRate)) {
    return {
      amount: 0,
      reason: 'rto_rate_varies_by_zone_missing_pickup_pincode',
      rates: row.rates || [],
    }
  }

  return { amount: roundMoney(minRate), reason: 'uniform_rto_rate_fallback' }
}

const hasExistingRtoDebit = async (executor: any, order: any) => {
  const result = await executor.execute(sql`
    select id
    from wallet_transactions
    where wallet_id = ${order.wallet_id}
      and type = 'debit'
      and reason ilike 'RTO freight -%'
      and (
        ref = ${order.id}
        or meta->>'awb' = ${order.awb_number}
        or meta->>'awb_number' = ${order.awb_number}
        or reason ilike ${`%${order.order_number || ''}%`}
      )
    limit 1
  `)
  return (((result as any).rows || [])[0] || null) as any
}

const loadCandidateOrders = async () => {
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
      w.id as wallet_id,
      coalesce(w.currency, 'INR') as currency,
      original_wt.id as original_debit_id,
      original_wt.meta as original_debit_meta
    from b2c_orders o
    join wallets w on w."userId" = o.user_id
    left join lateral (
      select wt.id, wt.meta
      from wallet_transactions wt
      where wt.wallet_id = w.id
        and wt.type = 'debit'
        and wt.reason not ilike 'RTO freight -%'
        and (
          wt.ref = o.id::text
          or wt.meta->>'awb' = o.awb_number
          or wt.meta->>'awb_number' = o.awb_number
          or (
            o.order_number is not null
            and wt.reason ilike ('%' || o.order_number || '%')
          )
        )
      order by wt.created_at asc
      limit 1
    ) original_wt on true
    where
      o.awb_number is not null
      and o.awb_number <> ''
      and (${onlyAwb || null}::text is null or o.awb_number = ${onlyAwb || null})
      and (${recentDays || 0}::int <= 0 or o.created_at >= now() - (${recentDays || 0}::int * interval '1 day'))
      and (
        lower(coalesce(o.order_status, '')) like 'rto%'
        or exists (
          select 1
          from rto_events re
          where re.order_id = o.id
        )
      )
      and not exists (
        select 1
        from wallet_transactions wt
        where wt.wallet_id = w.id
          and wt.type = 'debit'
          and wt.reason ilike 'RTO freight -%'
          and (
            wt.ref = o.id::text
            or wt.meta->>'awb' = o.awb_number
            or wt.meta->>'awb_number' = o.awb_number
            or (
              o.order_number is not null
              and wt.reason ilike ('%' || o.order_number || '%')
            )
          )
      )
    order by o.order_number
  `)

  return ((result as any).rows || []) as any[]
}

const main = async () => {
  const candidates = await loadCandidateOrders()
  const summary = {
    dryRun: !apply,
    candidates: candidates.length,
    wouldDebit: 0,
    debited: 0,
    debitAmount: 0,
    skipped: 0,
    details: [] as any[],
  }

  for (const order of candidates) {
    let computed = await computeRtoFreight(order)
    if (computed.amount <= 0 && computed.reason === 'missing_required_shipment_fields') {
      computed = await computeUniformRtoFreightFallback(order)
    }
    const amount = roundMoney(computed.amount)
    const courierLabel = order.courier_partner || order.integration_type || 'Courier'

    if (amount <= 0) {
      summary.skipped += 1
      summary.details.push({
        awb_number: order.awb_number,
        order_number: order.order_number,
        courier: courierLabel,
        action: 'skipped',
        reason: computed.reason,
      })
      continue
    }

    summary.wouldDebit += 1
    summary.debitAmount = roundMoney(summary.debitAmount + amount)

    if (!apply) {
      summary.details.push({
        awb_number: order.awb_number,
        order_number: order.order_number,
        courier: courierLabel,
        action: 'would_debit',
        amount,
      })
      continue
    }

    await db.transaction(async (tx) => {
      const existing = await hasExistingRtoDebit(tx, order)
      if (existing) {
        summary.skipped += 1
        summary.details.push({
          awb_number: order.awb_number,
          order_number: order.order_number,
          courier: courierLabel,
          action: 'skipped',
          reason: 'existing_rto_debit_found_during_transaction',
          existing_transaction_id: existing.id,
        })
        return
      }

      const created = await createWalletTransaction({
        walletId: order.wallet_id,
        amount,
        type: 'debit',
        currency: order.currency || 'INR',
        reason: `RTO freight - ${courierLabel} (${order.order_number})`,
        ref: order.id,
        meta: {
          source: 'missing_rto_freight_backfill',
          rate_type: 'rto',
          awb: order.awb_number,
          awb_number: order.awb_number,
          order_id: order.id,
          order_number: order.order_number,
          courier_id: order.courier_id ?? null,
          courier_partner: courierLabel,
        },
        tx: tx as any,
      })

      await tx.execute(sql`
        update rto_events
        set rto_charges = ${amount}, updated_at = now()
        where order_id = ${order.id}
          and (rto_charges is null or rto_charges <= 0)
      `)

      summary.debited += 1
      summary.details.push({
        awb_number: order.awb_number,
        order_number: order.order_number,
        courier: courierLabel,
        action: 'debited',
        amount,
        transaction_id: created?.[0]?.id ?? null,
      })
    })
  }

  console.log(JSON.stringify(summary, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
