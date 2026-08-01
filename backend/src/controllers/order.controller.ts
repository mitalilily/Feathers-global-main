// controllers/shipmentController.ts
import axios from 'axios'
import { Request, Response } from 'express'
import { and, eq, inArray } from 'drizzle-orm'
import { PDFDocument } from 'pdf-lib'
import {
  bookExistingB2COrderWithCourierService,
  checkMerchantOrderNumberAvailability,
  createB2BShipmentService,
  createB2COrderDraftService,
  createB2CShipmentService,
  fetchAvailableCouriersWithRates,
  generateManifestService,
  getAllOrdersService,
  getB2BOrdersByUserService,
  getB2COrdersByUserService,
  retryFailedManifestService,
  ShipmentParams,
  trackByAwbService,
  trackByOrderService,
} from '../models/services/shiprocket.service'
import { regenerateOrderDocumentsServiceAdmin } from '../models/services/adminOrders.service'
import { db } from '../models/client'
import { b2c_orders } from '../models/schema/b2cOrders'
import { courierPriorityProfiles } from '../models/schema/courierPriority'
import { addresses, pickupAddresses } from '../models/schema/pickupAddresses'
import { generateLabelForOrder } from '../models/services/generateCustomLabelService'
import { presignDownload } from '../models/services/upload.service'
import { getOrderLabelReference, isExternalLabelReference } from '../utils/orderLabels'
import { getMerchantSafeOperationalError } from '../utils/merchantErrorMessages'
import { getMerchantScopedUserId } from '../utils/merchantScope'

const isOperationalTimeoutError = (error: any) => {
  const message = String(error?.message || '')
    .trim()
    .toLowerCase()

  return (
    error?.code === 'ECONNABORTED' ||
    error?.code === 'ETIMEDOUT' ||
    message.includes('timeout') ||
    message.includes('timed out')
  )
}

const BULK_LABEL_DOWNLOAD_TIMEOUT_MS = 30000
const BULK_LABEL_ORDER_FETCH_CHUNK_SIZE = 500

const todayIsoDate = () => new Date().toISOString().slice(0, 10)

const normalizeRuleText = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()

const toNumberOrZero = (value: unknown) => {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num : 0
}

const getOrderAmountForAutoAssign = (order: any) => {
  const products = Array.isArray(order.products) ? order.products : []
  const subtotal = products.reduce(
    (sum: number, product: Record<string, any>) =>
      sum +
      toNumberOrZero(product.price) * toNumberOrZero(product.quantity ?? product.qty ?? 1) -
      toNumberOrZero(product.discount),
    0,
  )
  return subtotal > 0 ? subtotal : toNumberOrZero(order.order_amount)
}

const getOrderPaymentMode = (order: any) =>
  normalizeRuleText(order.order_type) === 'cod' ? 'cod' : 'prepaid'

const getOrderChannel = (order: any) => {
  const orderId = normalizeRuleText(order.order_id)
  if (orderId.startsWith('shopify_')) return 'shopify'
  if (orderId.startsWith('woo_')) return 'woocommerce'
  if (order.is_external_api) return 'api'
  return 'manual'
}

const getOrderTags = (order: any) =>
  String(order.tags || '')
    .split(/[,\|]/)
    .map((tag) => normalizeRuleText(tag))
    .filter(Boolean)

const getOrderSkus = (order: any) =>
  (Array.isArray(order.products) ? order.products : [])
    .map((product: any) => normalizeRuleText(product.sku ?? product.product_sku ?? product.itemSku))
    .filter(Boolean)

const normalizeConditionValues = (value: unknown) =>
  (Array.isArray(value) ? value : [value])
    .map((entry) => normalizeRuleText(entry))
    .filter(Boolean)

const conditionMatches = (condition: any, order: any, zoneCode?: string | null) => {
  const type = normalizeRuleText(condition?.type)
  if (!type) return true
  const values = normalizeConditionValues(condition?.value)

  if (type === 'payment_mode' || type === 'payment' || type === 'payment mode') {
    return !values.length || values.includes(getOrderPaymentMode(order))
  }

  if (type === 'weight') {
    const weightKg = toNumberOrZero(order.weight)
    const min = condition?.min === undefined || condition?.min === '' ? -Infinity : Number(condition.min)
    const max = condition?.max === undefined || condition?.max === '' ? Infinity : Number(condition.max)
    return weightKg >= min && weightKg <= max
  }

  if (type === 'zone' || type === 'zone_wise' || type === 'zone wise') {
    if (!values.length) return true
    return values.includes(normalizeRuleText(zoneCode))
  }

  if (type === 'channel') {
    return !values.length || values.includes(getOrderChannel(order))
  }

  if (type === 'order_tags' || type === 'order tags' || type === 'tags') {
    if (!values.length) return true
    const tags = getOrderTags(order)
    return values.some((value) => tags.includes(value))
  }

  if (type === 'product_sku' || type === 'product sku' || type === 'sku') {
    if (!values.length) return true
    const skus = getOrderSkus(order)
    return values.some((value) => skus.includes(value))
  }

  return true
}

const ruleMatchesOrder = (rule: any, order: any, zoneCode?: string | null) => {
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : []
  return conditions.every((condition: any) => conditionMatches(condition, order, zoneCode))
}

const normalizeCourierProvider = (courier: any) =>
  normalizeRuleText(courier.integration_type ?? courier.serviceProvider ?? courier.service_provider)

