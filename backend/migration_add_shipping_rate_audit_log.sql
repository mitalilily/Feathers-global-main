CREATE TABLE IF NOT EXISTS shipping_rate_audit_log (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL,
  shipping_rate_id UUID,
  plan_id UUID,
  courier_id INTEGER,
  courier_name TEXT,
  service_provider TEXT,
  mode TEXT,
  business_type TEXT,
  zone_id UUID,
  rate_type TEXT,
  old_row JSONB,
  new_row JSONB,
  db_user TEXT NOT NULL DEFAULT current_user,
  application_name TEXT DEFAULT current_setting('application_name', true),
  client_addr INET DEFAULT inet_client_addr(),
  backend_pid INTEGER NOT NULL DEFAULT pg_backend_pid(),
  transaction_id BIGINT NOT NULL DEFAULT txid_current()
);

CREATE INDEX IF NOT EXISTS idx_shipping_rate_audit_log_rate_id
  ON shipping_rate_audit_log (shipping_rate_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_shipping_rate_audit_log_plan_courier
  ON shipping_rate_audit_log (plan_id, courier_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_shipping_rate_audit_log_action_time
  ON shipping_rate_audit_log (action, occurred_at DESC);

CREATE OR REPLACE FUNCTION log_shipping_rate_change()
RETURNS TRIGGER AS $$
DECLARE
  source_row RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    source_row := OLD;
  ELSE
    source_row := NEW;
  END IF;

  INSERT INTO shipping_rate_audit_log (
    action,
    shipping_rate_id,
    plan_id,
    courier_id,
    courier_name,
    service_provider,
    mode,
    business_type,
    zone_id,
    rate_type,
    old_row,
    new_row
  )
  VALUES (
    TG_OP,
    source_row.id,
    source_row.plan_id,
    source_row.courier_id,
    source_row.courier_name,
    source_row.service_provider,
    source_row.mode,
    source_row.business_type,
    source_row.zone_id,
    source_row.type,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shipping_rate_audit_log ON shipping_rates;

CREATE TRIGGER trg_shipping_rate_audit_log
AFTER INSERT OR UPDATE OR DELETE ON shipping_rates
FOR EACH ROW
EXECUTE FUNCTION log_shipping_rate_change();
