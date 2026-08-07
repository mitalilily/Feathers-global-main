import crypto from 'crypto'
import { and, eq, inArray, lte, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { b2c_orders } from '../schema/b2cOrders'
import { ndr_events } from '../schema/ndr'
import { rto_events } from '../schema/rto'
import { shopifyComplianceRequests } from '../schema/shopifyComplianceRequests'
import { stores } from '../schema/stores'
import { supportTickets } from '../schema/supportTickets'
import { tracking_events } from '../schema/trackingEvents'
import { users } from '../schema/users'
import { weight_discrepancies, weight_disputes } from '../schema/weightDiscrepancies'
import { decryptSecret, encryptSecret } from '../../utils/secretEncryption'
import { sendShopifyCustomerDataExportEmail } from '../../utils/emailSender'
import { createNotificationService } from './notifications.service'

type ShopifyStore = typeof stores.$inferSelect

const DAY_MS = 24 * 60 * 60 * 1000
const hashValue = (value: unknown) =>
  crypto.createHash('sha256').update(String(value || '').trim().toLowerCase()).digest('hex')

const sanitizeAuditError = (error: unknown) =>
  String((error as any)?.message || error || 'Unknown Shopify privacy delivery error')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[redacted-email]')
    .replace(/\+?\d[\d\s()-]{7,}\d/g, '[redacted-phone]')
    .slice(0, 1000)

const buildShopifyOrderIdsForPayload = (store: ShopifyStore, orderIds: unknown[] = []) =>
  orderIds
    .map((orderId) => String(orderId || '').trim())
    .filter(Boolean)
    .flatMap((orderId) => [`shopify_${store.id}_${orderId}`, `shopify_${orderId}`])

const findRequestedOrders = async (store: ShopifyStore, payload: any, executor: any = db) => {
  const requestedOrderIds = Array.isArray(payload?.orders_requested) ? payload.orders_requested : []
  const orderIds = buildShopifyOrderIdsForPayload(store, requestedOrderIds)
  const customerEmail = String(payload?.customer?.email || '').trim().toLowerCase()
  const customerPhone = String(payload?.customer?.phone || '').trim()

  if (!orderIds.length && !customerEmail && !customerPhone) return []

  return executor
    .select()
    .from(b2c_orders)
    .where(sql`
      ${b2c_orders.order_id} LIKE ${`shopify_${store.id}_%`}
      AND (
        ${orderIds.length ? sql`${b2c_orders.order_id} IN (${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)})` : sql`false`}
        OR ${customerEmail ? sql`lower(coalesce(${b2c_orders.buyer_email}, '')) = ${customerEmail}` : sql`false`}
        OR ${customerPhone ? sql`coalesce(${b2c_orders.buyer_phone}, '') = ${customerPhone}` : sql`false`}
      )
    `)
}

const buildCustomerDataExport = async (store: ShopifyStore, payload: any) => {
  const orders = await findRequestedOrders(store, payload)
  const orderIds = orders.map((order: any) => order.id)
  const awbNumbers = orders.map((order: any) => String(order.awb_number || '').trim()).filter(Boolean)
  const [ndrRows, rtoRows, trackingRows, discrepancyRows, ticketRows] = orderIds.length
    ? await Promise.all([
        db.select().from(ndr_events).where(inArray(ndr_events.order_id, orderIds)),
        db.select().from(rto_events).where(inArray(rto_events.order_id, orderIds)),
        db.select().from(tracking_events).where(inArray(tracking_events.order_id, orderIds)),
        db.select().from(weight_discrepancies).where(inArray(weight_discrepancies.b2c_order_id, orderIds)),
        awbNumbers.length
          ? db
              .select()
              .from(supportTickets)
              .where(and(eq(supportTickets.userId, store.userId), inArray(supportTickets.awbNumber, awbNumbers)))
          : Promise.resolve([]),
      ])
    : [[], [], [], [], []]
  const discrepancyIds = (discrepancyRows as any[]).map((row) => row.id)
  const disputeRows = discrepancyIds.length
    ? await db.select().from(weight_disputes).where(inArray(weight_disputes.discrepancy_id, discrepancyIds))
    : []

  const eventRowsByOrder = <T extends { order_id: string }>(rows: T[]) => {
    const grouped = new Map<string, T[]>()
    rows.forEach((row) => grouped.set(row.order_id, [...(grouped.get(row.order_id) || []), row]))
    return grouped
  }
  const ndrByOrder = eventRowsByOrder(ndrRows as any[])
  const rtoByOrder = eventRowsByOrder(rtoRows as any[])
  const trackingByOrder = eventRowsByOrder(trackingRows as any[])

  return {
    generatedAt: new Date().toISOString(),
    source: 'Feather Global Shopify application',
    shop: store.domain,
    request: {
      id: String(payload?.data_request?.id || ''),
      customer: {
        id: payload?.customer?.id ?? null,
        email: payload?.customer?.email ?? null,
        phone: payload?.customer?.phone ?? null,
      },
      ordersRequested: Array.isArray(payload?.orders_requested) ? payload.orders_requested : [],
    },
    relatedRecords: {
      weightDiscrepancies: discrepancyRows,
      weightDisputes: disputeRows,
      supportTickets: (ticketRows as any[]).map((ticket) => ({
        id: ticket.id,
        subject: ticket.subject,
        category: ticket.category,
        subcategory: ticket.subcategory,
        awbNumber: ticket.awbNumber,
        description: ticket.description,
        attachmentsHeld: Array.isArray(ticket.attachments) ? ticket.attachments.length : 0,
        status: ticket.status,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      })),
    },
    records: orders.map((order: any) => ({
      shopifyReference: order.order_id,
      orderNumber: order.order_number,
      orderDate: order.order_date,
      invoiceNumber: order.invoice_number,
      invoiceDate: order.invoice_date,
      invoiceAmount: order.invoice_amount,
      orderAmount: order.order_amount,
      paymentType: order.order_type,
      customer: {
        name: order.buyer_name,
        email: order.buyer_email,
        phone: order.buyer_phone,
        address: order.address,
        addressLine1: order.address_line_1,
        addressLine2: order.address_line_2,
        landmark: order.address_landmark,
        locality: order.address_locality,
        city: order.city,
        state: order.state,
        country: order.country,
        postalCode: order.pincode,
      },
      purchases: order.products,
      shipment: {
        status: order.order_status,
        pickupStatus: order.pickup_status,
        courier: order.courier_partner,
        awbNumber: order.awb_number,
        deliveryLocation: order.delivery_location,
        deliveryMessage: order.delivery_message,
        providerMetadata: order.provider_meta,
        returnDetails: order.rto_details,
      },
      documentsHeld: {
        label: Boolean(order.label),
        invoice: Boolean(order.invoice_link),
        manifest: Boolean(order.manifest),
      },
      events: {
        ndr: ndrByOrder.get(order.id) || [],
        rto: rtoByOrder.get(order.id) || [],
        tracking: trackingByOrder.get(order.id) || [],
      },
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    })),
  }
}

