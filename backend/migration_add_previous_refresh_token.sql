ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "previousRefreshToken" varchar(500),
  ADD COLUMN IF NOT EXISTS "previousRefreshTokenExpiresAt" timestamp;
