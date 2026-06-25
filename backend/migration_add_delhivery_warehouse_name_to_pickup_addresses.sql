ALTER TABLE pickup_addresses
ADD COLUMN IF NOT EXISTS "delhiveryWarehouseName" varchar(120);

UPDATE pickup_addresses pa
SET "delhiveryWarehouseName" = COALESCE(NULLIF(TRIM(a."addressNickname"), ''), NULLIF(TRIM(a."contactName"), ''))
FROM addresses a
WHERE pa."addressId" = a.id
  AND COALESCE(TRIM(pa."delhiveryWarehouseName"), '') = ''
  AND COALESCE(NULLIF(TRIM(a."addressNickname"), ''), NULLIF(TRIM(a."contactName"), '')) IS NOT NULL;
