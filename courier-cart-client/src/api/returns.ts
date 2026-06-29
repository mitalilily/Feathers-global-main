import axiosInstance from './axiosInstance'

export async function createReverseShipment(payload: Record<string, unknown>) {
  const res = await axiosInstance.post(`/returns/create`, payload, {
    timeout: 210000,
  })
  return res.data
}

export async function quoteReverse(payload: {
  orderId: string
  weightGrams?: number
  package_length?: number
  package_breadth?: number
  package_height?: number
  shipping_mode?: string
}) {
  const res = await axiosInstance.post(`/returns/quote`, payload)
  return res.data
}


