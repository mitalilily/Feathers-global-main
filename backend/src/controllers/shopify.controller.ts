import { Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { users } from '../models/schema/users'
import {
  SHOPIFY_API_VERSION,
  SHOPIFY_REAUTHORIZATION_REQUIRED_CODE,
  buildShopifyOAuthAuthorizeUrl,
  claimShopifyManagedStoreForMerchant,
  completeShopifyManagedInstall,
  completeShopifyOAuthInstall,
  connectShopifyStore,
  getConfiguredShopifyCredentials,
  getShopifyOAuthConfig,
  getShopifyComplianceWebhookAddress,
  getShopifyWebhookAddress,
  processShopifyComplianceWebhook,
  processShopifyAppUninstalled,
  processShopifyWebhookOrder,
  probeShopifyStore,
  syncShopifyOrdersForUser,
  updateShopifyStoreSettingsForUser,
  isValidShopifyDomain,
  normalizeShopifyDomain,
  verifyShopifyOAuthState,
  verifyShopifyInstallBootstrap,
  verifyShopifyOAuthQueryHmac,
  verifyShopifyWebhookSignatureForDomain,
} from '../models/services/shopify.service'
import { findUserById, saveRefreshToken } from '../models/services/userService'
import { signAccessToken, signRefreshToken, verifyAccessToken } from '../utils/jwt'
import { logShopifyInstallEvent } from '../models/services/shopifyInstallAudit.service'

const ensureCanConnectForUser = async (actorUserId: string, targetUserId: string) => {
  if (actorUserId === targetUserId) return true

  const [actor] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorUserId)).limit(1)
  return actor?.role === 'admin'
}

const getShopifyAdminStatusPayload = () => {
  const configured = getConfiguredShopifyCredentials()
  const oauthConfig = getShopifyOAuthConfig()
  const webhookUrl = getShopifyWebhookAddress()

  return {
    configured: configured.configured,
    oauthConfigured: oauthConfig.configured,
    store: configured.storeUrl || null,
    apiVersion: SHOPIFY_API_VERSION,
    oauthRedirectUri: oauthConfig.redirectUri || null,
    webhookUrl,
    complianceWebhookUrl: getShopifyComplianceWebhookAddress(),
    webhookPublic: /^https:\/\//i.test(webhookUrl) && !/localhost|127\.0\.0\.1/i.test(webhookUrl),
    hasAccessToken: Boolean(configured.adminApiAccessToken),
    hasWebhookSecret: Boolean(configured.webhookSecret),
    requiredScopes: oauthConfig.scopes,
    protectedCustomerData: {
      required: true,
      fields: ['name', 'email', 'phone', 'shipping_address', 'billing_address'],
      note:
        'Shopify only returns buyer name, phone, email, and addresses after the app is granted protected customer data access for these fields.',
    },
  }
}

const getShopifyOAuthFrontendUrl = () => {
  const config = getShopifyOAuthConfig()
  const rawUrl = config.frontendUrl || 'http://localhost:5173/channels/connected'

  try {
    const url = new URL(rawUrl)
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/channels/connected'
    }
    return url.toString()
  } catch {
    return 'http://localhost:5173/channels/connected'
  }
}

const buildShopifyOAuthFrontendRedirect = ({
  status,
  shop,
  message,
  returnTo,
}: {
  status: 'connected' | 'error'
  shop?: string
  message?: string
  returnTo?: string
}) => {
  const fallbackUrl = getShopifyOAuthFrontendUrl()
  const target = String(returnTo || '').trim()
  let url: URL

  try {
    const fallback = new URL(fallbackUrl)
    if (target.startsWith('/')) {
      url = new URL(target, fallback.origin)
    } else if (target) {
      const requested = new URL(target)
      url = requested.origin === fallback.origin ? requested : fallback
    } else {
      url = fallback
    }
  } catch {
    url = new URL('http://localhost:5173/channels/connected')
  }

  url.searchParams.set('shopify', status)
  if (shop) url.searchParams.set('shop', shop)
  if (message) url.searchParams.set('message', message)
  return url.toString()
}

