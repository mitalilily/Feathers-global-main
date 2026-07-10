import { pool } from '../client'

const COMBINED_ORDERS_CTE = `
with combined_orders as (
  select
    created_at,
    updated_at,
    lower(coalesce(order_status, '')) as status,
    lower(coalesce(order_type, '')) as order_type,
    coalesce(order_amount::numeric, 0) as order_amount,
    coalesce(shipping_charges::numeric, 0) as shipping_charges,
    coalesce(freight_charges::numeric, 0) as freight_charges,
    coalesce(courier_cost::numeric, 0) as courier_cost,
    nullif(btrim(coalesce(courier_partner, integration_type, '')), '') as courier_name,
    coalesce(nullif(btrim(city), ''), 'Unknown') as destination_city,
    coalesce(nullif(btrim(state), ''), 'Unknown') as destination_state,
    coalesce(nullif(btrim(pickup_details->>'city'), ''), nullif(btrim(city), ''), 'Unknown') as origin_city
  from b2c_orders
  union all
  select
    created_at,
    updated_at,
    lower(coalesce(order_status, '')) as status,
    lower(coalesce(order_type, '')) as order_type,
    coalesce(order_amount::numeric, 0) as order_amount,
    coalesce(shipping_charges::numeric, 0) as shipping_charges,
    coalesce(freight_charges::numeric, 0) as freight_charges,
    coalesce(courier_cost::numeric, 0) as courier_cost,
    nullif(btrim(coalesce(courier_partner, integration_type, '')), '') as courier_name,
    coalesce(nullif(btrim(city), ''), 'Unknown') as destination_city,
    coalesce(nullif(btrim(state), ''), 'Unknown') as destination_state,
    coalesce(nullif(btrim(pickup_details->>'city'), ''), nullif(btrim(city), ''), 'Unknown') as origin_city
  from b2b_orders
)
`

const NDR_STATUS_PREDICATE = `
  status like any (
    array[
      '%ndr%',
      '%undelivered%',
      '%delivery_attempt_failed%',
      '%door_closed%',
      '%address_issue%'
    ]
  )
`

const TRANSIT_STATUS_PREDICATE = `
  status in ('shipment_created', 'in_transit', 'out_for_delivery')
`