const getCourierOptionKey = (courier: any) =>
  String(
    courier.courier_option_key ??
      `${courier.id ?? courier.courier_id}__${normalizeCourierProvider(courier)}__${courier.max_slab_weight ?? 'base'}`,
  )

const priorityCourierMatches = (priority: any, courier: any) => {
  const priorityCourierId = normalizeRuleText(priority?.courierId ?? priority?.courier_id)
  const courierId = normalizeRuleText(courier.id ?? courier.courier_id)
  if (priorityCourierId && priorityCourierId !== courierId) return false

  const priorityProvider = normalizeRuleText(priority?.integration_type ?? priority?.serviceProvider)
  if (priorityProvider && priorityProvider !== normalizeCourierProvider(courier)) return false

  const priorityMaxSlab = priority?.max_slab_weight
  if (
    priorityMaxSlab !== undefined &&
    priorityMaxSlab !== null &&
    String(priorityMaxSlab) !== String(courier.max_slab_weight ?? '')
  ) {
    return false
  }

  return true
}

const orderCouriersByRule = (couriers: any[], rule: any) => {
  const priority = Array.isArray(rule?.personalised_order) ? rule.personalised_order : []
  const ordered: any[] = []
  priority
    .slice()
    .sort((a: any, b: any) => Number(a.priority ?? 0) - Number(b.priority ?? 0))
    .forEach((entry: any) => {
      couriers.forEach((courier) => {
        const key = getCourierOptionKey(courier)
        if (!ordered.some((existing) => getCourierOptionKey(existing) === key) && priorityCourierMatches(entry, courier)) {
          ordered.push(courier)
        }
      })
    })
  couriers.forEach((courier) => {
    if (!ordered.some((existing) => getCourierOptionKey(existing) === getCourierOptionKey(courier))) {
      ordered.push(courier)
    }
  })
  return ordered
}

const getForwardRateForAutoAssign = (courier: any) =>
  toNumberOrZero(courier.localRates?.forward?.rate ?? courier.rate ?? courier.freight_charges)

const getCodRateForAutoAssign = (courier: any, order: any) =>
  getOrderPaymentMode(order) === 'cod'
    ? toNumberOrZero(courier.localRates?.forward?.cod_charges ?? courier.cod_charges)
    : 0

const getOtherRateForAutoAssign = (courier: any) =>
  toNumberOrZero(courier.localRates?.forward?.other_charges ?? courier.other_charges)

const getCourierEddForAutoAssign = (courier: any) =>
  [
    courier.expected_delivery_date_label,
    courier.edd,
    courier.expected_delivery_date,
    courier.expectedDeliveryDate,
    courier.estimated_delivery_date,
    courier.estimatedDeliveryDate,
  ]
    .map((value) => String(value ?? '').trim())
    .find(Boolean)

const getAddressLine = (address: any) =>
  [address?.addressLine1, address?.addressLine2].filter(Boolean).join(', ')

const buildAutoAssignBookingPayload = ({
  order,
  courier,
  pickup,
  rto,
  pickupLocationId,
  pickupDate,
  pickupTime,
}: {
  order: any
  courier: any
  pickup: any
  rto?: any
  pickupLocationId: string
  pickupDate: string
  pickupTime: string
}) => ({
  payment_type: getOrderPaymentMode(order),
  package_weight: toNumberOrZero(order.weight),
  package_length: toNumberOrZero(order.length),
  package_breadth: toNumberOrZero(order.breadth),
  package_height: toNumberOrZero(order.height),
  order_amount: getOrderAmountForAutoAssign(order),
  shipping_charges: toNumberOrZero(order.shipping_charges),
  prepaid_amount: toNumberOrZero(order.prepaid_amount),
  discount: toNumberOrZero(order.discount),
  transaction_fee: toNumberOrZero(order.transaction_fee),
  gift_wrap: toNumberOrZero(order.gift_wrap),
  freight_charges: getForwardRateForAutoAssign(courier),
  cod_charges: getCodRateForAutoAssign(courier, order),
  other_charges: getOtherRateForAutoAssign(courier),
  courier_cost: toNumberOrZero(courier.courier_cost_estimate ?? courier.rate),
  integration_type: courier.integration_type ?? courier.serviceProvider,
  courier_id: Number(courier.id ?? courier.courier_id),
  courier_partner: courier.name ?? courier.displayName,
  courier_option_key: getCourierOptionKey(courier),
  edd: getCourierEddForAutoAssign(courier),
  expected_delivery_date:
    courier.expected_delivery_date ??
    courier.expectedDeliveryDate ??
    courier.estimated_delivery_date ??
    courier.estimatedDeliveryDate ??
    undefined,
  expectedDeliveryDate:
    courier.expectedDeliveryDate ??
    courier.expected_delivery_date ??
    courier.estimatedDeliveryDate ??
    courier.estimated_delivery_date ??
    undefined,
  expected_delivery_days: courier.expected_delivery_days ?? courier.edd_days ?? undefined,
  amazon_request_token: courier.amazon_request_token,
  amazon_rate_id: courier.amazon_rate_id,
  amazon_service_id: courier.amazon_service_id,
  amazon_carrier_id: courier.amazon_carrier_id,
  shadowfax_forward_mode: courier.provider_serviceability?.mode ?? courier.mode ?? 'marketplace',
  shadowfax_service_mode: courier.provider_serviceability?.service_mode ?? courier.service_mode,
  selected_max_slab_weight: courier.max_slab_weight ?? undefined,
  pickup_location_id: pickupLocationId,
  pickup_date: pickupDate,
  pickup_time: pickupTime,
  delivery_location: courier.approxZone?.code ?? courier.approxZone?.name,
  zone_id: courier.approxZone?.id,
  chargedWeight: courier.localRates?.forward?.chargeable_weight ?? courier.chargeable_weight ?? undefined,
  volumetricWeight:
    courier.localRates?.forward?.volumetric_weight ?? courier.volumetric_weight ?? undefined,
  pickup: {
    warehouse_name: pickup.addressNickname || pickup.contactName || '',
    name: pickup.contactName || pickup.addressNickname || '',
    phone: pickup.contactPhone || '',
    address: getAddressLine(pickup),
    city: pickup.city || '',
    state: pickup.state || '',
    pincode: pickup.pincode || '',
    pickup_date: pickupDate,
    pickup_time: pickupTime,
  },
  is_rto_different: rto ? 'yes' : 'no',
  ...(rto
    ? {
        rto: {
          warehouse_name: rto.addressNickname || rto.contactName || '',
          name: rto.contactName || rto.addressNickname || '',
          phone: rto.contactPhone || '',
          address: getAddressLine(rto),
          city: rto.city || '',
          state: rto.state || '',
          pincode: rto.pincode || '',
        },
      }
    : {}),
})