export const shopifyOAuthInstallController = async (req: Request, res: Response): Promise<any> => {
  const shop = normalizeShopifyDomain(String(req.query?.shop || ''))

  try {
    if (!isValidShopifyDomain(shop)) {
      throw new Error('Invalid Shopify shop domain')
    }

    if (req.query?.hmac && !verifyShopifyOAuthQueryHmac(req.query as Record<string, any>)) {
      throw new Error('Invalid Shopify install request')
    }

    const url = new URL(getShopifyOAuthFrontendUrl())
    url.searchParams.set('shopifyInstall', '1')
    url.searchParams.set('shop', shop)
    return res.redirect(302, url.toString())
  } catch (error: any) {
    const redirectUrl = buildShopifyOAuthFrontendRedirect({
      status: 'error',
      message: error?.message || 'Shopify install could not be started',
    })
    return res.redirect(302, redirectUrl)
  }
}

export const startShopifyOAuthController = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = req.user?.sub
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' })

    const requestedUserId = String(req.body?.userId || req.body?.targetUserId || '').trim()
    const targetUserId = requestedUserId || userId
    const canConnect = await ensureCanConnectForUser(userId, targetUserId)
    if (!canConnect) {
      return res.status(403).json({ success: false, error: 'Admin access is required to bind another user' })
    }

    const shop = String(req.body?.shop || req.body?.storeUrl || req.query?.shop || '').trim()
    const returnTo = String(req.body?.returnTo || req.query?.returnTo || '/channels/connected').trim()
    const result = buildShopifyOAuthAuthorizeUrl({ shop, userId: targetUserId, returnTo })

    return res.status(200).json({
      success: true,
      message: 'Shopify OAuth authorization URL created',
      data: result,
      authUrl: result.authUrl,
    })
  } catch (error: any) {
    return res.status(error?.statusCode || 400).json({
      success: false,
      error: error?.message || 'Failed to start Shopify OAuth',
    })
  }
}

export const shopifyOAuthCallbackController = async (req: Request, res: Response): Promise<any> => {
  try {
    const result = await completeShopifyOAuthInstall(req.query as Record<string, any>)
    const redirectUrl = buildShopifyOAuthFrontendRedirect({
      status: 'connected',
      shop: result.shop,
      message: result.warning || 'Shopify connected successfully',
      returnTo: result.returnTo,
    })
    return res.redirect(302, redirectUrl)
  } catch (error: any) {
    console.error('Shopify OAuth callback failed:', error?.response?.data || error?.message || error)
    const shop = normalizeShopifyDomain(String(req.query?.shop || ''))
    let returnTo: string | undefined

    try {
      const state = String(req.query?.state || '')
      if (state) {
        returnTo = verifyShopifyOAuthState(state).returnTo
      }
    } catch {
      returnTo = undefined
    }

    const redirectUrl = buildShopifyOAuthFrontendRedirect({
      status: 'error',
      shop: isValidShopifyDomain(shop) ? shop : undefined,
      message: error?.message || 'Shopify OAuth failed',
      returnTo,
    })
    return res.redirect(302, redirectUrl)
  }
}

export const publicStartShopifyOAuthController = async (_req: Request, res: Response): Promise<any> =>
  res.status(400).json({
    success: false,
    error: 'Open Feather Global from Shopify Admin to complete the secure embedded installation.',
  })

