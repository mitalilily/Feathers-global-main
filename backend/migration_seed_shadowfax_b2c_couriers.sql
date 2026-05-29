-- Ensure existing Shadowfax B2C rate-card rows have a matching courier registry
-- entry. This is intentionally idempotent so it can run on every VPS release.

begin;

update shipping_rates
set
  service_provider = 'shadowfax',
  mode = coalesce(nullif(lower(trim(mode)), ''), 'surface'),
  last_updated = now()
where lower(business_type) = 'b2c'
  and (
    lower(coalesce(service_provider, '')) = 'shadowfax'
    or lower(coalesce(courier_name, '')) like '%shadowfax%'
  );

with shadowfax_rate_couriers as (
  select distinct on (courier_id)
    courier_id::integer as id,
    left(nullif(trim(courier_name), ''), 100) as name
  from shipping_rates
  where lower(business_type) = 'b2c'
    and lower(coalesce(service_provider, '')) = 'shadowfax'
    and courier_id is not null
    and courier_id > 0
  order by
    courier_id,
    case when lower(coalesce(courier_name, '')) like '%warehouse%' then 0 else 1 end,
    last_updated desc nulls last,
    created_at desc nulls last
),
valid_shadowfax_rate_couriers as (
  select
    id,
    coalesce(name, 'Shadowfax') as name
  from shadowfax_rate_couriers
),
updated_existing as (
  update couriers c
  set
    name = v.name,
    "isEnabled" = true,
    business_type = case
      when coalesce(c.business_type, '[]'::jsonb) @> '["b2c"]'::jsonb
        then coalesce(c.business_type, '[]'::jsonb)
      else coalesce(c.business_type, '[]'::jsonb) || '["b2c"]'::jsonb
    end,
    updated_at = now()
  from valid_shadowfax_rate_couriers v
  where c.id = v.id
    and lower(c."serviceProvider") = 'shadowfax'
  returning c.id
)
insert into couriers (
  id,
  name,
  "serviceProvider",
  "isEnabled",
  business_type,
  created_at,
  updated_at
)
select
  v.id,
  v.name,
  'shadowfax',
  true,
  '["b2c"]'::jsonb,
  now(),
  now()
from valid_shadowfax_rate_couriers v
where not exists (
  select 1
  from couriers c
  where c.id = v.id
    and lower(c."serviceProvider") = 'shadowfax'
);

commit;