const PENDING_STATUS_PREDICATE = `
  status in ('pending', 'booked')
`

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeCourierName = (value: unknown) => {
  const courier = String(value || '').trim()
  if (!courier) return 'Unknown'
  const lower = courier.toLowerCase()
  if (lower.includes('delhivery')) return 'Delhivery'
  if (lower.includes('xpressbees')) return 'Xpressbees'
  if (lower.includes('shadowfax')) return 'Shadowfax'
  if (lower.includes('ekart')) return 'Ekart'
  if (lower.includes('amazon')) return 'Amazon'
  if (lower.includes('ecom')) return 'Ecom'
  return courier
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export const getAdminDashboardStats = async () => {
  const [
    summaryResult,
    chartResult,
    courierResult,
    originResult,
    destinationResult,
    alertResult,
  ] = await Promise.all([
    pool.query(`
      ${COMBINED_ORDERS_CTE}
      select
        count(*)::int as total_orders,
        count(*) filter (where status <> 'cancelled')::int as operational_base_count,
        count(*) filter (where status = 'delivered')::int as delivered_orders,
        count(*) filter (where ${NDR_STATUS_PREDICATE})::int as ndr_orders,
        count(*) filter (where status like '%rto%' or status = 'returned_to_origin')::int as rto_orders,
        count(*) filter (where created_at::date = current_date)::int as today_orders,
        count(*) filter (where created_at::date = current_date and ${PENDING_STATUS_PREDICATE})::int as today_pending,
        count(*) filter (where created_at::date = current_date and ${TRANSIT_STATUS_PREDICATE})::int as today_in_transit,
        count(*) filter (where updated_at::date = current_date and status = 'delivered')::int as today_delivered,
        count(*) filter (where created_at::date = current_date and ${NDR_STATUS_PREDICATE})::int as today_ndr,
        count(*) filter (where ${TRANSIT_STATUS_PREDICATE} and created_at <= now() - interval '5 days')::int as stuck_orders,
        coalesce(sum(freight_charges - courier_cost), 0)::numeric as total_revenue,
        coalesce(sum(shipping_charges), 0)::numeric as total_shipping_charges,
        coalesce(sum(freight_charges), 0)::numeric as total_freight_charges,
        coalesce(sum(courier_cost), 0)::numeric as total_courier_costs,
        coalesce(sum(case when created_at::date = current_date then freight_charges - courier_cost else 0 end), 0)::numeric as today_revenue,
        coalesce(sum(case when order_type = 'cod' then order_amount else 0 end), 0)::numeric as cod_amount,
        round(
          coalesce(
            avg(
              case
                when status = 'delivered' and updated_at is not null and created_at is not null
                then extract(epoch from (updated_at - created_at)) / 86400.0
                else null
              end
            ),
            0
          )
        )::int as avg_delivery_time
      from combined_orders
    `),
    pool.query(`
      ${COMBINED_ORDERS_CTE}
      with days as (
        select generate_series(current_date - interval '6 days', current_date, interval '1 day')::date as day
      ),
      order_days as (
        select
          created_at::date as day,
          count(*)::int as orders,
          coalesce(sum(freight_charges - courier_cost), 0)::numeric as revenue
        from combined_orders
        group by created_at::date
      )
      select
        to_char(days.day, 'YYYY-MM-DD') as date,
        coalesce(order_days.orders, 0)::int as orders,
        coalesce(order_days.revenue, 0)::numeric as revenue
      from days
      left join order_days on order_days.day = days.day
      order by days.day asc
    `),
    pool.query(`
      ${COMBINED_ORDERS_CTE}
      select
        coalesce(courier_name, 'Unknown') as courier_name,
        count(*) filter (where status <> 'cancelled')::int as order_count,
        count(*) filter (where status = 'delivered')::int as delivered_count,
        coalesce(sum(freight_charges - courier_cost), 0)::numeric as revenue
      from combined_orders
      group by coalesce(courier_name, 'Unknown')
      order by order_count desc, revenue desc
      limit 8
    `),
    pool.query(`
      ${COMBINED_ORDERS_CTE}
      select
        origin_city as city,
        count(*)::int as order_count
      from combined_orders
      group by origin_city
      order by order_count desc, city asc
      limit 5
    `),
    pool.query(`
      ${COMBINED_ORDERS_CTE}
      select
        destination_city as city,
        count(*)::int as order_count
      from combined_orders
      group by destination_city
      order by order_count desc, city asc
      limit 5
    `),
    pool.query(`
      select
        (select count(*)::int from support_tickets where status = 'open') as open_tickets,
        (select count(*)::int from support_tickets where status = 'in_progress') as in_progress_tickets,
        (
          select count(*)::int
          from support_tickets
          where status in ('open', 'in_progress')
            and due_date is not null
            and due_date < now()
        ) as overdue_tickets,
        (
          select count(*)::int
          from users
          left join user_profiles on user_profiles."userId" = users.id
          left join kyc on kyc."userId" = users.id
          where lower(coalesce(users.role, 'customer')) = 'customer'
            and coalesce(kyc.status::text, user_profiles."domesticKyc" ->> 'status', 'pending') = 'verification_in_progress'
        ) as pending_kyc,
        (
          select count(*)::int
          from weight_discrepancies
          where status = 'pending'
        ) as weight_discrepancies,
        (
          select coalesce(sum(remittable_amount::numeric), 0)::numeric
          from cod_remittances
          where status = 'pending'
        ) as cod_remittance_due
    `),
  ])

  const summary = summaryResult.rows[0] || {}
  const alerts = alertResult.rows[0] || {}

  const totalOrders = toNumber(summary.total_orders)
  const deliveredOrders = toNumber(summary.delivered_orders)
  const nonCancelledOrders = toNumber(summary.operational_base_count)
  const ndrOrders = toNumber(summary.ndr_orders)
  const rtoOrders = toNumber(summary.rto_orders)

  const courierPerformance = Object.fromEntries(
    courierResult.rows.map((row) => {
      const count = toNumber(row.order_count)
      const delivered = toNumber(row.delivered_count)
      return [
        normalizeCourierName(row.courier_name),
        {
          count,
          deliveryRate: count > 0 ? Math.round((delivered / count) * 100) : 0,
          revenue: toNumber(row.revenue),
        },
      ]
    }),
  )

  return {
    success: true,
    data: {
      todayOperations: {
        orders: toNumber(summary.today_orders),
        pending: toNumber(summary.today_pending),
        inTransit: toNumber(summary.today_in_transit),
        delivered: toNumber(summary.today_delivered),
        ndr: toNumber(summary.today_ndr),
        stuck: toNumber(summary.stuck_orders),
      },
      financial: {
        todayRevenue: toNumber(summary.today_revenue),
        totalRevenue: toNumber(summary.total_revenue),
        totalShippingCharges: toNumber(summary.total_shipping_charges),
        totalFreightCharges: toNumber(summary.total_freight_charges),
        totalCourierCosts: toNumber(summary.total_courier_costs),
        codAmount: toNumber(summary.cod_amount),
        codRemittanceDue: toNumber(alerts.cod_remittance_due),
      },
      operational: {
        deliverySuccessRate:
          nonCancelledOrders > 0 ? Math.round((deliveredOrders / nonCancelledOrders) * 100) : 0,
        ndrRate: nonCancelledOrders > 0 ? Number(((ndrOrders / nonCancelledOrders) * 100).toFixed(1)) : 0,
        rtoRate: nonCancelledOrders > 0 ? Math.round((rtoOrders / nonCancelledOrders) * 100) : 0,
        avgDeliveryTime: toNumber(summary.avg_delivery_time),
        totalOrders,
        deliveredOrders,
        ndrOrders,
        rtoOrders,
      },
      alerts: {
        openTickets: toNumber(alerts.open_tickets),
        inProgressTickets: toNumber(alerts.in_progress_tickets),
        overdueTickets: toNumber(alerts.overdue_tickets),
        pendingKyc: toNumber(alerts.pending_kyc),
        weightDiscrepancies: toNumber(alerts.weight_discrepancies),
      },
      couriers: {
        performance: courierPerformance,
      },
      geographic: {
        topOriginCities: originResult.rows.map((row) => ({
          city: row.city,
          count: toNumber(row.order_count),
        })),
        topDestinationCities: destinationResult.rows.map((row) => ({
          city: row.city,
          count: toNumber(row.order_count),
        })),
      },
      charts: {
        ordersByDate: chartResult.rows.map((row) => ({
          date: row.date,
          orders: toNumber(row.orders),
        })),
        revenueByDate: chartResult.rows.map((row) => ({
          date: row.date,
          revenue: toNumber(row.revenue),
        })),
      },
    },
  }
}