export const exchangeShopifySessionController = async (req: Request, res: Response): Promise<any> => {
  try {
    const sessionToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (!sessionToken) {
      return res.status(401).set('Cache-Control', 'no-store').json({
        success: false,
        error: 'Shopify session token is required',
        code: 'SHOPIFY_SESSION_MISSING',
      })
    }
    const result = await completeShopifyManagedInstall(sessionToken)
    return res.status(200).set('Cache-Control', 'no-store').json({
      success: true,
      message: 'Shopify managed install completed successfully',
      shop: result.shop,
      bootstrap: result.bootstrap,
      accountLinkAllowed: result.accountLinkAllowed,
    })
  } catch (error: any) {
    const authFailure =
      error?.response?.status === 401 ||
      ['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(String(error?.name || '')) ||
      /^Invalid Shopify session token/i.test(String(error?.message || ''))
    return res.status(authFailure ? 401 : 400).set('Cache-Control', 'no-store').json({
      success: false,
      error: authFailure
        ? 'Your Shopify session expired. Refresh the app and try again.'
        : error?.message || 'Failed to complete Shopify managed install',
      code: authFailure ? 'SHOPIFY_SESSION_INVALID' : 'SHOPIFY_INSTALL_FAILED',
    })
  }
}

export const exchangeShopifyBootstrapController = async (req: Request, res: Response): Promise<any> => {
  try {
    const bootstrap = String(req.body?.bootstrap || '').trim()
    if (!bootstrap) return res.status(400).json({ success: false, error: 'Shopify bootstrap token is required' })
    const payload = verifyShopifyInstallBootstrap(bootstrap)
    const user = await findUserById(payload.userId)
    if (!user) return res.status(404).json({ success: false, error: 'Shopify merchant account not found' })
    const accessToken = signAccessToken(user.id, user.role ?? 'customer')
    const { token: refreshToken } = signRefreshToken(user.id, user.role ?? 'customer')
    await saveRefreshToken(user.id, refreshToken, 7 * 24 * 60 * 60 * 1000)
    return res.status(200).set('Cache-Control', 'no-store').json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        onboardingComplete: user.onboardingComplete,
      },
      shop: payload.shop,
      returnTo: payload.returnTo || '/channels/connected',
    })
  } catch (error: any) {
    return res.status(400).set('Cache-Control', 'no-store').json({
      success: false,
      error: error?.message || 'Failed to exchange Shopify bootstrap token',
    })
  }
}

export const claimShopifyMerchantAccountController = async (req: Request, res: Response): Promise<any> => {
  try {
    const sessionToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    const shiplifiAccessToken = String(req.headers['x-shiplifi-access-token'] || '').trim()
    if (!sessionToken || !shiplifiAccessToken) {
      return res.status(401).set('Cache-Control', 'no-store').json({
        success: false,
        error: 'Shopify and Feather Global sessions are required',
      })
    }
    const targetSession = await verifyAccessToken(shiplifiAccessToken)
    if (!targetSession?.sub || targetSession.role !== 'customer') {
      return res.status(403).json({ success: false, error: 'A Feather Global merchant account is required' })
    }
    const result = await claimShopifyManagedStoreForMerchant({
      sessionToken,
      targetUserId: targetSession.sub,
    })
    return res.status(200).set('Cache-Control', 'no-store').json({
      success: true,
      message: 'Shopify store linked to your Feather Global account',
      ...result,
    })
  } catch (error: any) {
    return res.status(409).set('Cache-Control', 'no-store').json({
      success: false,
      error: error?.message || 'Unable to link this Shopify store',
    })
  }
}

const SHOPIFY_FRONTEND_AUDIT_EVENTS = new Set([
  'install_page_opened',
  'app_bridge_started',
  'id_token_acquired',
  'session_exchange_started',
  'bootstrap_exchange_started',
  'install_ui_completed',
  'install_ui_failed',
])

export const shopifyInstallAuditController = async (req: Request, res: Response): Promise<any> => {
  const event = String(req.body?.event || '').trim()
  const shop = normalizeShopifyDomain(String(req.body?.shop || ''))
  if (!SHOPIFY_FRONTEND_AUDIT_EVENTS.has(event) || !isValidShopifyDomain(shop)) {
    return res.status(400).json({ success: false, error: 'Invalid Shopify install audit event' })
  }
  await logShopifyInstallEvent({
    event,
    status: event.endsWith('_failed') ? 'failed' : event.endsWith('_completed') ? 'passed' : 'info',
    requestId: String((req as any).requestId || ''),
    shop,
    source: 'frontend',
    detail: String(req.body?.detail || ''),
  })
  return res.status(204).send()
}

