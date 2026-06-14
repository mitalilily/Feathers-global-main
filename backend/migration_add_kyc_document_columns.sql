DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_status') THEN
    CREATE TYPE "kyc_status" AS ENUM (
      'pending',
      'verification_in_progress',
      'verified',
      'rejected'
    );
  END IF;
END $$;

ALTER TYPE "kyc_status" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "kyc_status" ADD VALUE IF NOT EXISTS 'verification_in_progress';
ALTER TYPE "kyc_status" ADD VALUE IF NOT EXISTS 'verified';
ALTER TYPE "kyc_status" ADD VALUE IF NOT EXISTS 'rejected';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'business_structure_enum') THEN
    CREATE TYPE "business_structure_enum" AS ENUM (
      'individual',
      'company',
      'partnership_firm',
      'sole_proprietor'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_doc_status') THEN
    CREATE TYPE "kyc_doc_status" AS ENUM (
      'pending',
      'verified',
      'rejected'
    );
  END IF;
END $$;

ALTER TABLE "kyc"
  ADD COLUMN IF NOT EXISTS "structure" "business_structure_enum" DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS "companyType" varchar(50),
  ADD COLUMN IF NOT EXISTS "gstin" varchar(20),
  ADD COLUMN IF NOT EXISTS "panNumber" varchar(10),
  ADD COLUMN IF NOT EXISTS "cin" varchar(25),
  ADD COLUMN IF NOT EXISTS "panCardUrl" text,
  ADD COLUMN IF NOT EXISTS "aadhaarUrl" text,
  ADD COLUMN IF NOT EXISTS "cancelledChequeUrl" text,
  ADD COLUMN IF NOT EXISTS "boardResolutionUrl" text,
  ADD COLUMN IF NOT EXISTS "partnershipDeedUrl" text,
  ADD COLUMN IF NOT EXISTS "llpAgreementUrl" text,
  ADD COLUMN IF NOT EXISTS "selfieUrl" text,
  ADD COLUMN IF NOT EXISTS "businessPanUrl" text,
  ADD COLUMN IF NOT EXISTS "companyAddressProofUrl" text,
  ADD COLUMN IF NOT EXISTS "gstCertificateUrl" text,
  ADD COLUMN IF NOT EXISTS "panCardMime" varchar(100),
  ADD COLUMN IF NOT EXISTS "aadhaarMime" varchar(100),
  ADD COLUMN IF NOT EXISTS "cancelledChequeMime" varchar(100),
  ADD COLUMN IF NOT EXISTS "boardResolutionMime" varchar(100),
  ADD COLUMN IF NOT EXISTS "partnershipDeedMime" varchar(100),
  ADD COLUMN IF NOT EXISTS "llpAgreementMime" varchar(100),
  ADD COLUMN IF NOT EXISTS "companyAddressProofMime" varchar(100),
  ADD COLUMN IF NOT EXISTS "businessPanMime" varchar(100),
  ADD COLUMN IF NOT EXISTS "gstCertificateMime" varchar(100),
  ADD COLUMN IF NOT EXISTS "selfieMime" varchar(100),
  ADD COLUMN IF NOT EXISTS "panCardStatus" "kyc_doc_status" DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS "panCardRejectionReason" text,
  ADD COLUMN IF NOT EXISTS "aadhaarStatus" "kyc_doc_status" DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS "aadhaarRejectionReason" text,
  ADD COLUMN IF NOT EXISTS "cancelledChequeStatus" "kyc_doc_status" DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS "cancelledChequeRejectionReason" text,
  ADD COLUMN IF NOT EXISTS "boardResolutionStatus" "kyc_doc_status" DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS "boardResolutionRejectionReason" text,
  ADD COLUMN IF NOT EXISTS "partnershipDeedStatus" "kyc_doc_status" DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS "partnershipDeedRejectionReason" text,
  ADD COLUMN IF NOT EXISTS "cinStatus" "kyc_doc_status" DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS "cinRejectionReason" text,
  ADD COLUMN IF NOT EXISTS "llpAgreementStatus" "kyc_doc_status" DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS "llpAgreementRejectionReason" text,
  ADD COLUMN IF NOT EXISTS "selfieStatus" "kyc_doc_status" DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS "selfieRejectionReason" text,
  ADD COLUMN IF NOT EXISTS "businessPanStatus" "kyc_doc_status" DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS "businessPanRejectionReason" text,
  ADD COLUMN IF NOT EXISTS "companyAddressProofStatus" "kyc_doc_status" DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS "companyAddressProofRejectionReason" text,
  ADD COLUMN IF NOT EXISTS "gstCertificateStatus" "kyc_doc_status" DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS "gstCertificateRejectionReason" text,
  ADD COLUMN IF NOT EXISTS "rejectionReason" text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'kyc'
      AND column_name = 'status'
      AND udt_name <> 'kyc_status'
  ) THEN
    ALTER TABLE "kyc" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "kyc"
      ALTER COLUMN "status" TYPE "kyc_status"
      USING "status"::text::"kyc_status";
    ALTER TABLE "kyc" ALTER COLUMN "status" SET DEFAULT 'pending'::"kyc_status";
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'kyc'
      AND column_name = 'status'
  ) THEN
    ALTER TABLE "kyc" ALTER COLUMN "status" SET DEFAULT 'pending'::"kyc_status";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'kyc'
      AND column_name = '  llpAgreementUrl'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'kyc'
      AND column_name = 'llpAgreementUrl'
  ) THEN
    ALTER TABLE "kyc" RENAME COLUMN "  llpAgreementUrl" TO "llpAgreementUrl";
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'kyc'
      AND column_name = '  llpAgreementUrl'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'kyc'
      AND column_name = 'llpAgreementUrl'
  ) THEN
    UPDATE "kyc"
    SET "llpAgreementUrl" = COALESCE("llpAgreementUrl", "  llpAgreementUrl")
    WHERE "llpAgreementUrl" IS NULL
      AND "  llpAgreementUrl" IS NOT NULL;

    ALTER TABLE "kyc" DROP COLUMN "  llpAgreementUrl";
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'kyc'
      AND column_name = 'llpAgreementUrl'
  ) THEN
    ALTER TABLE "kyc" ADD COLUMN "llpAgreementUrl" text;
  END IF;
END $$;
