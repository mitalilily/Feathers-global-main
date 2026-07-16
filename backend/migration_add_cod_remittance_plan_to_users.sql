ALTER TABLE users
ADD COLUMN IF NOT EXISTS cod_remittance_plan varchar(60) DEFAULT 'T+4 Days (Default)';
