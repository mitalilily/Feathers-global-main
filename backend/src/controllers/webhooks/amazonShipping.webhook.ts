import crypto from 'crypto'
import { Request, Response } from 'express'
import { and, eq, gte, isNull } from 'drizzle-orm'
import { db } from '../../models/client'
import {
  AMAZON_SHIPPING_APPLICATION_ID,
  AMAZON_SHIPPING_WEBHOOK_API_KEY_HEADER,
  AMAZON_SHIPPING_WEBHOOK_URL,
} from '../../config/amazonShippingWebhook'
import {
  getAmazonShippingWebhookSummary,
  processAmazonShippingTrackingWebhook,
} from '../../models/services/webhookProcessor'
import { pending_webhooks } from '../../schema/schema'

const AMAZON_WEBHOOK_API_KEY_ENV_KEYS = [
  'AMAZON_SHIPPING_WEBHOOK_API_KEY',
  'AMAZON_WEBHOOK_API_KEY',
  'AMAZON_SHIPPING_WEBHOOK_SECRET',
]

const getConfiguredApiKey = () =>
  AMAZON_WEBHOOK_API_KEY_ENV_KEYS.map((key) => String(process.env[key] || '').trim()).find(Boolean) ||
  ''

const timingSafeStringEqual = (actual: string, expected: string) => {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}

const summarizeHeaders = (req: Request) => ({
  'content-type': req.headers['content-type'] || null,
  'user-agent': req.headers['user-agent'] || null,
  'x-forwarded-for': req.headers['x-forwarded-for'] || null,
  'x-real-ip': req.headers['x-real-ip'] || null,
  'x-api-key-present': Boolean(req.get(AMAZON_SHIPPING_WEBHOOK_API_KEY_HEADER)),
})

const queuePendingAmazonWebhook = async (payload: any) => {
  const summary = getAmazonShippingWebhookSummary(payload)
  const awb = summary.trackingId || summary.shipmentId || summary.orderRef || null
  const status = `amazon:${summary.status || summary.eventCode || 'unknown'}`

  if (!awb) {
    return { queued: false, reason: 'missing_awb' }
  }

  const dedupeWindowStart = new Date(Date.now() - 10 * 60 * 1000)
  const [existingPending] = await db
    .select({ id: pending_webhooks.id })
    .from(pending_webhooks)
    .where(
      and(
        eq(pending_webhooks.awb_number, awb),
        eq(pending_webhooks.status, status),
        isNull(pending_webhooks.processed_at),
        gte(pending_webhooks.created_at, dedupeWindowStart),
      ),
    )
    .limit(1)

  if (existingPending) {
    return { queued: true, duplicate: true, awb, status }
  }

  await db.insert(pending_webhooks).values({
    awb_number: awb,
    status,
    payload: {
      __provider: 'amazon',
      body: payload,
    },
  })

  return { queued: true, duplicate: false, awb, status }
}

export const amazonShippingTrackingWebhookHandler = async (req: Request, res: Response) => {
  const configuredApiKey = getConfiguredApiKey()
  const receivedApiKey = String(req.get(AMAZON_SHIPPING_WEBHOOK_API_KEY_HEADER) || '').trim()
  const summary = getAmazonShippingWebhookSummary(req.body)

  console.log('[AmazonShippingWebhook] received', {
    trackingId: summary.trackingId || null,
    shipmentId: summary.shipmentId || null,
    orderRef: summary.orderRef || null,
    status: summary.status || summary.eventCode || null,
    eventTime: summary.eventTime || null,
    shippingPartyAccountId: summary.shippingPartyAccountId || null,
    ip: req.ip || req.socket.remoteAddress || null,
    headers: summarizeHeaders(req),
  })

  if (!configuredApiKey) {
    console.error('[AmazonShippingWebhook] AMAZON_SHIPPING_WEBHOOK_API_KEY is not configured')
    return res.status(503).json({
      success: false,
      message: 'Amazon Shipping webhook is not configured',
    })
  }

  if (!receivedApiKey || !timingSafeStringEqual(receivedApiKey, configuredApiKey)) {
    console.warn('[AmazonShippingWebhook] rejected invalid API key', {
      trackingId: summary.trackingId || null,
      shipmentId: summary.shipmentId || null,
    })
    return res.status(401).json({ success: false, message: 'invalid api key' })
  }

  try {
    const result = await processAmazonShippingTrackingWebhook(req.body)

    if (!result.success && result.reason === 'missing_awb') {
      return res.status(200).json({
        success: true,
        accepted: true,
        ignored: true,
        reason: 'missing Amazon trackingId, shipmentId, or order reference',
      })
    }

    if (!result.success && result.reason === 'order_not_found') {
      const queued = await queuePendingAmazonWebhook(req.body)
      return res.status(200).json({
        success: true,
        accepted: true,
        queued: true,
        duplicate: Boolean('duplicate' in queued && queued.duplicate),
      })
    }

    if (!result.success) {
      return res.status(202).json({ success: false, reason: result.reason || 'unknown' })
    }

    return res.status(200).json({ success: true })
  } catch (err: any) {
    console.error('[AmazonShippingWebhook] processing failed:', {
      message: err?.message || String(err),
      stack: err?.stack || null,
      trackingId: summary.trackingId || null,
      shipmentId: summary.shipmentId || null,
    })
    return res.status(500).json({ success: false, message: 'Internal Server Error' })
  }
}

export const amazonShippingTrackingWebhookHealthHandler = (_req: Request, res: Response) =>
  res.status(200).json({
    success: true,
    provider: 'amazon-shipping',
    webhookUrl: AMAZON_SHIPPING_WEBHOOK_URL,
    applicationId: AMAZON_SHIPPING_APPLICATION_ID,
    authentication: {
      type: 'api_key_header',
      headerName: AMAZON_SHIPPING_WEBHOOK_API_KEY_HEADER,
    },
  })
