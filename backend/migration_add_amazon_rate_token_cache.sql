CREATE TABLE IF NOT EXISTS amazon_rate_token_cache (
  cache_key text PRIMARY KEY,
  user_id text NOT NULL,
  courier_id text,
  pickup_location_id text,
  origin_pincode text,
  destination_pincode text,
  payment_type text,
  order_amount numeric,
  weight_g integer,
  length_cm numeric,
  breadth_cm numeric,
  height_cm numeric,
  request_token text NOT NULL,
  rate_id text NOT NULL,
  carrier_id text,
  carrier_name text,
  service_id text,
  service_name text,
  raw_rate jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS amazon_rate_token_cache_user_expires_idx
  ON amazon_rate_token_cache (user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS amazon_rate_token_cache_route_idx
  ON amazon_rate_token_cache (
    user_id,
    courier_id,
    pickup_location_id,
    origin_pincode,
    destination_pincode,
    payment_type
  );
