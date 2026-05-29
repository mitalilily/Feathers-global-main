import axios from 'axios'
import * as crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../client'
import { b2c_orders } from '../schema/b2cOrders'
import { stores } from '../schema/stores'
import { ensurePlatformRegistration, updateUserChannelIntegration, upsertStore } from './userService'

export const SHOPIFY_PLATFORM_ID = 1
export const SHOPIFY_PLATFORM = {
  id: SHOPIFY_PLATFORM_ID,
  name: 'Shopify',
  slug: 'shopify',
} as const
export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-04'

const SHOPIFY_API_TIMEOUT_MS = Number(process.env.PLATFORM_API_TIMEOUT_MS || 15000)
const SHOPIFY_WEBHOOK_TOPICS = ['ORDERS_CREATE', 'ORDERS_UPDATED', 'ORDERS_CANCELLED'] as const
const SHOPIFY_ORDER_CREATED_WEBHOOK_PATH = '/api/webhooks/shopify/order-created'

type ShopifyStore = typeof stores.$inferSelect

type SyncResult = {
  created: number
  updated: number
  skipped: number
}

type FulfillTrigger =
  | 'do_not_fulfill'
  | 'order_booked'
  | 'order_in_transit'
  | 'order_out_for_delivery'
  | 'order_delivered'

type ConnectShopifyStoreParams = {
  storeUrl: string
  adminApiAccessToken: string
  userId: string
  apiKey?: string
  apiSecretKey?: string
  webhookSecret?: string
  settings?: Record<string, any>
  tx?: any
}

const toNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export const normalizeShopifyDomain = (domain?: string): string => {
  const clean = String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .replace(/\/admin(?:\/.*)?$/, '')
  return clean
}

const toShopifyGid = (resource: string, id: string | number) => {
  const raw = String(id || '').trim()
  if (raw.startsWith('gid://shopify/')) return raw
  return `gid://shopify/${resource}/${raw}`
}

const extractLegacyId = (value: unknown): string => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw.split('/').pop() || raw
}

const moneyAmount = (value: any, fallback = 0) =>
  toNumber(value?.shopMoney?.amount ?? value?.presentmentMoney?.amount ?? value?.amount, fallback)

const buildInternalOrderId = (storeId: string, shopifyOrderId: string) => {
  const safeStoreId = String(storeId || '').trim()
  const safeOrderId = String(shopifyOrderId || '').trim()
  return `shopify_${safeStoreId}_${safeOrderId}`.slice(0, 100)
}

const parseInternalShopifyOrderId = (
  localOrderId: string,
): { storeId?: string; shopifyOrderId?: string } => {
  const value = String(localOrderId || '')
  if (!value.startsWith('shopify_')) return {}
  const withStoreMatch = value.match(/^shopify_([^_]+)_(.+)$/)
  if (withStoreMatch) {
    return { storeId: withStoreMatch[1], shopifyOrderId: withStoreMatch[2] }
  }
  return { shopifyOrderId: value.replace(/^shopify_/, '') }
}

export const getConfiguredShopifyCredentials = () => {
  const storeUrl = normalizeShopifyDomain(process.env.SHOPIFY_STORE || process.env.SHOPIFY_STORE_URL)
  const adminApiAccessToken = String(
    process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || '',
  ).trim()
  const apiSecretKey = String(
    process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_API_SECRET_KEY || process.env.SHOPIFY_WEBHOOK_SECRET || '',
  ).trim()

  return {
    storeUrl,
    adminApiAccessToken,
    apiSecretKey,
    webhookSecret: apiSecretKey,
    configured: Boolean(storeUrl && adminApiAccessToken && apiSecretKey),
  }
}

export const getShopifyWebhookAddress = ({ requirePublic = false }: { requirePublic?: boolean } = {}) => {
  const baseUrl = String(process.env.API_URL || '').trim().replace(/\/+$/, '')
  if (!baseUrl) {
    if (requirePublic) {
      throw new Error('API_URL is not configured for Shopify webhook registration')
    }
    return `http://localhost:${process.env.PORT || 5003}${SHOPIFY_ORDER_CREATED_WEBHOOK_PATH}`
  }
  return `${baseUrl}${SHOPIFY_ORDER_CREATED_WEBHOOK_PATH}`
}

