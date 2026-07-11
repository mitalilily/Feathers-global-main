import { Request, Response } from 'express'
import { and, eq, gte, isNull, sql } from 'drizzle-orm'
import { db } from '../../models/client'
import { processShadowfaxWebhook } from '../../models/services/webhookProcessor'
import { pending_webhooks } from '../../schema/schema'
import { ShadowfaxService } from '../../models/services/couriers/shadowfax.service'

export const SHADOWFAX_WEBHOOK_PATH = '/webhooks/shadowfax'
export const SHADOWFAX_WEBHOOK_URL =
  process.env.SHADOWFAX_WEBHOOK_URL || `https://api.fgship.in${SHADOWFAX_WEBHOOK_PATH}`

const SHADOWFAX_REQUIRE_AUTH =
  String(process.env.SHADOWFAX_WEBHOOK_REQUIRE_AUTH || '')
    .trim()
    .toLowerCase() === 'true'
const SHADOWFAX_WEBHOOK_BASIC_USERNAME = String(
  process.env.SHADOWFAX_WEBHOOK_BASIC_USERNAME || '',
).trim()
const SHADOWFAX_WEBHOOK_BASIC_PASSWORD = String(
  process.env.SHADOWFAX_WEBHOOK_BASIC_PASSWORD || '',
).trim()
const SHADOWFAX_BASIC_AUTH_CONFIGURED = Boolean(
  SHADOWFAX_WEBHOOK_BASIC_USERNAME && SHADOWFAX_WEBHOOK_BASIC_PASSWORD,
)
const SHADOWFAX_AUTH_REQUIRED = SHADOWFAX_REQUIRE_AUTH || SHADOWFAX_BASIC_AUTH_CONFIGURED

const SHADOWFAX_SUPPORTED_EVENTS = [
  'FWD Marketplace',
  'FWD Warehouse',
  'Return Seller',
  'Return Origin',
  'Seller Delivery',
  'Invoice',
]

const summarizeHeaders = (headers: Request['headers']) => ({
  'content-type': headers['content-type'] || null,
  'user-agent': headers['user-agent'] || null,
  'x-forwarded-for': headers['x-forwarded-for'] || null,
  'x-real-ip': headers['x-real-ip'] || null,
  'x-shadowfax-secret-present': Boolean(headers['x-shadowfax-secret']),
  authorization_present: Boolean(headers['authorization']),
})

const getHeaderValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return String(value[0] || '').trim()
  return String(value || '').trim()
}

const isValidShadowfaxBasicAuth = (authorizationHeader: string) => {
  if (!SHADOWFAX_BASIC_AUTH_CONFIGURED) return false
  const [scheme, encodedCredentials] = authorizationHeader.split(/\s+/, 2)
  if (!/^basic$/i.test(scheme || '') || !encodedCredentials) return false

  let decoded = ''
  try {
    decoded = Buffer.from(encodedCredentials, 'base64').toString('utf8')
  } catch {
    return false
  }

  const separatorIndex = decoded.indexOf(':')
  if (separatorIndex < 0) return false
  const username = decoded.slice(0, separatorIndex)
  const password = decoded.slice(separatorIndex + 1)

  return username === SHADOWFAX_WEBHOOK_BASIC_USERNAME && password === SHADOWFAX_WEBHOOK_BASIC_PASSWORD
}

const unwrapShadowfaxPayload = (payload: any) => {
  if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data
  }
  if (payload?.event_data && typeof payload.event_data === 'object') return payload.event_data
  if (payload?.payload && typeof payload.payload === 'object') return payload.payload
  if (payload?.shipment && typeof payload.shipment === 'object') {
    return { ...payload.shipment, shadowfax_parent_payload: payload }
  }
  if (payload?.order && typeof payload.order === 'object') {
    return { ...payload.order, shadowfax_parent_payload: payload }
  }
  return payload || {}
}

