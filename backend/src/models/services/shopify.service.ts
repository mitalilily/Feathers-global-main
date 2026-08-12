import axios from 'axios'
import * as crypto from 'crypto'
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { db } from '../client'
import { b2c_orders } from '../schema/b2cOrders'
import { stores } from '../schema/stores'
import { users } from '../schema/users'
import {
  getCourierProviderDisplayName,
  getProviderMetaCourierName,
  resolveCourierProviderKeyFromFields,
} from '../../utils/courierProvider'
import { normalizeIndianPhoneForBooking } from '../../utils/functions'
import {
  decryptShopifyToken,
  encryptShopifyOAuth,
  encryptShopifyToken,
} from '../../utils/shopifyTokenEncryption'
import {
  createUserWithWallet,
  ensurePlatformRegistration,
  setUserChannelIntegration,
  updateUserChannelIntegration,
  upsertStore,
} from './userService'
import { recordSalesChannelSyncOutcome } from './salesChannelSyncAudit.service'
import { deleteSalesChannelOrdersForStore } from './storeCleanup.service'
import {
  queueShopifyCustomerDataRequest,
  redactShopifyComplianceRequestPayloads,
} from './shopifyPrivacy.service'

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
export const SHOPIFY_UNINSTALL_WEBHOOK_PATH = '/api/webhooks/shopify/app-uninstalled'
export const SHOPIFY_REAUTHORIZATION_REQUIRED_CODE = 'SHOPIFY_REAUTHORIZATION_REQUIRED'
const SHOPIFY_COMPLIANCE_TOPICS = [
  'customers/data_request',
  'customers/redact',
  'shop/redact',
] as const

type ShopifyStore = typeof stores.$inferSelect

export class ShopifyReauthorizationRequiredError extends Error {
  readonly code = SHOPIFY_REAUTHORIZATION_REQUIRED_CODE
  readonly statusCode = 409
  readonly reconnectRequired = true
  readonly shop: string
  readonly reconnectUrl: string

  constructor(shop: string, reason?: string) {
    const normalizedShop = normalizeShopifyDomain(shop)
    super(
      reason ||
        `Shopify authorization needs to be renewed for ${normalizedShop}. Open Feather Global from Shopify Admin to reconnect.`,
    )
    this.name = 'ShopifyReauthorizationRequiredError'
    this.shop = normalizedShop
    const storeHandle = normalizedShop.replace(/\.myshopify\.com$/i, '')
    const clientId = getShopifyOAuthConfig().clientId
    this.reconnectUrl =
      storeHandle && clientId
        ? `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/apps/${encodeURIComponent(clientId)}`
        : 'https://admin.shopify.com/'
  }
}

type SyncResult = {
  created: number
  updated: number
  skipped: number
}

type ExistingShopifyOrderRow = {
  id: string
  order_id?: string | null
  order_number?: string | null
  order_amount?: any
  invoice_number?: string | null
  invoice_date?: string | null
  invoice_amount?: any
  buyer_name?: string | null
  buyer_phone?: string | null
  buyer_email?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  pincode?: string | null
  products?: any
  weight?: any
  length?: any
  breadth?: any
  height?: any
  order_type?: string | null
  prepaid_amount?: any
  cod_charges?: any
  shipping_charges?: any
  transaction_fee?: any
  gift_wrap?: any
  discount?: any
  order_status?: string | null
  awb_number?: string | null
  courier_partner?: string | null
  integration_type?: string | null
  provider_meta?: any
  provider_service?: string | null
  pickup_details?: any
  rto_details?: any
  label?: string | null
  label_generated_once?: boolean | null
}
const parseProviderMetaObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

const getLocalOverrideFields = (row: ExistingShopifyOrderRow | null | undefined) => {
  const providerMeta = parseProviderMetaObject(row?.provider_meta)
  const localOverrides = parseProviderMetaObject(providerMeta.local_overrides)
  return new Set(
    Array.isArray(localOverrides.fields)
      ? localOverrides.fields.map((field: unknown) => String(field || '').trim()).filter(Boolean)
      : [],
  )
}

const existingShopifyOrderSelect = {
  id: b2c_orders.id,
  order_id: b2c_orders.order_id,
  order_number: b2c_orders.order_number,
  order_amount: b2c_orders.order_amount,
  invoice_number: b2c_orders.invoice_number,
  invoice_date: b2c_orders.invoice_date,
  invoice_amount: b2c_orders.invoice_amount,
  buyer_name: b2c_orders.buyer_name,
  buyer_phone: b2c_orders.buyer_phone,
  buyer_email: b2c_orders.buyer_email,
  address: b2c_orders.address,
  city: b2c_orders.city,
  state: b2c_orders.state,
  country: b2c_orders.country,
  pincode: b2c_orders.pincode,
  products: b2c_orders.products,
  weight: b2c_orders.weight,
  length: b2c_orders.length,
  breadth: b2c_orders.breadth,
  height: b2c_orders.height,
  order_type: b2c_orders.order_type,
  prepaid_amount: b2c_orders.prepaid_amount,
  cod_charges: b2c_orders.cod_charges,
  shipping_charges: b2c_orders.shipping_charges,
  transaction_fee: b2c_orders.transaction_fee,
  gift_wrap: b2c_orders.gift_wrap,
  discount: b2c_orders.discount,
  order_status: b2c_orders.order_status,
  awb_number: b2c_orders.awb_number,
  courier_partner: b2c_orders.courier_partner,
  integration_type: b2c_orders.integration_type,
  provider_meta: b2c_orders.provider_meta,
  provider_service: b2c_orders.provider_service,
  pickup_details: b2c_orders.pickup_details,
  rto_details: b2c_orders.rto_details,
  label: b2c_orders.label,
  label_generated_once: b2c_orders.label_generated_once,
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

type ShopifyInstallBootstrapPayload = {
  nonce: string
  shop: string
  userId: string
  returnTo?: string
  issuedAt: number
  expiresAt: number
}

type ShopifyAccessTokenResponse = {
  access_token?: string
  scope?: string
  expires_in?: number
  refresh_token?: string
  refresh_token_expires_in?: number
}

type ShopifySessionTokenPayload = JwtPayload & {
  aud: string
  dest: string
  iss: string
  sub: string
}

type ShopifyMerchantIdentity = {
  id: string
  role: string | null
  email: string | null
  phone: string | null
  googleId: string | null
  pendingEmail: string | null
  pendingPhone: string | null
  passwordHash: string | null
}

const isEmptyShopifyBootstrapMerchant = (merchant?: ShopifyMerchantIdentity | null) =>
  Boolean(
    merchant?.role === 'customer' &&
      !merchant.email &&
      !merchant.phone &&
      !merchant.googleId &&
      !merchant.pendingEmail &&
      !merchant.pendingPhone &&
      !merchant.passwordHash,
  )

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
  'write_fulfillments',
  'read_merchant_managed_fulfillment_orders',
  'write_merchant_managed_fulfillment_orders',
] as const