const sanitizeBulkPdfFileName = (value: string) =>
  value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'bulk-labels'

const resolveLabelDownloadUrl = async (labelReference: string) => {
  const trimmedReference = String(labelReference || '').trim()
  if (!trimmedReference) return null

  if (/^data:application\/pdf;base64,/i.test(trimmedReference)) {
    return trimmedReference
  }

  if (isExternalLabelReference(trimmedReference)) {
    return trimmedReference
  }

  const signed = await presignDownload(trimmedReference, {
    disposition: 'inline',
    contentType: 'application/pdf',
  })
  return Array.isArray(signed) ? signed[0] : signed
}

const fetchPdfBuffer = async (source: string) => {
  if (/^data:application\/pdf;base64,/i.test(source)) {
    const base64 = source.replace(/^data:application\/pdf;base64,/i, '')
    return Buffer.from(base64, 'base64')
  }

  const response = await axios.get(source, {
    responseType: 'arraybuffer',
    timeout: BULK_LABEL_DOWNLOAD_TIMEOUT_MS,
  })
  return Buffer.from(response.data)
}

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = []
  const chunkSize = Math.max(1, size)
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }
  return chunks
}

export const createB2CShipmentController = async (req: any, res: Response) => {
  try {
    const id = getMerchantScopedUserId(req)
    if (!id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }
    // Local order creation (via dashboard), so is_external_api = false
    console.log('[ShipmentCreate] B2C request received', {
      user_id: id || null,
      order_number: req.body?.order_number || null,
      integration_type: req.body?.integration_type || null,
      payment_type: req.body?.payment_type || null,
      courier_id: req.body?.courier_id ?? null,
      courier_partner: req.body?.courier_partner || null,
      has_amazon_request_token: Boolean(req.body?.amazon_request_token || req.body?.requestToken),
      has_amazon_rate_id: Boolean(req.body?.amazon_rate_id || req.body?.rateId),
      amazon_service_id: req.body?.amazon_service_id || null,
      amazon_carrier_id: req.body?.amazon_carrier_id || null,
    })

    // Set a longer timeout for B2C order creation (3 minutes)
    // External courier API calls (Delhivery) can take time
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Order creation timed out after 3 minutes')), 180000)
    })

    const shipmentPromise = createB2CShipmentService(req.body, id, false)

    const shipment = (await Promise.race([shipmentPromise, timeoutPromise])) as Awaited<
      ReturnType<typeof createB2CShipmentService>
    >

    res.status(200).json({ success: true, shipment })
  } catch (error: any) {
    console.error('Error creating B2C shipment:', {
      message: error?.message || 'Unknown error',
      statusCode: error?.statusCode ?? error?.response?.status ?? 500,
      code: error?.code ?? null,
      stack: error?.stack || null,
      response: error?.response?.data || null,
      request: {
        order_number: req.body?.order_number,
        integration_type: req.body?.integration_type,
        payment_type: req.body?.payment_type,
        courier_id: req.body?.courier_id ?? null,
      },
    })
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500
    const errorMessage =
      error.message?.includes('timeout') || error.code === 'ECONNABORTED'
        ? 'Order creation is taking longer than expected. Please try again or contact support if the issue persists.'
        : error.message || 'Failed to create order. Please try again.'
    res.status(statusCode).json({ success: false, message: errorMessage })
  }
}

