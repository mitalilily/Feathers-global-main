import { and, eq, or } from 'drizzle-orm'
import { db } from '../client'
import { b2c_orders } from '../schema/b2cOrders'
import { HttpError } from '../../utils/classes'
import { EkartService } from './couriers/ekart.service'

type B2COrder = typeof b2c_orders.$inferSelect

type OrderLookupInput = {
  orderIdentifier: string
  userId?: string
}

type UpdateDispatchDateInput = {
  order: B2COrder
  dispatchDate: string
  ids?: string[]
}

type UpdateEwbnInput = {
  order: B2COrder
  ewbn: string
  id?: string
}

const DISPATCH_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const isPlainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const normalizeDate = (value: string) => {
  const trimmed = String(value || '').trim()
  if (!DISPATCH_DATE_PATTERN.test(trimmed)) return ''

  const parsed = new Date(`${trimmed}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return ''

  return parsed.toISOString().slice(0, 10) === trimmed ? trimmed : ''
}

const normalizeProviderMeta = (value: unknown): Record<string, any> => {
  if (isPlainObject(value)) return { ...value }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (isPlainObject(parsed)) return parsed
    } catch {
      return {}
    }
  }
  return {}
}

const normalizeIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 100)
}

const normalizeEwbn = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '').trim()
  return digits.length === 12 ? digits : ''
}

const resolveDelayedDispatchFlag = (providerMeta: Record<string, any>) => {
  const candidates = [
    providerMeta?.delayed_dispatch,
    providerMeta?.delayedDispatch,
    providerMeta?.shipment?.delayed_dispatch,
    providerMeta?.shipment?.delayedDispatch,
    providerMeta?.ekart?.delayed_dispatch,
    providerMeta?.ekart?.delayedDispatch,
    providerMeta?.ekart?.shipment?.delayed_dispatch,
    providerMeta?.ekart?.shipment?.delayedDispatch,
  ]

  return candidates.some((value) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value === 1
    return ['true', '1', 'yes', 'y'].includes(String(value ?? '').trim().toLowerCase())
  })
}

const resolveShipmentReference = (order: B2COrder, providerMeta: Record<string, any>) => {
  const candidates = [
    order.awb_number,
    order.provider_reference,
    order.provider_request_id,
    order.shipment_id,
    providerMeta?.awb_number,
    providerMeta?.provider_reference,
    providerMeta?.provider_request_id,
    providerMeta?.shipment_id,
    providerMeta?.ekart?.awb_number,
    providerMeta?.ekart?.tracking_id,
    providerMeta?.ekart?.shipment_id,
  ]

  return String(candidates.find((value) => String(value || '').trim()) || '').trim()
}

const buildOrderLookupCondition = (identifier: string) =>
  or(
    eq(b2c_orders.id, identifier),
    eq(b2c_orders.order_id, identifier),
    eq(b2c_orders.order_number, identifier),
    eq(b2c_orders.awb_number, identifier),
    eq(b2c_orders.provider_reference, identifier),
    eq(b2c_orders.provider_request_id, identifier),
    eq(b2c_orders.shipment_id, identifier),
  )

export const findEkartOrderForDispatchDate = async ({ orderIdentifier, userId }: OrderLookupInput) => {
  const identifier = String(orderIdentifier || '').trim()
  if (!identifier) {
    throw new HttpError(400, 'Order identifier is required')
  }

  const baseCondition = buildOrderLookupCondition(identifier)
  const [order] = userId
    ? await db
        .select()
        .from(b2c_orders)
        .where(and(eq(b2c_orders.user_id, userId), baseCondition))
        .limit(1)
    : await db.select().from(b2c_orders).where(baseCondition).limit(1)

  if (!order) {
    throw new HttpError(404, 'Order not found')
  }

  return order
}

export const updateEkartDispatchDateForOrder = async ({
  order,
  dispatchDate,
  ids,
}: UpdateDispatchDateInput) => {
  if (String(order.integration_type || '').toLowerCase() !== 'ekart') {
    throw new HttpError(400, 'Dispatch date updates are supported for Ekart orders only')
  }

  const normalizedDispatchDate = normalizeDate(dispatchDate)
  if (!normalizedDispatchDate) {
    throw new HttpError(400, 'dispatchDate must be in YYYY-MM-DD format')
  }

  const providerMeta = normalizeProviderMeta(order.provider_meta)
  if (!resolveDelayedDispatchFlag(providerMeta)) {
    throw new HttpError(
      400,
      'This order is not marked for delayed dispatch. Only delayed-dispatch Ekart shipments can be updated.',
    )
  }

  const shipmentReference = resolveShipmentReference(order, providerMeta)
  if (!shipmentReference) {
    throw new HttpError(400, 'Ekart shipment reference not found for this order')
  }

  const shipmentIds = normalizeIds(ids)
  const effectiveIds = shipmentIds.length ? shipmentIds : [shipmentReference]

  const ekart = new EkartService()
  const providerResponse = await ekart.updateDispatchDate(effectiveIds, normalizedDispatchDate)

  const now = new Date().toISOString()
  const nextMeta = {
    ...providerMeta,
    preferred_dispatch_date: normalizedDispatchDate,
    ekart: {
      ...(isPlainObject(providerMeta.ekart) ? providerMeta.ekart : {}),
      delayed_dispatch: true,
      preferred_dispatch_date: normalizedDispatchDate,
      dispatch_date_updated_at: now,
      dispatch_date_update_request: {
        ids: effectiveIds,
        dispatchDate: normalizedDispatchDate,
      },
      dispatch_date_update_response: providerResponse,
    },
  }

  await db
    .update(b2c_orders)
    .set({
      provider_meta: nextMeta,
      updated_at: new Date(),
    } as any)
    .where(eq(b2c_orders.id, order.id))

  return {
    order_id: order.id,
    order_number: order.order_number,
    awb_number: order.awb_number || null,
    shipment_reference: shipmentReference,
    dispatchDate: normalizedDispatchDate,
    ids: effectiveIds,
    provider_response: providerResponse,
  }
}

export const updateEkartEwbnForOrder = async ({ order, ewbn, id }: UpdateEwbnInput) => {
  if (String(order.integration_type || '').toLowerCase() !== 'ekart') {
    throw new HttpError(400, 'EWBN updates are supported for Ekart orders only')
  }

  const normalizedEwbn = normalizeEwbn(ewbn)
  if (!normalizedEwbn) {
    throw new HttpError(400, 'ewbn must be a 12-digit numeric string')
  }

  const providerMeta = normalizeProviderMeta(order.provider_meta)
  const shipmentReference = resolveShipmentReference(order, providerMeta)
  const effectiveId = String(id || '').trim() || shipmentReference
  if (!effectiveId) {
    throw new HttpError(400, 'Ekart shipment reference not found for this order')
  }

  const ekart = new EkartService()
  const providerResponse = await ekart.updateEwbn(effectiveId, normalizedEwbn)

  const now = new Date().toISOString()
  const nextMeta = {
    ...providerMeta,
    ewbn: normalizedEwbn,
    ekart: {
      ...(isPlainObject(providerMeta.ekart) ? providerMeta.ekart : {}),
      ewbn: normalizedEwbn,
      ewbn_updated_at: now,
      ewbn_update_request: {
        id: effectiveId,
        ewbn: normalizedEwbn,
      },
      ewbn_update_response: providerResponse,
    },
  }

  await db
    .update(b2c_orders)
    .set({
      provider_meta: nextMeta,
      updated_at: new Date(),
    } as any)
    .where(eq(b2c_orders.id, order.id))

  return {
    order_id: order.id,
    order_number: order.order_number,
    awb_number: order.awb_number || null,
    shipment_reference: effectiveId,
    ewbn: normalizedEwbn,
    provider_response: providerResponse,
  }
}