export const testShopifyConnectionController = async (_req: any, res: Response): Promise<any> => {
  const status = getShopifyAdminStatusPayload()

  try {
    const configured = getConfiguredShopifyCredentials()
    if (!configured.storeUrl || !configured.adminApiAccessToken) {
      return res.status(200).json({
        success: true,
        data: {
          ...status,
          connected: false,
          message: 'Shopify environment variables are not fully configured',
        },
      })
    }

    const shop = await probeShopifyStore(configured.storeUrl, configured.adminApiAccessToken)
    return res.status(200).json({
      success: true,
      data: {
        ...status,
        connected: true,
        shop: {
          id: shop.id,
          name: shop.name,
          domain: shop.domain,
          currency: shop.currency,
          timezone: shop.timezone,
          email: shop.email,
        },
      },
    })
  } catch (error: any) {
    console.error('Shopify connection test failed:', error?.response?.data || error?.message || error)
    return res.status(502).json({
      success: false,
      data: {
        ...status,
        connected: false,
      },
      error: error?.message || 'Failed to connect to Shopify Admin API',
    })
  }
}

export const connectConfiguredShopifyStoreController = async (req: any, res: Response): Promise<any> => {
  if (String(process.env.SHOPIFY_ALLOW_LEGACY_MANUAL_AUTH || '').toLowerCase() !== 'true') {
    return res.status(410).json({
      success: false,
      error: 'Configured Shopify custom app connection is no longer supported. Connect Shopify through OAuth.',
      migrationPath: '/api/integrations/shopify/oauth/start',
    })
  }

  try {
    const actorUserId = req.user?.sub
    if (!actorUserId) return res.status(401).json({ success: false, error: 'Unauthorized' })

    const requestedUserId = String(req.body?.userId || req.body?.targetUserId || '').trim()
    const targetUserId = requestedUserId || actorUserId
    const canConnect = await ensureCanConnectForUser(actorUserId, targetUserId)
    if (!canConnect) {
      return res.status(403).json({ success: false, error: 'Admin access is required to bind another user' })
    }

    const configured = getConfiguredShopifyCredentials()
    if (!configured.storeUrl || !configured.adminApiAccessToken || !configured.webhookSecret) {
      return res.status(400).json({
        success: false,
        error: 'Shopify environment variables are not fully configured',
        data: getShopifyAdminStatusPayload(),
      })
    }

    const settings =
      req.body?.settings && typeof req.body.settings === 'object' && !Array.isArray(req.body.settings)
        ? req.body.settings
        : {}

    const result = await connectShopifyStore({
      storeUrl: configured.storeUrl,
      adminApiAccessToken: configured.adminApiAccessToken,
      apiSecretKey: configured.apiSecretKey,
      webhookSecret: configured.webhookSecret,
      userId: targetUserId,
      settings,
    })

    return res.status(200).json({
      success: true,
      message: 'Shopify custom app connected successfully',
      data: {
        store: {
          id: result.store?.id,
          name: result.store?.name,
          domain: result.store?.domain,
          userId: result.store?.userId,
        },
        shop: {
          id: result.shopifyData.id,
          name: result.shopifyData.name,
          domain: result.shopifyData.domain,
          currency: result.shopifyData.currency,
          timezone: result.shopifyData.timezone,
        },
        webhooks: result.webhooks,
        warning: result.warning,
        status: getShopifyAdminStatusPayload(),
      },
    })
  } catch (error: any) {
    console.error('Shopify env store connection failed:', error?.response?.data || error?.message || error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to connect configured Shopify store',
    })
  }
}

export const syncShopifyOrdersController = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = req.user?.sub
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    const rawLimit = Number(req.body?.limit ?? req.query?.limit ?? 50)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 250) : 50
    const storeId = String(req.body?.storeId ?? req.query?.storeId ?? '').trim() || undefined

    const result = await syncShopifyOrdersForUser(userId, limit, storeId)
    return res.status(200).json({
      success: true,
      message: 'Shopify orders synced successfully',
      ...result,
    })
  } catch (error: any) {
    if (error?.code === SHOPIFY_REAUTHORIZATION_REQUIRED_CODE || error?.reconnectRequired === true) {
      console.warn('Shopify sync requires merchant reauthorization', {
        shop: error?.shop,
        code: SHOPIFY_REAUTHORIZATION_REQUIRED_CODE,
      })
      return res.status(200).set('Cache-Control', 'no-store').json({
        success: false,
        reconnectRequired: true,
        code: SHOPIFY_REAUTHORIZATION_REQUIRED_CODE,
        error: error?.message || 'Open Feather Global from Shopify Admin to reconnect this store.',
        reconnectUrl: error?.reconnectUrl || 'https://admin.shopify.com/',
      })
    }
    console.error('Shopify sync failed:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to sync Shopify orders',
    })
  }
}

