import { Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { users } from '../models/schema/users'
import {
  SHOPIFY_API_VERSION,
  connectShopifyStore,
  getConfiguredShopifyCredentials,
  getShopifyWebhookAddress,
  processShopifyWebhookOrder,
  probeShopifyStore,
  syncShopifyOrdersForUser,
  verifyShopifyWebhookSignatureForDomain,
} from '../models/services/shopify.service'

const ensureCanConnectForUser = async (actorUserId: string, targetUserId: string) => {
  if (actorUserId === targetUserId) return true

  const [actor] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorUserId)).limit(1)
  return actor?.role === 'admin'
}

const getShopifyAdminStatusPayload = () => {
  const configured = getConfiguredShopifyCredentials()
  const webhookUrl = getShopifyWebhookAddress()

  return {
    configured: configured.configured,
    store: configured.storeUrl || null,
    apiVersion: SHOPIFY_API_VERSION,
    webhookUrl,
    webhookPublic: /^https:\/\//i.test(webhookUrl) && !/localhost|127\.0\.0\.1/i.test(webhookUrl),
    hasAccessToken: Boolean(configured.adminApiAccessToken),
    hasWebhookSecret: Boolean(configured.webhookSecret),
    requiredScopes: [
      'read_orders',
      'write_orders',
      'read_webhooks',
      'write_webhooks',
      'write_merchant_managed_fulfillment_orders',
    ],
  }
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
    console.error('Shopify sync failed:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to sync Shopify orders',
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
    const result = await processShopifyWebhookOrder(shopDomain, topic, payload)
    return res.status(200).json({ success: true, result })
  } catch (error: any) {
    console.error('Shopify webhook handling failed:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to process Shopify webhook',
    })
  }
}
