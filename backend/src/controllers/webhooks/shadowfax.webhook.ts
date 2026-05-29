import { Request, Response } from 'express'
import { and, eq, gte, isNull, sql } from 'drizzle-orm'
import { db } from '../../models/client'
import { processShadowfaxWebhook } from '../../models/services/webhookProcessor'
import { pending_webhooks } from '../../schema/schema'
import { ShadowfaxService } from '../../models/services/couriers/shadowfax.service'

const summarizeHeaders = (headers: Request['headers']) => ({
  'content-type': headers['content-type'] || null,
  'user-agent': headers['user-agent'] || null,
  'x-forwarded-for': headers['x-forwarded-for'] || null,
  'x-real-ip': headers['x-real-ip'] || null,
  'x-shadowfax-secret-present': Boolean(headers['x-shadowfax-secret']),
  authorization_present: Boolean(headers['authorization']),
})

export const shadowfaxWebhookHandler = async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString()
  const rawPayload = req.body || {}
  const eventTimestamp =
    rawPayload?.event_timestamp ||
    rawPayload?.event_time ||
    rawPayload?.status_time ||
    rawPayload?.updated_at ||
    rawPayload?.timestamp ||
    null
  const payload = {
    ...rawPayload,
    shadowfax_event_timestamp: eventTimestamp ? String(eventTimestamp) : null,
  }
  const awb =
    payload?.awb_number || payload?.client_request_id || payload?.request_id || payload?.order_id || null
  const status = payload?.event || payload?.status || payload?.current_status || 'unknown'
  const bodyKeys = Object.keys(payload || {})

  console.log('='.repeat(80))
  console.log(`📦 [${timestamp}] Shadowfax Webhook Received`)
  console.log(`   AWB/Request: ${awb || 'N/A'}`)
  console.log(`   Status: ${status}`)
  console.log(`   Event Timestamp: ${eventTimestamp || 'N/A'}`)
  console.log(`   IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`)
  console.log(`   Headers:`, summarizeHeaders(req.headers))
  console.log(`   Body Keys:`, bodyKeys)
  console.log(`   Full Payload:`, JSON.stringify(payload, null, 2))
  console.log('='.repeat(80))

  try {
    const shadowfax = new ShadowfaxService()
    const configuredSecret = shadowfax.configuredWebhookSecret
    if (configuredSecret) {
      const providedSecret =
        String(req.headers['x-shadowfax-secret'] || req.headers['authorization'] || '').trim()
      if (!providedSecret || !providedSecret.includes(configuredSecret)) {
        console.warn('❌ Shadowfax webhook auth validation failed', {
          awb: awb || null,
          status: String(status || 'unknown'),
          eventTimestamp: eventTimestamp || null,
          headers: summarizeHeaders(req.headers),
        })
        return res.status(401).json({ message: 'Invalid Shadowfax webhook signature' })
      }
    }

    if (!awb) {
      console.warn('❌ Shadowfax webhook missing identifier', {
        status: String(status || 'unknown'),
        eventTimestamp: eventTimestamp || null,
        bodyKeys,
      })
      return res.status(400).json({ message: 'Missing AWB/request identifier' })
    }

    const result = await processShadowfaxWebhook(payload)
    console.log('📦 Shadowfax webhook processed result', {
      awb: String(awb),
      status: String(status || 'unknown'),
      eventTimestamp: eventTimestamp || null,
      success: Boolean(result?.success),
      reason: result?.reason || null,
      orderType: result?.orderType || null,
    })
    if (!result.success && result.reason === 'order_not_found') {
      const dedupeWindowStart = new Date(Date.now() - 10 * 60 * 1000)
      const [existingPending] = await db
        .select({ id: pending_webhooks.id })
        .from(pending_webhooks)
        .where(
          and(
            eq(pending_webhooks.awb_number, String(awb)),
            eq(pending_webhooks.status, `shadowfax:${String(status || 'unknown')}`),
            isNull(pending_webhooks.processed_at),
            eventTimestamp
              ? sql`coalesce(${pending_webhooks.payload}->>'shadowfax_event_timestamp', '') = ${String(eventTimestamp)}`
              : sql`true`,
            gte(pending_webhooks.created_at, dedupeWindowStart),
          ),
        )
        .limit(1)

      if (!existingPending) {
        await db.insert(pending_webhooks).values({
          awb_number: String(awb),
          status: `shadowfax:${String(status || 'unknown')}`,
          payload,
        })
        console.log('📥 Shadowfax webhook queued in pending_webhooks', {
          awb: String(awb),
          status: String(status || 'unknown'),
          eventTimestamp: eventTimestamp || null,
        })
      } else {
        console.log('ℹ️ Shadowfax webhook skipped duplicate pending queue insert', {
          awb: String(awb),
          status: String(status || 'unknown'),
          eventTimestamp: eventTimestamp || null,
          pendingId: existingPending.id,
        })
      }

      return res.status(202).json({ success: true, queued: true })
    }

    if (result.success) {
      console.log('✅ Shadowfax webhook completed', {
        awb: String(awb),
        status: String(status || 'unknown'),
        eventTimestamp: eventTimestamp || null,
      })
      return res.status(200).json({ success: true })
    }

    console.warn('⚠️ Shadowfax webhook returned non-success outcome', {
      awb: String(awb),
      status: String(status || 'unknown'),
      eventTimestamp: eventTimestamp || null,
      result,
    })
    return res.status(202).json({ success: false })
  } catch (err: any) {
    console.error('❌ Shadowfax webhook error:', {
      message: err?.message || String(err),
      awb: awb || null,
      status: String(status || 'unknown'),
      eventTimestamp: eventTimestamp || null,
      stack: err?.stack || null,
    })
    return res.status(500).json({ message: 'Internal Server Error' })
  }
}
