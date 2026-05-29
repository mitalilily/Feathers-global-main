CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    CREATE TYPE invoice_status AS ENUM ('paid', 'pending', 'overdue', 'disputed');
  END IF;
END $$;

ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'overdue';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'disputed';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billingInvoiceTypeEnum') THEN
    CREATE TYPE "billingInvoiceTypeEnum" AS ENUM ('weekly', 'monthly_summary', 'manual');
  END IF;
END $$;

ALTER TYPE "billingInvoiceTypeEnum" ADD VALUE IF NOT EXISTS 'weekly';
ALTER TYPE "billingInvoiceTypeEnum" ADD VALUE IF NOT EXISTS 'monthly_summary';
ALTER TYPE "billingInvoiceTypeEnum" ADD VALUE IF NOT EXISTS 'manual';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_payment_method') THEN
    CREATE TYPE invoice_payment_method AS ENUM ('upi', 'neft', 'pg', 'wallet');
  END IF;
END $$;

ALTER TYPE invoice_payment_method ADD VALUE IF NOT EXISTS 'upi';
ALTER TYPE invoice_payment_method ADD VALUE IF NOT EXISTS 'neft';
ALTER TYPE invoice_payment_method ADD VALUE IF NOT EXISTS 'pg';
ALTER TYPE invoice_payment_method ADD VALUE IF NOT EXISTS 'wallet';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_adjustment_type') THEN
    CREATE TYPE invoice_adjustment_type AS ENUM ('credit', 'debit', 'waiver', 'surcharge');
  END IF;
END $$;

ALTER TYPE invoice_adjustment_type ADD VALUE IF NOT EXISTS 'credit';
ALTER TYPE invoice_adjustment_type ADD VALUE IF NOT EXISTS 'debit';
ALTER TYPE invoice_adjustment_type ADD VALUE IF NOT EXISTS 'waiver';
ALTER TYPE invoice_adjustment_type ADD VALUE IF NOT EXISTS 'surcharge';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_dispute_status') THEN
    CREATE TYPE invoice_dispute_status AS ENUM ('open', 'in_review', 'resolved', 'rejected');
  END IF;
END $$;

ALTER TYPE invoice_dispute_status ADD VALUE IF NOT EXISTS 'open';
ALTER TYPE invoice_dispute_status ADD VALUE IF NOT EXISTS 'in_review';
ALTER TYPE invoice_dispute_status ADD VALUE IF NOT EXISTS 'resolved';
ALTER TYPE invoice_dispute_status ADD VALUE IF NOT EXISTS 'rejected';

CREATE TABLE IF NOT EXISTS "billingInvoices" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no varchar(50) NOT NULL UNIQUE,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  billing_start date NOT NULL,
  billing_end date NOT NULL,
  taxable_value numeric(12, 2) DEFAULT 0,
  cgst numeric(12, 2) DEFAULT 0,
  sgst numeric(12, 2) DEFAULT 0,
  igst numeric(12, 2) DEFAULT 0,
  total_amount numeric(12, 2) DEFAULT 0,
  gst_rate integer DEFAULT 18,
  status invoice_status NOT NULL DEFAULT 'pending',
  type "billingInvoiceTypeEnum" NOT NULL DEFAULT 'weekly',
  pdf_url text NOT NULL,
  csv_url text NOT NULL,
  order_numbers jsonb,
  is_disputed boolean DEFAULT false,
  remarks text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES "billingInvoices"(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method invoice_payment_method NOT NULL,
  amount numeric(12, 2) NOT NULL,
  reference varchar(120),
  notes text,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES "billingInvoices"(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type invoice_adjustment_type NOT NULL,
  amount numeric(12, 2) NOT NULL,
  reason text,
  is_applied boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_cod_offsets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES "billingInvoices"(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cod_remittance_id uuid NOT NULL REFERENCES cod_remittances(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES "billingInvoices"(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status invoice_dispute_status NOT NULL DEFAULT 'open',
  subject varchar(140) NOT NULL,
  details text,
  line_item_ref varchar(120),
  resolution_notes text,
  resolved_by uuid REFERENCES users(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_sequences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_sequence bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_invoices_seller_period_idx
  ON "billingInvoices" (seller_id, billing_start, billing_end);
CREATE INDEX IF NOT EXISTS invoice_payments_invoice_id_idx ON invoice_payments (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_adjustments_invoice_id_idx ON invoice_adjustments (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_cod_offsets_invoice_id_idx ON invoice_cod_offsets (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_disputes_invoice_id_idx ON invoice_disputes (invoice_id);
