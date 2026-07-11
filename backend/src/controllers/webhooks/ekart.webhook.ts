import { Request, Response } from 'express'
import { and, eq, gte, isNull } from 'drizzle-orm'
import { db } from '../../models/client'
import { processEkartWebhook } from '../../models/services/webhookProcessor'
import { courier_credentials } from '../../models/schema/courierCredentials'
import { pending_webhooks } from '../../schema/schema'
import crypto from 'crypto'

const EKART_WEBHOOK_SECRET_HEADERS = [
  'x-ekart-webhook-secret',
  'x-ekart-webhook-signature',
  'x-ekart-signature',
  'x-ekart-hmac-sha256',
  'x-hmac-sha256',
  'x-webhook-signature',
  'x-signature',
  'x-hub-signature-256',
]

const EKART_PROVIDER = 'ekart'
const EKART_REQUIRE_SIGNATURE =
  String(process.env.EKART_WEBHOOK_REQUIRE_SIGNATURE || '')
    .trim()
    .toLowerCase() === 'true'

const findSecretHeader = (headers: Request['headers']) => {
  const normalized = headers as Record<string, string | string[] | undefined>
  for (const header of EKART_WEBHOOK_SECRET_HEADERS) {
    const value = normalized[header] || normalized[header.toLowerCase()]
    if (!value) continue
    if (Array.isArray(value) && value.length) return String(value[0]).trim()
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

const timingSafeStringEqual = (left: string, right: string) => {
  const leftBuf = Buffer.from(left)
  const rightBuf = Buffer.from(right)
  return leftBuf.length === rightBuf.length && crypto.timingSafeEqual(leftBuf, rightBuf)
}

const verifyEkartWebhookSignature = ({
  receivedSecret,
  configuredSecret,
  rawBody,
}: {
  receivedSecret: string
  configuredSecret: string
  rawBody: string
}) => {
  if (!configuredSecret) return { valid: true, unsigned: !receivedSecret }
  if (!receivedSecret) return { valid: !EKART_REQUIRE_SIGNATURE, unsigned: true }

  const normalizedHeader = receivedSecret.startsWith('Bearer ')
    ? receivedSecret.slice('Bearer '.length).trim()
    : receivedSecret

  if (timingSafeStringEqual(normalizedHeader, configuredSecret)) {
    return { valid: true, unsigned: false }
  }

  const hmacHex = crypto.createHmac('sha256', configuredSecret).update(rawBody).digest('hex')
  const hmacBase64 = crypto.createHmac('sha256', configuredSecret).update(rawBody).digest('base64')
  const candidates = [hmacHex, `sha256=${hmacHex}`, hmacBase64, `sha256=${hmacBase64}`]

  return {
    valid: candidates.some((candidate) => timingSafeStringEqual(normalizedHeader, candidate)),
    unsigned: false,
  }
}

const sanitizeHeadersForLog = (headers: Request['headers']) => {
  const sensitiveHeaders = new Set(EKART_WEBHOOK_SECRET_HEADERS)
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      sensitiveHeaders.has(key.toLowerCase()) ? '[redacted]' : value,
    ]),
  )
}

const fetchEkartWebhookSecret = async () => {
  const envSecret = String(process.env.EKART_WEBHOOK_SECRET || '').trim()

  try {
    const [row] = await db
      .select({
        webhookSecret: courier_credentials.webhookSecret,
      })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, EKART_PROVIDER))
      .limit(1)
    return (row?.webhookSecret || '').trim() || envSecret
  } catch (err: any) {
    console.error('Failed to load Ekart webhook secret:', err?.message || err)
    return envSecret
  }
}

const extractEkartWebhookAwb = (payload: any) =>
  payload?.tracking_id ||
  payload?.trackingId ||
  payload?.awb ||
  payload?.waybill ||
  payload?.wbn ||
  payload?.id ||
  payload?.track?.id ||
  payload?.track?.wbn ||
  payload?.track_updated?.id ||
  payload?.track_updated?.wbn ||
  payload?.barcodes?.wbn ||
  'unknown'