const parseShopifyScopes = () =>
  [
    ...REQUIRED_SHOPIFY_OAUTH_SCOPES,
    ...String(process.env.SHOPIFY_ADDITIONAL_SCOPES || '')
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
    process.env.SHOPIFY_SEND_OAUTH_SCOPE ?? process.env.SHOPIFY_USE_LEGACY_INSTALL_FLOW ?? 'false',
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

type ShopifyAppCredentials = {
  clientId: string
  clientSecret: string
}

const getShopifyAppCredentialCandidates = (): ShopifyAppCredentials[] => {
  const primary = getShopifyOAuthConfig()
  const candidates = [
    { clientId: primary.clientId, clientSecret: primary.clientSecret },
    {
      clientId: String(process.env.SHOPIFY_LEGACY_CLIENT_ID || '').trim(),
      clientSecret: String(process.env.SHOPIFY_LEGACY_CLIENT_SECRET || '').trim(),
    },
  ]

  return candidates.filter(
    (candidate, index, all) =>
      Boolean(candidate.clientId && candidate.clientSecret) &&
      all.findIndex((other) => other.clientId === candidate.clientId) === index,
  )
}

const getShopifyAppCredentialsForClientId = (clientId: string) =>
  getShopifyAppCredentialCandidates().find((candidate) => candidate.clientId === clientId)

export const assertShopifyAppInstallIsolation = ({
  incomingClientId,
  primaryClientId,
  existingClientId,
  hasExistingStore = Boolean(existingClientId),
}: {
  incomingClientId: string
  primaryClientId: string
  existingClientId?: string | null
  hasExistingStore?: boolean
}) => {
  const incoming = String(incomingClientId || '').trim()
  const primary = String(primaryClientId || '').trim()
  const existing = String(existingClientId || '').trim()

  if (!incoming || !primary) {
    throw new Error('Shopify app identity is not configured')
  }

  if (!hasExistingStore) {
    if (incoming !== primary) {
      throw new Error(
        'This legacy Shopify app can only continue an existing production connection. New stores must install the current Feather Global public app.',
      )
    }
    return
  }

  if (!existing) {
    throw new Error(
      'This shop has an existing Shopify connection without a verified app identity. Its production connection was left unchanged.',
    )
  }

  if (existing !== incoming) {
    throw new Error(
      'This shop is already connected through a different Feather Global Shopify app. Its existing production connection was left unchanged.',
    )
  }
}

const getShopifyAppCredentialsForStore = (store: ShopifyStore) => {
  const oauth = getStoreOAuthMetadata(store)
  const clientId = String(oauth.appClientId || store.apiKey || '').trim()
  return getShopifyAppCredentialsForClientId(clientId) || getShopifyAppCredentialCandidates()[0]
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

const getShopifyBootstrapSecret = () => {
  const config = getShopifyOAuthConfig()
  return String(
    process.env.SHOPIFY_BOOTSTRAP_SECRET ||
      process.env.SHOPIFY_OAUTH_STATE_SECRET ||
      config.clientSecret ||
      '',
  ).trim()
}

export const createShopifyInstallBootstrap = ({
  shop,
  userId,
  returnTo,
  ttlMs = 10 * 60 * 1000,
}: {
  shop: string
  userId: string
  returnTo?: string
  ttlMs?: number
}) => {
  const secret = getShopifyBootstrapSecret()
  if (!secret) throw new Error('SHOPIFY_CLIENT_SECRET or SHOPIFY_BOOTSTRAP_SECRET is not configured')
  const issuedAt = Date.now()
  const payload: ShopifyInstallBootstrapPayload = {
    nonce: crypto.randomBytes(16).toString('hex'),
    shop: normalizeShopifyDomain(shop),
    userId,
    returnTo,
    issuedAt,
    expiresAt: issuedAt + ttlMs,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

export const verifyShopifyInstallBootstrap = (token: string): ShopifyInstallBootstrapPayload => {
  const secret = getShopifyBootstrapSecret()
  if (!secret) throw new Error('SHOPIFY_CLIENT_SECRET or SHOPIFY_BOOTSTRAP_SECRET is not configured')
  const [body, signature] = String(token || '').split('.')
  if (!body || !signature) throw new Error('Invalid Shopify bootstrap token')
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  if (!timingSafeEqualString(expected, signature)) throw new Error('Invalid Shopify bootstrap token signature')
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ShopifyInstallBootstrapPayload
  if (!payload?.userId || !payload?.shop || !payload?.issuedAt || !payload?.expiresAt) {
    throw new Error('Invalid Shopify bootstrap token payload')
  }
  if (Date.now() > Number(payload.expiresAt)) throw new Error('Shopify bootstrap token expired')
  if (!isValidShopifyDomain(payload.shop)) throw new Error('Invalid Shopify shop in bootstrap token')
  return payload
}

export const verifyShopifySessionToken = (token: string): ShopifySessionTokenPayload => {
  const normalizedToken = String(token || '').trim()
  const decoded = jwt.decode(normalizedToken)
  if (!decoded || typeof decoded === 'string') throw new Error('Invalid Shopify session token payload')
  const audience = Array.isArray(decoded.aud) ? String(decoded.aud[0] || '') : String(decoded.aud || '')
  const credentials = getShopifyAppCredentialsForClientId(audience)
  if (!credentials) throw new Error('Shopify OAuth credentials are not configured')
  const payload = jwt.verify(normalizedToken, credentials.clientSecret, {
    algorithms: ['HS256'],
    audience: credentials.clientId,
    clockTolerance: 5,
  })
  if (typeof payload === 'string') throw new Error('Invalid Shopify session token payload')
  const session = payload as ShopifySessionTokenPayload
  const destination = new URL(String(session.dest || ''))
  const issuer = new URL(String(session.iss || ''))
  const shop = normalizeShopifyDomain(destination.hostname)
  if (!isValidShopifyDomain(shop) || normalizeShopifyDomain(issuer.hostname) !== shop) {
    throw new Error('Invalid Shopify session token shop')
  }
  if (!String(session.sub || '').trim()) throw new Error('Invalid Shopify session token user')
  return session
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

const exchangeShopifySessionToken = async ({
  shop,
  sessionToken,
  credentials,
}: {
  shop: string
  sessionToken: string
  credentials: ShopifyAppCredentials
}): Promise<ShopifyAccessTokenResponse> => {
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: sessionToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
    expiring: '1',
  })
  const response = await axios.post<ShopifyAccessTokenResponse>(
    `https://${normalizeShopifyDomain(shop)}/admin/oauth/access_token`,
    params.toString(),
    {
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
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
      appClientId: config.clientId,
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

export const completeShopifyManagedInstall = async (sessionToken: string) => {
  const session = verifyShopifySessionToken(sessionToken)
  const shop = normalizeShopifyDomain(new URL(session.dest).hostname)
  const credentials = getShopifyAppCredentialsForClientId(String(session.aud || '').trim())
  if (!credentials) throw new Error('Shopify app credentials do not match the session token')

  const existingStore = await getStoreByDomain(shop)
  const existingClientId = existingStore
    ? String(getStoreOAuthMetadata(existingStore).appClientId || existingStore.apiKey || '').trim()
    : ''
  assertShopifyAppInstallIsolation({
    incomingClientId: credentials.clientId,
    primaryClientId: getShopifyOAuthConfig().clientId,
    existingClientId,
    hasExistingStore: Boolean(existingStore),
  })

  const tokenResponse = await exchangeShopifySessionToken({ shop, sessionToken, credentials })
  const accessToken = String(tokenResponse.access_token || '').trim()
  const refreshToken = String(tokenResponse.refresh_token || '').trim()
  if (!accessToken) throw new Error('Shopify did not return an Admin API access token')
  if (!refreshToken) throw new Error('Shopify did not return an expiring offline refresh token')

  let connectedUserId = String(existingStore?.userId || '').trim()
  if (!connectedUserId) {
    const bootstrapUser = await createUserWithWallet({
      role: 'customer',
      email: null,
      phone: null,
      emailVerified: true,
      accountVerified: true,
      onboardingStep: 0,
      onboardingComplete: false,
    } as any)
    connectedUserId = bootstrapUser.id
  }

  const scopeStatus = getShopifyOAuthScopeStatus(tokenResponse.scope, getShopifyOAuthConfig().scopes)
  const result = await connectShopifyStore({
    storeUrl: shop,
    adminApiAccessToken: accessToken,
    apiKey: credentials.clientId,
    apiSecretKey: credentials.clientSecret,
    webhookSecret: credentials.clientSecret,
    userId: connectedUserId,
    settings: existingStore?.settings as Record<string, any> | undefined,
    authMethod: 'managed_install',
    oauth: {
      appClientId: credentials.clientId,
      scope: scopeStatus.grantedScopes.join(','),
      missingScopes: scopeStatus.missingScopes,
      tokenType: 'expiring_offline',
      expiresIn: tokenResponse.expires_in,
      expiresAt: toFutureIso(tokenResponse.expires_in),
      refreshToken,
      refreshTokenExpiresIn: tokenResponse.refresh_token_expires_in,
      refreshTokenExpiresAt: toFutureIso(tokenResponse.refresh_token_expires_in),
      installedAt: existingStore ? getStoreOAuthMetadata(existingStore).installedAt : new Date().toISOString(),
      exchangedAt: new Date().toISOString(),
      active: true,
      shopifyUserId: session.sub,
    },
  })

  return {
    ...result,
    shop,
    userId: connectedUserId,
    accountLinkAllowed: !existingStore,
    bootstrap: createShopifyInstallBootstrap({
      shop,
      userId: connectedUserId,
      returnTo: '/channels/connected',
    }),
  }
}

export const claimShopifyManagedStoreForMerchant = async ({
  sessionToken,
  targetUserId,
}: {
  sessionToken: string
  targetUserId: string
}) => {
  const session = verifyShopifySessionToken(sessionToken)
  const shop = normalizeShopifyDomain(new URL(session.dest).hostname)
  const store = await getStoreByDomain(shop)
  if (!store) throw new Error('Complete the Shopify installation before linking a Feather Global account')

  assertShopifyAppInstallIsolation({
    incomingClientId: String(session.aud || '').trim(),
    primaryClientId: getShopifyOAuthConfig().clientId,
    existingClientId: String(getStoreOAuthMetadata(store).appClientId || store.apiKey || '').trim(),
    hasExistingStore: true,
  })

  const merchantColumns = {
    id: users.id,
    role: users.role,
    email: users.email,
    phone: users.phone,
    googleId: users.googleId,
    pendingEmail: users.pendingEmail,
    pendingPhone: users.pendingPhone,
    passwordHash: users.passwordHash,
  }
  const [targetMerchant] = await db
    .select(merchantColumns)
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1)
  if (!targetMerchant || targetMerchant.role !== 'customer') {
    throw new Error('A valid Feather Global merchant account is required')
  }
  if (store.userId === targetMerchant.id) {
    return {
      shop,
      movedOrders: 0,
      bootstrap: createShopifyInstallBootstrap({ shop, userId: targetMerchant.id, returnTo: '/channels/connected' }),
    }
  }

  const [currentOwner] = await db
    .select(merchantColumns)
    .from(users)
    .where(eq(users.id, store.userId))
    .limit(1)
  if (!isEmptyShopifyBootstrapMerchant(currentOwner)) {
    throw new Error('This Shopify store is already linked to another Feather Global merchant')
  }

  const storeOrderFilter = or(
    sql`${b2c_orders.order_id} LIKE ${`shopify_${store.id}_%`}`,
    sql`coalesce(${b2c_orders.provider_meta}->>'shopify_store_id', '') = ${store.id}`,
  )
  let movedOrders = 0
  await db.transaction(async (tx: any) => {
    await tx.execute(sql`select id from stores where id = ${store.id} for update`)
    const [lockedStore] = await tx.select({ userId: stores.userId }).from(stores).where(eq(stores.id, store.id)).limit(1)
    if (lockedStore?.userId !== currentOwner!.id) throw new Error('Shopify store ownership changed while linking')

    const storeOrders = await tx
      .select({
        id: b2c_orders.id,
        userId: b2c_orders.user_id,
        awb: b2c_orders.awb_number,
        freight: b2c_orders.freight_charges,
        walletDebit: b2c_orders.wallet_debit_amount,
      })
      .from(b2c_orders)
      .where(storeOrderFilter)
    if (storeOrders.some((order: any) => order.userId !== currentOwner!.id)) {
      throw new Error('Shopify order ownership is inconsistent; account linking was stopped')
    }
    if (
      storeOrders.some((order: any) => {
        const awb = String(order.awb || '').trim()
        return Boolean(awb && !awb.startsWith('TEST')) || Number(order.freight || 0) !== 0 || Number(order.walletDebit || 0) !== 0
      })
    ) {
      throw new Error('This store has already booked real or charged shipments and cannot change accounts')
    }

    await tx
      .update(stores)
      .set({ userId: targetMerchant.id, updatedAt: new Date() })
      .where(and(eq(stores.id, store.id), eq(stores.userId, currentOwner!.id)))
    if (storeOrders.length) {
      await tx
        .update(b2c_orders)
        .set({ user_id: targetMerchant.id, updated_at: new Date() })
        .where(and(eq(b2c_orders.user_id, currentOwner!.id), storeOrderFilter))
    }
    movedOrders = storeOrders.length
    await updateUserChannelIntegration(targetMerchant.id, SHOPIFY_PLATFORM_ID, tx)
    const [remaining] = await tx
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.userId, currentOwner!.id), eq(stores.platformId, SHOPIFY_PLATFORM_ID)))
      .limit(1)
    if (!remaining) await setUserChannelIntegration(currentOwner!.id, SHOPIFY_PLATFORM_ID, false, tx)
  })

  return {
    shop,
    movedOrders,
    bootstrap: createShopifyInstallBootstrap({ shop, userId: targetMerchant.id, returnTo: '/channels/connected' }),
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

const getPanelShopifyBaseOrderNumber = (order: any) => {
  const orderNumber = String(order?.order_number || '').trim()
  const match = orderNumber.match(/^(#?[A-Za-z0-9]+)-E$/i)
  return match ? match[1] : ''
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
  const oauth = metadata.oauth && typeof metadata.oauth === 'object' ? metadata.oauth : {}
  return { ...oauth, refreshToken: decryptShopifyToken(oauth.refreshToken) }
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
    const credentials = getShopifyAppCredentialsForStore(latestStore)
    if (!credentials) {
      throw new ShopifyReauthorizationRequiredError(
        store.domain,
        'Shopify app credentials changed. Open Feather Global from Shopify Admin to reconnect this store.',
      )
    }
    const latestMetadata = ((latestStore as any)?.metadata || {}) as Record<string, any>
    const latestOauth = getStoreOAuthMetadata(latestStore)
    const latestAccessToken = decryptShopifyToken(latestStore.adminApiAccessToken)
    const safetyBufferMs = Number(process.env.SHOPIFY_TOKEN_REFRESH_BUFFER_MS || 5 * 60 * 1000)

    if (!options.force && latestAccessToken && !shouldRefreshShopifyToken(latestOauth)) {
      syncStoreOAuthState(store, latestAccessToken, latestMetadata)
      return latestAccessToken
    }

    if (
      options.force &&
      latestAccessToken &&
      latestAccessToken !== decryptShopifyToken(store.adminApiAccessToken) &&
      !isShopifyTokenExpired(latestOauth.expiresAt, safetyBufferMs)
    ) {
      syncStoreOAuthState(store, latestAccessToken, latestMetadata)
      return latestAccessToken
    }

    if (latestOauth.active === false || latestOauth.reconnectRequired === true) {
      throw new ShopifyReauthorizationRequiredError(store.domain)
    }

    if (isShopifyTokenExpired(latestOauth.refreshTokenExpiresAt)) {
      throw new ShopifyReauthorizationRequiredError(store.domain)
    }

    const refreshToken = String(latestOauth.refreshToken || '').trim()
    if (!refreshToken) {
      throw new ShopifyReauthorizationRequiredError(store.domain)
    }

    const params = new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })

    let response
    try {
      response = await axios.post<ShopifyAccessTokenResponse>(
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
    } catch (error: any) {
      const status = Number(error?.response?.status || 0)
      const providerCode = String(error?.response?.data?.error || '').trim().toLowerCase()
      const providerMessage = String(error?.response?.data?.error_description || '').trim().toLowerCase()
      const tokenWasRejected =
        [400, 401].includes(status) &&
        (['invalid_request', 'invalid_grant', 'invalid_token'].includes(providerCode) ||
          /refresh[_ ]token|access token|reauthor/i.test(providerMessage))

      if (!tokenWasRejected) throw error

      const disconnectedOAuth = encryptShopifyOAuth({
        ...latestOauth,
        active: false,
        reconnectRequired: true,
        invalidatedAt: new Date().toISOString(),
        invalidationReason: providerCode || 'token_rejected',
      })
      const disconnectedMetadata = { ...latestMetadata, oauth: disconnectedOAuth }
      await tx
        .update(stores)
        .set({ metadata: disconnectedMetadata, updatedAt: new Date() })
        .where(eq(stores.id, latestStore.id))
      syncStoreOAuthState(latestStore, latestStore.adminApiAccessToken, disconnectedMetadata)
      syncStoreOAuthState(store, store.adminApiAccessToken, disconnectedMetadata)

      throw new ShopifyReauthorizationRequiredError(store.domain)
    }

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

    const storedAccessToken = encryptShopifyToken(accessToken)
    const storedOAuth = encryptShopifyOAuth(refreshedOAuth)
    const nextMetadata = {
      ...latestMetadata,
      oauth: storedOAuth,
    }

    await tx
      .update(stores)
      .set({
        adminApiAccessToken: storedAccessToken,
        metadata: nextMetadata,
        updatedAt: new Date(),
      })
      .where(eq(stores.id, latestStore.id))

    syncStoreOAuthState(latestStore, storedAccessToken, nextMetadata)
    syncStoreOAuthState(store, storedAccessToken, nextMetadata)

    return accessToken
  })().finally(() => {
    shopifyTokenRefreshLocks.delete(lockKey)
  })

  shopifyTokenRefreshLocks.set(lockKey, refreshPromise)
  return refreshPromise
}

const getShopifyAccessTokenForStore = async (store: ShopifyStore, tx: any = db) => {
  const oauth = getStoreOAuthMetadata(store)
  if (oauth.active === false || oauth.reconnectRequired === true) {
    throw new ShopifyReauthorizationRequiredError(store.domain)
  }
  if (!shouldRefreshShopifyToken(oauth)) {
    const token = decryptShopifyToken(store.adminApiAccessToken)
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
  const storedAccessToken = encryptShopifyToken(adminApiAccessToken)
  const storedSigningSecret = signingSecret ? encryptShopifyToken(signingSecret) : undefined
  const storedOAuth = oauth ? encryptShopifyOAuth(oauth) : undefined
  if (storedAccessToken.length > 255) {
    throw new Error('Encrypted Shopify access token exceeds the database column limit')
  }
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
        adminApiAccessToken: storedAccessToken,
        shopifyWebhookSecret: storedSigningSecret,
        authMethod: authMethod || 'legacy_custom_app',
        oauth: storedOAuth,
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
          shopifyWebhookSecret: storedSigningSecret,
          apiSecretKey: apiSecretKey ? 'configured' : undefined,
          authMethod: authMethod || 'legacy_custom_app',
          oauth: storedOAuth,
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

const getEffectiveFulfillTriggerForStatusSync = (settings: any): FulfillTrigger => {
  const configuredTrigger = normalizeFulfillTrigger(settings?.fulfillTrigger)

  // Older frontend defaults saved "do_not_fulfill" even when shipment-status
  // auto-sync was enabled. Shopify fulfillment events need a fulfillment object,
  // so status sync must create/update fulfillment once tracking exists.
  if (settings?.autoUpdateShipmentStatus && configuredTrigger === 'do_not_fulfill') {
    return 'order_booked'
  }

  return configuredTrigger
}

const shouldNotifyCustomerOnFulfill = (settings: any) => {
  const value = String(
    settings?.customerNotifyOnFulfill ?? settings?.notifyCustomerOnFulfill ?? settings?.notifyOnFulfill ?? '',
  )
    .trim()
    .toLowerCase()
  return ['notify', 'notify_customer', 'yes', 'true', '1'].includes(value)
}

const shouldForceFulfillmentForStatusSync = ({
  trackingNumber,
  fulfillmentEventStatus,
}: {
  trackingNumber: string
  fulfillmentEventStatus: string | null
}) => Boolean(String(trackingNumber || '').trim() && fulfillmentEventStatus)

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
  const fulfillments = Array.isArray(node?.fulfillments) ? node.fulfillments : []
  const firstTracking = fulfillments
    .flatMap((fulfillment: any) => (Array.isArray(fulfillment?.trackingInfo) ? fulfillment.trackingInfo : []))
    .find((tracking: any) => String(tracking?.number || '').trim())
  const fulfillmentWithTracking =
    fulfillments.find((fulfillment: any) =>
      (Array.isArray(fulfillment?.trackingInfo) ? fulfillment.trackingInfo : []).some((tracking: any) =>
        String(tracking?.number || '').trim(),
      ),
    ) || null

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
    tracking_number: String(firstTracking?.number || '').trim(),
    tracking_company: String(firstTracking?.company || fulfillmentWithTracking?.name || '').trim(),
    tracking_url: String(firstTracking?.url || '').trim(),
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
  query ShiplifiOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
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
          fulfillments(first: 20) {
            id
            name
            status
            trackingInfo(first: 10) {
              company
              number
              url
            }
          }
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
  query ShiplifiOrdersRestricted($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
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
          fulfillments(first: 20) {
            id
            name
            status
            trackingInfo(first: 10) {
              company
              number
              url
            }
          }
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
  const totalLimit = Math.min(Math.max(limit, 1), 1000)
  let piiAccessRestricted = false
  let after: string | null = null
  const orders: any[] = []

  while (orders.length < totalLimit) {
    const first = Math.min(250, totalLimit - orders.length)
    let data: {
      orders: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }
        edges: Array<{ node: any }>
      }
    }

    try {
      data = await shopifyStoreGraphqlRequest<typeof data>({
        store,
        query: piiAccessRestricted ? SHOPIFY_ORDERS_RESTRICTED_QUERY : SHOPIFY_ORDERS_QUERY,
        variables: { first, after },
        timeout: 30000,
      })
    } catch (error: any) {
      if (piiAccessRestricted || !isShopifyCustomerDataAccessError(error)) throw error

      piiAccessRestricted = true
      console.warn('[Shopify] Customer data access restricted; syncing non-PII order fields only', {
        storeId: store.id,
        domain: store.domain,
      })
      data = await shopifyStoreGraphqlRequest<typeof data>({
        store,
        query: SHOPIFY_ORDERS_RESTRICTED_QUERY,
        variables: { first, after },
        timeout: 30000,
      })
    }

    const pageEdges = data?.orders?.edges || []
    orders.push(...pageEdges.map((edge) => normalizeGraphqlOrder(edge.node, { piiAccessRestricted })))

    if (!data?.orders?.pageInfo?.hasNextPage || !data.orders.pageInfo.endCursor || pageEdges.length === 0) {
      break
    }
    after = data.orders.pageInfo.endCursor
  }

  return orders
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
  const shopifyTrackingNumber = String(order?.tracking_number || '').trim()
  const shopifyTrackingCompany = String(order?.tracking_company || '').trim()
  const shopifyTrackingUrl = String(order?.tracking_url || '').trim()
  const providerMeta = {
    source: 'shopify',
    shopify_store_id: String(store.id),
    shopify_order_id: shopifyOrderId,
    shopify_financial_signature: shopifyFinancialSignature,
    shopify_pii_restricted: piiAccessRestricted,
    shopify_tracking_number: shopifyTrackingNumber || undefined,
    shopify_tracking_company: shopifyTrackingCompany || undefined,
    shopify_tracking_url: shopifyTrackingUrl || undefined,
    customer_data_note: piiAccessRestricted
      ? 'Shopify did not grant this app access to customer PII; buyer address and phone were not available during sync.'
      : undefined,
  }

  const [existing] = await tx
    .select(existingShopifyOrderSelect)
    .from(b2c_orders)
    .where(eq(b2c_orders.order_id, internalOrderId))
    .limit(1)

  const [legacyExisting] = existing
    ? [undefined]
    : await tx
        .select(existingShopifyOrderSelect)
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
    provider_meta: providerMeta,
    integration_type: 'shopify',
    awb_number: shopifyTrackingNumber || null,
    courier_partner: shopifyTrackingCompany || 'Shopify',
    is_external_api: false,
    tags: syncTags.slice(0, 200),
    updated_at: new Date(),
  }

  const buildBookedUpdatePayload = (
    row: ExistingShopifyOrderRow | null | undefined,
    payload: Partial<typeof b2c_orders.$inferInsert> = updatePayload,
  ) => {
    const existingProviderMeta =
      row?.provider_meta && typeof row.provider_meta === 'object' && !Array.isArray(row.provider_meta)
        ? row.provider_meta
        : {}
    const localOverrideFields = getLocalOverrideFields(row)
    const existingFinancialSignature = String(
      existingProviderMeta.shopify_financial_signature || '',
    ).trim()
    const shouldInvalidateStaleLabel =
      row?.awb_number &&
      localOverrideFields.size === 0 &&
      (!existingFinancialSignature || existingFinancialSignature !== shopifyFinancialSignature)
    const providerMetaCourierName = getProviderMetaCourierName(existingProviderMeta)
    const bookedProviderKey = resolveCourierProviderKeyFromFields(
      row?.integration_type,
      row?.courier_partner,
      providerMetaCourierName,
      row?.provider_service,
    )

    const nextPayload: Partial<typeof b2c_orders.$inferInsert> = {
      ...payload,
      provider_meta: {
        ...existingProviderMeta,
        ...providerMeta,
      },
    }

    if (row?.awb_number) {
      nextPayload.order_status =
        String(payload.order_status || '').toLowerCase() === 'cancelled'
          ? payload.order_status
          : row.order_status || payload.order_status
      nextPayload.courier_partner =
        providerMetaCourierName ||
        (bookedProviderKey ? getCourierProviderDisplayName(bookedProviderKey) : '') ||
        row.courier_partner ||
        payload.courier_partner
      nextPayload.integration_type = bookedProviderKey || row.integration_type || payload.integration_type
      nextPayload.awb_number = row.awb_number || payload.awb_number
    }

    if (localOverrideFields.has('consignee')) {
      Object.assign(nextPayload, {
        buyer_name: row?.buyer_name,
        buyer_phone: row?.buyer_phone,
        buyer_email: row?.buyer_email,
        address: row?.address,
        city: row?.city,
        state: row?.state,
        country: row?.country,
        pincode: row?.pincode,
      })
    }

    if (localOverrideFields.has('parcel')) {
      Object.assign(nextPayload, {
        weight: row?.weight,
        length: row?.length,
        breadth: row?.breadth,
        height: row?.height,
      })
    }

    if (localOverrideFields.has('products')) {
      nextPayload.products = row?.products
    }

    if (localOverrideFields.has('financial')) {
      Object.assign(nextPayload, {
        order_amount: row?.order_amount,
        order_type: row?.order_type,
        prepaid_amount: row?.prepaid_amount,
        cod_charges: row?.cod_charges,
        shipping_charges: row?.shipping_charges,
        transaction_fee: row?.transaction_fee,
        gift_wrap: row?.gift_wrap,
        discount: row?.discount,
      })
    }

    if (localOverrideFields.has('invoice')) {
      Object.assign(nextPayload, {
        invoice_number: row?.invoice_number,
        invoice_date: row?.invoice_date,
        invoice_amount: row?.invoice_amount,
      })
    }

    if (localOverrideFields.has('pickup')) {
      nextPayload.pickup_details = row?.pickup_details
    }

    if (localOverrideFields.has('rto')) {
      nextPayload.rto_details = row?.rto_details
    }

    if (shouldInvalidateStaleLabel) {
      nextPayload.label = null
    }

    return nextPayload
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
    .select(existingShopifyOrderSelect)
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
    .select(existingShopifyOrderSelect)
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
    .select(existingShopifyOrderSelect)
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
    const typedStore = store as ShopifyStore
    const accessToken = await getShopifyAccessTokenForStore(typedStore, tx)
    await ensureShopifyOrderWebhooks({
      storeUrl: typedStore.domain,
      accessToken,
    })
    const orders = await fetchShopifyOrders(typedStore, limit)
    const settings = normalizeShopifySettings((store as any)?.settings || {})
    for (const order of orders) {
      const state = await upsertFromShopifyOrder(typedStore, order, settings, tx)
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
    process.env.SHOPIFY_LEGACY_CLIENT_SECRET,
    process.env.SHOPIFY_WEBHOOK_SECRET,
    process.env.SHOPIFY_API_SECRET,
    process.env.SHOPIFY_API_SECRET_KEY,
  ]
  for (const candidate of candidates) {
    const val = decryptShopifyToken(candidate)
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
    const fallbackSecrets = [
      ...getShopifyAppCredentialCandidates().map((candidate) => candidate.clientSecret),
      String(configured.webhookSecret || '').trim(),
    ].filter((secret, index, all) => Boolean(secret) && all.indexOf(secret) === index)
    for (const fallbackSecret of fallbackSecrets) {
      if (verifyShopifyWebhookSignatureWithSecret(rawBody, receivedHmac, fallbackSecret)) return true
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
    const queued = await queueShopifyCustomerDataRequest({ store, payload, tx })
    console.log('Shopify customer data request received', {
      shopDomain: normalizeShopifyDomain(shopDomain),
      storeId: store.id,
      dataRequestId: payload?.data_request?.id,
      customerId: payload?.customer?.id,
      ...summary,
    })
    return { success: true, action: 'data_request_queued', ...summary, queued }
  }

  if (normalizedTopic === 'customers/redact') {
    await redactShopifyOrderCustomerData({ store, payload, scope: 'customer', tx })
    await redactShopifyComplianceRequestPayloads({ store, tx })
    return { success: true, action: 'customer_data_redacted' }
  }

  if (normalizedTopic === 'shop/redact') {
    await redactShopifyComplianceRequestPayloads({ store, tx })
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
  const normalizedShopDomain = normalizeShopifyDomain(shopDomain)
  await tx.execute(sql`
    select id
    from stores
    where domain = ${normalizedShopDomain}
      and platform_id = ${SHOPIFY_PLATFORM_ID}
    for update
  `)
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
        displayStatus?: string | null
        events?: {
          nodes: Array<{ id: string; status?: string | null; happenedAt?: string | null }>
        }
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
            displayStatus
            events(first: 10) {
              nodes {
                id
                status
                happenedAt
              }
            }
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

export const processShopifyAppUninstalled = async (shopDomain: string, tx: any = db) => {
  const store = await getStoreByDomain(shopDomain, tx)
  if (!store) return { success: true, action: 'store_not_found' }

  const metadata = ((store as any).metadata || {}) as Record<string, any>
  const oauth = metadata.oauth && typeof metadata.oauth === 'object' ? metadata.oauth : {}
  await tx
    .update(stores)
    .set({
      adminApiAccessToken: '',
      metadata: {
        ...metadata,
        oauth: {
          ...oauth,
          active: false,
          refreshToken: null,
          refreshTokenExpiresAt: null,
          uninstalledAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(stores.id, store.id))

  const [remainingStore] = await tx
    .select({ id: stores.id })
    .from(stores)
    .where(
      and(
        eq(stores.userId, store.userId),
        eq(stores.platformId, SHOPIFY_PLATFORM_ID),
        sql`${stores.id} <> ${store.id}`,
        sql`coalesce(${stores.adminApiAccessToken}, '') <> ''`,
      ),
    )
    .limit(1)
  if (!remainingStore) await setUserChannelIntegration(store.userId, SHOPIFY_PLATFORM_ID, false, tx)
  return { success: true, action: 'store_deactivated' }
}

const getShopifyOrderByNameForStatusSync = async (store: ShopifyStore, orderName: string) => {
  const cleanOrderName = String(orderName || '').trim()
  if (!cleanOrderName) return null

  const data = await shopifyStoreGraphqlRequest<{
    orders: {
      nodes: Array<{
        id: string
        name?: string | null
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
          displayStatus?: string | null
          events?: {
            nodes: Array<{ id: string; status?: string | null; happenedAt?: string | null }>
          }
          trackingInfo?: Array<{ company?: string | null; number?: string | null; url?: string | null }>
        }>
      }>
    }
  }>({
    store,
    query: `
      query ShiplifiOrderStatusSyncByName($query: String!) {
        orders(first: 5, query: $query) {
          nodes {
            id
            name
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
              displayStatus
              events(first: 10) {
                nodes {
                  id
                  status
                  happenedAt
                }
              }
              trackingInfo(first: 10) {
                company
                number
                url
              }
            }
          }
        }
      }
    `,
    variables: { query: `name:${cleanOrderName}` },
  })

  const orders = Array.isArray(data?.orders?.nodes) ? data.orders.nodes : []
  return orders.find((node: any) => String(node?.name || '').trim() === cleanOrderName) || null
}

const recordResolvedPanelShopifyOrder = async ({
  order,
  store,
  shopifyOrderId,
  baseOrderNumber,
  tx,
}: {
  order: any
  store: ShopifyStore
  shopifyOrderId: string
  baseOrderNumber: string
  tx: any
}) => {
  const localOrderUuid = String(order?.id || '').trim()
  if (!localOrderUuid || !shopifyOrderId) return

  const providerMeta =
    order?.provider_meta && typeof order.provider_meta === 'object' && !Array.isArray(order.provider_meta)
      ? { ...order.provider_meta }
      : {}

  const nextMeta = {
    ...providerMeta,
    source: 'shopify',
    shopify_store_id: String((store as any)?.id || ''),
    shopify_order_id: extractLegacyId(shopifyOrderId),
    shopify_order_gid: toShopifyGid('Order', shopifyOrderId),
    shopify_panel_base_order_number: baseOrderNumber,
    shopify_panel_link_resolved_at: new Date().toISOString(),
  }

  await tx
    .update(b2c_orders)
    .set({
      provider_meta: nextMeta,
      integration_type: 'shopify',
      updated_at: new Date(),
    })
    .where(sql`${b2c_orders.id} = ${localOrderUuid}::uuid`)

  order.provider_meta = nextMeta
  order.integration_type = 'shopify'
}

const assertNoUserErrors = (operation: string, errors: Array<{ field?: string[]; message: string }> = []) => {
  if (!errors.length) return
  throw new Error(`${operation}: ${errors.map((err) => err.message).join('; ')}`)
}

const getShopifyFulfillmentForStatusSync = async (store: ShopifyStore, fulfillmentId: string) => {
  const cleanFulfillmentId = String(fulfillmentId || '').trim()
  if (!cleanFulfillmentId) return null

  const data = await shopifyStoreGraphqlRequest<{
    fulfillment: {
      id: string
      status?: string | null
      displayStatus?: string | null
      events?: {
        nodes: Array<{ id: string; status?: string | null; happenedAt?: string | null }>
      }
      trackingInfo?: Array<{ company?: string | null; number?: string | null; url?: string | null }>
    } | null
  }>({
    store,
    query: `
      query ShiplifiFulfillmentDisplayStatus($id: ID!) {
        fulfillment(id: $id) {
          id
          status
          displayStatus
          events(first: 10) {
            nodes {
              id
              status
              happenedAt
            }
          }
          trackingInfo(first: 10) {
            company
            number
            url
          }
        }
      }
    `,
    variables: { id: cleanFulfillmentId },
  })

  return data?.fulfillment || null
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
    fulfillmentCreate: {
      fulfillment?: { id: string; status?: string | null } | null
      userErrors: Array<{ field?: string[]; message: string }>
    }
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

const normalizeShipmentStatus = (status: unknown) =>
  String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

const getShipmentStatusFromShopifyTags = (tags: unknown): string => {
  const tagList = Array.isArray(tags) ? tags : String(tags || '').split(',')
  for (const rawTag of tagList) {
    const match = String(rawTag || '')
      .trim()
      .match(/^(?:dg_status|mcw_status):(.+)$/i)
    const taggedStatus = normalizeShipmentStatus(match?.[1])
    if (taggedStatus && mapShopifyFulfillmentEventStatus(taggedStatus)) return taggedStatus
  }
  return ''
}

const getShopifyShipmentStatusPriority = (status: unknown) => {
  const fulfillmentStatus = mapShopifyFulfillmentEventStatus(status)
  if (!fulfillmentStatus) return 0
  return shopifyFulfillmentEventPriority[fulfillmentStatus] || 0
}

const resolveEffectiveShopifyShipmentStatus = ({
  taggedShipmentStatus,
  localOrderStatus,
}: {
  taggedShipmentStatus: string
  localOrderStatus: string
}) => {
  if (!taggedShipmentStatus) return { status: localOrderStatus, source: 'local_order' }
  if (!localOrderStatus) return { status: taggedShipmentStatus, source: 'shopify_tag' }

  const taggedPriority = getShopifyShipmentStatusPriority(taggedShipmentStatus)
  const localPriority = getShopifyShipmentStatusPriority(localOrderStatus)

  if (localPriority >= taggedPriority) {
    return {
      status: localOrderStatus,
      source: localPriority > taggedPriority ? 'local_order_newer_than_shopify_tag' : 'local_order',
    }
  }

  return { status: taggedShipmentStatus, source: 'shopify_tag' }
}

const mapShopifyFulfillmentEventStatus = (orderStatus: unknown): string | null => {
  const status = normalizeShipmentStatus(orderStatus)
  if (!status) return null

  if (
    [
      'booked',
      'shipment_created',
      'manifested',
      'manifest_generated',
      'label_printed',
      'label_purchased',
      'pickup_initiated',
      'pickup_scheduled',
      'pickup_requested',
    ].includes(status)
  ) {
    return 'CONFIRMED'
  }

  if (
    [
      'pickup_completed',
      'picked',
      'picked_up',
      'carrier_picked_up',
    ].includes(status)
  ) {
    // Only actual pickup-completed/picked-up movement should advance Shopify's
    // Delivery status column to In transit. Pending pickup states must keep
    // showing "Tracking added" until the courier confirms pickup.
    return 'IN_TRANSIT'
  }

  if (['in_transit', 'rto', 'rto_in_transit'].includes(status)) return 'IN_TRANSIT'
  if (status === 'out_for_delivery') return 'OUT_FOR_DELIVERY'
  if (['ndr', 'undelivered', 'delivery_attempted', 'attempted_delivery'].includes(status)) {
    return 'ATTEMPTED_DELIVERY'
  }
  if (['delayed', 'lost'].includes(status)) return 'FAILURE'
  if (['delivered', 'rto_delivered'].includes(status)) return 'DELIVERED'
  if (['cancelled', 'canceled', 'cancellation_requested'].includes(status)) return 'FAILURE'

  return null
}

const fulfillmentHasEventStatus = (fulfillment: any, status: string) => {
  const events = Array.isArray(fulfillment?.events?.nodes) ? fulfillment.events.nodes : []
  return events.some((event: any) => String(event?.status || '').toUpperCase() === status)
}

const shopifyFulfillmentEventPriority: Record<string, number> = {
  CONFIRMED: 1,
  CARRIER_PICKED_UP: 2,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  ATTEMPTED_DELIVERY: 4,
  FAILURE: 4,
  DELIVERED: 5,
}

const getLatestShopifyFulfillmentEvent = (fulfillment: any) => {
  const events = Array.isArray(fulfillment?.events?.nodes) ? fulfillment.events.nodes : []
  return events
    .map((event: any) => ({
      ...event,
      status: String(event?.status || '').toUpperCase(),
      time: new Date(event?.happenedAt || event?.createdAt || 0).getTime(),
    }))
    .filter((event: any) => event.status)
    .sort((a: any, b: any) => b.time - a.time)[0]
}

const shouldCreateShopifyFulfillmentEvent = (
  fulfillment: any,
  desiredStatus: string,
  options: { allowPanelShipmentStageOverride?: boolean } = {},
) => {
  const normalizedDesiredStatus = String(desiredStatus || '').toUpperCase()
  const desiredPriority = shopifyFulfillmentEventPriority[normalizedDesiredStatus] || 0
  const latestEvent = getLatestShopifyFulfillmentEvent(fulfillment)

  if (!latestEvent?.status) {
    return !fulfillmentHasEventStatus(fulfillment, normalizedDesiredStatus)
  }

  const latestPriority = shopifyFulfillmentEventPriority[latestEvent.status] || 0
  if (latestEvent.status === normalizedDesiredStatus) return false

  if (options.allowPanelShipmentStageOverride) return true

  // Never create an older/lower shipment stage after Shopify already has a
  // newer/higher event. This prevents the Delivery status column from
  // regressing, e.g. OFD -> In transit.
  if (latestPriority > desiredPriority) return false

  // If a higher current stage already exists but a lower event was added later,
  // create the current stage again with a fresh timestamp so Shopify displays
  // the actual latest status.
  return desiredPriority >= latestPriority
}

const shopifyFulfillmentDisplayMatchesStatus = (fulfillment: any, desiredStatus: string) => {
  const displayStatus = String(fulfillment?.displayStatus || '').trim().toUpperCase()
  const normalizedDesiredStatus = String(desiredStatus || '').trim().toUpperCase()
  if (!displayStatus || !normalizedDesiredStatus) return false
  if (displayStatus === normalizedDesiredStatus) return true

  // Shopify can collapse early carrier states into "in transit" in the Admin
  // list once the shipment is moving. Treat that as a valid real-column update
  // for pickup-stage events, but keep OFD/delivered exact.
  if (normalizedDesiredStatus === 'CARRIER_PICKED_UP' && displayStatus === 'IN_TRANSIT') return true

  return false
}

const getShopifyFulfillmentDisplayStatus = (fulfillment: any) =>
  String(fulfillment?.displayStatus || '').trim().toUpperCase() || 'UNKNOWN'

const createShopifyFulfillmentEvent = async ({
  store,
  fulfillmentId,
  status,
  message,
}: {
  store: ShopifyStore
  fulfillmentId: string
  status: string
  message?: string
}) => {
  const fulfillmentEvent: any = {
    fulfillmentId,
    status,
    happenedAt: new Date().toISOString(),
  }

  if (message) {
    fulfillmentEvent.message = String(message).slice(0, 255)
  }

  const data = await shopifyStoreGraphqlRequest<{
    fulfillmentEventCreate: {
      fulfillmentEvent?: { id: string; status?: string | null } | null
      userErrors: Array<{ field?: string[]; message: string }>
    }
  }>({
    store,
    query: `
      mutation ShiplifiFulfillmentEventCreate($fulfillmentEvent: FulfillmentEventInput!) {
        fulfillmentEventCreate(fulfillmentEvent: $fulfillmentEvent) {
          fulfillmentEvent { id status }
          userErrors { field message }
        }
      }
    `,
    variables: { fulfillmentEvent },
  })

  assertNoUserErrors(
    'Shopify fulfillmentEventCreate failed',
    data?.fulfillmentEventCreate?.userErrors,
  )
  return data?.fulfillmentEventCreate
}

const isShopifyFulfillmentEventPermissionError = (error: any) => {
  const message = String(error?.response?.data?.errors?.[0]?.message || error?.message || error || '')
  return (
    message.includes('fulfillmentEventCreate') &&
    (message.includes('write_fulfillments') || message.includes('fulfill_and_ship_orders'))
  )
}

const buildShopifyFulfillmentEventPermissionError = () =>
  new Error(
    'Shopify fulfillment events are blocked for this store. Reconnect the Shopify app after approving write_fulfillments and install it with a Shopify user that has fulfill_and_ship_orders permission.',
  )

const isShopifyReconnectRequiredError = (error: any) => {
  const responseData = error?.response?.data
  const message = String(
    responseData?.error_description ||
      responseData?.message ||
      error?.message ||
      error ||
      '',
  ).toLowerCase()

  return (
    message.includes('active refresh_token') ||
    message.includes('refresh token expired') ||
    message.includes('refresh token is missing') ||
    message.includes('reconnect the shopify store')
  )
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
  let syncTarget = extractShopifySyncTarget(order)
  const panelShopifyBaseOrderNumber = !syncTarget.isShopifyOrder ? getPanelShopifyBaseOrderNumber(order) : ''
  if (!syncTarget.isShopifyOrder && !panelShopifyBaseOrderNumber) {
    return { attempted: false, success: true, channel: 'shopify', reason: 'not_a_shopify_order' }
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
  const localOrderStatus = normalizeShipmentStatus(order?.order_status)
  const trackingNumber = String(order?.awb_number || '').trim()
  const actions: string[] = []
  let targetFulfillmentForEvent: any = null
  let remoteOrderFromPanelLookup: any = null
  let effectiveOrderStatusForAudit = localOrderStatus

  if (!syncTarget.isShopifyOrder) {
    if (!panelShopifyBaseOrderNumber) {
      return { attempted: false, success: true, channel: 'shopify', reason: 'not_a_shopify_order' }
    }

    remoteOrderFromPanelLookup = await getShopifyOrderByNameForStatusSync(store, panelShopifyBaseOrderNumber)
    if (!remoteOrderFromPanelLookup?.id) {
      return {
        attempted: true,
        success: false,
        channel: 'shopify',
        reason: 'panel_shopify_base_order_not_found',
      }
    }

    syncTarget = {
      storeId: String((store as any)?.id || '') || undefined,
      shopifyOrderId: extractLegacyId(remoteOrderFromPanelLookup.id),
      isShopifyOrder: true,
    }
    actions.push(`panel_order_linked:${panelShopifyBaseOrderNumber}`)

    await recordResolvedPanelShopifyOrder({
      order,
      store,
      shopifyOrderId: remoteOrderFromPanelLookup.id,
      baseOrderNumber: panelShopifyBaseOrderNumber,
      tx,
    })
  }

  const shopifyOrderId = syncTarget.shopifyOrderId || ''
  if (!shopifyOrderId) {
    return { attempted: false, success: false, channel: 'shopify', reason: 'missing_shopify_order_id' }
  }

  try {
    const remoteOrder = remoteOrderFromPanelLookup || (await getShopifyOrderForStatusSync(store, shopifyOrderId))
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

    const taggedShipmentStatus = getShipmentStatusFromShopifyTags(remoteOrder.tags)
    const resolvedOrderStatus = resolveEffectiveShopifyShipmentStatus({
      taggedShipmentStatus,
      localOrderStatus,
    })
    const orderStatus = resolvedOrderStatus.status
    effectiveOrderStatusForAudit = orderStatus
    const fulfillmentEventStatus = mapShopifyFulfillmentEventStatus(orderStatus)
    if (resolvedOrderStatus.source === 'shopify_tag') {
      actions.push(`status_source_shopify_tag:${taggedShipmentStatus}`)
    } else if (resolvedOrderStatus.source === 'local_order_newer_than_shopify_tag') {
      actions.push(`status_source_local_order_newer_than_shopify_tag:${localOrderStatus}`)
      actions.push(`stale_shopify_status_tag_ignored:${taggedShipmentStatus}`)
    } else {
      actions.push(`status_source_local_order:${orderStatus || 'unknown'}`)
    }

    const effectiveFulfillTrigger = getEffectiveFulfillTriggerForStatusSync(settings)
    if (
      effectiveFulfillTrigger !== normalizeFulfillTrigger(settings?.fulfillTrigger) &&
      trackingNumber
    ) {
      actions.push(`fulfill_trigger_normalized:${effectiveFulfillTrigger}`)
    }

    const forceFulfillmentForStatusSync = shouldForceFulfillmentForStatusSync({
      trackingNumber,
      fulfillmentEventStatus,
    })
    const shouldSyncFulfillment =
      shouldAttemptFulfillment(orderStatus, effectiveFulfillTrigger) || forceFulfillmentForStatusSync

    if (shouldSyncFulfillment) {
      if (!shouldAttemptFulfillment(orderStatus, effectiveFulfillTrigger) && forceFulfillmentForStatusSync) {
        actions.push('fulfillment_forced_for_status_sync')
      }

      const isAlreadyFulfilled = String(remoteOrder.displayFulfillmentStatus || '').toUpperCase() === 'FULFILLED'
      const openFulfillmentOrders = (remoteOrder.fulfillmentOrders?.nodes || []).filter((fo: any) => {
        const foStatus = String(fo?.status || '').toUpperCase()
        const reqStatus = String(fo?.requestStatus || '').toUpperCase()
        return ['OPEN', 'SCHEDULED'].includes(foStatus) && (!reqStatus || reqStatus === 'UNSUBMITTED')
      })
      if (!isAlreadyFulfilled && openFulfillmentOrders.length) {
        const fulfillmentResult = await createShopifyFulfillment({
          store,
          fulfillmentOrderIds: openFulfillmentOrders.map((fo: any) => fo.id),
          trackingNumber,
          courierPartner: order?.courier_partner,
          notifyCustomer: shouldNotifyCustomerOnFulfill(settings),
        })
        targetFulfillmentForEvent = fulfillmentResult?.fulfillment || null
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
          targetFulfillmentForEvent = fulfillmentWithCurrentTracking
          actions.push('tracking_already_current')
        } else if (targetFulfillment?.id) {
          await updateShopifyFulfillmentTracking({
            store,
            fulfillmentId: targetFulfillment.id,
            trackingNumber,
            courierPartner: order?.courier_partner,
            notifyCustomer: shouldNotifyCustomerOnFulfill(settings),
          })
          targetFulfillmentForEvent = targetFulfillment
          actions.push('tracking_updated')
        } else {
          actions.push(isAlreadyFulfilled ? 'already_fulfilled_no_tracking_target' : 'no_open_fulfillment_orders')
        }
      } else {
        const fulfillments = Array.isArray(remoteOrder.fulfillments) ? remoteOrder.fulfillments : []
        targetFulfillmentForEvent =
          fulfillments.find((fulfillment: any) =>
            ['SUCCESS', 'OPEN', 'PENDING'].includes(String(fulfillment?.status || '').toUpperCase()),
          ) ||
          fulfillments[0] ||
          null
        actions.push(isAlreadyFulfilled ? 'already_fulfilled' : 'no_tracking_number')
      }
    } else {
      actions.push('fulfillment_skipped_by_settings')
    }

    if (settings?.autoUpdateShipmentStatus && orderStatus) {
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
      try {
        await cancelShopifyOrder(store, shopifyOrderId)
        actions.push('order_cancelled')
      } catch (cancelError: any) {
        // Shopify may reject cancellation after a fulfillment exists. That
        // should not block tracking/status events from updating the Delivery
        // status column.
        actions.push('order_cancel_skipped_by_shopify')
        console.warn(
          `Shopify order cancel skipped for local order ${order?.order_number || order?.id}:`,
          cancelError?.response?.data || cancelError?.message || cancelError,
        )
      }
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

    if (targetFulfillmentForEvent?.id && fulfillmentEventStatus) {
      let currentFulfillmentForDisplay =
        (await getShopifyFulfillmentForStatusSync(store, targetFulfillmentForEvent.id)) ||
        targetFulfillmentForEvent
      const displayStatusAlreadyCurrent = shopifyFulfillmentDisplayMatchesStatus(
        currentFulfillmentForDisplay,
        fulfillmentEventStatus,
      )
      const shouldCreateEvent = shouldCreateShopifyFulfillmentEvent(
        currentFulfillmentForDisplay,
        fulfillmentEventStatus,
        {
          allowPanelShipmentStageOverride:
            Boolean(panelShopifyBaseOrderNumber) ||
            (fulfillmentEventStatus === 'CONFIRMED' &&
              ['booked', 'shipment_created', 'pickup_initiated', 'pickup_scheduled', 'pickup_requested'].includes(
                orderStatus,
              )),
        },
      )
      const shouldRefreshDisplayStatusWithEvent =
        !displayStatusAlreadyCurrent && fulfillmentHasEventStatus(currentFulfillmentForDisplay, fulfillmentEventStatus)

      if (!shouldCreateEvent && !shouldRefreshDisplayStatusWithEvent) {
        actions.push('fulfillment_event_already_current')
      } else {
        try {
          await createShopifyFulfillmentEvent({
            store,
            fulfillmentId: targetFulfillmentForEvent.id,
            status: fulfillmentEventStatus,
            message:
              String(order?.delivery_message || order?.provider_last_status || orderStatus || '').trim() ||
              undefined,
          })
          actions.push(`fulfillment_event_${fulfillmentEventStatus.toLowerCase()}`)
          currentFulfillmentForDisplay =
            (await getShopifyFulfillmentForStatusSync(store, targetFulfillmentForEvent.id)) ||
            currentFulfillmentForDisplay
        } catch (eventError: any) {
          if (isShopifyFulfillmentEventPermissionError(eventError)) {
            actions.push('fulfillment_event_blocked_by_shopify_permission')
            throw buildShopifyFulfillmentEventPermissionError()
          }
          throw eventError
        }
      }

      if (shopifyFulfillmentDisplayMatchesStatus(currentFulfillmentForDisplay, fulfillmentEventStatus)) {
        actions.push(`fulfillment_display_status_verified:${fulfillmentEventStatus.toLowerCase()}`)
      } else {
        actions.push(
          `fulfillment_display_status_pending:${getShopifyFulfillmentDisplayStatus(currentFulfillmentForDisplay).toLowerCase()}`,
        )
      }
    } else if (fulfillmentEventStatus) {
      actions.push('fulfillment_event_skipped_no_fulfillment')
    } else {
      actions.push('fulfillment_event_skipped_unmapped_status')
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
        reason: isShopifyReconnectRequiredError(err) ? 'shopify_reconnect_required' : undefined,
        error: err,
        syncedStatus: effectiveOrderStatusForAudit,
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
      reason: isShopifyReconnectRequiredError(err) ? 'shopify_reconnect_required' : undefined,
      error: err?.response?.data || err?.message || err,
    }
  }
}
