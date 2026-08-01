import { boolean, integer, json, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

export const courierPriorityProfiles = pgTable(
  'courier_priority_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id').notNull(),
    name: varchar('name', { length: 50 }).notNull(),
    personalised_order:
      json('personalised_order').$type<{
        courierId: string | number
        priority: number
        name?: string
        integration_type?: string
        serviceProvider?: string
        max_slab_weight?: number | null
      }[]>(),
    rule_type: varchar('rule_type', { length: 30 }).default('profile').notNull(),
    conditions: jsonb('conditions').$type<
      Array<{
        type: string
        operator?: string
        value?: unknown
        min?: number
        max?: number
      }>
    >(),
    is_active: boolean('is_active').default(true).notNull(),
    sort_order: integer('sort_order').default(0).notNull(),
    locked: boolean('locked').default(true).notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // 🔹 Enforce uniqueness at DB level
    uniqUserName: uniqueIndex('uniq_user_priority').on(table.user_id, table.name),
  }),
)
