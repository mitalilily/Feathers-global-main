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
    console.error('Failed to load Xpressbees webhook secret:', err?.message || err)
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
    base64Signature,
    `sha256=${base64Signature}`,
    hexSignature,
    `sha256=${hexSignature}`,
  ]
}

const maskSensitiveHeaders = (headers: Request['headers']) => {
  const masked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase()
    if (
      normalized.includes('authorization') ||
      normalized.includes('secret') ||
      normalized.includes('signature') ||
      normalized.includes('hmac')
    ) {
      masked[key] = '[masked]'
    } else {
      masked[key] = value
    }
  }
  return masked
}

const verifyXpressbeesWebhookSignature = ({
  configuredSecret,
  receivedSecret,
  rawBody,
}: {
  configuredSecret: string
  receivedSecret: string
  rawBody: string
}) => {
  if (!configuredSecret) return { valid: true, unsigned: !receivedSecret }
  if (!receivedSecret) return { valid: true, unsigned: true }

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
  const valid = candidateValues.some((candidate) =>
    expectedValues.some((expectedValue) => timingSafeStringEqual(candidate, expectedValue)),
  )

  return { valid, unsigned: false }
}

const processXpressbeesWebhookAfterAck = async ({
  payload,
  awb,
  status,
}: {
  payload: any
  awb: unknown
  status: unknown
}) => {
  const result = await processXpressbeesWebhook(payload)

  if (!result.success && result.reason === 'missing_awb') {
    console.warn('Xpressbees webhook ignored after ack: missing AWB')
    return
  }

  if (!result.success && result.reason === 'order_not_found') {
    const dedupeWindowStart = new Date(Date.now() - 10 * 60 * 1000)
    const awbValue = String(awb || 'unknown')
    const statusValue = `xpressbees:${String(status || 'unknown')}`
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
          __provider: 'xpressbees',
          body: payload,
        },
      })
      console.warn(`Stored Xpressbees webhook for AWB ${awb || 'N/A'} (order not yet created).`)
    } else {
      console.warn(
        `Duplicate pending Xpressbees webhook skipped for AWB ${awb || 'N/A'} (within dedupe window).`,
      )
    }
    return
  }

  if (!result.success) {
    console.warn('Xpressbees webhook accepted but not processed:', result.reason)
  }
}

export const xpressbeesWebhookHealthHandler = (_req: Request, res: Response) =>
  res.status(200).json({
    success: true,
    provider: 'xpressbees',
    webhookUrl: XPRESSBEES_WEBHOOK_URL,
    deliveryUrl: XPRESSBEES_WEBHOOK_URL,
    authentication: {
      type: 'hmac_sha256',
      headerName: XPRESSBEES_WEBHOOK_SIGNATURE_HEADER,
      encoding: 'base64',
      fallbackHeaders: XPRESSBEES_WEBHOOK_SECRET_HEADERS.filter(
        (header) => header !== 'x-hmac-sha256',
      ),
      sample: "base64_encode(hash_hmac('sha256', raw_request_body, secret, true))",
    },
    expectedResponse: '200 OK',
    timeoutSafe: true,
  })

export const xpressbeesWebhookHandler = async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString()
  const payload = req.body
  const rawBody = (req as any).rawBody || (req.body ? JSON.stringify(req.body) : '')
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
  console.log(`[${timestamp}] Xpressbees webhook received`)
  console.log(`   AWB: ${awb || 'N/A'}`)
  console.log(`   Status: ${status}`)
  console.log(`   IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`)
  console.log('   Headers:', JSON.stringify(maskSensitiveHeaders(req.headers), null, 2))
  console.log('   Payload:', JSON.stringify(payload, null, 2))
  console.log('='.repeat(80))

  res.status(200).json({
    success: true,
    accepted: true,
    processing: true,
  })

  setImmediate(() => {
    ;(async () => {
      const configuredSecret = await fetchXpressbeesWebhookSecret()
      const receivedSecret = findSecretHeader(req.headers)
      const signature = verifyXpressbeesWebhookSignature({
        configuredSecret,
        receivedSecret,
        rawBody,
      })

      if (!signature.valid) {
        console.warn('Xpressbees webhook signature mismatch; acknowledged without processing.')
        return
      }

      if (signature.unsigned && configuredSecret) {
        console.warn(
          'Xpressbees webhook received without signature. Processing because provider sends no hash when Secret is blank.',
        )
      }

      processXpressbeesWebhookAfterAck({ payload, awb, status }).catch((err: any) => {
        console.error('Xpressbees webhook background processing failed:', err?.message || err)
      })
    })().catch((err: any) => {
      console.error('Xpressbees webhook background verification failed:', err?.message || err)
    })
  })
}
