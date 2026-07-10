import axios from 'axios'
import * as crypto from 'crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../client'
import { b2c_orders } from '../schema/b2cOrders'
import { stores } from '../schema/stores'
import {
  getCourierProviderDisplayName,
  getProviderMetaCourierName,
  resolveCourierProviderKeyFromFields,
} from '../../utils/courierProvider'
import { normalizeIndianPhoneForBooking } from '../../utils/functions'
import {
  ensurePlatformRegistration,
  setUserChannelIntegration,
  updateUserChannelIntegration,
  upsertStore,
} from './userService'
import { recordSalesChannelSyncOutcome } from './salesChannelSyncAudit.service'
import { deleteSalesChannelOrdersForStore } from './storeCleanup.service'

export const SHOPIFY_PLATFORM_ID = 1
export const SHOPIFY_PLATFORM = {
  id: SHOPIFY_PLATFORM_ID,
  name: 'Shopify',
  slug: 'shopify',
} as const
export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-07'

const SHOPIFY_API_TIMEOUT_MS = Number(process.env.PLATFORM_API_TIMEOUT_MS || 15000)
const SHOPIFY_WEBHOOK_TOPICS = ['ORDERS_CREATE', 'ORDERS_UPDATED', 'ORDERS_CANCELLED'] as const
const SHOPIFY_ORDER_CREATED_WEBHOOK_PATH = '/api/webhooks/shopify/order-created'
export const SHOPIFY_COMPLIANCE_WEBHOOK_PATH = '/api/webhooks/shopify/compliance'
const SHOPIFY_COMPLIANCE_TOPICS = [
  'customers/data_request',
  'customers/redact',
  'shop/redact',
] as const

type ShopifyStore = typeof stores.$inferSelect

type SyncResult = {
  created: number
  updated: number
  skipped: number
}

type ExistingShopifyOrderRow = {
  id: string
  order_id?: string | null
  order_number?: string | null
  order_status?: string | null
  awb_number?: string | null
  courier_partner?: string | null
  integration_type?: string | null
  provider_meta?: any
  provider_service?: string | null
}

const DEFAULT_SHOPIFY_SYNC_SETTINGS = {
  fulfillTrigger: 'order_booked',
  customerNotifyOnFulfill: 'do_not_notify',
  autoUpdateShipmentStatus: true,
  autoCancelOrders: true,
  markCodPaidOnDelivery: false,
}

const normalizeShopifySettings = (settings?: Record<string, any> | null) => ({
  ...DEFAULT_SHOPIFY_SYNC_SETTINGS,
  ...(settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {}),
})

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
  authMethod?: string
  oauth?: Record<string, any>
  tx?: any
}

type ShopifyOAuthStatePayload = {
  nonce: string
  shop: string
  userId: string
  returnTo?: string
  issuedAt: number
}

type ShopifyAccessTokenResponse = {
  access_token?: string
  scope?: string
  expires_in?: number
  refresh_token?: string
  refresh_token_expires_in?: number
}

const shopifyTokenRefreshLocks = new Map<string, Promise<string>>()

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

export const isValidShopifyDomain = (domain?: string) =>
  /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(normalizeShopifyDomain(domain))

const REQUIRED_SHOPIFY_OAUTH_SCOPES = [
  'read_orders',
  'write_orders',
  'read_customers',
  'read_products',
  'read_webhooks',
  'write_webhooks',
  'read_merchant_managed_fulfillment_orders',
  'write_merchant_managed_fulfillment_orders',
] as const

const parseShopifyScopes = () =>
  [
    ...REQUIRED_SHOPIFY_OAUTH_SCOPES,
    ...String(process.env.SHOPIFY_SCOPES || process.env.SHOPIFY_OAUTH_SCOPES || '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean),
  ].filter((scope, index, scopes) => scopes.indexOf(scope) === index)

const normalizeScopeList = (value: unknown) =>
  String(value || '')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean)

const getShopifyOAuthScopeStatus = (grantedScopes: unknown, requiredScopes: string[]) => {
  const normalizedGrantedScopes = normalizeScopeList(grantedScopes)
  const missingScopes = requiredScopes.filter((scope) => !normalizedGrantedScopes.includes(scope))

  return {
    grantedScopes: normalizedGrantedScopes,
    missingScopes,
    warning: missingScopes.length
      ? `Shopify connected, but the app is still missing some permissions: ${missingScopes.join(', ')}. Open the latest Shopify app version in Shopify admin, approve the updated permissions, and reconnect if order sync or fulfillment updates are limited.`
      : null,
  }
}

export const getShopifyOAuthConfig = () => {
  const clientId = String(process.env.SHOPIFY_CLIENT_ID || '').trim()
  const clientSecret = String(process.env.SHOPIFY_CLIENT_SECRET || '').trim()
  const apiUrl = String(process.env.API_URL || '').trim().replace(/\/+$/, '')
  const callbackPath = String(
    process.env.SHOPIFY_OAUTH_CALLBACK_PATH || '/api/integrations/shopify/oauth/callback',
  ).trim()
  const redirectUri = String(
    process.env.SHOPIFY_OAUTH_REDIRECT_URI || (apiUrl ? `${apiUrl}${callbackPath}` : ''),
  ).trim()
  const frontendUrl = String(
    process.env.SHOPIFY_OAUTH_SUCCESS_URL ||
      process.env.CLIENT_URL ||
      process.env.FRONTEND_URL ||
      process.env.APP_URL ||
      'http://localhost:5173/channels/connected',
  ).trim()

  const sendScopeValue = String(
    process.env.SHOPIFY_SEND_OAUTH_SCOPE ?? process.env.SHOPIFY_USE_LEGACY_INSTALL_FLOW ?? 'true',
  )
    .trim()
    .toLowerCase()

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: parseShopifyScopes(),
    sendOAuthScope: ['true', '1', 'yes', 'on'].includes(sendScopeValue),
    accessMode: 'offline',
    frontendUrl,
    useExpiringOfflineTokens:
      String(process.env.SHOPIFY_USE_EXPIRING_OFFLINE_TOKENS || 'true').toLowerCase() !== 'false',
    configured: Boolean(clientId && clientSecret && redirectUri),
  }
}

const getShopifyOAuthStateSecret = () => {
  const config = getShopifyOAuthConfig()
  return String(process.env.SHOPIFY_OAUTH_STATE_SECRET || process.env.JWT_SECRET || config.clientSecret || '').trim()
}

