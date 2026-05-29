import { eq } from 'drizzle-orm'
import { sendWebhookEvent } from '../../services/webhookDelivery.service'
import { db } from '../client'
import { b2c_orders } from '../schema/b2cOrders'
import { cancelAmazonShipment } from './amazonShipping.service'
import {
  applyAmazonShippingCredentialsToEnv,
  getStoredAmazonShippingCredentials,
} from './amazonShippingCredentials.service'
import { DelhiveryService } from './couriers/delhivery.service'
import { EkartService } from './couriers/ekart.service'
import { ShadowfaxService } from './couriers/shadowfax.service'
import { XpressbeesService } from './couriers/xpressbees.service'
import { logTrackingEvent } from './trackingEvents.service'
import { applyCancellationRefundOnce } from './webhookProcessor'

const SUPPORTED_CANCELLATION_PROVIDERS = new Set([
  'delhivery',
  'ekart',
  'xpressbees',
  'shadowfax',
  'amazon',
])

const TERMINAL_NON_CANCELLABLE_STATUSES = new Set(['delivered', 'rto_delivered'])

const cancellationResponseText = (value: unknown) => {
  try {
    return JSON.stringify(value || {}).toLowerCase()
  } catch {
    return String(value || '').toLowerCase()
  }
}

const isCancellationAccepted = (result: any) => {
  const responseText = cancellationResponseText(result)
  const numericStatus = Number(
    result?.status ??
      result?.responseCode ??
      result?.code ??
      result?.ReturnCode ??
      result?.returnCode,
  )
  const alreadyCancelled =
    responseText.includes('already cancelled') || responseText.includes('already canceled')
  const rejected =
    responseText.includes('not accepted') ||
    responseText.includes('failed') ||
    responseText.includes('failure')
  const acceptedText =
    responseText.includes('cancelled') ||
    responseText.includes('canceled') ||
    responseText.includes('shipment updated successfully') ||
    responseText.includes('successful') ||
    responseText.includes('cancellation initiated') ||
    responseText.includes('cancellation accepted') ||
    responseText.includes('cancellation request accepted')

  return (
    alreadyCancelled ||
    result?.success === true ||
    result?.Success === true ||
    result?.status === true ||
    String(result?.ReturnCode || result?.returnCode || '').trim() === '100' ||
    String(result?.status || '').toLowerCase() === 'success' ||
    (Number.isFinite(numericStatus) && numericStatus >= 200 && numericStatus < 300) ||
    result?.response?.status === true ||
    (acceptedText && !rejected)
  )
}

const getCancellationErrorMessage = (result: any) =>
  result?.error ||
  result?.message ||
  result?.ReturnMessage ||
  result?.returnMessage ||
  result?.responseMsg ||
  result?.remark ||
  'Courier cancellation not accepted'

const truncateText = (value: unknown, maxLength: number) => {
  const text = String(value || '').trim()
  if (!text) return null
  return text.length > maxLength ? text.slice(0, maxLength - 3).trimEnd() + '...' : text
}

const getCancellationDeliveryMessage = (result: any) =>
  truncateText(
    result?.message ||
      result?.ReturnMessage ||
      result?.returnMessage ||
      result?.remark ||
      result?.responseMsg,
    100,
  )

const resolveCancellationProvider = (order: any) => {
  const providerText = `${order?.integration_type || ''} ${order?.courier_partner || ''}`
    .trim()
    .toLowerCase()
  if (providerText.includes('delhivery')) return 'delhivery'
  if (providerText.includes('ekart')) return 'ekart'
  if (providerText.includes('xpressbees') || providerText.includes('xpress bees')) {
    return 'xpressbees'
  }
  if (providerText.includes('shadowfax')) return 'shadowfax'
  if (providerText.includes('amazon')) return 'amazon'
  return providerText
}

