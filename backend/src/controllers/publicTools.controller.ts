import { Request, Response } from 'express'
import { eq, or } from 'drizzle-orm'
import { db } from '../models/client'
import { b2b_orders } from '../models/schema/b2bOrders'
import { b2c_orders } from '../models/schema/b2cOrders'
import {
  fetchAvailableCouriersWithRates,
  trackByAwbService,
  trackByOrderService,
} from '../models/services/shiprocket.service'
import { getOpaqueProviderCode } from '../utils/externalApiHelpers'
import { extractOrderAmountFromBody } from '../utils/orderAmount'

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const looksLikePublicOrderIdentifier = (value: string) => {
  const normalized = String(value || '').trim()
  if (!normalized) return false
  if (isUuid(normalized)) return true
  if (normalized.startsWith('#')) return true
  return /^(?:order|ord|df|fg|b2c|b2b|shopify|woo)[-_#]?[a-z0-9-]+$/i.test(normalized)
}

const findPublicOrderByIdentifier = async (identifier: string) => {
  const normalized = String(identifier || '').trim()
  if (!normalized) return null

  const b2cConditions = [
    eq(b2c_orders.order_number, normalized),
    eq(b2c_orders.order_id, normalized),
    ...(isUuid(normalized) ? [eq(b2c_orders.id, normalized)] : []),
  ]
  const [b2cOrder] = await db
    .select()
    .from(b2c_orders)
    .where(or(...b2cConditions))
    .limit(1)
  if (b2cOrder) return b2cOrder

  const b2bConditions = [
    eq(b2b_orders.order_number, normalized),
    eq(b2b_orders.order_id, normalized),
    ...(isUuid(normalized) ? [eq(b2b_orders.id, normalized)] : []),
  ]
  const [b2bOrder] = await db
    .select()
    .from(b2b_orders)
    .where(or(...b2bConditions))
    .limit(1)
  return b2bOrder || null
}

const mapPublicRates = (couriers: any[]) =>
  (couriers ?? []).map((courier: any) => ({
    courier_option_key: courier.courier_option_key || null,
    courier_id: courier.id,
    courier_name: courier.displayName || courier.name,
    rate: courier.rate || courier.freight_charges || courier.charge || 0,
    chargeable_weight_g: courier.chargeable_weight ?? null,
    volumetric_weight_g: courier.volumetric_weight ?? null,
    slabs: courier.slabs ?? null,
    max_slab_weight: courier.max_slab_weight ?? null,
    estimated_delivery_days: courier.estimated_delivery_days || courier.tat || '3-5',
    estimated_delivery_date: courier.estimated_delivery_date ?? null,
    serviceable: courier.serviceable !== false,
    cod_available: courier.cod_available !== false,
    zone:
      courier.zone ??
      courier.zone_name ??
      courier.approxZone?.name ??
      courier.zone_code ??
      courier.approxZone?.code ??
      null,
    provider_code: getOpaqueProviderCode(courier.integration_type),
  }))

export const getPublicTrackingController = async (req: Request, res: Response) => {
  try {
    const { awb, orderId, orderNumber, contact } = req.query

    let awbNumber: string | undefined = awb ? String(awb) : undefined
    const awbLooksLikeOrderIdentifier = awbNumber
      ? looksLikePublicOrderIdentifier(awbNumber)
      : false
    const publicOrderIdentifier = String(
      orderId || orderNumber || (awbLooksLikeOrderIdentifier ? awbNumber : ''),
    ).trim()

    if (publicOrderIdentifier && !contact) {
      const order = await findPublicOrderByIdentifier(publicOrderIdentifier)
      if (!order) {
        return res.status(404).json({
          success: false,
          message: `No order found for Order ID: ${publicOrderIdentifier}`,
        })
      }

      awbNumber = String(
        order.awb_number ||
          (order as any).provider_request_id ||
          (order as any).provider_reference ||
          (order as any).shipment_id ||
          '',
      ).trim()
      if (!awbNumber) {
        return res.status(404).json({
          success: false,
          message: 'AWB number is not available for this order yet',
        })
      }
    }

    if (!awbNumber && orderNumber && contact) {
      const contactStr = String(contact).trim()
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactStr)
      const isPhone = /^\d{7,15}$/.test(contactStr)

      if (!isEmail && !isPhone) {
        return res.status(400).json({
          success: false,
          message: 'Contact must be a valid email or phone number',
        })
      }

      const orderData = await trackByOrderService({
        orderNumber: String(orderNumber),
        email: isEmail ? contactStr : undefined,
        phone: isPhone ? contactStr : undefined,
      })

      awbNumber = orderData?.awb_number ?? ''
      if (!awbNumber) {
        return res.status(404).json({
          success: false,
          message: 'AWB number not found for this order',
        })
      }
    }

    if (!awbNumber) {
      return res.status(400).json({
        success: false,
        message: "Provide either 'awb' or ('orderNumber' with 'contact')",
      })
    }

    const trackingData = await trackByAwbService(awbNumber)
    return res.status(200).json({ success: true, data: trackingData })
  } catch (error: any) {
    console.error('Public tracking error:', error)
    const statusCode = Number(error?.status || error?.statusCode || error?.response?.status || 500)
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      message: error?.message || 'Failed to fetch tracking information',
    })
  }
}

export const getPublicShippingRatesController = async (req: Request, res: Response) => {
  try {
    const {
      origin,
      destination,
      payment_type = 'prepaid',
      shipment_type = 'b2c',
      weight = 500,
      length = 10,
      breadth = 10,
      height = 10,
    } = req.body ?? {}

    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        message: 'origin and destination pincodes are required',
      })
    }

    const orderAmountResult = extractOrderAmountFromBody(req.body ?? {})
    if (orderAmountResult.invalid) {
      return res.status(400).json({
        success: false,
        message: 'order_amount must be numeric and non-negative',
      })
    }

    const couriers = await fetchAvailableCouriersWithRates(
      {
        origin: Number(origin),
        destination: Number(destination),
        payment_type,
        shipment_type: shipment_type === 'b2c' ? 'b2c' : undefined,
        order_amount: orderAmountResult.value,
        weight: Number(weight),
        length: Number(length),
        breadth: Number(breadth),
        height: Number(height),
        isCalculator: true,
      },
      { planFallbackName: 'Basic' },
    )

    return res.status(200).json({
      success: true,
      data: {
        rates: mapPublicRates(couriers),
        origin_pincode: Number(origin),
        destination_pincode: Number(destination),
        payment_type,
        shipment_type: shipment_type === 'b2c' ? 'b2c' : 'b2c',
      },
    })
  } catch (error: any) {
    console.error('Public shipping rates error:', error)
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch shipping rates',
    })
  }
}