const extractShadowfaxIdentifier = (payload: any) =>
  payload?.awb_number ||
  payload?.awb ||
  payload?.waybill ||
  payload?.tracking_id ||
  payload?.trackingId ||
  payload?.client_request_id ||
  payload?.request_id ||
  payload?.return_request_id ||
  payload?.reverse_request_id ||
  payload?.shipment_id ||
  payload?.order_id ||
  payload?.client_order_id ||
  payload?.seller_order_id ||
  payload?.invoice_id ||
  null

const extractShadowfaxStatus = (payload: any) =>
  payload?.event ||
  payload?.event_name ||
  payload?.status ||
  payload?.current_status ||
  payload?.shipment_status ||
  payload?.state ||
  payload?.invoice_status ||
  'unknown'

const isShadowfaxAuthValid = ({
  authorizationHeader,
  providedSecret,
  configuredSecret,
}: {
  authorizationHeader: string
  providedSecret: string
  configuredSecret: string
}) => {
  if (isValidShadowfaxBasicAuth(authorizationHeader)) return true
  if (configuredSecret && providedSecret.includes(configuredSecret)) return true
  if (configuredSecret && authorizationHeader.includes(configuredSecret)) return true
  return !SHADOWFAX_AUTH_REQUIRED && !configuredSecret
}

const queuePendingShadowfaxWebhook = async ({
  payload,
  awb,
  status,
  eventTimestamp,
}: {
  payload: any
  awb: unknown
  status: unknown
  eventTimestamp: unknown
}) => {
  const dedupeWindowStart = new Date(Date.now() - 10 * 60 * 1000)
  const awbValue = String(awb || 'unknown')
  const statusValue = `shadowfax:${String(status || 'unknown')}`
  const [existingPending] = await db
    .select({ id: pending_webhooks.id })
    .from(pending_webhooks)
    .where(
      and(
        eq(pending_webhooks.awb_number, awbValue),
        eq(pending_webhooks.status, statusValue),
        isNull(pending_webhooks.processed_at),
        eventTimestamp
          ? sql`coalesce(${pending_webhooks.payload}->>'shadowfax_event_timestamp', '') = ${String(eventTimestamp)}`
          : sql`true`,
        gte(pending_webhooks.created_at, dedupeWindowStart),
      ),
    )
    .limit(1)

  if (existingPending) {
    console.log('Shadowfax webhook skipped duplicate pending queue insert', {
      awb: awbValue,
      status: statusValue,
      eventTimestamp: eventTimestamp || null,
      pendingId: existingPending.id,
    })
    return
  }

  await db.insert(pending_webhooks).values({
    awb_number: awb ? String(awb) : null,
    status: statusValue,
    payload,
  })
  console.log('Shadowfax webhook queued in pending_webhooks', {
    awb: awb ? String(awb) : null,
    status: statusValue,
    eventTimestamp: eventTimestamp || null,
  })
}

const processShadowfaxWebhookAfterAck = async ({
  payload,
  awb,
  status,
  eventTimestamp,
}: {
  payload: any
  awb: unknown
  status: unknown
  eventTimestamp: unknown
}) => {
  const result = await processShadowfaxWebhook(payload)
  console.log('Shadowfax webhook processed result', {
    awb: awb ? String(awb) : null,
    status: String(status || 'unknown'),
    eventTimestamp: eventTimestamp || null,
    success: Boolean(result?.success),
    reason: result?.reason || null,
    orderType: result?.orderType || null,
  })

  if (!result.success && result.reason === 'missing_awb') {
    console.warn('Shadowfax webhook ignored after ack: missing AWB/request identifier', {
      status: String(status || 'unknown'),
      eventTimestamp: eventTimestamp || null,
    })
    return
  }

  if (!result.success && result.reason === 'order_not_found') {
    await queuePendingShadowfaxWebhook({ payload, awb, status, eventTimestamp })
    return
  }

  if (!result.success) {
    console.warn('Shadowfax webhook accepted but not processed:', {
      awb: awb ? String(awb) : null,
      status: String(status || 'unknown'),
      reason: result.reason || null,
    })
  }
}