export async function cancelOrderShipment(orderId: string) {
  console.log('Starting cancellation for orderId:', orderId)

  const [order] = await db.select().from(b2c_orders).where(eq(b2c_orders.id, orderId))

  if (!order) {
    console.error('Order not found:', orderId)
    throw new Error('Order not found')
  }

  const integration = resolveCancellationProvider(order)
  const currentStatus = String(order.order_status || '').trim().toLowerCase()
  const awbNumber = String(order.awb_number || '').trim()

  console.log('Order found for cancellation:', {
    orderId: order.id,
    orderNumber: order.order_number,
    integrationType: integration,
    awbNumber,
    shipmentId: order.shipment_id,
    currentStatus,
  })

  if (currentStatus === 'cancelled') {
    return {
      success: true,
      alreadyCancelled: true,
      message: 'Order already cancelled',
    }
  }

  if (TERMINAL_NON_CANCELLABLE_STATUSES.has(currentStatus)) {
    throw new Error(`Order is already ${currentStatus} and cannot be cancelled`)
  }

  if (!SUPPORTED_CANCELLATION_PROVIDERS.has(integration)) {
    console.error('Unsupported integration type:', { orderId, integration })
    throw new Error('Only Delhivery, Ekart, Xpressbees, Shadowfax and Amazon are supported for cancellation')
  }

  const amazonShipmentId = String(
    order.shipment_id ||
      order.provider_reference ||
      order.order_id ||
      (order.provider_meta as any)?.shipment_id ||
      (order.provider_meta as any)?.provider_reference ||
      (order.provider_meta as any)?.shipmentId ||
      '',
  ).trim()

  if (integration === 'amazon' && !amazonShipmentId) {
    console.error('Amazon cancellation failed: Missing shipment id', {
      orderId,
      integration,
      awbNumber,
      shipmentId: order.shipment_id,
      providerReference: order.provider_reference,
    })
    throw new Error('Amazon cancellation requires a shipment id')
  }

  console.log('Attempting courier cancellation:', {
    orderId,
    awbNumber,
    shipmentId: integration === 'amazon' ? amazonShipmentId : order.shipment_id,
    integration,
  })

  let cancellationResult: any = null
  if (integration === 'delhivery' && !awbNumber) {
    throw new Error('Delhivery cancellation requires an AWB number')
  }

  if (integration !== 'amazon' && !awbNumber) {
    cancellationResult = {
      success: true,
      localOnly: true,
      message: 'Order has no provider AWB yet; cancelled locally before courier booking.',
    }
  } else if (integration === 'delhivery') {
    const svc = new DelhiveryService()
    cancellationResult = await svc.cancelShipment(awbNumber)
  } else if (integration === 'ekart') {
    const svc = new EkartService()
    cancellationResult = await svc.cancelShipment(awbNumber)
  } else if (integration === 'shadowfax') {
    const svc = new ShadowfaxService()
    const shadowfaxCancelRef = String(
      order.provider_request_id || order.provider_reference || awbNumber,
    ).trim()
    console.log('Shadowfax cancellation identifier', {
      orderId,
      awbNumber,
      providerRequestId: order.provider_request_id,
      providerReference: order.provider_reference,
      cancelReference: shadowfaxCancelRef,
      orderStatus: order.order_status,
    })
    cancellationResult = await svc.cancelShipment(shadowfaxCancelRef)
  } else if (integration === 'amazon') {
    const amazonCredentials = await getStoredAmazonShippingCredentials()
    applyAmazonShippingCredentialsToEnv(amazonCredentials)
    cancellationResult = await cancelAmazonShipment(
      {
        shipmentId: amazonShipmentId,
      },
      amazonCredentials,
    )
  } else {
    const svc = new XpressbeesService()
    cancellationResult = await svc.cancelShipment(awbNumber)
  }

  const isSuccess = isCancellationAccepted(cancellationResult)

  console.log('Courier cancellation response validation:', {
    integration,
    isSuccess,
    success: cancellationResult?.success,
    Success: cancellationResult?.Success,
    status: cancellationResult?.status,
    statusType: typeof cancellationResult?.status,
    remark: cancellationResult?.remark,
    message: cancellationResult?.message,
    error: cancellationResult?.error,
    fullResponse: cancellationResult,
  })

  if (!isSuccess) {
    const errorMsg = getCancellationErrorMessage(cancellationResult)
    console.error('Courier cancellation failed:', {
      orderId,
      integration,
      response: cancellationResult,
      message: errorMsg,
    })
    throw new Error(errorMsg)
  }

  const finalStatus = 'cancelled'
  console.log(`Updating order status to ${finalStatus}:`, { orderId, integration })
  const cancelledAt = new Date()
  const providerMeta: Record<string, unknown> =
    order.provider_meta && typeof order.provider_meta === 'object' && !Array.isArray(order.provider_meta)
      ? (order.provider_meta as Record<string, unknown>)
      : {}

  await db.transaction(async (tx) => {
    await tx
      .update(b2c_orders)
      .set({
        order_status: finalStatus,
        pickup_status: finalStatus,
        provider_last_status: finalStatus,
        delivery_message: getCancellationDeliveryMessage(cancellationResult),
        provider_meta: {
          ...providerMeta,
          cancellation: {
            provider: integration,
            requested_at: cancelledAt.toISOString(),
            awb_number: awbNumber || null,
            result: cancellationResult,
          },
        },
        updated_at: cancelledAt,
      })
      .where(eq(b2c_orders.id, orderId))

    await applyCancellationRefundOnce(tx, order, 'pickup_cancel_api')
  })

  await logTrackingEvent({
    orderId: order.id,
    userId: order.user_id,
    awbNumber: awbNumber || null,
    courier: order.courier_partner || integration,
    statusCode: finalStatus,
    statusText: 'Shipment cancelled',
    raw: cancellationResult,
  }).catch((err) => {
    console.warn('Failed to log cancellation tracking event:', err)
  })

  await sendWebhookEvent(order.user_id, 'tracking.updated', {
    awb_number: awbNumber || order.awb_number,
    order_id: order.id,
    order_number: order.order_number,
    status: finalStatus,
    raw_status: finalStatus,
    courier_partner: order.courier_partner,
  }).catch((err) => {
    console.warn('Failed to send cancellation tracking webhook:', err)
  })

  await sendWebhookEvent(order.user_id, 'order.cancelled', {
    awb_number: awbNumber || order.awb_number,
    order_id: order.id,
    order_number: order.order_number,
    status: finalStatus,
    courier_partner: order.courier_partner,
  }).catch((err) => {
    console.warn('Failed to send order cancellation webhook:', err)
  })

  console.log(`Order status updated to ${finalStatus} successfully:`, { orderId, integration })

  return cancellationResult
}
