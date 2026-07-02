import { Request, Response } from 'express'
import { and, eq, gte, isNull } from 'drizzle-orm'
import crypto from 'crypto'
import {
  XPRESSBEES_WEBHOOK_SIGNATURE_HEADER,
  XPRESSBEES_WEBHOOK_URL,
} from '../../config/xpressbeesWebhook'
import { db } from '../../models/client'
import { processXpressbeesWebhook } from '../../models/services/webhookProcessor'
import { courier_credentials } from '../../models/schema/courierCredentials'
import { pending_webhooks } from '../../schema/schema'

const XPRESSBEES_WEBHOOK_SECRET_HEADERS = [
  'x-hmac-sha256',
  'x-xpressbees-webhook-secret',
  'x-xpressbees-webhook-signature',
  'x-xpressbees-signature',
  'x-webhook-secret',
  'x-webhook-signature',
  'authorization',
]

const findSecretHeader = (headers: Request['headers']) => {
  const normalized = headers as Record<string, string | string[] | undefined>
  for (const header of XPRESSBEES_WEBHOOK_SECRET_HEADERS) {
    const value = normalized[header] || normalized[header.toLowerCase()]
    if (!value) continue
    if (Array.isArray(value) && value.length) return String(value[0]).trim()
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

const fetchXpressbeesWebhookSecret = async () => {
  try {
    const [row] = await db
      .select({
        webhookSecret: courier_credentials.webhookSecret,
      })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'xpressbees'))
      .limit(1)
    return (row?.webhookSecret || '').trim()
  } catch (err: any) {
    console.error('❌ Failed to load Xpressbees webhook secret:', err?.message || err)
    return ''
  }
}

const extractEventPayload = (payload: any) => {
  if (Array.isArray(payload?.data) && payload.data.length > 0) return payload.data[0]
  if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data
  }
  return payload
}

const timingSafeStringEqual = (actual: string, expected: string) => {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

const buildExpectedSignatureCandidates = (configuredSecret: string, rawBody: string) => {
  const digest = crypto.createHmac('sha256', configuredSecret).update(rawBody).digest()
  const base64Signature = digest.toString('base64')
  const hexSignature = digest.toString('hex')

  return [
    configuredSecret,
    base64Signature,
    `sha256=${hexSignature}`,
    hexSignature,
  ]
}

export const xpressbeesWebhookHealthHandler = (_req: Request, res: Response) =>
  res.status(200).json({
    success: true,
    provider: 'xpressbees',
    webhookUrl: XPRESSBEES_WEBHOOK_URL,
    authentication: {
      type: 'hmac_sha256',
      headerName: XPRESSBEES_WEBHOOK_SIGNATURE_HEADER,
      encoding: 'base64',
      fallbackHeaders: XPRESSBEES_WEBHOOK_SECRET_HEADERS.filter(
        (header) => header !== 'x-hmac-sha256',
      ),
    },
    expectedResponse: '200 OK',
  })

export const xpressbeesWebhookHandler = async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString()
  const payload = req.body
  const configuredSecret = await fetchXpressbeesWebhookSecret()
  const receivedSecret = findSecretHeader(req.headers)
  const rawBody =
    (req as any).rawBody || (req.body ? JSON.stringify(req.body) : '')
  const event = extractEventPayload(payload)
  const awb =
    event?.awb_number ||
    event?.awb ||
    event?.waybill ||
    event?.tracking_id ||
    event?.trackingId ||
    null
  const status =
    event?.current_status ||
    event?.shipment_status ||
    event?.status ||
    event?.event ||
    event?.event_name ||
    'unknown'

  console.log('='.repeat(80))
  console.log(`📦 [${timestamp}] Xpressbees Webhook Received`)
  console.log(`   AWB: ${awb || 'N/A'}`)
  console.log(`   Status: ${status}`)
  console.log(`   IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`)
  console.log(`   Headers:`, JSON.stringify(req.headers, null, 2))
  console.log(`   Full Payload:`, JSON.stringify(payload, null, 2))
  console.log('='.repeat(80))

  try {
    if (configuredSecret) {
      if (!receivedSecret) {
        console.warn('Xpressbees webhook rejected: missing signature/secret header')
        return res.status(401).json({ success: false, message: 'missing webhook secret' })
      } else {
        const normalizedHeader = receivedSecret.startsWith('Bearer ')
          ? receivedSecret.slice('Bearer '.length).trim()
          : receivedSecret
        const candidateValues = Array.from(
          new Set([
            normalizedHeader,
            normalizedHeader.startsWith('sha256=')
              ? normalizedHeader
              : `sha256=${normalizedHeader}`,
          ]),
        )
        const expectedValues = buildExpectedSignatureCandidates(configuredSecret, rawBody)
        const matchesExpectedSignature = candidateValues.some((candidate) =>
          expectedValues.some((expectedValue) => timingSafeStringEqual(candidate, expectedValue)),
        )

        if (!matchesExpectedSignature) {
          console.warn('⚠️ Xpressbees webhook rejected: invalid secret/signature')
          return res.status(401).json({ success: false, message: 'invalid webhook secret' })
        }
      }
    }

    const result = await processXpressbeesWebhook(payload)

    if (!result.success && result.reason === 'missing_awb') {
      return res.status(200).json({
        success: true,
        accepted: true,
        ignored: true,
        reason: 'missing_awb',
      })
    }

    if (!result.success && result.reason === 'order_not_found') {
      const dedupeWindowStart = new Date(Date.now() - 10 * 60 * 1000)
      const [existingPending] = await db
        .select({ id: pending_webhooks.id })
        .from(pending_webhooks)
        .where(
          and(
            eq(pending_webhooks.awb_number, String(awb || 'unknown')),
            eq(pending_webhooks.status, `xpressbees:${String(status || 'unknown')}`),
            isNull(pending_webhooks.processed_at),
            gte(pending_webhooks.created_at, dedupeWindowStart),
          ),
        )
        .limit(1)

      if (!existingPending) {
        await db.insert(pending_webhooks).values({
          awb_number: awb || null,
          status: `xpressbees:${String(status || 'unknown')}`,
          payload: {
            __provider: 'xpressbees',
            body: payload,
          },
        })
        console.warn(`⚠️ Stored Xpressbees webhook for AWB ${awb || 'N/A'} (order not yet created).`)
      } else {
        console.warn(
          `⚠️ Duplicate pending Xpressbees webhook skipped for AWB ${awb || 'N/A'} (within dedupe window).`,
        )
      }

      return res.status(200).json({ success: true, accepted: true, queued: true })
    }

    if (!result.success) {
      return res.status(200).json({
        success: true,
        accepted: true,
        processed: false,
        reason: result.reason,
      })
    }

    return res.status(200).json({ success: true })
  } catch (err: any) {
    console.error('❌ Xpressbees webhook processing failed:', err?.message || err)
    return res.status(500).json({ success: false, message: 'Internal Server Error' })
  }
}