export const updateShopifySettingsController = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = req.user?.sub
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    const settings =
      req.body?.settings && typeof req.body.settings === 'object' && !Array.isArray(req.body.settings)
        ? req.body.settings
        : null
    if (!settings) {
      return res.status(400).json({ success: false, error: 'Shopify settings payload is required' })
    }

    const storeId = String(req.body?.storeId || req.body?.id || '').trim() || undefined
    const result = await updateShopifyStoreSettingsForUser({ userId, storeId, settings })
    return res.status(200).json({
      success: true,
      message: result.warning ? 'Shopify settings saved with warning' : 'Shopify settings saved successfully',
      store: result.store,
      warning: result.warning,
    })
  } catch (error: any) {
    console.error('Shopify settings update failed:', error)
    return res.status(error?.statusCode || 500).json({
      success: false,
      error: error?.message || 'Failed to update Shopify settings',
    })
  }
}

export const shopifyOrderWebhookController = async (req: Request, res: Response): Promise<any> => {
  try {
    const rawBody: Buffer = req.body as Buffer
    const hmac = String(req.headers['x-shopify-hmac-sha256'] || '')
    const topic = String(req.headers['x-shopify-topic'] || '')
    const shopDomain = String(req.headers['x-shopify-shop-domain'] || '')

    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ success: false, error: 'Invalid webhook payload' })
    }

    const isValid = await verifyShopifyWebhookSignatureForDomain(rawBody, hmac, shopDomain)
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid Shopify webhook signature' })
    }

    const payload = JSON.parse(rawBody.toString('utf8') || '{}')
    const result = await db.transaction((tx: any) =>
      processShopifyWebhookOrder(shopDomain, topic, payload, tx),
    )
    return res.status(200).json({ success: true, result })
  } catch (error: any) {
    console.error('Shopify webhook handling failed:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to process Shopify webhook',
    })
  }
}

export const shopifyComplianceWebhookController = async (req: Request, res: Response): Promise<any> => {
  try {
    const rawBody: Buffer = req.body as Buffer
    const hmac = String(req.headers['x-shopify-hmac-sha256'] || '')
    const topic = String(req.headers['x-shopify-topic'] || '')
    const shopDomain = String(req.headers['x-shopify-shop-domain'] || '')

    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ success: false, error: 'Invalid webhook payload' })
    }

    const isValid = await verifyShopifyWebhookSignatureForDomain(rawBody, hmac, shopDomain)
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid Shopify webhook signature' })
    }

    const payload = JSON.parse(rawBody.toString('utf8') || '{}')
    const result = await processShopifyComplianceWebhook(shopDomain, topic, payload)
    return res.status(200).json({ success: true, result })
  } catch (error: any) {
    console.error('Shopify compliance webhook handling failed:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to process Shopify compliance webhook',
    })
  }
}

export const shopifyAppUninstalledWebhookController = async (req: Request, res: Response): Promise<any> => {
  try {
    const rawBody: Buffer = req.body as Buffer
    const hmac = String(req.headers['x-shopify-hmac-sha256'] || '')
    const shopDomain = String(req.headers['x-shopify-shop-domain'] || '')
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ success: false, error: 'Invalid webhook payload' })
    }
    if (!(await verifyShopifyWebhookSignatureForDomain(rawBody, hmac, shopDomain))) {
      return res.status(401).json({ success: false, error: 'Invalid Shopify webhook signature' })
    }
    const result = await processShopifyAppUninstalled(shopDomain)
    return res.status(200).json({ success: true, result })
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to process Shopify uninstall webhook',
    })
  }
}