export const shopifyGraphqlRequest = async <T = any>({
  storeUrl,
  accessToken,
  query,
  variables,
  timeout = SHOPIFY_API_TIMEOUT_MS,
}: {
  storeUrl: string
  accessToken: string
  query: string
  variables?: Record<string, any>
  timeout?: number
}): Promise<T> => {
  const domain = normalizeShopifyDomain(storeUrl)
  if (!domain) throw new Error('Shopify store URL is required')
  if (!String(accessToken || '').trim()) throw new Error('Shopify Admin API access token is required')

  try {
    const response = await axios.post(
      `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      { query, variables },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': String(accessToken || '').trim(),
        },
        timeout,
      },
    )

    if (Array.isArray(response.data?.errors) && response.data.errors.length) {
      const message = response.data.errors
        .map((err: any) => err?.message || JSON.stringify(err))
        .join('; ')
      throw new Error(message || 'Shopify GraphQL request failed')
    }

    return response.data?.data as T
  } catch (error: any) {
    const status = error?.response?.status
    const shopifyErrors = error?.response?.data?.errors
    const shopifyMessage =
      typeof shopifyErrors === 'string'
        ? shopifyErrors
        : Array.isArray(shopifyErrors)
          ? shopifyErrors.map((err: any) => err?.message || JSON.stringify(err)).join('; ')
          : ''

    if (status === 401 || status === 403) {
      const authError: any = new Error(
        `Shopify Admin API rejected the access token for ${domain}. Check the custom app token and scopes.`,
      )
      authError.statusCode = 401
      throw authError
    }
    if (status === 404) {
      const notFoundError: any = new Error(
        `Shopify store not found: ${domain}. Use the exact myshopify.com domain from Shopify admin.`,
      )
      notFoundError.statusCode = 404
      throw notFoundError
    }
    if (status) {
      const apiError: any = new Error(
        `Shopify Admin API request failed for ${domain} with HTTP ${status}${shopifyMessage ? `: ${shopifyMessage}` : ''}`,
      )
      apiError.statusCode = status >= 400 && status < 500 ? status : 502
      throw apiError
    }
    throw new Error(error?.message || `Shopify Admin API request failed for ${domain}`)
  }
}

export const probeShopifyStore = async (storeUrl: string, adminApiAccessToken: string) => {
  const data = await shopifyGraphqlRequest<{
    shop: {
      id: string
      name?: string
      myshopifyDomain?: string
      primaryDomain?: { host?: string; url?: string }
      currencyCode?: string
      ianaTimezone?: string
      timezoneAbbreviation?: string
      billingAddress?: { countryCodeV2?: string; country?: string; phone?: string; zip?: string }
      email?: string
    }
  }>({
    storeUrl,
    accessToken: adminApiAccessToken,
    query: `
      query ShiplifiShopProbe {
        shop {
          id
          name
          myshopifyDomain
          primaryDomain {
            host
            url
          }
          currencyCode
          ianaTimezone
          timezoneAbbreviation
          billingAddress {
            countryCodeV2
            country
            phone
            zip
          }
          email
        }
      }
    `,
  })

  const shop = data?.shop
  if (!shop?.id) {
    throw new Error('Failed to read Shopify shop details')
  }

  const myshopifyDomain = normalizeShopifyDomain(shop.myshopifyDomain || storeUrl)
  return {
    id: extractLegacyId(shop.id),
    graphqlId: shop.id,
    name: shop.name || myshopifyDomain,
    domain: myshopifyDomain,
    primaryDomain: shop.primaryDomain,
    currency: shop.currencyCode || undefined,
    timezone: shop.ianaTimezone || shop.timezoneAbbreviation || undefined,
    country: shop.billingAddress?.countryCodeV2 || shop.billingAddress?.country || undefined,
    email: shop.email || undefined,
    phone: shop.billingAddress?.phone || undefined,
    zip: shop.billingAddress?.zip || undefined,
    raw: shop,
  }
}

export const ensureShopifyOrderWebhooks = async ({
  storeUrl,
  accessToken,
}: {
  storeUrl: string
  accessToken: string
}) => {
  const address = getShopifyWebhookAddress({ requirePublic: true })
  const existingData = await shopifyGraphqlRequest<{
    webhookSubscriptions: { edges: Array<{ node: { id: string; topic: string; uri: string } }> }
  }>({
    storeUrl,
    accessToken,
    query: `
      query ShiplifiWebhookSubscriptions($topics: [WebhookSubscriptionTopic!]) {
        webhookSubscriptions(first: 250, topics: $topics) {
          edges {
            node {
              id
              topic
              uri
            }
          }
        }
      }
    `,
    variables: { topics: SHOPIFY_WEBHOOK_TOPICS },
  })

  const existing = existingData?.webhookSubscriptions?.edges?.map((edge) => edge.node) || []
  const existingKeys = new Set(
    existing.map((webhook) => `${String(webhook.topic || '').toUpperCase()}::${String(webhook.uri || '')}`),
  )

  const subscribed: string[] = []
  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    const key = `${topic}::${address}`
    if (existingKeys.has(key)) {
      subscribed.push(topic)
      continue
    }

    const created = await shopifyGraphqlRequest<{
      webhookSubscriptionCreate: {
        webhookSubscription?: { id: string; topic: string; uri: string }
        userErrors: Array<{ field?: string[]; message: string }>
      }
    }>({
      storeUrl,
      accessToken,
      query: `
        mutation ShiplifiWebhookSubscriptionCreate(
          $topic: WebhookSubscriptionTopic!,
          $webhookSubscription: WebhookSubscriptionInput!
        ) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              topic
              uri
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        topic,
        webhookSubscription: {
          uri: address,
        },
      },
    })

    const errors = created?.webhookSubscriptionCreate?.userErrors || []
    if (errors.length) {
      throw new Error(errors.map((err) => err.message).join('; '))
    }
    subscribed.push(topic)
  }

  return { address, subscribed }
}

