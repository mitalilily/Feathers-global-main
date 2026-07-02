import assert from 'node:assert/strict'
import * as crypto from 'node:crypto'
import path from 'node:path'
import * as dotenv from 'dotenv'

type CliOptions = {
  mock: boolean
  requirePublic: boolean
  shop?: string
  returnTo: string
}

const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

const hasArg = (name: string) => process.argv.includes(`--${name}`)

const getArgValue = (name: string) => {
  const prefix = `--${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length).trim() : undefined
}

const parseCliOptions = (): CliOptions => ({
  mock: hasArg('mock') || String(process.env.SHOPIFY_OAUTH_MOCK || '').toLowerCase() === 'true',
  requirePublic:
    hasArg('require-public') || String(process.env.SHOPIFY_OAUTH_REQUIRE_PUBLIC || '').toLowerCase() === 'true',
  shop: getArgValue('shop') || process.env.SHOPIFY_OAUTH_CHECK_SHOP,
  returnTo: getArgValue('return-to') || process.env.SHOPIFY_OAUTH_CHECK_RETURN_TO || '/channels/connected',
})

const mask = (value: string) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}...`
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`
}

const applyMockEnv = () => {
  process.env.API_URL = 'https://api.fgship.in'
  process.env.SHOPIFY_CLIENT_ID = 'mock_shopify_client_id'
  process.env.SHOPIFY_CLIENT_SECRET = 'mock_shopify_client_secret'
  process.env.SHOPIFY_SCOPES =
    'read_orders,write_orders,read_customers,read_products,read_webhooks,write_webhooks,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders'
  process.env.SHOPIFY_API_VERSION = '2026-07'
  process.env.SHOPIFY_OAUTH_SUCCESS_URL = 'https://client.fgship.in/channels/connected'
  process.env.SHOPIFY_USE_EXPIRING_OFFLINE_TOKENS = 'true'
  process.env.SHOPIFY_SEND_OAUTH_SCOPE = 'false'
}

const callbackHmac = (params: Record<string, string>, clientSecret: string) => {
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
  return crypto.createHmac('sha256', clientSecret).update(message).digest('hex')
}

const assertPublicRedirectUri = (redirectUri: string) => {
  const url = new URL(redirectUri)
  const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname)
  if (url.protocol !== 'https:' || isLocal) {
    throw new Error(`Shopify OAuth redirect URI must be public HTTPS in production: ${redirectUri}`)
  }
}

const legacyShopifyEnvPresent = () =>
  [
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET',
    'SHOPIFY_API_SECRET_KEY',
    'SHOPIFY_WEBHOOK_SECRET',
    'SHOPIFY_ACCESS_TOKEN',
    'SHOPIFY_ADMIN_API_ACCESS_TOKEN',
  ].filter((key) => String(process.env[key] || '').trim())

const main = async () => {
  const options = parseCliOptions()
  if (options.mock) applyMockEnv()

  // The OAuth helpers live in the Shopify service, which imports the shared DB module.
  // This smoke check does not connect to the DB, but the module requires a DATABASE_URL.
  process.env.DATABASE_URL ||= 'postgresql://shopify_oauth_check@127.0.0.1:5432/shopify_oauth_check'

  const {
    buildShopifyOAuthAuthorizeUrl,
    getShopifyOAuthConfig,
    normalizeShopifyDomain,
    verifyShopifyOAuthQueryHmac,
    verifyShopifyOAuthState,
  } = await import('../models/services/shopify.service')

  const config = getShopifyOAuthConfig()
  const missing = [
    !config.clientId && 'SHOPIFY_CLIENT_ID',
    !config.clientSecret && 'SHOPIFY_CLIENT_SECRET',
    !config.redirectUri && 'API_URL or SHOPIFY_OAUTH_REDIRECT_URI',
  ].filter(Boolean)

  if (missing.length) {
    const legacyKeys = legacyShopifyEnvPresent()
    const legacyHint = legacyKeys.length
      ? ` Legacy Shopify custom-app env is present (${legacyKeys.join(
          ', ',
        )}), but OAuth intentionally ignores those values. Set Shopify Dev Dashboard credentials as SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.`
      : ''
    throw new Error(`Missing Shopify OAuth configuration: ${missing.join(', ')}.${legacyHint}`)
  }
  if (!config.useExpiringOfflineTokens) {
    throw new Error('SHOPIFY_USE_EXPIRING_OFFLINE_TOKENS must stay enabled for the public multi-merchant flow')
  }
  if (options.requirePublic) assertPublicRedirectUri(config.redirectUri)

  const shop = normalizeShopifyDomain(options.shop || 'fgship-oauth-smoke.myshopify.com')
  const userId = '00000000-0000-0000-0000-000000000000'
  const result = buildShopifyOAuthAuthorizeUrl({
    shop,
    userId,
    returnTo: options.returnTo,
  })

  const authorizeUrl = new URL(result.authUrl)
  assert.equal(authorizeUrl.hostname, shop)
  assert.equal(authorizeUrl.pathname, '/admin/oauth/authorize')
  assert.equal(authorizeUrl.searchParams.get('client_id'), config.clientId)
  if (config.sendOAuthScope) {
    assert.equal(authorizeUrl.searchParams.get('scope'), config.scopes.join(','))
  } else {
    assert.equal(authorizeUrl.searchParams.has('scope'), false)
  }
  assert.equal(authorizeUrl.searchParams.get('redirect_uri'), config.redirectUri)
  assert.equal(authorizeUrl.searchParams.has('grant_options[]'), false)

  const state = authorizeUrl.searchParams.get('state') || ''
  const statePayload = verifyShopifyOAuthState(state)
  assert.equal(statePayload.shop, shop)
  assert.equal(statePayload.userId, userId)
  assert.equal(statePayload.returnTo, options.returnTo)

  const callbackQuery = {
    code: 'mock_authorization_code',
    shop,
    state,
    timestamp: String(Math.floor(Date.now() / 1000)),
  }
  const hmac = callbackHmac(callbackQuery, config.clientSecret)
  assert.equal(verifyShopifyOAuthQueryHmac({ ...callbackQuery, hmac }), true)

  console.log('Shopify OAuth smoke check passed')
  console.log(
    JSON.stringify(
      {
        mode: options.mock ? 'mock' : 'configured',
        shop,
        clientId: mask(config.clientId),
        redirectUri: config.redirectUri,
        scopes: config.scopes,
        scopeSource: result.scopeSource,
        accessMode: result.accessMode,
        expiringOfflineTokens: config.useExpiringOfflineTokens,
        grantOptions: 'omitted_for_offline_access',
        callbackHmacVerified: true,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error('Shopify OAuth smoke check failed')
  console.error(error?.message || String(error))
  process.exit(1)
})