const timingSafeEqualString = (left: string, right: string, encoding: BufferEncoding = 'utf8') => {
  const leftBuffer = Buffer.from(left, encoding)
  const rightBuffer = Buffer.from(right, encoding)
  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export const createShopifyOAuthState = ({
  shop,
  userId,
  returnTo,
}: {
  shop: string
  userId: string
  returnTo?: string
}) => {
  const secret = getShopifyOAuthStateSecret()
  if (!secret) throw new Error('SHOPIFY_CLIENT_SECRET or SHOPIFY_OAUTH_STATE_SECRET is not configured')

  const payload: ShopifyOAuthStatePayload = {
    nonce: crypto.randomBytes(16).toString('hex'),
    shop: normalizeShopifyDomain(shop),
    userId,
    returnTo,
    issuedAt: Date.now(),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

export const verifyShopifyOAuthState = (state: string): ShopifyOAuthStatePayload => {
  const secret = getShopifyOAuthStateSecret()
  if (!secret) throw new Error('SHOPIFY_CLIENT_SECRET or SHOPIFY_OAUTH_STATE_SECRET is not configured')

  const [body, signature] = String(state || '').split('.')
  if (!body || !signature) throw new Error('Invalid Shopify OAuth state')

  const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  if (!timingSafeEqualString(expectedSignature, signature)) {
    throw new Error('Invalid Shopify OAuth state signature')
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ShopifyOAuthStatePayload
  const maxAgeMs = Number(process.env.SHOPIFY_OAUTH_STATE_TTL_MS || 10 * 60 * 1000)
  if (!payload?.userId || !payload?.shop || !payload?.issuedAt) {
    throw new Error('Invalid Shopify OAuth state payload')
  }
  if (Date.now() - Number(payload.issuedAt) > maxAgeMs) {
    throw new Error('Shopify OAuth state expired')
  }
  if (!isValidShopifyDomain(payload.shop)) {
    throw new Error('Invalid Shopify shop in OAuth state')
  }

  return payload
}

export const verifyShopifyOAuthQueryHmac = (query: Record<string, any>) => {
  const config = getShopifyOAuthConfig()
  if (!config.clientSecret) throw new Error('SHOPIFY_CLIENT_SECRET is not configured')

  const receivedHmac = String(query?.hmac || '')
  if (!receivedHmac) return false

  const message = Object.keys(query || {})
    .filter((key) => key !== 'hmac' && key !== 'signature')
    .sort()
    .flatMap((key) => {
      const value = query[key]
      if (Array.isArray(value)) return value.map((item) => `${key}=${String(item)}`)
      return [`${key}=${String(value)}`]
    })
    .join('&')
  const digest = crypto.createHmac('sha256', config.clientSecret).update(message).digest('hex')
  return timingSafeEqualString(digest, receivedHmac, 'hex')
}

export const buildShopifyOAuthAuthorizeUrl = ({
  shop,
  userId,
  returnTo,
}: {
  shop: string
  userId: string
  returnTo?: string
}) => {
  const normalizedShop = normalizeShopifyDomain(shop)
  if (!isValidShopifyDomain(normalizedShop)) {
    throw new Error('Enter a valid Shopify myshopify.com store domain')
  }
  if (!userId) throw new Error('User ID is required')

  const config = getShopifyOAuthConfig()
  if (!config.configured) {
    throw new Error('Shopify OAuth is not configured. Set SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, and API_URL.')
  }

  const state = createShopifyOAuthState({ shop: normalizedShop, userId, returnTo })
  const url = new URL(`https://${normalizedShop}/admin/oauth/authorize`)
  url.searchParams.set('client_id', config.clientId)
  if (config.sendOAuthScope) {
    url.searchParams.set('scope', config.scopes.join(','))
  }
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('state', state)
  // Shopify returns an offline access token when grant_options[] is omitted.
  // Shiplifi needs offline access for background order sync, webhooks, and fulfillment updates.
  return {
    authUrl: url.toString(),
    shop: normalizedShop,
    scopes: config.scopes,
    scopeSource: config.sendOAuthScope ? 'oauth_query' : 'shopify_app_config',
    redirectUri: config.redirectUri,
    accessMode: config.accessMode,
  }
}

const exchangeShopifyOAuthCode = async ({
  shop,
  code,
}: {
  shop: string
  code: string
}): Promise<ShopifyAccessTokenResponse> => {
  const config = getShopifyOAuthConfig()
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
  })
  if (config.useExpiringOfflineTokens) {
    params.set('expiring', '1')
  }

  const response = await axios.post<ShopifyAccessTokenResponse>(
    `https://${normalizeShopifyDomain(shop)}/admin/oauth/access_token`,
    params.toString(),
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: SHOPIFY_API_TIMEOUT_MS,
    },
  )
  return response.data
}

export const completeShopifyOAuthInstall = async (query: Record<string, any>) => {
  const shop = normalizeShopifyDomain(String(query?.shop || ''))
  const code = String(query?.code || '')
  const state = String(query?.state || '')

  if (!isValidShopifyDomain(shop)) throw new Error('Invalid Shopify shop domain')
  if (!code) throw new Error('Missing Shopify OAuth code')
  if (!state) throw new Error('Missing Shopify OAuth state')
  if (!verifyShopifyOAuthQueryHmac(query)) throw new Error('Invalid Shopify OAuth HMAC')

  const statePayload = verifyShopifyOAuthState(state)
  if (statePayload.shop !== shop) {
    throw new Error('Shopify OAuth state shop does not match callback shop')
  }

  const config = getShopifyOAuthConfig()
  const tokenResponse = await exchangeShopifyOAuthCode({ shop, code })
  const accessToken = String(tokenResponse.access_token || '').trim()
  if (!accessToken) throw new Error('Shopify did not return an Admin API access token')
  const scopeStatus = getShopifyOAuthScopeStatus(tokenResponse.scope, config.scopes)
  if (!scopeStatus.grantedScopes.length || scopeStatus.missingScopes.length) {
    console.warn('Shopify OAuth scope validation warning', {
      shop,
      requiredScopes: config.scopes,
      grantedScopes: scopeStatus.grantedScopes,
      missingScopes: scopeStatus.missingScopes,
      scopeResponse: tokenResponse.scope || null,
    })
  }
  const refreshToken = String(tokenResponse.refresh_token || '').trim()

  if (config.useExpiringOfflineTokens && !refreshToken) {
    throw new Error('Shopify did not return an offline refresh token. Confirm expiring offline tokens are enabled.')
  }

  const result = await connectShopifyStore({
    storeUrl: shop,
    adminApiAccessToken: accessToken,
    apiKey: config.clientId,
    apiSecretKey: config.clientSecret,
    webhookSecret: config.clientSecret,
    userId: statePayload.userId,
    authMethod: 'oauth',
    oauth: {
      scope: scopeStatus.grantedScopes.join(','),
      missingScopes: scopeStatus.missingScopes,
      tokenType: config.useExpiringOfflineTokens ? 'expiring_offline' : 'offline',
      expiresIn: tokenResponse.expires_in,
      expiresAt: toFutureIso(tokenResponse.expires_in),
      refreshToken,
      refreshTokenExpiresIn: tokenResponse.refresh_token_expires_in,
      refreshTokenExpiresAt: toFutureIso(tokenResponse.refresh_token_expires_in),
      installedAt: new Date().toISOString(),
    },
  })

  return {
    ...result,
    warning: [result.warning, scopeStatus.warning].filter(Boolean).join(' | ') || null,
    shop,
    userId: statePayload.userId,
    returnTo: statePayload.returnTo,
    scope: scopeStatus.grantedScopes.join(','),
    missingScopes: scopeStatus.missingScopes,
  }
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

const extractShopifySyncTarget = (
  order: any,
): { storeId?: string; shopifyOrderId?: string; isShopifyOrder: boolean } => {
  const localOrderId = String(order?.order_id || '')
  const parsedFromOrderId = parseInternalShopifyOrderId(localOrderId)
  if (parsedFromOrderId.shopifyOrderId) {
    return {
      ...parsedFromOrderId,
      isShopifyOrder: true,
    }
  }

  const providerMeta =
    order?.provider_meta && typeof order.provider_meta === 'object' && !Array.isArray(order.provider_meta)
      ? order.provider_meta
      : {}

  const shopifyOrderId = String(providerMeta.shopify_order_id || '').trim()
  const storeId = String(providerMeta.shopify_store_id || '').trim()
  const integrationType = String(order?.integration_type || providerMeta.source || '')
    .trim()
    .toLowerCase()

  if (shopifyOrderId && (integrationType === 'shopify' || String(providerMeta.source || '').trim() === 'shopify')) {
    return {
      storeId: storeId || undefined,
      shopifyOrderId,
      isShopifyOrder: true,
    }
  }

  return { isShopifyOrder: false }
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

export const getShopifyComplianceWebhookAddress = () => {
  const baseUrl = String(process.env.API_URL || '').trim().replace(/\/+$/, '')
  return baseUrl ? `${baseUrl}${SHOPIFY_COMPLIANCE_WEBHOOK_PATH}` : SHOPIFY_COMPLIANCE_WEBHOOK_PATH
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
  const mutation = `
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
          ownerId: ownerData.shop.id,
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

const getStoreForStatusSync = async (userId: string, storeId?: string, tx: any = db) => {
  const normalizedStoreId = String(storeId || '').trim()
  if (normalizedStoreId) {
    const [store] = await tx
      .select()
      .from(stores)
      .where(and(eq(stores.id, normalizedStoreId), eq(stores.platformId, SHOPIFY_PLATFORM_ID)))
      .limit(1)
    if (store) return store as ShopifyStore
  }

  return getStoreForUser(userId, undefined, tx)
}

const getStoresForUser = async (userId: string, tx: any = db) => {
  const rows = await tx
    .select()
    .from(stores)
    .where(and(eq(stores.userId, userId), eq(stores.platformId, SHOPIFY_PLATFORM_ID)))
  return rows as ShopifyStore[]
}

const getAllShopifyStores = async (tx: any = db) => {
  const rows = await tx.select().from(stores).where(eq(stores.platformId, SHOPIFY_PLATFORM_ID))
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

const toFutureIso = (seconds?: number) => {
  const durationSeconds = Number(seconds)
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return undefined
  return new Date(Date.now() + durationSeconds * 1000).toISOString()
}

const getStoreOAuthMetadata = (store: ShopifyStore): Record<string, any> => {
  const metadata = ((store as any)?.metadata || {}) as Record<string, any>
  return metadata.oauth && typeof metadata.oauth === 'object' ? metadata.oauth : {}
}

const syncStoreOAuthState = (store: ShopifyStore, accessToken: string, metadata: Record<string, any>) => {
  ;(store as any).adminApiAccessToken = accessToken
  ;(store as any).metadata = metadata
}

const getShopifyRefreshLockKey = (store: ShopifyStore) =>
  [String(store.id || '').trim(), normalizeShopifyDomain(store.domain)].filter(Boolean).join(':')

const getStoreById = async (storeId: string, tx: any = db) => {
  const [store] = await tx.select().from(stores).where(eq(stores.id, String(storeId))).limit(1)
  return store as ShopifyStore | undefined
}

const isShopifyTokenExpired = (expiresAt?: unknown, safetyBufferMs = 0) => {
  const expiresAtMs = expiresAt ? new Date(String(expiresAt)).getTime() : 0
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) return false
  return expiresAtMs - Date.now() <= safetyBufferMs
}

const shouldRefreshShopifyToken = (oauth: Record<string, any>) => {
  if (oauth.tokenType !== 'expiring_offline') return false
  if (!String(oauth.refreshToken || '').trim()) return false

  const expiresAtMs = oauth.expiresAt ? new Date(oauth.expiresAt).getTime() : 0
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) return true

  const safetyBufferMs = Number(process.env.SHOPIFY_TOKEN_REFRESH_BUFFER_MS || 5 * 60 * 1000)
  return expiresAtMs - Date.now() <= safetyBufferMs
}

const refreshShopifyOfflineAccessToken = async (
  store: ShopifyStore,
  tx: any = db,
  options: { force?: boolean } = {},
) => {
  const lockKey = getShopifyRefreshLockKey(store)
  const existingRefresh = shopifyTokenRefreshLocks.get(lockKey)
  if (existingRefresh) return existingRefresh

  const refreshPromise = (async () => {
    const config = getShopifyOAuthConfig()
    const latestStore = (await getStoreById(String(store.id), tx)) || store
    const latestMetadata = ((latestStore as any)?.metadata || {}) as Record<string, any>
    const latestOauth = getStoreOAuthMetadata(latestStore)
    const latestAccessToken = String(latestStore.adminApiAccessToken || '').trim()
    const safetyBufferMs = Number(process.env.SHOPIFY_TOKEN_REFRESH_BUFFER_MS || 5 * 60 * 1000)

    if (!options.force && latestAccessToken && !shouldRefreshShopifyToken(latestOauth)) {
      syncStoreOAuthState(store, latestAccessToken, latestMetadata)
      return latestAccessToken
    }

    if (
      options.force &&
      latestAccessToken &&
      latestAccessToken !== String(store.adminApiAccessToken || '').trim() &&
      !isShopifyTokenExpired(latestOauth.expiresAt, safetyBufferMs)
    ) {
      syncStoreOAuthState(store, latestAccessToken, latestMetadata)
      return latestAccessToken
    }

    if (isShopifyTokenExpired(latestOauth.refreshTokenExpiresAt)) {
      throw new Error(`Shopify refresh token expired for ${store.domain}. Reconnect the Shopify store.`)
    }

    const refreshToken = String(latestOauth.refreshToken || '').trim()
    if (!refreshToken) {
      throw new Error(`Shopify refresh token is missing for ${store.domain}. Reconnect the Shopify store.`)
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })

    const response = await axios.post<ShopifyAccessTokenResponse>(
      `https://${normalizeShopifyDomain(latestStore.domain)}/admin/oauth/access_token`,
      params.toString(),
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: SHOPIFY_API_TIMEOUT_MS,
      },
    )

    const accessToken = String(response.data?.access_token || '').trim()
    if (!accessToken) {
      throw new Error(`Shopify refresh did not return an access token for ${store.domain}`)
    }

    const refreshedScopeStatus = response.data?.scope
      ? getShopifyOAuthScopeStatus(response.data.scope, config.scopes)
      : {
          grantedScopes: normalizeScopeList(latestOauth.scope),
          missingScopes: Array.isArray(latestOauth.missingScopes) ? latestOauth.missingScopes : [],
          warning: null,
        }
    const refreshedScopes = refreshedScopeStatus.grantedScopes.join(',')

    if (response.data?.scope && (!refreshedScopeStatus.grantedScopes.length || refreshedScopeStatus.missingScopes.length)) {
      console.warn('Shopify token refresh scope warning', {
        shop: normalizeShopifyDomain(latestStore.domain),
        requiredScopes: config.scopes,
        grantedScopes: refreshedScopeStatus.grantedScopes,
        missingScopes: refreshedScopeStatus.missingScopes,
        scopeResponse: response.data.scope,
      })
    }

    const refreshedOAuth = {
      ...latestOauth,
      tokenType: 'expiring_offline',
      scope: refreshedScopes,
      missingScopes: refreshedScopeStatus.missingScopes,
      expiresIn: response.data?.expires_in,
      expiresAt: toFutureIso(response.data?.expires_in),
      refreshToken: response.data?.refresh_token || refreshToken,
      refreshTokenExpiresIn: response.data?.refresh_token_expires_in,
      refreshTokenExpiresAt:
        toFutureIso(response.data?.refresh_token_expires_in) || latestOauth.refreshTokenExpiresAt,
      refreshedAt: new Date().toISOString(),
    }

    const nextMetadata = {
      ...latestMetadata,
      oauth: refreshedOAuth,
    }

    await tx
      .update(stores)
      .set({
        adminApiAccessToken: accessToken,
        metadata: nextMetadata,
        updatedAt: new Date(),
      })
      .where(eq(stores.id, latestStore.id))

    syncStoreOAuthState(latestStore, accessToken, nextMetadata)
    syncStoreOAuthState(store, accessToken, nextMetadata)

    return accessToken
  })().finally(() => {
    shopifyTokenRefreshLocks.delete(lockKey)
  })

  shopifyTokenRefreshLocks.set(lockKey, refreshPromise)
  return refreshPromise
}