export const queueShopifyCustomerDataRequest = async ({
  store,
  payload,
  tx = db,
}: {
  store: ShopifyStore
  payload: any
  tx?: any
}) => {
  const shopDomainHash = hashValue(store.domain)
  const requestExternalId =
    String(payload?.data_request?.id || '').trim() ||
    hashValue(JSON.stringify({ customer: payload?.customer || {}, orders: payload?.orders_requested || [] }))
  const requestedAt = new Date()
  const dueAt = new Date(requestedAt.getTime() + 30 * DAY_MS)
  const [created] = await tx
    .insert(shopifyComplianceRequests)
    .values({
      storeId: String(store.id),
      shopDomainHash,
      requestExternalId,
      topic: 'customers/data_request',
      status: 'pending',
      encryptedPayload: encryptSecret(JSON.stringify(payload || {})),
      requestedAt,
      dueAt,
      nextAttemptAt: requestedAt,
      updatedAt: requestedAt,
    })
    .onConflictDoNothing({
      target: [shopifyComplianceRequests.shopDomainHash, shopifyComplianceRequests.requestExternalId],
    })
    .returning({ id: shopifyComplianceRequests.id })

  if (created?.id) {
    await createNotificationService({
      targetRole: 'admin',
      title: 'Shopify customer data request received',
      message: `A Shopify privacy export request was queued for ${store.domain}. Request ${requestExternalId} is due within 30 days.`,
    }).catch((error) => {
      console.warn('Shopify privacy admin notification failed:', sanitizeAuditError(error))
    })
  }

  const [existingRequest] = created?.id
    ? []
    : await tx
        .select({ dueAt: shopifyComplianceRequests.dueAt })
        .from(shopifyComplianceRequests)
        .where(
          and(
            eq(shopifyComplianceRequests.shopDomainHash, shopDomainHash),
            eq(shopifyComplianceRequests.requestExternalId, requestExternalId),
          ),
        )
        .limit(1)

  setImmediate(() => {
    processPendingShopifyDataRequests({ limit: 1 }).catch((error) => {
      console.warn('Immediate Shopify privacy export processing failed:', sanitizeAuditError(error))
    })
  })

  return {
    queued: Boolean(created?.id),
    duplicate: !created?.id,
    requestId: requestExternalId,
    dueAt: (existingRequest?.dueAt || dueAt).toISOString(),
  }
}

