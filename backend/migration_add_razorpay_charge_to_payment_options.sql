-- ============================================================
-- Add Razorpay freight charge setting and B2C order audit fields
-- ============================================================

ALTER TABLE payment_options
  ADD COLUMN IF NOT EXISTS razorpay_charge_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS razorpay_charge_percent NUMERIC(6, 2) DEFAULT '0';

UPDATE payment_options
SET
  razorpay_charge_enabled = COALESCE(razorpay_charge_enabled, false),
  razorpay_charge_percent = COALESCE(razorpay_charge_percent, '0')
WHERE razorpay_charge_enabled IS NULL
  OR razorpay_charge_percent IS NULL;

ALTER TABLE payment_options
  ALTER COLUMN razorpay_charge_enabled SET DEFAULT false,
  ALTER COLUMN razorpay_charge_enabled SET NOT NULL,
  ALTER COLUMN razorpay_charge_percent SET DEFAULT '0',
  ALTER COLUMN razorpay_charge_percent SET NOT NULL;

ALTER TABLE b2c_orders
  ADD COLUMN IF NOT EXISTS razorpay_charge_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS razorpay_charge_percent NUMERIC(6, 2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS razorpay_charge_amount NUMERIC(12, 2) DEFAULT '0';

UPDATE b2c_orders
SET
  razorpay_charge_enabled = COALESCE(razorpay_charge_enabled, false),
  razorpay_charge_percent = COALESCE(razorpay_charge_percent, '0'),
  razorpay_charge_amount = COALESCE(razorpay_charge_amount, '0')
WHERE razorpay_charge_enabled IS NULL
  OR razorpay_charge_percent IS NULL
  OR razorpay_charge_amount IS NULL;

-- ============================================================
-- Verify:
-- SELECT razorpay_charge_enabled, razorpay_charge_percent FROM payment_options LIMIT 1;
-- SELECT razorpay_charge_enabled, razorpay_charge_percent, razorpay_charge_amount FROM b2c_orders LIMIT 5;
-- ============================================================