export const upsertShopifySettingsMetafield = async ({
  storeUrl,
  accessToken,
  settings,
  tx = db,
  id,
}: {
  storeUrl: string
  accessToken: string
  settings: Record<string, any>
  id: string
  tx?: any
}) => {
  const ownerData = await shopifyGraphqlRequest<{ shop: { id: string } }>({
    storeUrl,
    accessToken,
    query: `query ShiplifiSettingsOwner { shop { id } }`,
  })

  const metafieldData = await shopifyGraphqlRequest<{
    shop: {
      shiplifiSettings?: { id: string; namespace: string } | null
      legacySettings?: { id: string; namespace: string } | null
    }
  }>({
    storeUrl,
    accessToken,
    query: `
      query ShiplifiSettingsMetafield($key: String!) {
        shop {
          shiplifiSettings: metafield(namespace: "shiplifi", key: $key) {
            id
            namespace
          }
          legacySettings: metafield(namespace: "Shiplifi", key: $key) {
            id
            namespace
          }
        }
      }
    `,
    variables: { key: 'settings' },
  })

  const existingMetafield = metafieldData?.shop?.shiplifiSettings || metafieldData?.shop?.legacySettings
  const existingMetafieldId = existingMetafield?.id
  const mutation = existingMetafieldId
    ? `
      mutation ShiplifiSettingsMetafieldSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key }
          userErrors { field message }
        }
      }
    `
    : `
      mutation ShiplifiSettingsMetafieldSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key }
          userErrors { field message }
        }
      }
    `

  const saved = await shopifyGraphqlRequest<{
    metafieldsSet: { userErrors: Array<{ field?: string[]; message: string }> }
  }>({
    storeUrl,
    accessToken,
    query: mutation,
    variables: {
      metafields: [
        {
          ...(existingMetafieldId ? { id: existingMetafieldId } : { ownerId: ownerData.shop.id }),
          namespace: existingMetafield?.namespace || 'shiplifi',
          key: 'settings',
          type: 'json',
          value: JSON.stringify(settings || {}),
        },
      ],
    },
  })

  const errors = saved?.metafieldsSet?.userErrors || []
  if (errors.length) {
    throw new Error(errors.map((err) => err.message).join('; '))
  }

  await tx.update(stores).set({ settings, updatedAt: new Date() }).where(eq(stores.id, id))
}

const getStoreForUser = async (userId: string, storeId?: string, tx: any = db) => {
  const whereClause = storeId
    ? and(
        eq(stores.userId, userId),
        eq(stores.platformId, SHOPIFY_PLATFORM_ID),
        eq(stores.id, String(storeId)),
      )
    : and(eq(stores.userId, userId), eq(stores.platformId, SHOPIFY_PLATFORM_ID))

  const [store] = await tx.select().from(stores).where(whereClause).limit(1)
  return store as ShopifyStore | undefined
}

const getStoresForUser = async (userId: string, tx: any = db) => {
  const rows = await tx
    .select()
    .from(stores)
    .where(and(eq(stores.userId, userId), eq(stores.platformId, SHOPIFY_PLATFORM_ID)))
  return rows as ShopifyStore[]
}

const getStoreByDomain = async (domain: string, tx: any = db) => {
  const [store] = await tx
    .select()
    .from(stores)
    .where(and(eq(stores.domain, normalizeShopifyDomain(domain)), eq(stores.platformId, SHOPIFY_PLATFORM_ID)))
    .limit(1)
  return store as ShopifyStore | undefined
}

export const connectShopifyStore = async ({
  storeUrl,
  adminApiAccessToken,
  userId,
  apiKey,
  apiSecretKey,
  webhookSecret,
  settings,
  tx = db,
}: ConnectShopifyStoreParams) => {
  const normalizedDomain = normalizeShopifyDomain(storeUrl)
  if (!normalizedDomain) throw new Error('Shopify store URL is required')
  if (!String(adminApiAccessToken || '').trim()) throw new Error('Shopify Admin API access token is required')
  if (!userId) throw new Error('User ID is required')

  const shopifyData = await probeShopifyStore(normalizedDomain, adminApiAccessToken)
  const signingSecret = String(
    webhookSecret || apiSecretKey || process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET || '',
  ).trim()
  let savedStore: ShopifyStore | undefined

  await tx.transaction(async (innerTx: any) => {
    await ensurePlatformRegistration(SHOPIFY_PLATFORM, innerTx)

    const [existingGlobalStore] = await innerTx
      .select()
      .from(stores)
      .where(and(eq(stores.id, shopifyData.id), eq(stores.platformId, SHOPIFY_PLATFORM_ID)))
      .limit(1)

    if (existingGlobalStore && existingGlobalStore.userId !== userId) {
      throw new Error('This Shopify store is already connected to another merchant account')
    }

    await upsertStore(
      {
        id: shopifyData.id,
        name: shopifyData.name,
        domain: shopifyData.domain,
        timezone: shopifyData.timezone,
        country: shopifyData.country,
        currency: shopifyData.currency,
        email: shopifyData.email,
        phone: shopifyData.phone,
        zip: shopifyData.zip,
        apiKey: String(apiKey || '').trim() || 'shopify_custom_app',
        adminApiAccessToken,
        shopifyWebhookSecret: signingSecret || undefined,
        graphqlId: shopifyData.graphqlId,
        primaryDomain: shopifyData.primaryDomain,
        storeInfo: shopifyData.raw,
      },
      SHOPIFY_PLATFORM_ID,
      userId,
      innerTx,
    )

    await innerTx
      .update(stores)
      .set({
        settings: settings || {},
        metadata: {
          ...(existingGlobalStore?.metadata || {}),
          shopifyWebhookSecret: signingSecret || undefined,
          apiSecretKey: apiSecretKey ? 'configured' : undefined,
          graphqlId: shopifyData.graphqlId,
          primaryDomain: shopifyData.primaryDomain,
          storeInfo: shopifyData.raw,
        },
        updatedAt: new Date(),
      })
      .where(eq(stores.id, shopifyData.id))

    await updateUserChannelIntegration(userId, SHOPIFY_PLATFORM_ID, innerTx)
    ;[savedStore] = await innerTx.select().from(stores).where(eq(stores.id, shopifyData.id)).limit(1)
  })

  if (settings && savedStore) {
    try {
      await upsertShopifySettingsMetafield({
        storeUrl: normalizedDomain,
        accessToken: adminApiAccessToken,
        settings,
        id: savedStore.id,
      })
    } catch (err: any) {
      console.warn('Shopify settings metafield sync failed:', err?.message || err)
    }
  }

  let webhooks: { address: string; subscribed: string[] } | null = null
  let warning: string | null = null
  try {
    if (!signingSecret) {
      warning = 'Store connected, but Shopify webhook signature secret is missing'
    } else {
      webhooks = await ensureShopifyOrderWebhooks({
        storeUrl: normalizedDomain,
        accessToken: adminApiAccessToken,
      })
    }
  } catch (err: any) {
    warning = 'Store connected, but Shopify webhooks could not be auto-configured'
    console.warn('Shopify webhook setup failed:', err?.response?.data || err?.message || err)
  }

  return { shopifyData, store: savedStore, webhooks, warning }
}

