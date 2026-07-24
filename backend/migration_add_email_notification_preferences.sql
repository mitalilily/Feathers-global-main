CREATE TABLE IF NOT EXISTS email_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  customer_enabled boolean NOT NULL DEFAULT false,
  customer_events jsonb NOT NULL DEFAULT '{}'::jsonb,
  seller_events jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