export const createB2COrderDraftController = async (req: any, res: Response) => {
  try {
    const id = getMerchantScopedUserId(req)
    if (!id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const draft = await createB2COrderDraftService(req.body, id, false)

    return res.status(200).json({
      success: true,
      message: 'Order draft saved successfully',
      shipment: draft,
    })
  } catch (error: any) {
    console.error('Error saving B2C order draft:', {
      message: error?.message || 'Unknown error',
      statusCode: error?.statusCode ?? error?.response?.status ?? 500,
      code: error?.code ?? null,
      stack: error?.stack || null,
      request: {
        order_number: req.body?.order_number,
        payment_type: req.body?.payment_type,
      },
    })
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500
    return res.status(statusCode).json({
      success: false,
      message: error?.message || 'Failed to save order draft. Please try again.',
    })
  }
}

export const bookExistingB2COrderController = async (req: any, res: Response) => {
  try {
    const userId = getMerchantScopedUserId(req)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const orderId = String(req.params?.orderId || '').trim()
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' })
    }

    const result = await bookExistingB2COrderWithCourierService(orderId, userId, req.body || {})

    return res.status(200).json({
      success: true,
      message: 'Courier selected and shipment booked successfully',
      ...result,
    })
  } catch (error: any) {
    console.error('Error booking courier for existing B2C order:', {
      userId: req.user?.sub ?? null,
      orderId: req.params?.orderId ?? null,
      message: error?.message || 'Unknown error',
      statusCode: error?.statusCode ?? error?.response?.status ?? 500,
      response: error?.response?.data || null,
      stack: error?.stack || null,
    })

    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500
    const errorMessage =
      error.message?.includes('timeout') || error.code === 'ECONNABORTED'
        ? 'Courier booking is taking longer than expected. Please try again or contact support if the issue persists.'
        : error.message || 'Failed to book courier. Please try again.'

    return res.status(statusCode).json({ success: false, message: errorMessage })
  }
}

export const autoAssignAndBookB2COrdersController = async (req: any, res: Response) => {
  try {
    const userId = getMerchantScopedUserId(req)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const orderIds = Array.isArray(req.body?.order_ids)
      ? req.body.order_ids.map((id: unknown) => String(id || '').trim()).filter(Boolean)
      : []
    const pickupLocationId = String(req.body?.pickup_location_id || '').trim()
    const pickupDate = String(req.body?.pickup_date || todayIsoDate()).trim() || todayIsoDate()
    const pickupTime = String(req.body?.pickup_time || '10:00').trim() || '10:00'

    if (!orderIds.length) {
      return res.status(400).json({ success: false, message: 'Select at least one order.' })
    }
    if (!pickupLocationId) {
      return res.status(400).json({ success: false, message: 'Pickup warehouse is required.' })
    }

    const [pickupLink] = await db
      .select()
      .from(pickupAddresses)
      .where(
        and(
          eq(pickupAddresses.id, pickupLocationId),
          eq(pickupAddresses.userId, userId),
          eq(pickupAddresses.isPickupEnabled, true),
        ),
      )
      .limit(1)

    if (!pickupLink?.addressId) {
      return res.status(400).json({ success: false, message: 'Pickup warehouse is not available.' })
    }

    const [pickup] = await db.select().from(addresses).where(eq(addresses.id, pickupLink.addressId)).limit(1)
    const [rto] =
      pickupLink.isRTOSame || !pickupLink.rtoAddressId
        ? [null]
        : await db.select().from(addresses).where(eq(addresses.id, pickupLink.rtoAddressId)).limit(1)

    if (!pickup?.pincode) {
      return res.status(400).json({ success: false, message: 'Pickup warehouse pincode is missing.' })
    }

    const rules = await db
      .select()
      .from(courierPriorityProfiles)
      .where(
        and(
          eq(courierPriorityProfiles.user_id, userId),
          eq(courierPriorityProfiles.rule_type, 'rule'),
          eq(courierPriorityProfiles.is_active, true),
        ),
      )

    const activeRules = rules
      .filter((rule) => Array.isArray(rule.personalised_order) && rule.personalised_order.length > 0)
      .sort(
        (left, right) =>
          Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0) ||
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
      )

    if (!activeRules.length) {
      return res.status(400).json({
        success: false,
        message: 'No active courier priority rule found. Create and activate a rule first.',
      })
    }

    const orders = await db
      .select()
      .from(b2c_orders)
      .where(and(eq(b2c_orders.user_id, userId), inArray(b2c_orders.id, orderIds)))

    const orderById = new Map(orders.map((order) => [String(order.id), order]))
    const results: Array<{
      orderId: string
      orderNumber?: string | null
      success: boolean
      skipped?: boolean
      courier?: string | null
      ruleName?: string | null
      awbNumber?: string | null
      message: string
      attempts?: Array<{ courier: string; message: string }>
    }> = []

    for (const orderId of orderIds) {
      const order = orderById.get(orderId)
      if (!order) {
        results.push({ orderId, success: false, skipped: true, message: 'Order not found.' })
        continue
      }

      const orderStatus = normalizeRuleText(order.order_status)
      if (order.awb_number) {
        results.push({
          orderId,
          orderNumber: order.order_number,
          success: false,
          skipped: true,
          message: 'Skipped: order already has AWB.',
        })
        continue
      }
      if (['cancelled', 'canceled', 'delivered', 'rto_delivered'].includes(orderStatus)) {
        results.push({
          orderId,
          orderNumber: order.order_number,
          success: false,
          skipped: true,
          message: `Skipped: order status is ${order.order_status}.`,
        })
        continue
      }

      try {
        const couriers = await fetchAvailableCouriersWithRates(
          {
            origin: Number(pickup.pincode),
            destination: Number(order.pincode),
            pickupId: pickupLocationId,
            pickupName: pickup.addressNickname,
            pickupAddress: pickup.addressLine1,
            pickupCity: pickup.city,
            pickupState: pickup.state,
            deliveryName: order.buyer_name,
            deliveryPhone: order.buyer_phone,
            deliveryAddress: order.address,
            deliveryCity: order.city,
            deliveryState: order.state,
            payment_type: getOrderPaymentMode(order),
            order_amount: getOrderAmountForAutoAssign(order),
            weight: toNumberOrZero(order.weight),
            length: toNumberOrZero(order.length),
            breadth: toNumberOrZero(order.breadth),
            height: toNumberOrZero(order.height),
            shipment_type: 'b2c',
            context: 'auto_assign_book',
            shadowfax_forward_mode: 'marketplace',
          } as any,
          userId,
        )

        const serviceableCouriers = Array.isArray(couriers) ? couriers : []
        if (!serviceableCouriers.length) {
          results.push({
            orderId,
            orderNumber: order.order_number,
            success: false,
            message: 'No serviceable courier found for this route.',
          })
          continue
        }

        const zoneCode =
          serviceableCouriers[0]?.approxZone?.code ??
          serviceableCouriers[0]?.zone_code ??
          serviceableCouriers[0]?.zone ??
          null
        const matchedRule = activeRules.find((rule) => ruleMatchesOrder(rule, order, zoneCode))
        if (!matchedRule) {
          results.push({
            orderId,
            orderNumber: order.order_number,
            success: false,
            message: 'No active courier priority rule matched this order.',
          })
          continue
        }

        const orderedCouriers = orderCouriersByRule(serviceableCouriers, matchedRule)
        const attempts: Array<{ courier: string; message: string }> = []
        let booked = false

        for (const courier of orderedCouriers) {
          const courierName = String(courier.displayName || courier.name || 'Courier')
          try {
            const payload = buildAutoAssignBookingPayload({
              order,
              courier,
              pickup,
              rto: rto || undefined,
              pickupLocationId,
              pickupDate,
              pickupTime,
            })
            const bookedResult = await bookExistingB2COrderWithCourierService(order.id, userId, payload as any)
            results.push({
              orderId,
              orderNumber: order.order_number,
              success: true,
              courier: courierName,
              ruleName: matchedRule.name,
              awbNumber: (bookedResult as any)?.order?.awb_number ?? null,
              message: 'Booked successfully.',
              attempts,
            })
            booked = true
            break
          } catch (error: any) {
            attempts.push({
              courier: courierName,
              message: error?.message || error?.response?.data?.message || 'Booking failed',
            })
          }
        }

        if (!booked) {
          results.push({
            orderId,
            orderNumber: order.order_number,
            success: false,
            ruleName: matchedRule.name,
            message: attempts.length
              ? `All priority couriers failed. Last error: ${attempts[attempts.length - 1].message}`
              : 'No rule courier was serviceable.',
            attempts,
          })
        }
      } catch (error: any) {
        results.push({
          orderId,
          orderNumber: order.order_number,
          success: false,
          message: error?.message || 'Auto assign failed.',
        })
      }
    }

    const successCount = results.filter((result) => result.success).length
    const skippedCount = results.filter((result) => result.skipped).length
    const failedCount = results.length - successCount - skippedCount

    return res.status(200).json({
      success: failedCount === 0,
      message:
        failedCount > 0
          ? `${successCount} booked, ${failedCount} failed, ${skippedCount} skipped.`
          : `${successCount} orders booked successfully.`,
      summary: {
        total: results.length,
        successCount,
        failedCount,
        skippedCount,
      },
      results,
    })
  } catch (error: any) {
    console.error('Auto assign and book failed:', error)
    return res.status(500).json({
      success: false,
      message: error?.message || 'Auto assign and book failed.',
    })
  }
}