const parseCsvTags = (value: unknown): string[] =>
  String(value || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)

const getOrderTagSet = (order: any): Set<string> =>
  new Set(
    String(order?.tags || '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  )

const shouldIncludeByTags = (order: any, requiredTagsCsv?: string): boolean => {
  const required = parseCsvTags(requiredTagsCsv)
  if (!required.length) return true
  const orderTags = getOrderTagSet(order)
  return required.some((tag) => orderTags.has(tag))
}

const resolveOrderType = (order: any, settings: any): 'cod' | 'prepaid' => {
  const orderTags = getOrderTagSet(order)
  const codTags = parseCsvTags(settings?.codTags)
  const prepaidTags = parseCsvTags(settings?.prepaidTags)
  if (codTags.length && codTags.some((tag) => orderTags.has(tag))) return 'cod'
  if (prepaidTags.length && prepaidTags.some((tag) => orderTags.has(tag))) return 'prepaid'

  const gateways = Array.isArray(order?.payment_gateway_names)
    ? order.payment_gateway_names.map((g: string) => String(g || '').toLowerCase())
    : []
  const codGateway = gateways.some((g: string) => g.includes('cod') || g.includes('cash'))
  if (codGateway) return 'cod'

  return String(order?.financial_status || '').toLowerCase() === 'paid' ? 'prepaid' : 'cod'
}

const mapShopifyStatus = (order: any): string => {
  if (order?.cancelled_at) return 'cancelled'
  const fulfillmentStatus = String(order?.fulfillment_status || '').toLowerCase()
  if (fulfillmentStatus === 'fulfilled' || fulfillmentStatus === 'fulfilled_status') return 'delivered'
  if (fulfillmentStatus.includes('fulfilled') && fulfillmentStatus.includes('partial')) return 'in_transit'
  if (fulfillmentStatus === 'partial' || fulfillmentStatus === 'partially_fulfilled') return 'in_transit'
  return 'pending'
}

const normalizeFulfillTrigger = (value: unknown): FulfillTrigger => {
  const trigger = String(value || 'do_not_fulfill').trim().toLowerCase()
  if (
    trigger === 'order_booked' ||
    trigger === 'order_in_transit' ||
    trigger === 'order_out_for_delivery' ||
    trigger === 'order_delivered'
  ) {
    return trigger
  }
  return 'do_not_fulfill'
}

const statusPriority: Record<string, number> = {
  booked: 1,
  pickup_initiated: 1,
  in_transit: 2,
  out_for_delivery: 3,
  delivered: 4,
}

const triggerPriority: Record<FulfillTrigger, number> = {
  do_not_fulfill: Number.MAX_SAFE_INTEGER,
  order_booked: 1,
  order_in_transit: 2,
  order_out_for_delivery: 3,
  order_delivered: 4,
}

const shouldAttemptFulfillment = (orderStatus: unknown, trigger: unknown) => {
  const normalizedTrigger = normalizeFulfillTrigger(trigger)
  if (normalizedTrigger === 'do_not_fulfill') return false
  const orderLevel = statusPriority[String(orderStatus || '').toLowerCase()] || 0
  return orderLevel >= triggerPriority[normalizedTrigger]
}

const shouldNotifyCustomerOnFulfill = (settings: any) => {
  const value = String(
    settings?.customerNotifyOnFulfill ?? settings?.notifyCustomerOnFulfill ?? settings?.notifyOnFulfill ?? '',
  )
    .trim()
    .toLowerCase()
  return ['notify', 'notify_customer', 'yes', 'true', '1'].includes(value)
}

const mapProducts = (order: any) => {
  const items = Array.isArray(order?.line_items) ? order.line_items : []
  return items.map((item: any) => {
    const qty = Math.max(1, toNumber(item?.quantity, 1))
    const price = toNumber(item?.price, 0)
    const discount = Array.isArray(item?.discount_allocations)
      ? item.discount_allocations.reduce((sum: number, d: any) => sum + toNumber(d?.amount, 0), 0)
      : 0
    const lineTaxRate = Array.isArray(item?.tax_lines)
      ? item.tax_lines.reduce((sum: number, t: any) => sum + toNumber(t?.rate, 0), 0) * 100
      : 0
    return {
      name: item?.name || item?.title || 'Item',
      sku: item?.sku || 'NA',
      qty,
      price,
      discount,
      tax_rate: lineTaxRate,
      hsn: '',
    }
  })
}

const toPhone = (order: any): string => {
  const phone =
    order?.phone ||
    order?.shipping_address?.phone ||
    order?.billing_address?.phone ||
    order?.customer?.phone ||
    ''
  const clean = String(phone).replace(/[^\d+]/g, '').trim()
  return clean || '0000000000'
}

const mapAddressFromGraphql = (address: any) =>
  address
    ? {
        name:
          address.name ||
          `${address.firstName || ''} ${address.lastName || ''}`.trim() ||
          address.company ||
          '',
        first_name: address.firstName,
        last_name: address.lastName,
        address1: address.address1,
        address2: address.address2,
        city: address.city,
        province: address.province,
        province_code: address.provinceCode,
        country: address.country,
        country_code: address.countryCodeV2,
        zip: address.zip,
        phone: address.phone,
      }
    : null

const normalizeGraphqlOrder = (node: any) => {
  const legacyId = extractLegacyId(node?.legacyResourceId || node?.id)
  const tags = Array.isArray(node?.tags) ? node.tags.join(', ') : String(node?.tags || '')
  const lineItems = Array.isArray(node?.lineItems?.nodes) ? node.lineItems.nodes : []
  const totalQuantity = lineItems.reduce((sum: number, item: any) => sum + toNumber(item?.quantity, 0), 0)

  return {
    id: legacyId,
    admin_graphql_api_id: node?.id,
    name: node?.name,
    order_number: node?.number,
    created_at: node?.createdAt,
    updated_at: node?.updatedAt,
    cancelled_at: node?.cancelledAt,
    email: node?.email || node?.customer?.email || '',
    phone: node?.phone || node?.customer?.phone || '',
    financial_status: String(node?.displayFinancialStatus || '').toLowerCase(),
    fulfillment_status: String(node?.displayFulfillmentStatus || '').toLowerCase(),
    payment_gateway_names: node?.paymentGatewayNames || [],
    tags,
    total_price: moneyAmount(node?.currentTotalPriceSet ?? node?.totalPriceSet),
    total_discounts: moneyAmount(node?.currentTotalDiscountsSet ?? node?.totalDiscountsSet),
    shipping_lines: [
      {
        price: moneyAmount(node?.currentShippingPriceSet ?? node?.totalShippingPriceSet),
      },
    ],
    shipping_address: mapAddressFromGraphql(node?.shippingAddress),
    billing_address: mapAddressFromGraphql(node?.billingAddress),
    customer: node?.customer
      ? {
          first_name: node.customer.firstName,
          last_name: node.customer.lastName,
          email: node.customer.email,
          phone: node.customer.phone,
        }
      : null,
    line_items: lineItems.map((item: any) => ({
      id: extractLegacyId(item?.id),
      name: item?.name || item?.title,
      title: item?.title || item?.name,
      sku: item?.sku || item?.variant?.sku,
      quantity: item?.quantity,
      price: moneyAmount(item?.originalUnitPriceSet),
      grams: Math.round(toNumber(node?.totalWeight, 0) / Math.max(1, totalQuantity)),
      discount_allocations: [
        {
          amount: moneyAmount(item?.totalDiscountSet),
        },
      ],
      tax_lines: Array.isArray(item?.taxLines)
        ? item.taxLines.map((tax: any) => ({
            rate: toNumber(tax?.rate, toNumber(tax?.ratePercentage, 0) / 100),
          }))
        : [],
    })),
  }
}

const fetchShopifyOrders = async (store: ShopifyStore, limit = 50) => {
  const clampedLimit = Math.min(Math.max(limit, 1), 250)
  const data = await shopifyGraphqlRequest<{
    orders: { edges: Array<{ node: any }> }
  }>({
    storeUrl: store.domain,
    accessToken: String(store.adminApiAccessToken || '').trim(),
    query: `
      query ShiplifiOrders($first: Int!) {
        orders(first: $first, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              legacyResourceId
              name
              number
              createdAt
              updatedAt
              cancelledAt
              email
              phone
              displayFinancialStatus
              displayFulfillmentStatus
              paymentGatewayNames
              tags
              totalWeight
              currentTotalPriceSet { shopMoney { amount currencyCode } }
              totalPriceSet { shopMoney { amount currencyCode } }
              currentShippingPriceSet { shopMoney { amount currencyCode } }
              totalShippingPriceSet { shopMoney { amount currencyCode } }
              currentTotalDiscountsSet { shopMoney { amount currencyCode } }
              totalDiscountsSet { shopMoney { amount currencyCode } }
              customer {
                firstName
                lastName
                email
                phone
              }
              shippingAddress {
                name
                firstName
                lastName
                address1
                address2
                city
                province
                provinceCode
                country
                countryCodeV2
                zip
                phone
              }
              billingAddress {
                name
                firstName
                lastName
                address1
                address2
                city
                province
                provinceCode
                country
                countryCodeV2
                zip
                phone
              }
              lineItems(first: 100) {
                nodes {
                  id
                  name
                  title
                  sku
                  quantity
                  originalUnitPriceSet { shopMoney { amount currencyCode } }
                  totalDiscountSet { shopMoney { amount currencyCode } }
                  taxLines {
                    rate
                    ratePercentage
                  }
                  variant {
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `,
    variables: { first: clampedLimit },
    timeout: 30000,
  })

  return (data?.orders?.edges || []).map((edge) => normalizeGraphqlOrder(edge.node))
}

const upsertFromShopifyOrder = async (store: ShopifyStore, order: any, settings: any, tx: any = db) => {
  if (!order?.id) return 'skipped' as const
  if (!shouldIncludeByTags(order, settings?.orderTagsToFetch)) return 'skipped' as const

  const shopifyOrderId = String(order.id)
  const internalOrderId = buildInternalOrderId(String(store.id), shopifyOrderId)
  const legacyInternalOrderId = `shopify_${shopifyOrderId}`
  const orderType = resolveOrderType(order, settings)
  const mappedStatus = mapShopifyStatus(order)

  const shippingAddress = order?.shipping_address || order?.billing_address || {}
  const shippingCharges = Array.isArray(order?.shipping_lines)
    ? order.shipping_lines.reduce((sum: number, s: any) => sum + toNumber(s?.price, 0), 0)
    : 0
  const products = mapProducts(order)
  const totalWeightGrams = (Array.isArray(order?.line_items) ? order.line_items : []).reduce(
    (sum: number, item: any) => sum + toNumber(item?.grams, 0) * Math.max(1, toNumber(item?.quantity, 1)),
    0,
  )
  const declaredWeight = totalWeightGrams > 0 ? totalWeightGrams : 500
  const orderAmount = toNumber(order?.total_price, 0)
  const orderName = String(order?.name || order?.order_number || shopifyOrderId).trim()

  const updatePayload: Partial<typeof b2c_orders.$inferInsert> = {
    user_id: store.userId,
    order_number: orderName.slice(0, 50),
    order_date: String(order?.created_at || new Date().toISOString()).slice(0, 50),
    order_amount: orderAmount,
    order_id: internalOrderId,
    invoice_number: order?.name ? String(order.name).slice(0, 100) : null,
    invoice_date: order?.created_at ? String(order.created_at).slice(0, 50) : null,
    invoice_amount: orderAmount,
    buyer_name: String(
      shippingAddress?.name || order?.customer?.first_name || order?.email || 'Shopify Customer',
    ).slice(0, 255),
    buyer_phone: toPhone(order).slice(0, 20),
    buyer_email: String(order?.email || '').slice(0, 255) || null,
    address: String([shippingAddress?.address1, shippingAddress?.address2].filter(Boolean).join(', ') || 'Address not provided').slice(
      0,
      500,
    ),
    city: String(shippingAddress?.city || 'NA').slice(0, 100),
    state: String(shippingAddress?.province || shippingAddress?.province_code || 'NA').slice(0, 100),
    country: String(shippingAddress?.country || 'India').slice(0, 100),
    pincode: String(shippingAddress?.zip || '000000').slice(0, 20),
    products: products.length ? products : [{ name: 'Item', sku: 'NA', qty: 1, price: orderAmount }],
    weight: declaredWeight,
    length: 10,
    breadth: 10,
    height: 10,
    order_type: orderType,
    prepaid_amount: orderType === 'prepaid' ? orderAmount : 0,
    cod_charges: 0,
    shipping_charges: shippingCharges,
    transaction_fee: 0,
    gift_wrap: 0,
    discount: toNumber(order?.total_discounts, 0),
    order_status: mappedStatus,
    courier_partner: 'Shopify',
    integration_type: 'shopify',
    is_external_api: false,
    tags: String(order?.tags || '').slice(0, 200) || `shopify_store:${store.id}`,
    updated_at: new Date(),
  }

  const [existing] = await tx
    .select({ id: b2c_orders.id })
    .from(b2c_orders)
    .where(eq(b2c_orders.order_id, internalOrderId))
    .limit(1)

  const [legacyExisting] = existing
    ? [undefined]
    : await tx
        .select({ id: b2c_orders.id })
        .from(b2c_orders)
        .where(eq(b2c_orders.order_id, legacyInternalOrderId))
        .limit(1)

  if (existing?.id || legacyExisting?.id) {
    const targetId = existing?.id || legacyExisting?.id
    await tx
      .update(b2c_orders)
      .set({ ...updatePayload, order_id: internalOrderId })
      .where(eq(b2c_orders.id, targetId as string))
    return 'updated' as const
  }

  await tx.insert(b2c_orders).values({
    ...updatePayload,
    created_at: new Date(),
  } as any)
  return 'created' as const
}

export const syncShopifyOrdersForUser = async (
  userId: string,
  limit = 50,
  storeId?: string,
  tx: any = db,
): Promise<SyncResult> => {
  const storesToSync = storeId
    ? [await getStoreForUser(userId, storeId, tx)].filter(Boolean)
    : await getStoresForUser(userId, tx)
  if (!storesToSync.length) {
    throw new Error('No connected Shopify store found for this user')
  }

  const result: SyncResult = { created: 0, updated: 0, skipped: 0 }

  for (const store of storesToSync) {
    const orders = await fetchShopifyOrders(store as ShopifyStore, limit)
    const settings = (store as any)?.settings || {}
    for (const order of orders) {
      const state = await upsertFromShopifyOrder(store as ShopifyStore, order, settings, tx)
      result[state] += 1
    }
  }

  return result
}

export const verifyShopifyWebhookSignature = (rawBody: Buffer, receivedHmac?: string) => {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET
  if (!secret) {
    throw new Error('SHOPIFY_WEBHOOK_SECRET or SHOPIFY_API_SECRET is not configured')
  }
  return verifyShopifyWebhookSignatureWithSecret(rawBody, receivedHmac, secret)
}

const verifyShopifyWebhookSignatureWithSecret = (
  rawBody: Buffer,
  receivedHmac: string | undefined,
  secret: string,
) => {
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  const a = Buffer.from(digest)
  const b = Buffer.from(String(receivedHmac || ''))
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

const getStoreWebhookSecret = (store: ShopifyStore): string => {
  const metadata = ((store as any)?.metadata || {}) as Record<string, unknown>
  const candidates = [
    metadata.shopifyWebhookSecret,
    metadata.webhookSecret,
    metadata.apiSecret,
    metadata.apiSecretKey,
    process.env.SHOPIFY_WEBHOOK_SECRET,
    process.env.SHOPIFY_API_SECRET,
    process.env.SHOPIFY_API_SECRET_KEY,
  ]
  for (const candidate of candidates) {
    const val = String(candidate || '').trim()
    if (val) return val
  }
  return ''
}

export const verifyShopifyWebhookSignatureForDomain = async (
  rawBody: Buffer,
  receivedHmac: string | undefined,
  shopDomain: string,
  tx: any = db,
) => {
  const store = await getStoreByDomain(shopDomain, tx)
  if (!store) {
    const configured = getConfiguredShopifyCredentials()
    if (
      configured.webhookSecret &&
      configured.storeUrl &&
      configured.storeUrl === normalizeShopifyDomain(shopDomain)
    ) {
      return verifyShopifyWebhookSignatureWithSecret(rawBody, receivedHmac, configured.webhookSecret)
    }
    return false
  }
  const secret = getStoreWebhookSecret(store)
  if (!secret) return false
  return verifyShopifyWebhookSignatureWithSecret(rawBody, receivedHmac, secret)
}

export const processShopifyWebhookOrder = async (
  shopDomain: string,
  topic: string,
  payload: any,
  tx: any = db,
) => {
  const store = await getStoreByDomain(shopDomain, tx)
  if (!store) {
    return { success: false, reason: 'store_not_found' }
  }
  const settings = (store as any)?.settings || {}
  const normalizedTopic = String(topic || '').toLowerCase()

  if (normalizedTopic.includes('orders/create') || normalizedTopic.includes('orders/updated')) {
    const action = await upsertFromShopifyOrder(store, payload, settings, tx)
    return { success: true, action }
  }

  if (normalizedTopic.includes('orders/cancelled')) {
    const internalOrderId = buildInternalOrderId(String(store.id), String(payload?.id || ''))
    const legacyOrderId = `shopify_${String(payload?.id || '')}`
    if (!payload?.id) return { success: false, reason: 'missing_order_id' }
    await tx
      .update(b2c_orders)
      .set({ order_status: 'cancelled', updated_at: new Date() })
      .where(eq(b2c_orders.order_id, internalOrderId))
    await tx
      .update(b2c_orders)
      .set({ order_status: 'cancelled', updated_at: new Date() })
      .where(eq(b2c_orders.order_id, legacyOrderId))
    return { success: true, action: 'cancelled' }
  }

  return { success: true, action: 'ignored_topic' }
}

const getShopifyOrderForStatusSync = async (store: ShopifyStore, shopifyOrderId: string) => {
  const data = await shopifyGraphqlRequest<{
    order: {
      id: string
      tags: string[]
      cancelledAt?: string | null
      displayFulfillmentStatus?: string
      canMarkAsPaid?: boolean
      fulfillmentOrders: {
        nodes: Array<{ id: string; status: string; requestStatus?: string }>
      }
    } | null
  }>({
    storeUrl: store.domain,
    accessToken: String(store.adminApiAccessToken || '').trim(),
    query: `
      query ShiplifiOrderStatusSync($id: ID!) {
        order(id: $id) {
          id
          tags
          cancelledAt
          displayFulfillmentStatus
          canMarkAsPaid
          fulfillmentOrders(first: 50) {
            nodes {
              id
              status
              requestStatus
            }
          }
        }
      }
    `,
    variables: { id: toShopifyGid('Order', shopifyOrderId) },
  })

  return data?.order
}

const assertNoUserErrors = (operation: string, errors: Array<{ field?: string[]; message: string }> = []) => {
  if (!errors.length) return
  throw new Error(`${operation}: ${errors.map((err) => err.message).join('; ')}`)
}

const createShopifyFulfillment = async ({
  store,
  fulfillmentOrderIds,
  trackingNumber,
  courierPartner,
  notifyCustomer,
}: {
  store: ShopifyStore
  fulfillmentOrderIds: string[]
  trackingNumber?: string
  courierPartner?: string
  notifyCustomer: boolean
}) => {
  const fulfillment: any = {
    lineItemsByFulfillmentOrder: fulfillmentOrderIds.map((fulfillmentOrderId) => ({ fulfillmentOrderId })),
    notifyCustomer,
  }

  if (trackingNumber) {
    fulfillment.trackingInfo = {
      number: trackingNumber,
      company: String(courierPartner || 'Feather Global').slice(0, 255),
    }
  }

  const data = await shopifyGraphqlRequest<{
    fulfillmentCreate: { userErrors: Array<{ field?: string[]; message: string }> }
  }>({
    storeUrl: store.domain,
    accessToken: String(store.adminApiAccessToken || '').trim(),
    query: `
      mutation ShiplifiFulfillmentCreate($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          fulfillment { id status }
          userErrors { field message }
        }
      }
    `,
    variables: { fulfillment },
  })

  assertNoUserErrors('Shopify fulfillmentCreate failed', data?.fulfillmentCreate?.userErrors)
}

const updateShopifyOrderTags = async (store: ShopifyStore, shopifyOrderId: string, tags: string[]) => {
  const data = await shopifyGraphqlRequest<{
    orderUpdate: { userErrors: Array<{ field?: string[]; message: string }> }
  }>({
    storeUrl: store.domain,
    accessToken: String(store.adminApiAccessToken || '').trim(),
    query: `
      mutation ShiplifiOrderTagsUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id }
          userErrors { field message }
        }
      }
    `,
    variables: {
      input: {
        id: toShopifyGid('Order', shopifyOrderId),
        tags,
      },
    },
  })

  assertNoUserErrors('Shopify orderUpdate failed', data?.orderUpdate?.userErrors)
}

const cancelShopifyOrder = async (store: ShopifyStore, shopifyOrderId: string) => {
  const data = await shopifyGraphqlRequest<{
    orderCancel: {
      orderCancelUserErrors?: Array<{ field?: string[]; message: string }>
      userErrors?: Array<{ field?: string[]; message: string }>
    }
  }>({
    storeUrl: store.domain,
    accessToken: String(store.adminApiAccessToken || '').trim(),
    query: `
      mutation ShiplifiOrderCancel(
        $orderId: ID!,
        $notifyCustomer: Boolean,
        $refundMethod: OrderCancelRefundMethodInput!,
        $restock: Boolean!,
        $reason: OrderCancelReason!,
        $staffNote: String
      ) {
        orderCancel(
          orderId: $orderId,
          notifyCustomer: $notifyCustomer,
          refundMethod: $refundMethod,
          restock: $restock,
          reason: $reason,
          staffNote: $staffNote
        ) {
          job { id done }
          orderCancelUserErrors { field message }
          userErrors { field message }
        }
      }
    `,
    variables: {
      orderId: toShopifyGid('Order', shopifyOrderId),
      notifyCustomer: false,
      refundMethod: { originalPaymentMethodsRefund: false },
      restock: false,
      reason: 'OTHER',
      staffNote: 'Cancelled from Feather Global shipment status sync.',
    },
  })

  assertNoUserErrors(
    'Shopify orderCancel failed',
    data?.orderCancel?.orderCancelUserErrors || data?.orderCancel?.userErrors,
  )
}

const markShopifyOrderAsPaid = async (store: ShopifyStore, shopifyOrderId: string) => {
  const data = await shopifyGraphqlRequest<{
    orderMarkAsPaid: { userErrors: Array<{ field?: string[]; message: string }> }
  }>({
    storeUrl: store.domain,
    accessToken: String(store.adminApiAccessToken || '').trim(),
    query: `
      mutation ShiplifiOrderMarkAsPaid($input: OrderMarkAsPaidInput!) {
        orderMarkAsPaid(input: $input) {
          order { id canMarkAsPaid displayFinancialStatus }
          userErrors { field message }
        }
      }
    `,
    variables: { input: { id: toShopifyGid('Order', shopifyOrderId) } },
  })

  assertNoUserErrors('Shopify orderMarkAsPaid failed', data?.orderMarkAsPaid?.userErrors)
}

export const syncShopifyStatusForLocalOrder = async (order: any, tx: any = db) => {
  const localOrderId = String(order?.order_id || '')
  if (!localOrderId.startsWith('shopify_')) return

  const parsed = parseInternalShopifyOrderId(localOrderId)
  const shopifyOrderId = parsed.shopifyOrderId || ''
  if (!shopifyOrderId) return

  const store = await getStoreForUser(order.user_id, parsed.storeId, tx)
  if (!store) return
  const settings = (store as any)?.settings || {}
  const orderStatus = String(order?.order_status || '').toLowerCase()

  try {
    const remoteOrder = await getShopifyOrderForStatusSync(store, shopifyOrderId)
    if (!remoteOrder) return

    if (shouldAttemptFulfillment(orderStatus, settings?.fulfillTrigger)) {
      const isAlreadyFulfilled = String(remoteOrder.displayFulfillmentStatus || '').toUpperCase() === 'FULFILLED'
      const openFulfillmentOrders = (remoteOrder.fulfillmentOrders?.nodes || []).filter((fo: any) => {
        const foStatus = String(fo?.status || '').toUpperCase()
        const reqStatus = String(fo?.requestStatus || '').toUpperCase()
        return ['OPEN', 'SCHEDULED'].includes(foStatus) && (!reqStatus || reqStatus === 'UNSUBMITTED')
      })

      if (!isAlreadyFulfilled && openFulfillmentOrders.length) {
        await createShopifyFulfillment({
          store,
          fulfillmentOrderIds: openFulfillmentOrders.map((fo: any) => fo.id),
          trackingNumber: String(order?.awb_number || '').trim(),
          courierPartner: order?.courier_partner,
          notifyCustomer: shouldNotifyCustomerOnFulfill(settings),
        })
      }
    }

    if (settings?.autoUpdateShipmentStatus) {
      const cleanTags = (Array.isArray(remoteOrder.tags) ? remoteOrder.tags : String(order?.tags || '').split(','))
        .map((t: string) => String(t || '').trim())
        .filter(Boolean)
        .filter((t: string) => !/^(mcw_status|dg_status):/i.test(t))
      cleanTags.push(`dg_status:${orderStatus}`)
      await updateShopifyOrderTags(store, shopifyOrderId, cleanTags)
    }

    if (settings?.autoCancelOrders && orderStatus === 'cancelled' && !remoteOrder.cancelledAt) {
      await cancelShopifyOrder(store, shopifyOrderId)
    }

    if (
      settings?.markCodPaidOnDelivery &&
      String(order?.order_type || '').toLowerCase() === 'cod' &&
      orderStatus === 'delivered' &&
      remoteOrder.canMarkAsPaid
    ) {
      await markShopifyOrderAsPaid(store, shopifyOrderId)
    }
  } catch (err: any) {
    console.warn(
      `Shopify status sync failed for local order ${order?.order_number || order?.id}:`,
      err?.response?.data || err?.message || err,
    )
  }
}
