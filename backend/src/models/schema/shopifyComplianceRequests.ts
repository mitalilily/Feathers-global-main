import { integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

/**
 * Durable, Shopify-only privacy request queue and delivery audit.
 *
 * Customer identifiers are kept only inside encryptedPayload while a request
 * is pending. The payload is erased after delivery or shop redaction; the
 * remaining hashes and timestamps are non-reversible audit evidence.
 */
export const shopifyComplianceRequests = pgTable(
  'shopify_compliance_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storeId: varchar('store_id', { length: 50 }),
    shopDomainHash: varchar('shop_domain_hash', { length: 64 }).notNull(),
    requestExternalId: varchar('request_external_id', { length: 120 }).notNull(),
    topic: varchar('topic', { length: 80 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    encryptedPayload: text('encrypted_payload'),
    exportSha256: varchar('export_sha256', { length: 64 }),
    deliveryEmailHash: varchar('delivery_email_hash', { length: 64 }),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    redactedAt: timestamp('redacted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    shopRequestUnique: uniqueIndex('shopify_compliance_requests_shop_request_unique').on(
      table.shopDomainHash,
      table.requestExternalId,
    ),
  }),
)
