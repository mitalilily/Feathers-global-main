import { sql } from 'drizzle-orm'
import { boolean, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

export type CustomerEmailNotificationEvent =
  | 'pickup_done'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'undelivered'
  | 'reverse_pickup'

export type SellerEmailNotificationEvent =
  | 'wallet_recharge'
  | 'ticket_created'
  | 'account_activated'
  | 'cod_remittance'
  | 'tax_invoice'
  | 'weight_discrepancy'

export type EmailNotificationEventMap<T extends string = string> = Record<T, boolean>

export const emailNotificationPreferences = pgTable('email_notification_preferences', {
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .primaryKey(),
  customerEnabled: boolean('customer_enabled').default(false).notNull(),
  customerEvents: jsonb('customer_events')
    .$type<EmailNotificationEventMap<CustomerEmailNotificationEvent>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  sellerEvents: jsonb('seller_events')
    .$type<EmailNotificationEventMap<SellerEmailNotificationEvent>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date()),
})