export const createB2CBulkShipmentController = async (req: any, res: Response) => {
  try {
    const userId = getMerchantScopedUserId(req)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const orders = Array.isArray(req.body?.orders) ? req.body.orders : []
    if (!orders.length) {
      return res.status(400).json({ success: false, message: 'At least one order is required.' })
    }

    const normalizedInRequest = new Map<string, number>()
    const results: Array<{
      rowNumber: number
      orderNumber: string | null
      success: boolean
      shipment?: any
      message: string
    }> = []

    for (let index = 0; index < orders.length; index += 1) {
      const order = orders[index]
      const rowNumber = Number(order?.client_row_number ?? index + 1)
      const orderNumber = String(order?.order_number ?? '').trim() || null
      const normalizedKey = String(orderNumber || '').toLowerCase()

      if (!orderNumber) {
        results.push({
          rowNumber,
          orderNumber,
          success: false,
          message: 'Order ID is required.',
        })
        continue
      }

      normalizedInRequest.set(normalizedKey, (normalizedInRequest.get(normalizedKey) ?? 0) + 1)
      if ((normalizedInRequest.get(normalizedKey) ?? 0) > 1) {
        results.push({
          rowNumber,
          orderNumber,
          success: false,
          message: `Order ID "${orderNumber}" is duplicated in this bulk upload.`,
        })
        continue
      }

      try {
        const availability = await checkMerchantOrderNumberAvailability(userId, orderNumber)
        if (!availability.available) {
          results.push({
            rowNumber,
            orderNumber,
            success: false,
            message: `Order ID "${availability.normalizedOrderNumber}" already exists for this merchant.`,
          })
          continue
        }

        const shipment = await createB2CShipmentService(order, userId, false)
        results.push({
          rowNumber,
          orderNumber,
          success: true,
          shipment,
          message: 'Order created successfully.',
        })
      } catch (error: any) {
        console.error('Bulk B2C row create error:', {
          rowNumber,
          orderNumber,
          message: error?.message || 'Unknown error',
          statusCode: error?.statusCode ?? error?.response?.status ?? 500,
        })
        results.push({
          rowNumber,
          orderNumber,
          success: false,
          message: error?.message || 'Failed to create order.',
        })
      }
    }

    const successCount = results.filter((result) => result.success).length
    const failedCount = results.length - successCount

    return res.status(200).json({
      success: failedCount === 0,
      message:
        failedCount > 0
          ? `${successCount} orders created, ${failedCount} failed.`
          : `${successCount} orders created successfully.`,
      summary: {
        total: results.length,
        successCount,
        failedCount,
      },
      results,
    })
  } catch (error: any) {
    console.error('Error creating bulk B2C shipments:', error)
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to create bulk B2C shipments.',
    })
  }
}

