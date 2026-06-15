ALTER TABLE b2c_orders
  ADD COLUMN IF NOT EXISTS manifest_error varchar(255);