export const shadowfaxWebhookHealthHandler = (_req: Request, res: Response) =>
  res.status(200).json({
    success: true,
    provider: 'shadowfax',
    deliveryUrl: SHADOWFAX_WEBHOOK_URL,
    clientPushUrl: SHADOWFAX_WEBHOOK_URL,
    aliases: ['/api/webhook/shadowfax', '/api/webhook/shadowfax/track'],
    supportedEvents: SHADOWFAX_SUPPORTED_EVENTS,
    authentication: {
      type: SHADOWFAX_BASIC_AUTH_CONFIGURED ? 'basic_auth' : 'optional_shared_secret',
      required: SHADOWFAX_AUTH_REQUIRED,
      authorizationPresent: SHADOWFAX_BASIC_AUTH_CONFIGURED,
      acceptedHeaders: ['authorization', 'x-shadowfax-secret'],
    },
    expectedResponse: '200 OK',
  })

export const shadowfaxWebhookHandler = async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString()
  const rawPayload = req.body || {}
  const normalizedPayload = unwrapShadowfaxPayload(rawPayload)
  const eventTimestamp =
    normalizedPayload?.event_timestamp ||
    normalizedPayload?.event_time ||
    normalizedPayload?.status_time ||
    normalizedPayload?.updated_at ||
    normalizedPayload?.timestamp ||
    rawPayload?.event_timestamp ||
    rawPayload?.event_time ||
    rawPayload?.status_time ||
    rawPayload?.updated_at ||
    rawPayload?.timestamp ||
    null
  const payload = {
    ...normalizedPayload,
    shadowfax_raw_payload: rawPayload,
    shadowfax_event_timestamp: eventTimestamp ? String(eventTimestamp) : null,
  }
  const awb = extractShadowfaxIdentifier(payload)
  const status = extractShadowfaxStatus(payload)

  console.log('='.repeat(80))
  console.log(`[${timestamp}] Shadowfax webhook received`)
  console.log(`AWB/Request: ${awb || 'N/A'}`)
  console.log(`Status: ${status}`)
  console.log(`Event Timestamp: ${eventTimestamp || 'N/A'}`)
  console.log(`IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`)
  console.log('Headers:', summarizeHeaders(req.headers))
  console.log('Body Keys:', Object.keys(payload || {}))
  console.log('Full Payload:', JSON.stringify(payload, null, 2))
  console.log('='.repeat(80))

  res.status(200).json({
    success: true,
    accepted: true,
    processing: true,
  })

  setImmediate(() => {
    ;(async () => {
      const shadowfax = new ShadowfaxService()
      const configuredSecret = await shadowfax.getConfiguredWebhookSecret()
      const authorizationHeader = getHeaderValue(req.headers['authorization'])
      const providedSecret = getHeaderValue(req.headers['x-shadowfax-secret'])

      if (!isShadowfaxAuthValid({ authorizationHeader, providedSecret, configuredSecret })) {
        console.warn('Shadowfax webhook auth validation failed; acknowledged without processing.', {
          awb: awb || null,
          status: String(status || 'unknown'),
          eventTimestamp: eventTimestamp || null,
          headers: summarizeHeaders(req.headers),
          strictAuth: SHADOWFAX_AUTH_REQUIRED,
          basicAuthConfigured: SHADOWFAX_BASIC_AUTH_CONFIGURED,
        })
        return
      }

      if (SHADOWFAX_AUTH_REQUIRED && !authorizationHeader && !providedSecret) {
        console.warn(
          'Shadowfax webhook received without authorization; acknowledged without processing.',
        )
      }

      await processShadowfaxWebhookAfterAck({ payload, awb, status, eventTimestamp })
    })().catch((err: any) => {
      console.error('Shadowfax webhook background error:', {
        message: err?.message || String(err),
        awb: awb || null,
        status: String(status || 'unknown'),
        eventTimestamp: eventTimestamp || null,
        stack: err?.stack || null,
      })
    })
  })
}