export const createB2BShipmentController = async (req: any, res: Response) => {
  try {
    const userId = getMerchantScopedUserId(req) // merchant owner for delegated employee access
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    const params: ShipmentParams = req.body

    // Basic validation (you can enhance this with Zod/Yup)
    const hasBoxes = Array.isArray((params as any)?.boxes) && (params as any).boxes.length > 0
    const hasOrderItems = Array.isArray(params?.order_items) && params.order_items.length > 0
    if (!params.order_number || !params.consignee || (!hasBoxes && !hasOrderItems)) {
      return res.status(400).json({ message: 'Invalid shipment payload' })
    }

    // Call service to create shipment (local order creation, so is_external_api = false)
    const shipmentData = await createB2BShipmentService(params, userId, false)

    return res.status(200).json({
      message: 'B2B shipment created successfully',
      shipment: shipmentData,
    })
  } catch (err: any) {
    console.error('B2B Shipment Controller Error:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    return res.status(statusCode).json({ message: err.message || 'Internal server error' })
  }
}

export const checkOrderNumberAvailabilityController = async (req: any, res: Response) => {
  try {
    const userId = getMerchantScopedUserId(req)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const orderNumber = req.query.orderNumber as string | undefined
    const result = await checkMerchantOrderNumberAvailability(userId, orderNumber)

    return res.status(200).json({
      success: true,
      data: {
        orderNumber: result.normalizedOrderNumber,
        available: result.available,
        message: result.available
          ? 'Order ID is available.'
          : `Order ID "${result.normalizedOrderNumber}" already exists for this merchant.`,
      },
    })
  } catch (error: any) {
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500
    return res.status(statusCode).json({
      success: false,
      message: error?.message || 'Failed to check order ID availability.',
    })
  }
}

export const getAllOrdersController = async (req: any, res: Response) => {
  try {
    const userId = getMerchantScopedUserId(req)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    // Pagination params
    const page = parseInt(req.query.page as string, 10) || 1
    const limit = parseInt(req.query.limit as string, 10) || 10

    // Filters from query
    const filters = {
      status: String(req.query.status || '').split(',').map((value) => value.trim()).filter(Boolean),
      labelGenerated: req.query.labelGenerated as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
    }

    const { orders, totalCount, totalPages } = await getAllOrdersService(userId, {
      page,
      limit,
      filters,
    })

    res.status(200).json({ success: true, orders, totalCount, totalPages })
  } catch (error: any) {
    console.error('Error fetching all orders:', error.message)
    res.status(500).json({ success: false, message: error.message })
  }
}

export const getB2COrdersController = async (req: Request, res: Response) => {
  try {
    const userId = getMerchantScopedUserId(req)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    // Pagination params
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1)
    const fetchAll =
      String(req.query.fetchAll ?? '')
        .trim()
        .toLowerCase() === 'true'
    const limit = fetchAll
      ? Math.min(parseInt(req.query.limit as string, 10) || 5000, 5000)
      : Math.min(parseInt(req.query.limit as string, 10) || 10, 100)

    const rawStatus = (req.query.status as string | undefined) || undefined
    const normalizedStatus = rawStatus
      ? rawStatus
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, '_')
      : undefined

    // Filters from query
    const filters = {
      status: normalizedStatus ? normalizedStatus.split(',').filter(Boolean) : undefined,
      labelGenerated: req.query.labelGenerated as string | undefined,
      type: req.query.type as string | undefined,
      courier: req.query.courier as string | undefined,
      warehouse: req.query.warehouse as string | undefined,
      productQuery: req.query.productQuery as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
      sortBy: (req.query.sortBy as 'created_at' | undefined) || 'created_at',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc' | undefined) || 'desc',
    }

    const { orders, totalCount, totalPages } = await getB2COrdersByUserService(
      userId,
      page,
      limit,
      filters,
    )

    return res.status(200).json({
      success: true,
      orders,
      totalCount,
      totalPages,
    })
  } catch (error: any) {
    console.error('❌ Error fetching B2C orders', {
      userId: (req as any)?.user?.sub,
      query: req?.query,
      message: error?.message,
      stack: error?.stack,
    })

    // Detect Drizzle/PG query errors
    if (typeof error.message === 'string' && error.message.includes('Failed query')) {
      return res.status(200).json({
        success: true,
        orders: [],
        totalCount: 0,
        totalPages: 0,
      })
    }

    // Fallback generic error
    return res.status(500).json({
      success: false,
      message: 'Something went wrong while fetching orders. Please try again later.',
    })
  }
}

