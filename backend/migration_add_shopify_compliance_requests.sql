CREATE TABLE IF NOT EXISTS shopify_compliance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id varchar(50),
  shop_domain_hash varchar(64) NOT NULL,
  request_external_id varchar(120) NOT NULL,
  topic varchar(80) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending',
  encrypted_payload text,
  export_sha256 varchar(64),
  delivery_email_hash varchar(64),
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  delivered_at timestamptz,
  redacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shopify_compliance_requests_shop_request_unique
  ON shopify_compliance_requests (shop_domain_hash, request_external_id);

CREATE INDEX IF NOT EXISTS shopify_compliance_requests_retry_idx
  ON shopify_compliance_requests (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS shopify_compliance_requests_due_idx
  ON shopify_compliance_requests (due_at)
  WHERE status NOT IN ('delivered', 'redacted');