const processShopifyDataRequest = async (request: typeof shopifyComplianceRequests.$inferSelect) => {
  const [store] = await db.select().from(stores).where(eq(stores.id, String(request.storeId || ''))).limit(1)
  if (!store) throw new Error('Shopify store connection is unavailable for the privacy export')

  const [merchant] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, store.userId))
    .limit(1)
  const storeMetadata = (store.metadata && typeof store.metadata === 'object' ? store.metadata : {}) as Record<
    string,
    unknown
  >
  const storeInfo =
    storeMetadata.storeInfo && typeof storeMetadata.storeInfo === 'object'
      ? (storeMetadata.storeInfo as Record<string, unknown>)
      : {}
  const merchantEmail = String(
    merchant?.email || storeMetadata.email || storeInfo.email || storeInfo.contactEmail || '',
  ).trim()
  if (!merchantEmail) throw new Error('Shopify store owner email is unavailable for privacy delivery')
  if (!request.encryptedPayload) throw new Error('Encrypted Shopify privacy request payload is unavailable')

  const payload = JSON.parse(decryptSecret(request.encryptedPayload) || '{}')
  const customerDataExport = await buildCustomerDataExport(store, payload)
  const exportBuffer = Buffer.from(`${JSON.stringify(customerDataExport, null, 2)}\n`, 'utf8')
  const exportSha256 = crypto.createHash('sha256').update(exportBuffer).digest('hex')

  await sendShopifyCustomerDataExportEmail({
    to: merchantEmail,
    shopDomain: store.domain,
    requestId: request.requestExternalId,
    exportBuffer,
  })

  const deliveredAt = new Date()
  await db
    .update(shopifyComplianceRequests)
    .set({
      status: 'delivered',
      encryptedPayload: null,
      exportSha256,
      deliveryEmailHash: hashValue(merchantEmail),
      deliveredAt,
      processingStartedAt: null,
      lastError: null,
      updatedAt: deliveredAt,
    })
    .where(eq(shopifyComplianceRequests.id, request.id))

  await createNotificationService({
    targetRole: 'admin',
    title: 'Shopify customer data request delivered',
    message: `Privacy export ${request.requestExternalId} was delivered to the store owner.`,
  }).catch((error) => {
    console.warn('Shopify privacy delivery notification failed:', sanitizeAuditError(error))
  })
}

export const processPendingShopifyDataRequests = async ({ limit = 10 }: { limit?: number } = {}) => {
  const now = new Date()
  await db
    .update(shopifyComplianceRequests)
    .set({
      status: 'failed',
      lastError: 'Previous delivery attempt was interrupted and has been queued for retry',
      nextAttemptAt: now,
      processingStartedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(shopifyComplianceRequests.status, 'processing'),
        lte(shopifyComplianceRequests.processingStartedAt, new Date(now.getTime() - 15 * 60 * 1000)),
      ),
    )

  const candidates = await db
    .select()
    .from(shopifyComplianceRequests)
    .where(
      and(
        or(
          eq(shopifyComplianceRequests.status, 'pending'),
          eq(shopifyComplianceRequests.status, 'failed'),
        ),
        lte(shopifyComplianceRequests.nextAttemptAt, now),
      ),
    )
    .limit(Math.min(Math.max(Number(limit) || 1, 1), 25))

  let delivered = 0
  let failed = 0

  for (const candidate of candidates) {
    const [claimed] = await db
      .update(shopifyComplianceRequests)
      .set({
        status: 'processing',
        attemptCount: candidate.attemptCount + 1,
        processingStartedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(shopifyComplianceRequests.id, candidate.id),
          or(
            eq(shopifyComplianceRequests.status, 'pending'),
            eq(shopifyComplianceRequests.status, 'failed'),
          ),
        ),
      )
      .returning()
    if (!claimed) continue

    try {
      await processShopifyDataRequest(claimed)
      delivered += 1
    } catch (error) {
      failed += 1
      const retryDelayMs = Math.min(24 * 60 * 60 * 1000, 5 * 60 * 1000 * 2 ** Math.min(claimed.attemptCount, 8))
      await db
        .update(shopifyComplianceRequests)
        .set({
          status: 'failed',
          lastError: sanitizeAuditError(error),
          nextAttemptAt: new Date(Date.now() + retryDelayMs),
          processingStartedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(shopifyComplianceRequests.id, claimed.id))
      await createNotificationService({
        targetRole: 'admin',
        title: 'Shopify customer data export needs attention',
        message: `Privacy export ${claimed.requestExternalId} failed on attempt ${claimed.attemptCount} and is queued for retry. Deadline: ${claimed.dueAt.toISOString()}.`,
      }).catch((notificationError) => {
        console.warn('Shopify privacy failure notification failed:', sanitizeAuditError(notificationError))
      })
      console.warn('Shopify customer data export delivery failed:', {
        requestId: claimed.requestExternalId,
        attempt: claimed.attemptCount,
        error: sanitizeAuditError(error),
      })
    }
  }

  return { attempted: delivered + failed, delivered, failed }
}

export const redactShopifyComplianceRequestPayloads = async ({
  store,
  tx = db,
}: {
  store: ShopifyStore
  tx?: any
}) => {
  const redactedAt = new Date()
  await tx
    .update(shopifyComplianceRequests)
    .set({
      storeId: null,
      encryptedPayload: null,
      status: 'redacted',
      lastError: null,
      processingStartedAt: null,
      redactedAt,
      updatedAt: redactedAt,
    })
    .where(
      and(
        eq(shopifyComplianceRequests.shopDomainHash, hashValue(store.domain)),
        or(
          eq(shopifyComplianceRequests.status, 'pending'),
          eq(shopifyComplianceRequests.status, 'failed'),
          eq(shopifyComplianceRequests.status, 'processing'),
        ),
      ),
    )
}