const getShopifyAccessTokenForStore = async (store: ShopifyStore, tx: any = db) => {
  const oauth = getStoreOAuthMetadata(store)
  if (!shouldRefreshShopifyToken(oauth)) {
    const token = String(store.adminApiAccessToken || '').trim()
    if (!token) throw new Error(`Shopify access token is missing for ${store.domain}`)
    return token
  }

  return refreshShopifyOfflineAccessToken(store, tx)
}

const shopifyStoreGraphqlRequest = async <T = any>({
  store,
  query,
  variables,
  timeout,
  tx = db,
}: {
  store: ShopifyStore
  query: string
  variables?: Record<string, any>
  timeout?: number
  tx?: any
}) =>
  {
    const request = async (accessToken: string) =>
      shopifyGraphqlRequest<T>({
        storeUrl: store.domain,
        accessToken,
        query,
        variables,
        timeout,
      })

    try {
      return await request(await getShopifyAccessTokenForStore(store, tx))
    } catch (error: any) {
      const oauth = getStoreOAuthMetadata(store)
      if (error?.statusCode === 401 && String(oauth.refreshToken || '').trim()) {
        return request(await refreshShopifyOfflineAccessToken(store, tx, { force: true }))
      }
      throw error
    }
  }

export const connectShopifyStore = async ({
  storeUrl,
  adminApiAccessToken,
  userId,
  apiKey,
  apiSecretKey,
  webhookSecret,
  settings,
  authMethod,
  oauth,
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
  const normalizedSettings = normalizeShopifySettings(settings)
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
        apiKey: String(apiKey || '').trim() || (authMethod === 'oauth' ? 'shopify_oauth_app' : 'shopify_custom_app'),
        adminApiAccessToken,
        shopifyWebhookSecret: signingSecret || undefined,
        authMethod: authMethod || 'legacy_custom_app',
        oauth: oauth || undefined,
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
        settings: normalizedSettings,
        metadata: {
          ...(existingGlobalStore?.metadata || {}),
          shopifyWebhookSecret: signingSecret || undefined,
          apiSecretKey: apiSecretKey ? 'configured' : undefined,
          authMethod: authMethod || 'legacy_custom_app',
          oauth: oauth || undefined,
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
        settings: normalizedSettings,
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

export const updateShopifyStoreSettingsForUser = async ({
  userId,
  storeId,
  settings,
  tx = db,
}: {
  userId: string
  storeId?: string
  settings: Record<string, any>
  tx?: any
}) => {
  if (!userId) throw new Error('User ID is required')
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('Shopify settings payload is required')
  }

  const store = await getStoreForUser(userId, storeId, tx)
  if (!store) throw new Error('No connected Shopify store found for this user')

  const normalizedSettings = normalizeShopifySettings(settings)

  await tx.update(stores).set({ settings: normalizedSettings, updatedAt: new Date() }).where(eq(stores.id, store.id))

  let warning: string | null = null
  try {
    const accessToken = await getShopifyAccessTokenForStore(store, tx)
    await upsertShopifySettingsMetafield({
      storeUrl: store.domain,
      accessToken,
      settings: normalizedSettings,
      id: store.id,
      tx,
    })
  } catch (err: any) {
    warning = 'Settings saved locally, but Shopify metafield sync failed'
    console.warn('Shopify settings metafield update failed:', err?.response?.data || err?.message || err)
  }

  const [updatedStore] = await tx.select().from(stores).where(eq(stores.id, store.id)).limit(1)
  return { store: updatedStore as ShopifyStore | undefined, warning }
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

const normalizeShopifyFulfillmentStatus = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

const mapShopifyStatus = (order: any): string => {
  if (order?.cancelled_at) return 'cancelled'
  const fulfillmentStatus = normalizeShopifyFulfillmentStatus(order?.fulfillment_status)

  if (!fulfillmentStatus || fulfillmentStatus === 'unfulfilled' || fulfillmentStatus === 'on_hold') {
    return 'pending'
  }

  if (
    ['label_purchased', 'label_printed', 'confirmed', 'open', 'scheduled'].includes(
      fulfillmentStatus,
    )
  ) {
    return 'booked'
  }

  if (
    fulfillmentStatus === 'partial' ||
    fulfillmentStatus === 'partially_fulfilled' ||
    fulfillmentStatus === 'fulfilled' ||
    fulfillmentStatus === 'fulfilled_status' ||
    fulfillmentStatus === 'ready_for_pickup' ||
    fulfillmentStatus === 'shipment_created'
  ) {
    return 'in_transit'
  }

  if (fulfillmentStatus === 'in_transit') return 'in_transit'
  if (fulfillmentStatus === 'out_for_delivery') return 'out_for_delivery'
  if (fulfillmentStatus === 'delivered') return 'delivered'

  if (
    fulfillmentStatus === 'attempted_delivery' ||
    fulfillmentStatus === 'delivery_attempted' ||
    fulfillmentStatus === 'failure'
  ) {
    return 'ndr'
  }

  if (fulfillmentStatus.includes('delivered')) return 'delivered'
  if (fulfillmentStatus.includes('transit')) return 'in_transit'
  if (fulfillmentStatus.includes('attempt') || fulfillmentStatus.includes('fail')) return 'ndr'
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
  shipment_created: 1,
  pickup_initiated: 1,
  pickup_scheduled: 1,
  in_transit: 2,
  out_for_delivery: 3,
  ndr: 3,
  undelivered: 3,
  delivery_attempted: 3,
  rto: 3,
  rto_in_transit: 3,
  delivered: 4,
  rto_delivered: 4,
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
    const originalPrice = toNumber(item?.original_price ?? item?.price, 0)
    const discountedUnitPrice = toNumber(
      item?.discounted_unit_price_after_all_discounts ?? item?.discounted_price ?? item?.final_price,
      originalPrice,
    )
    const explicitDiscount = Array.isArray(item?.discount_allocations)
      ? item.discount_allocations.reduce((sum: number, d: any) => sum + toNumber(d?.amount, 0), 0)
      : 0
    const inferredDiscount = Math.max(0, originalPrice * qty - discountedUnitPrice * qty)
    const discount = explicitDiscount > 0 ? explicitDiscount : inferredDiscount
    const lineTaxRate = Array.isArray(item?.tax_lines)
      ? item.tax_lines.reduce((sum: number, t: any) => sum + toNumber(t?.rate, 0), 0) * 100
      : 0
    return {
      name: item?.name || item?.title || 'Item',
      sku: item?.sku || 'NA',
      qty,
      price: originalPrice,
      original_price: originalPrice,
      net_price: discountedUnitPrice,
      display_price: discountedUnitPrice,
      discounted_price: discountedUnitPrice,
      discount,
      tax_rate: lineTaxRate,
      hsn: '',
    }
  })
}

const buildShopifyFinancialSignature = ({
  orderAmount,
  shippingCharges,
  discount,
  products,
}: {
  orderAmount: number
  shippingCharges: number
  discount: number
  products: any[]
}) =>
  JSON.stringify({
    orderAmount: Number(orderAmount || 0).toFixed(2),
    shippingCharges: Number(shippingCharges || 0).toFixed(2),
    discount: Number(discount || 0).toFixed(2),
    products: products.map((product) => ({
      sku: String(product?.sku || ''),
      qty: Number(product?.qty || 0),
      price: Number(product?.price || 0).toFixed(2),
      netPrice: Number(product?.net_price ?? product?.display_price ?? product?.discounted_price ?? 0).toFixed(2),
      discount: Number(product?.discount || 0).toFixed(2),
    })),
  })

const toPhone = (order: any): string => {
  const phone =
    order?.phone ||
    order?.shipping_address?.phone ||
    order?.billing_address?.phone ||
    order?.customer?.phone ||
    ''
  const clean = normalizeIndianPhoneForBooking(phone)
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

const isShopifyCustomerDataAccessError = (error: any) =>
  /not approved to access the customer object|personally identifiable information|protected customer data/i.test(
    String(error?.message || error || ''),
  )

const normalizeGraphqlOrder = (
  node: any,
  options: { piiAccessRestricted?: boolean } = {},
) => {
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
    email: node?.email || '',
    phone: node?.phone || '',
    financial_status: String(node?.displayFinancialStatus || '').toLowerCase(),
    fulfillment_status: String(node?.displayFulfillmentStatus || '').toLowerCase(),
    payment_gateway_names: node?.paymentGatewayNames || [],
    tags,
    total_price: moneyAmount(node?.currentTotalPriceSet ?? node?.totalPriceSet),
    total_discounts: moneyAmount(node?.currentTotalDiscountsSet ?? node?.totalDiscountsSet),
    shopify_pii_restricted: options.piiAccessRestricted === true,
    shipping_lines: [
      {
        price: moneyAmount(node?.currentShippingPriceSet ?? node?.totalShippingPriceSet),
      },
    ],
    shipping_address: mapAddressFromGraphql(node?.shippingAddress),
    billing_address: mapAddressFromGraphql(node?.billingAddress),
    customer: null,
    line_items: lineItems.map((item: any) => ({
      id: extractLegacyId(item?.id),
      name: item?.name || item?.title,
      title: item?.title || item?.name,
      sku: item?.sku,
      quantity: item?.quantity,
      price: moneyAmount(item?.originalUnitPriceSet),
      original_price: moneyAmount(item?.originalUnitPriceSet),
      net_price: moneyAmount(item?.discountedUnitPriceAfterAllDiscountsSet ?? item?.originalUnitPriceSet),
      display_price: moneyAmount(item?.discountedUnitPriceAfterAllDiscountsSet ?? item?.originalUnitPriceSet),
      discounted_price: moneyAmount(item?.discountedUnitPriceAfterAllDiscountsSet ?? item?.originalUnitPriceSet),
      discounted_unit_price_after_all_discounts: moneyAmount(
        item?.discountedUnitPriceAfterAllDiscountsSet ?? item?.originalUnitPriceSet,
      ),
      grams: Math.round(toNumber(node?.totalWeight, 0) / Math.max(1, totalQuantity)),
      discount_allocations: [
        {
          amount: Math.max(
            moneyAmount(item?.totalDiscountSet),
            moneyAmount(item?.originalUnitPriceSet) * Math.max(1, toNumber(item?.quantity, 1)) -
              moneyAmount(item?.discountedUnitPriceAfterAllDiscountsSet ?? item?.originalUnitPriceSet) *
                Math.max(1, toNumber(item?.quantity, 1)),
          ),
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

const appendOrderNumberSuffix = (base: string, suffix: string) => {
  const cleanBase = String(base || '').trim() || 'SHOPIFY'
  const cleanSuffix = String(suffix || '').replace(/[^a-zA-Z0-9-]/g, '').slice(-16)
  const ending = cleanSuffix ? `-${cleanSuffix}` : ''
  return `${cleanBase.slice(0, Math.max(1, 50 - ending.length))}${ending}`.slice(0, 50)
}

const resolveShopifyOrderNumber = async ({
  tx,
  userId,
  baseOrderNumber,
  storeId,
  shopifyOrderId,
  internalOrderId,
  legacyInternalOrderId,
  targetId,
}: {
  tx: any
  userId: string
  baseOrderNumber: string
  storeId: string
  shopifyOrderId: string
  internalOrderId: string
  legacyInternalOrderId: string
  targetId?: string | null
}) => {
  const base = String(baseOrderNumber || '').trim().slice(0, 50) || shopifyOrderId.slice(-12)
  const suffixBase = `${String(storeId || '').slice(-4)}${String(shopifyOrderId || '').slice(-6)}`
  const candidates = [
    base,
    appendOrderNumberSuffix(base, suffixBase),
    appendOrderNumberSuffix(base, String(shopifyOrderId || '').slice(-10)),
  ]

  for (let attempt = 2; attempt <= 20; attempt += 1) {
    candidates.push(appendOrderNumberSuffix(base, `${suffixBase}-${attempt}`))
  }

  for (const candidate of candidates) {
    const [conflict] = await tx
      .select({ id: b2c_orders.id, order_id: b2c_orders.order_id })
      .from(b2c_orders)
      .where(and(eq(b2c_orders.user_id, userId), eq(b2c_orders.order_number, candidate)))
      .limit(1)

    if (!conflict) return candidate
    if (targetId && conflict.id === targetId) return candidate
    if ([internalOrderId, legacyInternalOrderId].includes(String(conflict.order_id || ''))) {
      return candidate
    }
  }

  return appendOrderNumberSuffix(base, `${suffixBase}-${Date.now().toString(36).slice(-4)}`)
}

const isSameShopifyOrderRow = (
  row: { order_id?: string | null; provider_meta?: any } | undefined,
  {
    storeId,
    shopifyOrderId,
    internalOrderId,
    legacyInternalOrderId,
  }: {
    storeId: string
    shopifyOrderId: string
    internalOrderId: string
    legacyInternalOrderId: string
  },
) => {
  if (!row) return false

  const orderId = String(row.order_id || '')
  if ([internalOrderId, legacyInternalOrderId].includes(orderId)) return true

  const providerMeta = row.provider_meta && typeof row.provider_meta === 'object' ? row.provider_meta : {}
  return (
    String(providerMeta.source || '').toLowerCase() === 'shopify' &&
    String(providerMeta.shopify_store_id || '') === String(storeId) &&
    String(providerMeta.shopify_order_id || '') === String(shopifyOrderId)
  )
}

const canAttachShopifyToExistingOrderNumber = (
  row: {
    order_id?: string | null
    order_status?: string | null
    awb_number?: string | null
    integration_type?: string | null
    provider_meta?: any
  } | undefined,
) => {
  if (!row) return false

  const providerMeta = row.provider_meta && typeof row.provider_meta === 'object' ? row.provider_meta : {}
  const existingSource = String(providerMeta.source || '').toLowerCase()
  const existingOrderId = String(row.order_id || '').trim().toLowerCase()
  const existingStatus = String(row.order_status || '').trim().toLowerCase()

  if (existingSource === 'shopify' || String(row.integration_type || '').trim().toLowerCase() === 'shopify') {
    return false
  }
  if (String(row.awb_number || '').trim()) return false
  if (existingOrderId.startsWith('shopify_')) return false
  if (['shipment_created', 'booked', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled'].includes(existingStatus)) {
    return false
  }

  return true
}

const SHOPIFY_ORDERS_QUERY = `
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
            }
          }
        }
      }
    }
  }
`

const SHOPIFY_ORDERS_RESTRICTED_QUERY = `
  query ShiplifiOrdersRestricted($first: Int!) {
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
            }
          }
        }
      }
    }
  }
`

const fetchShopifyOrders = async (store: ShopifyStore, limit = 50) => {
  const clampedLimit = Math.min(Math.max(limit, 1), 250)
  let piiAccessRestricted = false
  let data: { orders: { edges: Array<{ node: any }> } }

  try {
    data = await shopifyStoreGraphqlRequest<{
      orders: { edges: Array<{ node: any }> }
    }>({
      store,
      query: SHOPIFY_ORDERS_QUERY,
      variables: { first: clampedLimit },
      timeout: 30000,
    })
  } catch (error: any) {
    if (!isShopifyCustomerDataAccessError(error)) throw error

    piiAccessRestricted = true
    console.warn('[Shopify] Customer data access restricted; syncing non-PII order fields only', {
      storeId: store.id,
      domain: store.domain,
    })
    data = await shopifyStoreGraphqlRequest<{
      orders: { edges: Array<{ node: any }> }
    }>({
      store,
      query: SHOPIFY_ORDERS_RESTRICTED_QUERY,
      variables: { first: clampedLimit },
      timeout: 30000,
    })
  }

  return (data?.orders?.edges || []).map((edge) =>
    normalizeGraphqlOrder(edge.node, { piiAccessRestricted }),
  )
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
  const discountAmount = toNumber(order?.total_discounts, 0)
  const shopifyFinancialSignature = buildShopifyFinancialSignature({
    orderAmount,
    shippingCharges,
    discount: discountAmount,
    products,
  })
  const orderName = String(order?.name || order?.order_number || shopifyOrderId).trim()
  const piiAccessRestricted = order?.shopify_pii_restricted === true
  const existingTags = String(order?.tags || '').trim()
  const syncTags = existingTags || `shopify_store:${store.id}`
  const providerMeta = {
    source: 'shopify',
    shopify_store_id: String(store.id),
    shopify_order_id: shopifyOrderId,
    shopify_financial_signature: shopifyFinancialSignature,
    shopify_pii_restricted: piiAccessRestricted,
    customer_data_note: piiAccessRestricted
      ? 'Shopify did not grant this app access to customer PII; buyer address and phone were not available during sync.'
      : undefined,
  }

  const [existing] = await tx
    .select({
      id: b2c_orders.id,
      order_number: b2c_orders.order_number,
      order_status: b2c_orders.order_status,
      awb_number: b2c_orders.awb_number,
      courier_partner: b2c_orders.courier_partner,
      integration_type: b2c_orders.integration_type,
      provider_meta: b2c_orders.provider_meta,
      provider_service: b2c_orders.provider_service,
    })
    .from(b2c_orders)
    .where(eq(b2c_orders.order_id, internalOrderId))
    .limit(1)

  const [legacyExisting] = existing
    ? [undefined]
    : await tx
        .select({
          id: b2c_orders.id,
          order_number: b2c_orders.order_number,
          order_status: b2c_orders.order_status,
          awb_number: b2c_orders.awb_number,
          courier_partner: b2c_orders.courier_partner,
          integration_type: b2c_orders.integration_type,
          provider_meta: b2c_orders.provider_meta,
          provider_service: b2c_orders.provider_service,
        })
        .from(b2c_orders)
        .where(eq(b2c_orders.order_id, legacyInternalOrderId))
        .limit(1)

  const targetOrder = (existing || legacyExisting || null) as ExistingShopifyOrderRow | null
  const targetId = targetOrder?.id || null
  const resolvedOrderNumber = targetId
    ? String(existing?.order_number || legacyExisting?.order_number || orderName).slice(0, 50)
    : await resolveShopifyOrderNumber({
        tx,
        userId: store.userId,
        baseOrderNumber: orderName,
        storeId: String(store.id),
        shopifyOrderId,
        internalOrderId,
        legacyInternalOrderId,
      })

  const updatePayload: Partial<typeof b2c_orders.$inferInsert> = {
    user_id: store.userId,
    order_number: resolvedOrderNumber,
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
    discount: discountAmount,
    order_status: mappedStatus,
    courier_partner: 'Shopify',
    provider_meta: providerMeta,
    integration_type: 'shopify',
    is_external_api: false,
    tags: syncTags.slice(0, 200),
    updated_at: new Date(),
  }

  const buildBookedUpdatePayload = (
    row: ExistingShopifyOrderRow | null | undefined,
    payload: Partial<typeof b2c_orders.$inferInsert> = updatePayload,
  ) => {
    if (!row?.awb_number) return payload

    const existingProviderMeta =
      row.provider_meta && typeof row.provider_meta === 'object' && !Array.isArray(row.provider_meta)
        ? row.provider_meta
        : {}
    const existingFinancialSignature = String(
      existingProviderMeta.shopify_financial_signature || '',
    ).trim()
    const shouldInvalidateStaleLabel =
      !existingFinancialSignature || existingFinancialSignature !== shopifyFinancialSignature
    const providerMetaCourierName = getProviderMetaCourierName(existingProviderMeta)
    const bookedProviderKey = resolveCourierProviderKeyFromFields(
      row.integration_type,
      row.courier_partner,
      providerMetaCourierName,
      row.provider_service,
    )

    return {
      ...payload,
      order_status:
        String(payload.order_status || '').toLowerCase() === 'cancelled'
          ? payload.order_status
          : row.order_status || payload.order_status,
      courier_partner:
        providerMetaCourierName ||
        (bookedProviderKey ? getCourierProviderDisplayName(bookedProviderKey) : '') ||
        row.courier_partner ||
        payload.courier_partner,
      integration_type: bookedProviderKey || row.integration_type || payload.integration_type,
      provider_meta: {
        ...existingProviderMeta,
        ...providerMeta,
      },
      ...(shouldInvalidateStaleLabel ? { label: null } : {}),
    }
  }

  if (targetOrder?.id) {
    await tx
      .update(b2c_orders)
      .set({ ...buildBookedUpdatePayload(targetOrder), order_id: internalOrderId })
      .where(eq(b2c_orders.id, targetOrder.id))
    return 'updated' as const
  }

  const updateExistingOrder = async (
    row: ExistingShopifyOrderRow,
    payload: Partial<typeof b2c_orders.$inferInsert> = updatePayload,
  ) => {
    await tx
      .update(b2c_orders)
      .set({ ...buildBookedUpdatePayload(row, payload), order_id: internalOrderId })
      .where(eq(b2c_orders.id, row.id))
    return 'updated' as const
  }

  const tryInsertOrder = async (payload: Partial<typeof b2c_orders.$inferInsert>) => {
    const [inserted] = await tx
      .insert(b2c_orders)
      .values({
        ...payload,
        created_at: new Date(),
      } as any)
      .onConflictDoNothing()
      .returning({ id: b2c_orders.id })

    return inserted?.id ? 'created' as const : null
  }

  const inserted = await tryInsertOrder(updatePayload)
  if (inserted) return inserted

  const [postInsertOrderIdConflict] = await tx
    .select({
      id: b2c_orders.id,
      order_id: b2c_orders.order_id,
      order_status: b2c_orders.order_status,
      awb_number: b2c_orders.awb_number,
      courier_partner: b2c_orders.courier_partner,
      integration_type: b2c_orders.integration_type,
      provider_meta: b2c_orders.provider_meta,
      provider_service: b2c_orders.provider_service,
    })
    .from(b2c_orders)
    .where(eq(b2c_orders.order_id, internalOrderId))
    .limit(1)

  if (
    isSameShopifyOrderRow(postInsertOrderIdConflict, {
      storeId: String(store.id),
      shopifyOrderId,
      internalOrderId,
      legacyInternalOrderId,
    })
  ) {
    return updateExistingOrder(postInsertOrderIdConflict)
  }

  const [orderNumberConflict] = await tx
    .select({
      id: b2c_orders.id,
      order_id: b2c_orders.order_id,
      order_status: b2c_orders.order_status,
      awb_number: b2c_orders.awb_number,
      courier_partner: b2c_orders.courier_partner,
      integration_type: b2c_orders.integration_type,
      provider_meta: b2c_orders.provider_meta,
      provider_service: b2c_orders.provider_service,
    })
    .from(b2c_orders)
    .where(and(eq(b2c_orders.user_id, store.userId), eq(b2c_orders.order_number, resolvedOrderNumber)))
    .limit(1)

  if (
    isSameShopifyOrderRow(orderNumberConflict, {
      storeId: String(store.id),
      shopifyOrderId,
      internalOrderId,
      legacyInternalOrderId,
    })
  ) {
    return updateExistingOrder(orderNumberConflict)
  }

  if (canAttachShopifyToExistingOrderNumber(orderNumberConflict)) {
    return updateExistingOrder(orderNumberConflict, {
      ...updatePayload,
      order_number: resolvedOrderNumber,
    })
  }

  const fallbackOrderNumber = await resolveShopifyOrderNumber({
    tx,
    userId: store.userId,
    baseOrderNumber: appendOrderNumberSuffix(
      orderName,
      `${String(store.id || '').slice(-4)}${String(shopifyOrderId || '').slice(-6)}-${Date.now().toString(36).slice(-4)}`,
    ),
    storeId: String(store.id),
    shopifyOrderId,
    internalOrderId,
    legacyInternalOrderId,
  })
  const fallbackPayload = { ...updatePayload, order_number: fallbackOrderNumber }
  const fallbackInserted = await tryInsertOrder(fallbackPayload)
  if (fallbackInserted) return fallbackInserted

  const [fallbackConflict] = await tx
    .select({
      id: b2c_orders.id,
      order_id: b2c_orders.order_id,
      order_status: b2c_orders.order_status,
      awb_number: b2c_orders.awb_number,
      courier_partner: b2c_orders.courier_partner,
      integration_type: b2c_orders.integration_type,
      provider_meta: b2c_orders.provider_meta,
      provider_service: b2c_orders.provider_service,
    })
    .from(b2c_orders)
    .where(and(eq(b2c_orders.user_id, store.userId), eq(b2c_orders.order_number, fallbackOrderNumber)))
    .limit(1)

  if (
    isSameShopifyOrderRow(fallbackConflict, {
      storeId: String(store.id),
      shopifyOrderId,
      internalOrderId,
      legacyInternalOrderId,
    })
  ) {
    return updateExistingOrder(fallbackConflict, fallbackPayload)
  }

  const lastChancePayload = {
    ...fallbackPayload,
    order_number: appendOrderNumberSuffix(
      orderName,
      `${String(store.id || '').slice(-4)}${String(shopifyOrderId || '').slice(-6)}-${Date.now().toString(36)}`,
    ),
  }
  const lastChanceInserted = await tryInsertOrder(lastChancePayload)
  if (lastChanceInserted) return lastChanceInserted

  throw new Error(`Could not reserve a unique Shopify order number for order ${shopifyOrderId}`)
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
    const settings = normalizeShopifySettings((store as any)?.settings || {})
    for (const order of orders) {
      const state = await upsertFromShopifyOrder(store as ShopifyStore, order, settings, tx)
      result[state] += 1
    }
  }

  return result
}

export const syncShopifyOrdersForAllStores = async (
  limit = Number(process.env.SHOPIFY_ORDER_SYNC_LIMIT || 100),
  tx: any = db,
) => {
  const storesToSync = await getAllShopifyStores(tx)
  const clampedLimit = Math.min(Math.max(Number(limit) || 100, 1), 250)
  const summary = {
    stores: storesToSync.length,
    created: 0,
    updated: 0,
    skipped: 0,
    failedStores: 0,
  }

  for (const store of storesToSync) {
    try {
      const result = await syncShopifyOrdersForUser(store.userId, clampedLimit, store.id, tx)
      summary.created += result.created
      summary.updated += result.updated
      summary.skipped += result.skipped
    } catch (err: any) {
      summary.failedStores += 1
      console.warn('[Shopify] Store sync failed during global refresh', {
        storeId: store.id,
        userId: store.userId,
        domain: store.domain,
        message: err?.message || err,
      })
    }
  }

  return summary
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
    process.env.SHOPIFY_CLIENT_SECRET,
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
    const fallbackSecret = String(
      process.env.SHOPIFY_CLIENT_SECRET || configured.webhookSecret || '',
    ).trim()
    if (fallbackSecret) {
      return verifyShopifyWebhookSignatureWithSecret(rawBody, receivedHmac, fallbackSecret)
    }
    return false
  }
  const secret = getStoreWebhookSecret(store)
  if (!secret) return false
  return verifyShopifyWebhookSignatureWithSecret(rawBody, receivedHmac, secret)
}

const buildShopifyOrderIdsForPayload = (store: ShopifyStore, orderIds: unknown[] = []) =>
  orderIds
    .map((orderId) => String(orderId || '').trim())
    .filter(Boolean)
    .flatMap((orderId) => [buildInternalOrderId(String(store.id), orderId), `shopify_${orderId}`])

const redactShopifyOrderCustomerData = async ({
  store,
  payload,
  scope,
  tx = db,
}: {
  store: ShopifyStore
  payload?: any
  scope: 'customer' | 'shop'
  tx?: any
}) => {
  const redactedAt = new Date()
  const ordersToRedact = Array.isArray(payload?.orders_to_redact)
    ? payload.orders_to_redact
    : Array.isArray(payload?.orders_requested)
      ? payload.orders_requested
      : []
  const orderIds = buildShopifyOrderIdsForPayload(store, ordersToRedact)
  const customerEmail = String(payload?.customer?.email || '').trim().toLowerCase()
  const customerPhone = normalizeIndianPhoneForBooking(payload?.customer?.phone)

  const redactedFields = {
    buyer_name: 'Redacted Shopify customer',
    buyer_phone: '',
    buyer_email: null,
    address: 'Redacted by Shopify privacy request',
    city: 'Redacted',
    state: 'Redacted',
    pincode: '000000',
    tags: scope === 'shop' ? 'shopify,privacy_redacted,shop_redacted' : 'shopify,privacy_redacted',
    updated_at: redactedAt,
  }

  if (orderIds.length > 0) {
    await tx.update(b2c_orders).set(redactedFields).where(inArray(b2c_orders.order_id, orderIds))
  }

  if (scope === 'shop') {
    await tx
      .update(b2c_orders)
      .set(redactedFields)
      .where(sql`${b2c_orders.order_id} LIKE ${`shopify_${store.id}_%`}`)
    return
  }

  if (customerEmail || customerPhone) {
    await tx
      .update(b2c_orders)
      .set(redactedFields)
      .where(sql`
        ${b2c_orders.order_id} LIKE ${`shopify_${store.id}_%`}
        AND (
          ${customerEmail ? sql`lower(coalesce(${b2c_orders.buyer_email}, '')) = ${customerEmail}` : sql`false`}
          OR ${customerPhone ? sql`coalesce(${b2c_orders.buyer_phone}, '') = ${customerPhone}` : sql`false`}
        )
      `)
  }
}

const getShopifyDataRequestSummary = async ({
  store,
  payload,
  tx = db,
}: {
  store: ShopifyStore
  payload?: any
  tx?: any
}) => {
  const requestedOrderIds = Array.isArray(payload?.orders_requested) ? payload.orders_requested : []
  const orderIds = buildShopifyOrderIdsForPayload(store, requestedOrderIds)
  const customerEmail = String(payload?.customer?.email || '').trim().toLowerCase()
  const customerPhone = normalizeIndianPhoneForBooking(payload?.customer?.phone)

  if (!orderIds.length && !customerEmail && !customerPhone) {
    return { matchingOrders: 0, requestedOrders: requestedOrderIds.length }
  }

  const rows = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(b2c_orders)
    .where(sql`
      ${b2c_orders.order_id} LIKE ${`shopify_${store.id}_%`}
      AND (
        ${orderIds.length ? sql`${b2c_orders.order_id} IN (${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)})` : sql`false`}
        OR ${customerEmail ? sql`lower(coalesce(${b2c_orders.buyer_email}, '')) = ${customerEmail}` : sql`false`}
        OR ${customerPhone ? sql`coalesce(${b2c_orders.buyer_phone}, '') = ${customerPhone}` : sql`false`}
      )
    `)

  return {
    matchingOrders: Number(rows?.[0]?.count || 0),
    requestedOrders: requestedOrderIds.length,
  }
}

export const processShopifyComplianceWebhook = async (
  shopDomain: string,
  topic: string,
  payload: any,
  tx: any = db,
) => {
  const normalizedTopic = String(topic || '').toLowerCase()
  if (!SHOPIFY_COMPLIANCE_TOPICS.includes(normalizedTopic as any)) {
    return { success: true, action: 'ignored_topic' }
  }

  const store = await getStoreByDomain(shopDomain, tx)
  if (!store) {
    return { success: true, action: 'store_not_found', shopDomain: normalizeShopifyDomain(shopDomain) }
  }

  if (normalizedTopic === 'customers/data_request') {
    const summary = await getShopifyDataRequestSummary({ store, payload, tx })
    console.log('Shopify customer data request received', {
      shopDomain: normalizeShopifyDomain(shopDomain),
      storeId: store.id,
      dataRequestId: payload?.data_request?.id,
      customerId: payload?.customer?.id,
      ...summary,
    })
    return { success: true, action: 'data_request_logged', ...summary }
  }

  if (normalizedTopic === 'customers/redact') {
    await redactShopifyOrderCustomerData({ store, payload, scope: 'customer', tx })
    return { success: true, action: 'customer_data_redacted' }
  }

  if (normalizedTopic === 'shop/redact') {
    await deleteSalesChannelOrdersForStore(
      {
        id: String(store.id),
        userId: String(store.userId),
        platformId: SHOPIFY_PLATFORM_ID,
      },
      tx,
    )
    await setUserChannelIntegration(store.userId, SHOPIFY_PLATFORM_ID, false, tx)
    await tx.delete(stores).where(eq(stores.id, store.id))
    return { success: true, action: 'shop_data_deleted' }
  }

  return { success: true, action: 'ignored_topic' }
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
  const settings = normalizeShopifySettings((store as any)?.settings || {})
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
  const data = await shopifyStoreGraphqlRequest<{
    order: {
      id: string
      tags: string[]
      cancelledAt?: string | null
      displayFulfillmentStatus?: string
      canMarkAsPaid?: boolean
      fulfillmentOrders: {
        nodes: Array<{ id: string; status: string; requestStatus?: string }>
      }
      fulfillments: Array<{
        id: string
        status?: string
        trackingInfo?: Array<{ company?: string | null; number?: string | null; url?: string | null }>
      }>
    } | null
  }>({
    store,
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
          fulfillments(first: 20) {
            id
            status
            trackingInfo(first: 10) {
              company
              number
              url
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
      company: String(courierPartner || 'Shiplifi').slice(0, 255),
      url: buildTrackingUrl(trackingNumber),
    }
  }

  const data = await shopifyStoreGraphqlRequest<{
    fulfillmentCreate: { userErrors: Array<{ field?: string[]; message: string }> }
  }>({
    store,
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
  return data?.fulfillmentCreate
}

const buildTrackingUrl = (trackingNumber: string) => {
  const awb = String(trackingNumber || '').trim()
  if (!awb) return undefined

  const frontendUrl = String(
    process.env.FRONTEND_URL ||
      process.env.CLIENT_URL ||
      process.env.APP_URL ||
      'https://client.fgship.in',
  )
    .trim()
    .replace(/\/+$/, '')

  return `${frontendUrl}/tracking?awb=${encodeURIComponent(awb)}`
}

const updateShopifyFulfillmentTracking = async ({
  store,
  fulfillmentId,
  trackingNumber,
  courierPartner,
  notifyCustomer,
}: {
  store: ShopifyStore
  fulfillmentId: string
  trackingNumber: string
  courierPartner?: string
  notifyCustomer: boolean
}) => {
  const data = await shopifyStoreGraphqlRequest<{
    fulfillmentTrackingInfoUpdate: { userErrors: Array<{ field?: string[]; message: string }> }
  }>({
    store,
    query: `
      mutation ShiplifiFulfillmentTrackingUpdate(
        $fulfillmentId: ID!,
        $trackingInfoInput: FulfillmentTrackingInput!,
        $notifyCustomer: Boolean
      ) {
        fulfillmentTrackingInfoUpdate(
          fulfillmentId: $fulfillmentId,
          trackingInfoInput: $trackingInfoInput,
          notifyCustomer: $notifyCustomer
        ) {
          fulfillment { id status }
          userErrors { field message }
        }
      }
    `,
    variables: {
      fulfillmentId,
      notifyCustomer,
      trackingInfoInput: {
        number: trackingNumber,
        company: String(courierPartner || 'Shiplifi').slice(0, 255),
        url: buildTrackingUrl(trackingNumber),
      },
    },
  })

  assertNoUserErrors(
    'Shopify fulfillmentTrackingInfoUpdate failed',
    data?.fulfillmentTrackingInfoUpdate?.userErrors,
  )
  return data?.fulfillmentTrackingInfoUpdate
}

const updateShopifyOrderTags = async (store: ShopifyStore, shopifyOrderId: string, tags: string[]) => {
  const data = await shopifyStoreGraphqlRequest<{
    orderUpdate: { userErrors: Array<{ field?: string[]; message: string }> }
  }>({
    store,
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
  const data = await shopifyStoreGraphqlRequest<{
    orderCancel: {
      orderCancelUserErrors?: Array<{ field?: string[]; message: string }>
      userErrors?: Array<{ field?: string[]; message: string }>
    }
  }>({
    store,
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
      staffNote: 'Cancelled from Shiplifi shipment status sync.',
    },
  })

  assertNoUserErrors(
    'Shopify orderCancel failed',
    data?.orderCancel?.orderCancelUserErrors || data?.orderCancel?.userErrors,
  )
}

const markShopifyOrderAsPaid = async (store: ShopifyStore, shopifyOrderId: string) => {
  const data = await shopifyStoreGraphqlRequest<{
    orderMarkAsPaid: { userErrors: Array<{ field?: string[]; message: string }> }
  }>({
    store,
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

export const syncShopifyStatusForLocalOrder = async (
  order: any,
  tx: any = db,
  options: { source?: string } = {},
) => {
  const syncTarget = extractShopifySyncTarget(order)
  if (!syncTarget.isShopifyOrder) {
    return { attempted: false, success: true, channel: 'shopify', reason: 'not_a_shopify_order' }
  }

  const shopifyOrderId = syncTarget.shopifyOrderId || ''
  if (!shopifyOrderId) {
    return { attempted: false, success: false, channel: 'shopify', reason: 'missing_shopify_order_id' }
  }

  const store = await getStoreForStatusSync(order.user_id, syncTarget.storeId, tx)
  if (!store) {
    await recordSalesChannelSyncOutcome(
      order,
      {
        channel: 'shopify',
        status: 'failed',
        source: options.source,
        reason: 'store_not_found',
      },
      tx,
    )
    return { attempted: false, success: false, channel: 'shopify', reason: 'store_not_found' }
  }

  const settings = normalizeShopifySettings((store as any)?.settings || {})
  const orderStatus = String(order?.order_status || '').toLowerCase()
  const trackingNumber = String(order?.awb_number || '').trim()
  const actions: string[] = []

  try {
    const remoteOrder = await getShopifyOrderForStatusSync(store, shopifyOrderId)
    if (!remoteOrder) {
      await recordSalesChannelSyncOutcome(
        order,
        {
          channel: 'shopify',
          status: 'failed',
          source: options.source,
          reason: 'remote_order_not_found',
        },
        tx,
      )
      return { attempted: true, success: false, channel: 'shopify', reason: 'remote_order_not_found' }
    }

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
          trackingNumber,
          courierPartner: order?.courier_partner,
          notifyCustomer: shouldNotifyCustomerOnFulfill(settings),
        })
        actions.push('fulfillment_created')
      } else if (trackingNumber) {
        const fulfillments = Array.isArray(remoteOrder.fulfillments) ? remoteOrder.fulfillments : []
        const fulfillmentWithCurrentTracking = fulfillments.find((fulfillment: any) =>
          (fulfillment?.trackingInfo || []).some(
            (tracking: any) => String(tracking?.number || '').trim() === trackingNumber,
          ),
        )
        const targetFulfillment =
          fulfillmentWithCurrentTracking ||
          fulfillments.find((fulfillment: any) =>
            ['SUCCESS', 'OPEN', 'PENDING'].includes(String(fulfillment?.status || '').toUpperCase()),
          ) ||
          fulfillments[0]

        if (fulfillmentWithCurrentTracking) {
          actions.push('tracking_already_current')
        } else if (targetFulfillment?.id) {
          await updateShopifyFulfillmentTracking({
            store,
            fulfillmentId: targetFulfillment.id,
            trackingNumber,
            courierPartner: order?.courier_partner,
            notifyCustomer: shouldNotifyCustomerOnFulfill(settings),
          })
          actions.push('tracking_updated')
        } else {
          actions.push(isAlreadyFulfilled ? 'already_fulfilled_no_tracking_target' : 'no_open_fulfillment_orders')
        }
      } else {
        actions.push(isAlreadyFulfilled ? 'already_fulfilled' : 'no_tracking_number')
      }
    } else {
      actions.push('fulfillment_skipped_by_settings')
    }

    if (settings?.autoUpdateShipmentStatus) {
      const cleanTags = (Array.isArray(remoteOrder.tags) ? remoteOrder.tags : String(order?.tags || '').split(','))
        .map((t: string) => String(t || '').trim())
        .filter(Boolean)
        .filter((t: string) => !/^(mcw_status|dg_status):/i.test(t))
      cleanTags.push(`dg_status:${orderStatus}`)
      await updateShopifyOrderTags(store, shopifyOrderId, cleanTags)
      actions.push('status_tag_updated')
    } else {
      actions.push('status_tag_skipped_by_settings')
    }

    if (settings?.autoCancelOrders && orderStatus === 'cancelled' && !remoteOrder.cancelledAt) {
      await cancelShopifyOrder(store, shopifyOrderId)
      actions.push('order_cancelled')
    }

    if (
      settings?.markCodPaidOnDelivery &&
      String(order?.order_type || '').toLowerCase() === 'cod' &&
      orderStatus === 'delivered' &&
      remoteOrder.canMarkAsPaid
    ) {
      await markShopifyOrderAsPaid(store, shopifyOrderId)
      actions.push('cod_marked_paid')
    }

    await recordSalesChannelSyncOutcome(
      order,
      {
        channel: 'shopify',
        status: 'success',
        source: options.source,
        actions,
        syncedStatus: orderStatus,
        syncedAwb: trackingNumber,
      },
      tx,
    )

    return { attempted: true, success: true, channel: 'shopify', actions }
  } catch (err: any) {
    await recordSalesChannelSyncOutcome(
      order,
      {
        channel: 'shopify',
        status: 'failed',
        source: options.source,
        actions,
        error: err,
        syncedStatus: orderStatus,
        syncedAwb: trackingNumber,
      },
      tx,
    )
    console.warn(
      `Shopify status sync failed for local order ${order?.order_number || order?.id}:`,
      err?.response?.data || err?.message || err,
    )
    return {
      attempted: true,
      success: false,
      channel: 'shopify',
      actions,
      error: err?.response?.data || err?.message || err,
    }
  }
}
