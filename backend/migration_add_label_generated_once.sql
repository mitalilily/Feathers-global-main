ALTER TABLE b2c_orders
  ADD COLUMN IF NOT EXISTS label_generated_once boolean NOT NULL DEFAULT false;

ALTER TABLE b2b_orders
  ADD COLUMN IF NOT EXISTS label_generated_once boolean NOT NULL DEFAULT false;

UPDATE b2c_orders
SET label_generated_once = true
WHERE NULLIF(BTRIM(label), '') IS NOT NULL
  AND label_generated_once = false;

UPDATE b2b_orders
SET label_generated_once = true
WHERE NULLIF(BTRIM(label), '') IS NOT NULL
  AND label_generated_once = false;

CREATE OR REPLACE FUNCTION preserve_label_generated_once()
RETURNS trigger AS $$
BEGIN
  NEW.label_generated_once := CASE WHEN TG_OP = 'UPDATE'
      THEN COALESCE(OLD.label_generated_once, false)
      ELSE false
    END
    OR COALESCE(NEW.label_generated_once, false)
    OR NULLIF(BTRIM(NEW.label), '') IS NOT NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS b2c_orders_label_generated_once_trigger ON b2c_orders;
CREATE TRIGGER b2c_orders_label_generated_once_trigger
BEFORE INSERT OR UPDATE OF label, label_generated_once ON b2c_orders
FOR EACH ROW EXECUTE FUNCTION preserve_label_generated_once();

DROP TRIGGER IF EXISTS b2b_orders_label_generated_once_trigger ON b2b_orders;
CREATE TRIGGER b2b_orders_label_generated_once_trigger
BEFORE INSERT OR UPDATE OF label, label_generated_once ON b2b_orders
FOR EACH ROW EXECUTE FUNCTION preserve_label_generated_once();

-- Repair only booking-stage rows that have no physical-movement tracking event.
-- This avoids downgrading shipments that genuinely entered transit.
UPDATE b2c_orders AS orders
SET order_status = 'pickup_initiated',
    pickup_status = CASE
      WHEN COALESCE(NULLIF(BTRIM(orders.pickup_status), ''), 'pending') = 'pending'
        THEN 'pickup_requested'
      ELSE orders.pickup_status
    END,
    provider_last_status = 'pickup_initiated',
    updated_at = NOW()
WHERE LOWER(COALESCE(orders.integration_type, '')) IN ('xpressbees', 'shadowfax', 'ekart')
  AND LOWER(COALESCE(orders.order_status, '')) = 'in_transit'
  AND NOT EXISTS (
    SELECT 1
    FROM tracking_events AS events
    WHERE events.order_id = orders.id
      AND LOWER(CONCAT_WS(' ', events.status_code, events.status_text)) ~
        '(in[ _-]?transit|out for delivery|ofd|delivered|arrived|departed|dispatched|received at|hub scan|rto)'
  );
