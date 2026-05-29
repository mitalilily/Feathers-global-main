ALTER TABLE "kyc" ADD COLUMN IF NOT EXISTS "selfieUrl" text;
ALTER TABLE "kyc" ADD COLUMN IF NOT EXISTS "selfieStatus" "kyc_doc_status" DEFAULT 'pending' NOT NULL;
ALTER TABLE "kyc" ADD COLUMN IF NOT EXISTS "selfieRejectionReason" text;
ALTER TABLE "kyc" ADD COLUMN IF NOT EXISTS "selfieMime" varchar(100);
