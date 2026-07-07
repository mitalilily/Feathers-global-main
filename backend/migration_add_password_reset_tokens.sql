ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "passwordResetToken" varchar(8),
  ADD COLUMN IF NOT EXISTS "passwordResetTokenExpiresAt" timestamp;