export const getB2BOrdersController = async (req: any, res: Response) => {
  try {
    const userId = getMerchantScopedUserId(req)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    // Pagination params
    const page = parseInt(req.query.page as string, 10) || 1
    const limit = parseInt(req.query.limit as string, 10) || 10

    // Filters from query
    const filters = {
      status: req.query.status as string | undefined,
      labelGenerated: req.query.labelGenerated as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
      companyName: req.query.companyName as string | undefined, // optional B2B-specific filter
    }

    const { orders, totalCount, totalPages } = await getB2BOrdersByUserService(
      userId,
      page,
      limit,
      filters,
    )

    res.status(200).json({ success: true, orders, totalCount, totalPages })
  } catch (error: any) {
    console.error('❌ Error fetching B2B orders', {
      userId: req?.user?.sub,
      query: req?.query,
      message: error?.message,
      stack: error?.stack,
    })
    res.status(500).json({ success: false, message: error.message })
  }
}

export const generateManifestController = async (req: any, res: Response) => {
  try {
    const userId = getMerchantScopedUserId(req)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const {
      awbs,
      type = 'b2c',
      pickup_date,
      pickup_time,
      pickup_location,
      expected_package_count,
    } = req.body

    if (!awbs || !Array.isArray(awbs) || awbs.length === 0) {
      return res.status(400).json({ success: false, message: 'AWBs are required' })
    }

    if (!['b2c', 'b2b'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid manifest type' })
    }

    const { manifest_id, manifest_url, manifest_key, warnings } = await generateManifestService({
      awbs,
      type,
      userId,
      pickup_date,
      pickup_time,
      pickup_location,
      expected_package_count,
      requestId: req.requestId,
      source: 'order.generateManifestController',
    })

    return res.status(200).json({
      success: true,
      message: 'Manifest generated and saved successfully',
      manifest_id,
      manifest_url,
      manifest_key,
      warnings,
    })
  } catch (error: any) {
    console.error('❌ [Manifest] Request failed', {
      requestId: req.requestId ?? null,
      source: 'order.generateManifestController',
      userId: req.user?.sub ?? null,
      manifestType: req.body?.type ?? 'b2c',
      awbCount: Array.isArray(req.body?.awbs) ? req.body.awbs.length : 0,
      statusCode: typeof error?.statusCode === 'number' ? error.statusCode : 500,
      errorName: error?.name || null,
      message: error?.message || String(error),
      stack: error?.stack || null,
    })
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500
    // Don't expose internal error details, provide user-friendly message
    const rawErrorMessage =
      error.message?.includes('timeout') || error.code === 'ECONNABORTED'
        ? 'Manifest generation is taking longer than expected. Please try again or contact support if the issue persists.'
        : error.message || 'Failed to generate manifest. Please try again.'
    const errorMessage = getMerchantSafeOperationalError(rawErrorMessage)
    return res.status(statusCode).json({ success: false, message: errorMessage })
  }
}

export const retryFailedManifestController = async (req: any, res: Response) => {
  try {
    const userId = getMerchantScopedUserId(req)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { orderId } = req.params
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' })
    }

    const result = await retryFailedManifestService(String(orderId), userId)
    const retryLabel =
      result.retry_action === 'pickup_request' ? 'Pickup retry completed successfully.' : 'Manifest retry completed successfully.'

    return res.status(200).json({
      success: true,
      message: retryLabel,
      ...result,
    })
  } catch (error: any) {
    console.error('Retry failed manifest error:', error)
    const isTimeout = isOperationalTimeoutError(error)
    const statusCode = typeof error?.statusCode === 'number'
      ? error.statusCode
      : isTimeout
        ? 504
        : 500
    const errorMessage = isTimeout
      ? 'Manifest retry is taking longer than expected. Please try again shortly.'
      : error?.message || 'Failed to retry manifest.'
    return res.status(statusCode).json({
      success: false,
      message: getMerchantSafeOperationalError(errorMessage),
    })
  }
}

