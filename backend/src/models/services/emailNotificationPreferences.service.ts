import { eq } from 'drizzle-orm'
import { db } from '../client'
import {
  CustomerEmailNotificationEvent,
  EmailNotificationEventMap,
  SellerEmailNotificationEvent,
  emailNotificationPreferences,
} from '../schema/emailNotificationPreferences'

export const CUSTOMER_EMAIL_EVENTS: CustomerEmailNotificationEvent[] = [
  'pickup_done',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'undelivered',
  'reverse_pickup',
]

export const SELLER_EMAIL_EVENTS: SellerEmailNotificationEvent[] = [
  'wallet_recharge',
  'ticket_created',
  'account_activated',
  'cod_remittance',
  'tax_invoice',
  'weight_discrepancy',
]

export const CUSTOMER_EMAIL_EVENT_LABELS: Record<CustomerEmailNotificationEvent, string> = {
  pickup_done: 'Pickup done',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  undelivered: 'Undelivered',
  reverse_pickup: 'Reverse pickup',
}

export const SELLER_EMAIL_EVENT_LABELS: Record<SellerEmailNotificationEvent, string> = {
  wallet_recharge: 'Wallet recharge related',
  ticket_created: 'Ticket create related',
  account_activated: 'Account activate',
  cod_remittance: 'COD remittance',
  tax_invoice: 'Tax invoice',
  weight_discrepancy: 'Weight discrepancies',
}

export type EmailNotificationPreferencesDto = {
  customer_enabled: boolean
  customer_events: EmailNotificationEventMap<CustomerEmailNotificationEvent>
  seller_events: EmailNotificationEventMap<SellerEmailNotificationEvent>
}

const emptyEventMap = <T extends string>(events: readonly T[]): EmailNotificationEventMap<T> =>
  events.reduce((acc, event) => {
    acc[event] = false
    return acc
  }, {} as EmailNotificationEventMap<T>)

const normalizeEventMap = <T extends string>(
  events: readonly T[],
  value: unknown,
): EmailNotificationEventMap<T> => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  return events.reduce((acc, event) => {
    acc[event] = input[event] === true
    return acc
  }, {} as EmailNotificationEventMap<T>)
}

export const DEFAULT_EMAIL_NOTIFICATION_PREFERENCES: EmailNotificationPreferencesDto = {
  customer_enabled: false,
  customer_events: emptyEventMap(CUSTOMER_EMAIL_EVENTS),
  seller_events: emptyEventMap(SELLER_EMAIL_EVENTS),
}

const toDto = (row?: typeof emailNotificationPreferences.$inferSelect | null): EmailNotificationPreferencesDto => {
  if (!row) return DEFAULT_EMAIL_NOTIFICATION_PREFERENCES

  return {
    customer_enabled: row.customerEnabled === true,
    customer_events: normalizeEventMap(CUSTOMER_EMAIL_EVENTS, row.customerEvents),
    seller_events: normalizeEventMap(SELLER_EMAIL_EVENTS, row.sellerEvents),
  }
}

export const getEmailNotificationPreferences = async (userId: string) => {
  if (!String(userId || '').trim()) return DEFAULT_EMAIL_NOTIFICATION_PREFERENCES

  const [row] = await db
    .select()
    .from(emailNotificationPreferences)
    .where(eq(emailNotificationPreferences.userId, userId))
    .limit(1)

  return toDto(row)
}

export const updateEmailNotificationPreferences = async (
  userId: string,
  updates: Partial<EmailNotificationPreferencesDto>,
) => {
  if (!String(userId || '').trim()) {
    throw new Error('Missing user id for email notification preferences')
  }

  const customerEvents = normalizeEventMap(
    CUSTOMER_EMAIL_EVENTS,
    updates.customer_events ?? DEFAULT_EMAIL_NOTIFICATION_PREFERENCES.customer_events,
  )
  const sellerEvents = normalizeEventMap(
    SELLER_EMAIL_EVENTS,
    updates.seller_events ?? DEFAULT_EMAIL_NOTIFICATION_PREFERENCES.seller_events,
  )

  const [row] = await db
    .insert(emailNotificationPreferences)
    .values({
      userId,
      customerEnabled: updates.customer_enabled === true,
      customerEvents,
      sellerEvents,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: emailNotificationPreferences.userId,
      set: {
        customerEnabled: updates.customer_enabled === true,
        customerEvents,
        sellerEvents,
        updatedAt: new Date(),
      },
    })
    .returning()

  return toDto(row)
}

export const isCustomerEmailNotificationEnabled = async (
  userId: string,
  event: CustomerEmailNotificationEvent,
) => {
  const preferences = await getEmailNotificationPreferences(userId)
  return preferences.customer_enabled && preferences.customer_events[event] === true
}

export const isSellerEmailNotificationEnabled = async (
  userId: string,
  event: SellerEmailNotificationEvent,
) => {
  const preferences = await getEmailNotificationPreferences(userId)
  return preferences.seller_events[event] === true
}

export const resolveCustomerEmailEventForOrderStatus = (
  status: string,
): CustomerEmailNotificationEvent | null => {
  const normalized = String(status || '').trim().toLowerCase()
  if (
    normalized === 'booked' ||
    normalized === 'shipment_created' ||
    normalized === 'pickup_initiated' ||
    normalized === 'picked_up'
  ) return 'pickup_done'
  if (normalized === 'in_transit') return 'in_transit'
  if (normalized === 'out_for_delivery') return 'out_for_delivery'
  if (normalized === 'delivered') return 'delivered'
  if (normalized === 'ndr' || normalized === 'undelivered' || normalized === 'lost') return 'undelivered'
  if (normalized.startsWith('rto') || normalized.includes('reverse')) return 'reverse_pickup'
  return null
}