const extractEkartWebhookStatus = (payload: any) =>
  String(
    payload?.status ||
      payload?.current_status ||
      payload?.event ||
      payload?.track_updated?.status ||
      payload?.track?.status ||
      'unknown',
  )

const processEkartWebhookAfterAck = async ({
  payload,
  awb,
  status,
}: {
  payload: any
  awb: unknown
  status: unknown
}) => {
  const result = await processEkartWebhook(payload)

  if (!result.success && result.reason === 'missing_awb') {
    console.warn('Ekart webhook ignored after ack: missing AWB')
    return
  }

  if (!result.success && result.reason === 'order_not_found') {
    const dedupeWindowStart = new Date(Date.now() - 10 * 60 * 1000)
    const awbValue = String(awb || 'unknown')
    const statusValue = `ekart:${String(status || 'unknown')}`
    const [existingPending] = await db
      .select({ id: pending_webhooks.id })
      .from(pending_webhooks)
      .where(
        and(
          eq(pending_webhooks.awb_number, awbValue),
          eq(pending_webhooks.status, statusValue),
          isNull(pending_webhooks.processed_at),
          gte(pending_webhooks.created_at, dedupeWindowStart),
        ),
      )
      .limit(1)

    if (!existingPending) {
      await db.insert(pending_webhooks).values({
        awb_number: awb ? String(awb) : null,
        status: statusValue,
        payload: {
          __provider: 'ekart',
          body: payload,
        },
      })
      console.warn(`Stored Ekart webhook for AWB ${awb || 'N/A'} (order not yet created).`)
    } else {
      console.warn(
        `Duplicate pending Ekart webhook skipped for AWB ${awb || 'N/A'} (within dedupe window).`,
      )
    }
    return
  }

  if (!result.success) {
    console.warn('Ekart webhook accepted but not processed:', result.reason)
  }
}

export const ekartWebhookHandler = async (req: Request, res: Response) => {
  const payload = req.body
  const rawBody = (req as any).rawBody || (req.body ? JSON.stringify(req.body) : '')
  const awb = extractEkartWebhookAwb(payload)
  const status = extractEkartWebhookStatus(payload)

  console.log('='.repeat(80))
  console.log(`[Ekart] Webhook received - AWB: ${awb}`)
  console.log(`Status: ${status}`)
  console.log(`IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`)
  console.log('Headers:', JSON.stringify(sanitizeHeadersForLog(req.headers), null, 2))
  console.log('Payload:', JSON.stringify(payload, null, 2))
  console.log('='.repeat(80))

  res.status(200).json({
    success: true,
    accepted: true,
    processing: true,
  })

  setImmediate(() => {
    ;(async () => {
      const configuredSecret = await fetchEkartWebhookSecret()
      const receivedSecret = findSecretHeader(req.headers)
      const signature = verifyEkartWebhookSignature({
        configuredSecret,
        receivedSecret,
        rawBody,
      })

      if (!signature.valid) {
        console.warn('Ekart webhook signature mismatch; acknowledged without processing.', {
          requireSignature: EKART_REQUIRE_SIGNATURE,
          hasConfiguredSecret: Boolean(configuredSecret),
          hasReceivedSignature: Boolean(receivedSecret),
        })
        return
      }

      if (signature.unsigned && configuredSecret) {
        console.warn(
          EKART_REQUIRE_SIGNATURE
            ? 'Ekart webhook received without signature and strict verification is enabled; skipped.'
            : 'Ekart webhook received without signature. Processing because Ekart tracking callbacks may not send a signature header.',
        )
      }

      await processEkartWebhookAfterAck({ payload, awb, status })
    })().catch((err: any) => {
      console.error('Ekart webhook background processing failed:', err?.message || err)
    })
  })
}