export const downloadBulkB2CLabelsController = async (req: any, res: Response) => {
  try {
    const userId = getMerchantScopedUserId(req)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const orderIds: string[] = Array.isArray(req.body?.orderIds)
      ? Array.from(
          new Set<string>(
            req.body.orderIds
              .map((value: unknown) => String(value || '').trim())
              .filter(Boolean),
          ),
        )
      : []

    if (!orderIds.length) {
      return res.status(400).json({ success: false, message: 'Select at least one order.' })
    }

    const rows: any[] = []
    for (const orderIdChunk of chunkArray(orderIds, BULK_LABEL_ORDER_FETCH_CHUNK_SIZE)) {
      const chunkRows = await db
        .select()
        .from(b2c_orders)
        .where(and(eq(b2c_orders.user_id, userId), inArray(b2c_orders.id, orderIdChunk)))
      rows.push(...chunkRows)
    }

    const rowsById = new Map(rows.map((order) => [String(order.id), order]))
    const orderedRows = orderIds.map((orderId) => rowsById.get(orderId)).filter(Boolean) as any[]
    const mergedPdf = await PDFDocument.create()
    const generatedLabels: string[] = []
    const failedLabels: string[] = []
    const missingOrderIds = orderIds.filter((orderId) => !rowsById.has(orderId))

    missingOrderIds.forEach((orderId) => {
      failedLabels.push(`${orderId}: order not found`)
    })

    const generateAndStoreLabel = async (order: any) => {
      if (!String(order.awb_number || '').trim()) {
        throw new Error('AWB missing')
      }

      const generatedLabelKey = await generateLabelForOrder(order, userId, db)
      if (!generatedLabelKey) {
        throw new Error('label generation failed')
      }

      generatedLabels.push(String(order.order_number || order.id))
      await db
        .update(b2c_orders)
        .set({ label: generatedLabelKey, label_generated_once: true, updated_at: new Date() })
        .where(and(eq(b2c_orders.id, order.id), eq(b2c_orders.user_id, userId)))
      order.label = generatedLabelKey
      return generatedLabelKey
    }

    const appendLabelToMergedPdf = async (labelReference: string) => {
      const downloadUrl = await resolveLabelDownloadUrl(labelReference)
      if (!downloadUrl) {
        throw new Error('label file unavailable')
      }

      const labelBuffer = await fetchPdfBuffer(downloadUrl)
      const sourcePdf = await PDFDocument.load(labelBuffer, { ignoreEncryption: true })
      const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices())
      pages.forEach((page) => mergedPdf.addPage(page))
    }

    for (const order of orderedRows) {
      let labelReference = getOrderLabelReference(order)

      if (!labelReference) {
        try {
          labelReference = await generateAndStoreLabel(order)
        } catch (error: any) {
          failedLabels.push(
            `${order.order_number || order.id}: ${error?.message || 'label generation failed'}`,
          )
          continue
        }
      }

      try {
        await appendLabelToMergedPdf(labelReference)
      } catch (error: any) {
        try {
          const regeneratedLabelReference = await generateAndStoreLabel(order)
          await appendLabelToMergedPdf(regeneratedLabelReference)
        } catch (retryError: any) {
          failedLabels.push(
            `${order.order_number || order.id}: ${
              retryError?.message || error?.message || 'label merge failed'
            }`,
          )
        }
      }
    }

    if (mergedPdf.getPageCount() === 0) {
      return res.status(400).json({
        success: false,
        message: failedLabels.length
          ? `No labels could be prepared. ${failedLabels.slice(0, 3).join(' ')}`
          : 'No labels could be prepared for the selected orders.',
      })
    }

    const pdfBytes = await mergedPdf.save()
    const fileName = `${sanitizeBulkPdfFileName(`bulk-labels-${new Date().toISOString().slice(0, 10)}`)}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('X-Bulk-Label-Total', String(orderIds.length))
    res.setHeader('X-Bulk-Label-Generated', String(generatedLabels.length))
    res.setHeader('X-Bulk-Label-Failed', String(failedLabels.length))
    if (failedLabels.length) {
      res.setHeader('X-Bulk-Label-Warnings', encodeURIComponent(failedLabels.slice(0, 10).join(' | ')))
    }

    return res.status(200).send(Buffer.from(pdfBytes))
  } catch (error: any) {
    console.error('Bulk B2C label download failed:', {
      userId: req.user?.sub ?? null,
      count: Array.isArray(req.body?.orderIds) ? req.body.orderIds.length : 0,
      message: error?.message || error,
      stack: error?.stack,
    })
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to download bulk labels.',
    })
  }
}

export const regenerateOrderDocumentsController = async (req: any, res: Response) => {
  try {
    const userId = getMerchantScopedUserId(req)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const orderId = String(req.params.orderId || '').trim()
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' })
    }

    const regenerateLabel =
      typeof req.body?.regenerateLabel === 'boolean' ? req.body.regenerateLabel : true
    const regenerateInvoice =
      typeof req.body?.regenerateInvoice === 'boolean' ? req.body.regenerateInvoice : true

    const result = await regenerateOrderDocumentsServiceAdmin({
      orderId,
      regenerateLabel,
      regenerateInvoice,
      expectedUserId: userId,
    })

    return res.status(200).json({
      success: true,
      message: 'Order documents regenerated successfully',
      data: result,
    })
  } catch (error: any) {
    const statusCode = error?.message === 'Order not found' ? 404 : 400
    return res.status(statusCode).json({
      success: false,
      message: error?.message || 'Failed to regenerate order documents',
    })
  }
}

// export const getB2BOrdersController = async (req: Request, res: Response) => {
//   try {
//     const orders = await getAllB2BOrdersService()
//     res.status(200).json({ success: true, orders })
//   } catch (error: any) {
//     console.error('Error fetching B2B orders:', error.message)
//     res.status(500).json({ success: false, message: error.message })
//   }
// }

export const trackOrderController = async (req: Request, res: Response) => {
  try {
    const { awb, orderNumber, contact } = req.query

    let awbNumber: string | undefined = awb ? String(awb) : undefined

    if (!awbNumber && orderNumber && contact) {
      // Determine if contact is email or phone
      const contactStr = String(contact)
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactStr)
      const isPhone = /^\d{7,15}$/.test(contactStr)

      if (!isEmail && !isPhone) {
        return res.status(400).json({
          success: false,
          message: 'Contact must be a valid email or phone number',
        })
      }

      // Get the order by orderNumber + contact
      const orderData = await trackByOrderService({
        orderNumber: String(orderNumber),
        email: isEmail ? contactStr : undefined,
        phone: isPhone ? contactStr : undefined,
      })

      awbNumber = orderData?.awb_number ?? ''
      if (!awbNumber) {
        return res.status(400).json({
          success: false,
          message: 'AWB number not found for this order',
        })
      }
    }

    if (awbNumber) {
      // Fetch full tracking info using AWB
      const trackingData = await trackByAwbService(awbNumber)
      return res.json({ success: true, data: trackingData })
    }

    return res.status(400).json({
      success: false,
      message: "Provide either 'awb' or ('orderNumber' with 'contact')",
    })
  } catch (err: any) {
    console.error(err)
    return res.status(500).json({ success: false, message: err.message })
  }
}
