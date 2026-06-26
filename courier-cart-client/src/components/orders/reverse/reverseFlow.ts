export type ProductLike = {
  name?: string
  productName?: string
  sku?: string
  qty?: number
  quantity?: number
  price?: number
  hsn?: string
  hsnCode?: string
  discount?: number
  tax_rate?: number
  taxRate?: number
}

export type OrderForReverse = {
  id: string | number
  order_number?: string
  awb_number?: string | null
  weight?: number
  length?: number
  breadth?: number
  height?: number
  integration_type: string
  pickup_details?: {
    warehouse_name?: string
    name?: string
    address?: string
    city?: string
    state?: string
    pincode?: string
    phone?: string
  }
  buyer_name?: string
  buyer_phone?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  products?: ProductLike[]
}

export type ReverseCreatePayload = {
  original_order_id: string
  order_number: string
  payment_type: 'reverse'
  order_amount: number
  order_date: string
  package_length?: number
  package_breadth?: number
  package_height?: number
  shipping_charges: number
  prepaid_amount: number
  is_rto_different: 'no'
  discount: number
  integration_type: string
  transaction_fee: number
  gift_wrap: number
  consignee: {
    name: string
    address: string
    city: string
    state: string
    pincode: string
    email: string
    phone: string
  }
  pickup: {
    warehouse_name: string
    address: string
    name: string
    phone: string
    city: string
    state: string
    pincode: string
  }
  order_items: {
    name: string
    sku: string
    qty: number
    price: number
    hsn: string
    discount: number
    tax_rate: number
  }[]
}

export type ReverseFlowRouteState = {
  reverseOrder?: OrderForReverse | null
  reverseReturnTo?: string
}

export const buildReverseFlowPath = (orderId?: string | number) => {
  const params = new URLSearchParams({
    type: 'b2c',
    pickupMode: 'reverse',
  })

  if (orderId !== undefined && orderId !== null && String(orderId).trim()) {
    params.set('sourceOrderId', String(orderId))
  }

  return `/orders/create?${params.toString()}`
}

export const buildReverseCreatePayload = (
  order: OrderForReverse,
  shippingCharges: number,
): ReverseCreatePayload => ({
  original_order_id: String(order.id),
  order_number: `${order.order_number || String(order.id)}-R`,
  payment_type: 'reverse',
  order_amount: 0,
  order_date: new Date().toISOString(),
  package_length: Number(order.length || 0),
  package_breadth: Number(order.breadth || 0),
  package_height: Number(order.height || 0),
  shipping_charges: shippingCharges,
  prepaid_amount: 0,
  is_rto_different: 'no',
  discount: 0,
  integration_type: order.integration_type,
  transaction_fee: 0,
  gift_wrap: 0,
  consignee: {
    name: order.pickup_details?.name || order.pickup_details?.warehouse_name || '',
    address: order.pickup_details?.address || '',
    city: order.pickup_details?.city || '',
    state: order.pickup_details?.state || '',
    pincode: order.pickup_details?.pincode || '',
    email: '',
    phone: order.pickup_details?.phone || '',
  },
  pickup: {
    warehouse_name: order.buyer_name || '',
    address: order.address || '',
    name: order.buyer_name || '',
    phone: order.buyer_phone || '',
    city: order.city || '',
    state: order.state || '',
    pincode: order.pincode || '',
  },
  order_items: (Array.isArray(order.products) ? order.products : []).map((product) => ({
    name: product?.name || product?.productName || 'Item',
    sku: product?.sku || 'NA',
    qty: Number(product?.qty ?? product?.quantity ?? 1),
    price: Number(product?.price ?? 0),
    hsn: product?.hsn || product?.hsnCode || '',
    discount: Number(product?.discount ?? 0),
    tax_rate: Number(product?.tax_rate ?? product?.taxRate ?? 0),
  })),
})
