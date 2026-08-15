ALTER TABLE "billingInvoices"
  ADD COLUMN IF NOT EXISTS email_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS email_last_attempt_at timestamp,
  ADD COLUMN IF NOT EXISTS email_error text;

CREATE INDEX IF NOT EXISTS idx_billing_invoices_email_retry
  ON "billingInvoices" (email_sent_at, email_last_attempt_at)
  WHERE email_sent_at IS NULL;

INSERT INTO billing_preferences (user_id, frequency, auto_generate, custom_frequency_days, created_at, updated_at)
SELECT u.id, 'monthly', true, NULL, NOW(), NOW()
FROM users u
LEFT JOIN billing_preferences bp ON bp.user_id = u.id
WHERE bp.id IS NULL;
