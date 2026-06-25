import axios, { type AxiosRequestConfig } from 'axios'
import qs from 'qs'
import { DelhiveryManifestError, HttpError } from '../../../utils/classes'
import {
  normalizeCourierId,
  resolveDelhiveryShippingMode,
} from '../../../utils/delhiveryCourier'
import { getDelhiveryCredentials } from '../delhiveryCredentials.service'
import { ShipmentParams } from '../shiprocket.service'

const parseTimeout = (value: string | undefined, fallbackMs: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs
}

const extractProviderErrorMessage = (value: unknown): string | null => {
  if (!value) return null

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const message = extractProviderErrorMessage(entry)
      if (message) return message
    }
    return null
  }

  if (typeof value === 'object') {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      const message = extractProviderErrorMessage(nestedValue)
      if (message) return message
    }
  }

  return null
}

const isTimeoutError = (err: any) => {
  const message = String(err?.message || '')
    .trim()
    .toLowerCase()

  return (
    err?.code === 'ECONNABORTED' ||
    err?.code === 'ETIMEDOUT' ||
    message.includes('timeout') ||
    message.includes('timed out')
  )
}

const getExistingPickupRequestId = (message: unknown): string | null => {
  const normalized = String(message || '').trim()
  if (!normalized) return null

  const lower = normalized.toLowerCase()
  if (!lower.includes('pickup request') || !lower.includes('already exist')) {
    return null
  }

  return normalized.match(/pickup request\s+(\d+)/i)?.[1] || null
}

const normalizeDelhiveryWeightGrams = (value: unknown, fallbackGrams = 500) => {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return fallbackGrams

  // Feather Global stores B2C weights in grams; older integrations may still send kg.
  return numericValue > 50 ? Math.round(numericValue) : Math.round(numericValue * 1000)
}

const resolveDelhiveryPickupLocationName = (pickup?: ShipmentParams['pickup']) =>
  String(
    (pickup as any)?.delhivery_warehouse_name ||
      (pickup as any)?.delhiveryWarehouseName ||
      pickup?.warehouse_name ||
      pickup?.addressNickname ||
      'Default Warehouse',
  )
    .trim()
    .replace(/\s+/g, ' ')

const delhiveryCancellationResponseText = (value: unknown) => {
  try {
    return JSON.stringify(value || {}).toLowerCase()
  } catch {
    return String(value || '').toLowerCase()
  }
}

const isDelhiveryAlreadyCancelledResponse = (value: unknown) => {
  const responseText = delhiveryCancellationResponseText(value)
  return responseText.includes('already cancelled') || responseText.includes('already canceled')
}

const getDelhiveryCancellationMessage = (value: unknown): string | null => {
  if (!value) return null

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized ? normalized : null
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const message = getDelhiveryCancellationMessage(entry)
      if (message) return message
    }
    return null
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['message', 'remark', 'remarks', 'responseMsg', 'ReturnMessage']) {
      const direct = record[key]
      if (typeof direct === 'string' && direct.trim()) return direct.trim()
    }

    for (const key of ['packages', 'package', 'response', 'data']) {
      const nested = record[key]
      if (nested) {
        const message = getDelhiveryCancellationMessage(nested)
        if (message) return message
      }
    }
  }

  return null
}

export const isDelhiveryCancellationAccepted = (value: unknown) => {
  const result = value as any
  const responseText = delhiveryCancellationResponseText(value)
  const numericStatus = Number(result?.status ?? result?.responseCode ?? result?.code)
  const alreadyCancelled = isDelhiveryAlreadyCancelledResponse(value)
  const acceptedText =
    responseText.includes('cancelled') ||
    responseText.includes('canceled') ||
    responseText.includes('cancellation initiated') ||
    responseText.includes('cancellation accepted') ||
    responseText.includes('cancellation request accepted') ||
    responseText.includes('marked for cancellation')
  const rejectedText =
    responseText.includes('not accepted') ||
    responseText.includes('not found') ||
    responseText.includes('invalid') ||
    responseText.includes('failed') ||
    responseText.includes('failure') ||
    responseText.includes('error')

  return (
    alreadyCancelled ||
    result?.success === true ||
    result?.Success === true ||
    result?.status === true ||
    String(result?.status || '').toLowerCase() === 'success' ||
    String(result?.Status || '').toLowerCase() === 'success' ||
    (Number.isFinite(numericStatus) && numericStatus >= 200 && numericStatus < 300) ||
    result?.response?.status === true ||
    (acceptedText && !rejectedText)
  )
}

export class DelhiveryService {
  private apiBase = 'https://track.delhivery.com'
  private token = ''
  private clientName = ''
  private readonly requestTimeoutMs = parseTimeout(process.env.DELHIVERY_REQUEST_TIMEOUT_MS, 30000)
  private readonly labelTimeoutMs = parseTimeout(process.env.DELHIVERY_LABEL_TIMEOUT_MS, 15000)

  private async ensureCredentials() {
    const credentials = await getDelhiveryCredentials()
    this.apiBase = credentials.apiBase
    this.token = credentials.apiKey
    this.clientName = credentials.clientName
  }

  private get headers() {
    return {
      Authorization: `Token ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  private async postFormEncoded(path: string, payload: unknown) {
    await this.ensureCredentials()
    const encodedData = qs.stringify({
      format: 'json',
      data: JSON.stringify(payload),
    })

    return axios.post(`${this.apiBase}${path}`, encodedData, {
      headers: {
        Authorization: `Token ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: this.requestTimeoutMs,
    })
  }

  private async getWithTimeout(url: string, config: AxiosRequestConfig = {}, timeoutMs?: number) {
    return axios.get(url, {
      ...config,
      timeout: timeoutMs ?? this.requestTimeoutMs,
    })
  }

  private async postWithTimeout(
    url: string,
    data: unknown,
    config: AxiosRequestConfig = {},
    timeoutMs?: number,
  ) {
    return axios.post(url, data, {
      ...config,
      timeout: timeoutMs ?? this.requestTimeoutMs,
    })
  }

  // 🔹 1. Check Serviceability
  async checkServiceability(pincode: string) {
    try {
      await this.ensureCredentials()
      const url = `${this.apiBase}/c/api/pin-codes/json/?filter_codes=${pincode}`
      const res = await this.getWithTimeout(url, { headers: this.headers })

      // Log the full response structure
      console.log('📦 Delhivery Serviceability API Response:', {
        url,
        status: res.status,
        data: JSON.stringify(res.data, null, 2),
        dataType: typeof res.data,
        isArray: Array.isArray(res.data),
        keys: res.data ? Object.keys(res.data) : [],
      })

      return res.data
    } catch (err: any) {
      console.error('❌ Delhivery serviceability error:', {
        pincode,
        status: err.response?.status,
        data: JSON.stringify(err.response?.data, null, 2),
        message: err.message,
      })
      throw new Error('Failed to fetch Delhivery serviceability')
    }
  }

  // 🔹 2. Expected TAT (Transit Time)
  async getExpectedTAT(
    origin: string,
    destination: string,
    mot: 'S' | 'E' = 'S',
    pdt: 'B2B' | 'B2C' = 'B2C',
  ) {
    try {
      await this.ensureCredentials()
      const url = `${this.apiBase}/api/dc/expected_tat?origin_pin=${origin}&destination_pin=${destination}&mot=${mot}&pdt=${pdt}`
      const res = await this.getWithTimeout(url, { headers: this.headers })
      const tat = res.data?.data?.tat
      return typeof tat === 'number' || typeof tat === 'string' ? Number(tat) : null
    } catch (err: any) {
      console.error('Delhivery TAT API error:', err.response?.data || err.message)
      return null
    }
  }

  // 🔹 3. Calculate Shipping Cost
  async calculateShippingCost(params: {
    md: 'E' | 'S' | string
    cgm: number | string
    o_pin: number | string
    d_pin: number | string
    ss: string
    pt: 'Pre-paid' | 'COD' | string
    l?: number | string
    b?: number | string
    h?: number | string
    ipkg_type?: 'box' | 'flyer' | string
  }) {
    try {
      await this.ensureCredentials()

      const md = String(params.md ?? '').trim().toUpperCase()
      const cgm = String(params.cgm ?? '').trim()
      const oPin = String(params.o_pin ?? '').trim()
      const dPin = String(params.d_pin ?? '').trim()
      const ss = String(params.ss ?? '').trim()
      const pt = String(params.pt ?? '').trim()

      if (!md || !cgm || !oPin || !dPin || !ss || !pt) {
        throw new HttpError(
          400,
          'md, cgm, o_pin, d_pin, ss, and pt are required for Delhivery shipping cost calculation.',
        )
      }

      const query = qs.stringify({
        md,
        cgm,
        o_pin: oPin,
        d_pin: dPin,
        ss,
        pt,
        ...(params.l !== undefined ? { l: String(params.l).trim() } : {}),
        ...(params.b !== undefined ? { b: String(params.b).trim() } : {}),
        ...(params.h !== undefined ? { h: String(params.h).trim() } : {}),
        ...(params.ipkg_type ? { ipkg_type: String(params.ipkg_type).trim() } : {}),
      })

      const url = `${this.apiBase}/api/kinko/v1/invoice/charges/.json?${query}`
      const res = await this.getWithTimeout(url, { headers: this.headers })
      return res.data
    } catch (err: any) {
      console.error('Delhivery shipping cost API error:', err.response?.data || err.message)
      throw new Error(
        extractProviderErrorMessage(err.response?.data) ||
          'Delhivery shipping cost calculation failed',
      )
    }
  }

  // 🔹 3. Fetch Waybills
  async fetchWaybills(count: number = 10) {
    try {
      await this.ensureCredentials()
      const normalizedCount = Math.max(1, Number(count || 1))
      const isBulk = normalizedCount > 1
      const path = isBulk ? '/waybill/api/bulk/json/' : '/waybill/api/fetch/json/'
      const query = qs.stringify({
        cl: this.clientName,
        token: this.token,
        ...(isBulk ? { count: normalizedCount } : {}),
      })
      const url = `${this.apiBase}${path}?${query}`
      const res = await this.getWithTimeout(url, { headers: this.headers })
      return res.data?.waybill ?? res.data?.waybills ?? res.data
    } catch (err: any) {
      console.error('Delhivery waybill fetch error:', err.response?.data || err.message)
      throw new Error('Failed to fetch Delhivery waybill')
    }
  }

  // 🔹 4. Create Shipment (Manifestation)
  private normalizeWaybill(value: unknown) {
    return String(value ?? '').trim()
  }

  private normalizeWaybillList(value: unknown): string[] {
    if (!value) return []
    const values = Array.isArray(value) ? value : String(value).split(',')
    return [...new Set(values.map((entry) => this.normalizeWaybill(entry)).filter(Boolean))]
  }

  async createShipment(params: ShipmentParams, waybill?: string) {
    try {
      const normalizedCourierId = normalizeCourierId(params.courier_id)
      if (normalizedCourierId === null) {
        throw new HttpError(
          400,
          'Delhivery courier_id is required for Air/Express or Surface bookings.',
        )
      }
      const shippingMode = resolveDelhiveryShippingMode({
        courierId: normalizedCourierId,
        mode: params.shipping_mode,
        courierName: params.courier_partner,
      })
      if (!shippingMode) {
        throw new HttpError(
          400,
          `Invalid Delhivery courier selection: courier_id ${normalizedCourierId} does not map to Air/Express or Surface.`,
        )
      }

      const sanitizeString = (value?: string | null) => {
        if (!value) return ''
        return String(value).trim()
      }
      const sanitizePhone = (value?: string | null) => {
        const digits = String(value || '').replace(/\\D/g, '')
        return digits.length >= 10 ? digits.slice(-10) : digits
      }
      const sanitizePincode = (value?: string | number | null) => {
        if (value === undefined || value === null) return ''
        return String(value).trim()
      }
      const sanitizeBoolean = (value?: boolean | string | number | null) => {
        if (value === undefined || value === null) return undefined
        if (typeof value === 'boolean') return value
        const normalized = String(value).trim().toLowerCase()
        return ['true', '1', 'yes', 'y'].includes(normalized)
      }

      const pickup = params.pickup || ({} as ShipmentParams['pickup'])
      const consignee = params.consignee || ({} as ShipmentParams['consignee'])
      const boxes = Array.isArray(params.boxes) ? params.boxes.filter(Boolean) : []
      const explicitShipmentType = String((params as any).shipment_type || '')
        .trim()
        .toUpperCase()
      const isMpsShipment =
        Boolean(params.mps) || boxes.length > 1 || explicitShipmentType === 'MPS'
      const orderNumber = sanitizeString(params.order_number)
      const invoiceNumber = sanitizeString(params.invoice_number)
      const pickupDate = sanitizeString(params.pickup_date || pickup.pickup_date)
      const pickupTime = sanitizeString(params.pickup_time || pickup.pickup_time)
      const resolvedInvoiceNumber = invoiceNumber || orderNumber
      const orderAmount = Number(params.order_amount ?? 0)
      const orderItems = Array.isArray(params.order_items) ? params.order_items : []
      const hsnCodes = Array.from(
        new Set(
          orderItems
            .map((item) => (item?.hsn || item?.hsnCode || '').toString().trim())
            .filter((code) => code.length > 0),
        ),
      )

      if (!orderNumber) {
        throw new HttpError(400, 'order_number is required to create a Delhivery shipment.')
      }
      if (!invoiceNumber) {
        console.warn(
          `ℹ️ Delhivery invoice_number missing for order ${orderNumber}; using order_number as fallback.`,
        )
      }
      // if (!invoiceNumber) {
      //   throw new HttpError(
      //     400,
      //     'invoice_number (invoice_reference) is mandatory for Delhivery B2C manifests. Please provide the seller invoice number.',
      //   )
      // }
      // if (!hsnCodes.length) {
      //   throw new HttpError(
      //     400,
      //     'Delhivery requires HSN/SAC codes for at least one of the products you are shipping. Attach HSN codes to your order items.',
      //   )
      // }
      if (orderAmount <= 0 || Number.isNaN(orderAmount)) {
        throw new HttpError(
          400,
          'order_amount is required and must be a positive number when booking with Delhivery.',
        )
      }
      if (isMpsShipment && boxes.length === 0) {
        throw new HttpError(400, 'MPS shipments require a boxes array with at least one box.')
      }

      const pickupAddressParts = [
        sanitizeString(pickup.address),
        sanitizeString(pickup.address_2),
      ].filter((part) => part.length > 0)
      const pickupAddress =
        pickupAddressParts.length > 0
          ? pickupAddressParts.join(', ')
          : sanitizeString(pickup.warehouse_name)

      const sellerName = sanitizeString(params.company?.name || pickup.name || 'Feather Global')
      const sellerGst = sanitizeString(params.company?.gst || pickup.gst_number || '')
      const productNames = orderItems
        .map((item) => sanitizeString(item?.name))
        .filter((name) => name.length > 0)
      const productsDesc = productNames.length ? productNames.join(', ') : 'General Merchandise'

      const consigneePhone = sanitizePhone(consignee.phone)
      if (!consigneePhone) {
        throw new HttpError(
          400,
          'Consignee phone must contain at least 10 digits for Delhivery shipments.',
        )
      }
      const pickupPhone = sanitizePhone(pickup.phone)
      if (!pickupPhone) {
        throw new HttpError(400, 'Valid pickup phone is required for Delhivery manifests.')
      }

      const orderDate =
        params.order_date instanceof Date
          ? params.order_date.toISOString().split('T')[0]
          : sanitizeString(params.order_date) || new Date().toISOString().split('T')[0]
      const invoiceDate =
        params.invoice_date && sanitizeString(params.invoice_date)
          ? sanitizeString(params.invoice_date)
          : orderDate
      const paymentMode =
        params.payment_type === 'cod'
          ? 'COD'
          : params.payment_type === 'reverse'
            ? 'Pickup'
            : params.payment_type === 'replacement'
              ? 'REPL'
              : 'Prepaid'
      const codAmount = paymentMode === 'COD' ? orderAmount : 0
      const packageWeightGrams = normalizeDelhiveryWeightGrams(params.package_weight)

      const manifestShipmentBase: Record<string, any> = {
        order: orderNumber,
        order_date: orderDate,
        name: sanitizeString(consignee.name),
        phone: consigneePhone,
        add: sanitizeString(consignee.address),
        city: sanitizeString(consignee.city),
        state: sanitizeString(consignee.state),
        pin: sanitizePincode(consignee.pincode),
        country: 'India',
        payment_mode: paymentMode,
        cod_amount: codAmount,
        total_amount: orderAmount,
        products_desc: productsDesc,
        hsn_code: hsnCodes.join(', '),
        weight: packageWeightGrams,
        shipment_length: Number(params.package_length ?? 10),
        shipment_width: Number(params.package_breadth ?? 10),
        shipment_height: Number(params.package_height ?? 10),
        seller_name: sellerName,
        seller_add: pickupAddress,
        seller_city: sanitizeString(pickup.city),
        seller_state: sanitizeString(pickup.state),
        seller_pin: sanitizePincode(pickup.pincode),
        seller_phone: pickupPhone,
        seller_gst_tin: sellerGst,
        seller_inv: resolvedInvoiceNumber,
        invoice_reference: resolvedInvoiceNumber,
        invoice_date: invoiceDate,
        pickup_location: resolveDelhiveryPickupLocationName(pickup) || 'Default Warehouse',
        pickup_address: pickupAddress,
        pickup_city: sanitizeString(pickup.city),
        pickup_state: sanitizeString(pickup.state),
        pickup_pin: sanitizePincode(pickup.pincode),
        pickup_phone: pickupPhone,
        pickup_country: 'India',
        pickup_date: pickupDate || undefined,
        pickup_time: pickupTime || undefined,
        shipping_mode: shippingMode,
        client_name: this.clientName || sellerName,
        client_gst_tin: sellerGst,
      }

      if (params.transport_speed) {
        manifestShipmentBase.transport_speed = sanitizeString(params.transport_speed)
      }
      if (params.address_type) {
        manifestShipmentBase.address_type = sanitizeString(params.address_type)
      }
      const ewbnValue =
        params.ewbn || params.ewb || params.ewbn_number || params.ewaybill_number || undefined
      if (ewbnValue) {
        manifestShipmentBase.ewbn = sanitizeString(ewbnValue)
      }
      if (params.dangerous_good !== undefined) {
        manifestShipmentBase.dangerous_good = sanitizeBoolean(params.dangerous_good)
      }
      if (params.fragile_shipment !== undefined) {
        manifestShipmentBase.fragile_shipment = sanitizeBoolean(params.fragile_shipment)
      }
      if (params.plastic_packaging !== undefined) {
        manifestShipmentBase.plastic_packaging = sanitizeBoolean(params.plastic_packaging)
      }
      if (params.quantity !== undefined && params.quantity !== null) {
        manifestShipmentBase.quantity = sanitizeString(String(params.quantity))
      }
      if (params.country) {
        manifestShipmentBase.country = sanitizeString(params.country)
      }

      const resolvedReturnAddress =
        params.rto && params.is_rto_different === 'yes'
          ? params.rto
          : paymentMode === 'REPL'
            ? (params.rto ?? params.pickup)
            : null

      if (resolvedReturnAddress) {
        Object.assign(manifestShipmentBase, {
          return_name: resolvedReturnAddress.name,
          return_add: resolvedReturnAddress.address,
          return_address: resolvedReturnAddress.address,
          return_city: resolvedReturnAddress.city,
          return_state: resolvedReturnAddress.state,
          return_pin: resolvedReturnAddress.pincode,
          return_phone: resolvedReturnAddress.phone,
          return_country: 'India',
        })
      }

      const buildMpsShipment = (box: any, index: number, masterWaybill: string, boxWaybill: string) => {
        const boxProductsDesc =
          sanitizeString(box?.products_desc ?? box?.productsDesc) || productsDesc
        const boxOrder =
          sanitizeString(box?.order) || (index === 0 ? orderNumber : `${orderNumber}-${index + 1}`)
        const boxWeightGrams = normalizeDelhiveryWeightGrams(
          box?.weight ?? box?.weightKg ?? params.package_weight,
        )
        const boxLength = Number(
          box?.shipment_length ?? box?.length ?? box?.lengthCm ?? params.package_length ?? 10,
        )
        const boxBreadth = Number(
          box?.shipment_width ?? box?.width ?? box?.breadth ?? box?.breadthCm ?? params.package_breadth ?? 10,
        )
        const boxHeight = Number(
          box?.shipment_height ?? box?.height ?? box?.heightCm ?? params.package_height ?? 10,
        )

        return {
          ...manifestShipmentBase,
          order: boxOrder,
          name: sanitizeString(box?.name ?? consignee.name),
          phone: sanitizePhone(box?.phone ?? consignee.phone),
          add: sanitizeString(box?.add ?? box?.address ?? consignee.address),
          city: sanitizeString(box?.city ?? consignee.city),
          state: sanitizeString(box?.state ?? consignee.state),
          pin: sanitizePincode(box?.pin ?? box?.pincode ?? consignee.pincode),
          total_amount: Number(box?.total_amount ?? box?.mps_amount ?? orderAmount),
          products_desc: boxProductsDesc,
          weight: boxWeightGrams,
          shipment_length: boxLength,
          shipment_width: boxBreadth,
          shipment_height: boxHeight,
          shipment_type: 'MPS',
          mps_amount: paymentMode === 'COD' ? orderAmount : 0,
          mps_children: boxes.length,
          master_id: masterWaybill,
          waybill: boxWaybill,
        }
      }

      if (!isMpsShipment && waybill) {
        manifestShipmentBase.waybill = waybill
      }

      let shipmentPayloads: Record<string, any>[]
      if (isMpsShipment) {
        const collectedWaybills = this.normalizeWaybillList([
          waybill,
          (params as any).master_waybill,
          ...(Array.isArray((params as any).waybills) ? (params as any).waybills : []),
          ...boxes.map((box: any) => box?.waybill),
        ])
        const waybillPool =
          collectedWaybills.length >= boxes.length
            ? collectedWaybills.slice(0, boxes.length)
            : this.normalizeWaybillList([
                ...collectedWaybills,
                ...this.normalizeWaybillList(await this.fetchWaybills(boxes.length - collectedWaybills.length)),
              ]).slice(0, boxes.length)

        if (waybillPool.length < boxes.length) {
          throw new HttpError(
            400,
            `MPS shipments require ${boxes.length} waybill numbers, but only ${waybillPool.length} were available.`,
          )
        }

        const masterWaybill = waybillPool[0]
        if (!masterWaybill) {
          throw new HttpError(400, 'MPS shipments require a master waybill number.')
        }

        shipmentPayloads = boxes.map((box: any, index: number) =>
          buildMpsShipment(box, index, masterWaybill, waybillPool[index]),
        )
      } else {
        shipmentPayloads = [manifestShipmentBase]
      }

      const payload = {
        shipments: shipmentPayloads,
        pickup_location: {
          name: resolveDelhiveryPickupLocationName(pickup) || 'Default Warehouse',
        },
      }

      console.log('📤 Delhivery createShipment payload summary', {
        order: orderNumber,
        pickup_location: payload.shipments[0].pickup_location,
        pickup_date: payload.shipments[0].pickup_date ?? null,
        pickup_time: payload.shipments[0].pickup_time ?? null,
        weight_g: packageWeightGrams,
        payment_mode: paymentMode,
        shipment_type: isMpsShipment ? 'MPS' : 'SPS',
        boxes: shipmentPayloads.length,
        hsn_present: hsnCodes.length,
        invoice_number: invoiceNumber,
        shipping_mode: shippingMode,
        cod_amount: codAmount,
      })

      const res = await this.postFormEncoded('/api/cmu/create.json', payload)
      const responseData = res.data

      const packages: any[] =
        Array.isArray(responseData?.packages) && responseData.packages.length
          ? responseData.packages
          : responseData?.packages
            ? [responseData.packages]
            : []

      const normalizedStatus = (value?: string) => (value || '').toLowerCase()
      const normalizeRemarks = (remarks: unknown): string[] => {
        if (!remarks) return []
        if (Array.isArray(remarks)) {
          return remarks
            .flatMap((entry) => normalizeRemarks(entry))
            .filter((entry) => entry.trim().length > 0)
        }
        if (typeof remarks === 'string') {
          return [remarks.trim()].filter(Boolean)
        }
        if (typeof remarks === 'object') {
          return Object.values(remarks as Record<string, unknown>)
            .flatMap((entry) => normalizeRemarks(entry))
            .filter((entry) => entry.trim().length > 0)
        }
        return [String(remarks).trim()].filter(Boolean)
      }
      const overallStatus = normalizedStatus(responseData?.status)
      const packageFailures = packages.filter(
        (pkg) =>
          normalizedStatus(pkg?.status) === 'fail' || pkg?.serviceable === false || !pkg?.waybill,
      )
      const packageFailuresWithRemarks = packageFailures.map((pkg) => ({
        ...pkg,
        remarks: normalizeRemarks(pkg?.remarks),
      }))
      const successPackage = packages.find(
        (pkg) =>
          pkg?.waybill && pkg?.serviceable !== false && normalizedStatus(pkg?.status) !== 'fail',
      )

      if (
        overallStatus === 'fail' ||
        responseData?.success === false ||
        responseData?.serviceable === false ||
        !successPackage
      ) {
        console.error('❌ Delhivery manifest rejected', {
          order: orderNumber,
          response: responseData,
          packageFailures: packageFailuresWithRemarks,
        })

        const failureReason =
          responseData?.message ||
          responseData?.status_message ||
          packageFailuresWithRemarks
            .map((pkg) => {
              const joinedRemarks = pkg.remarks.join(' | ')
              return (
                joinedRemarks ||
                pkg?.message ||
                pkg?.reason ||
                pkg?.rmk ||
                `status=${pkg?.status}`
              )
            })
            .filter(Boolean)
            .join(' | ') ||
          normalizeRemarks(responseData?.rmk).join(' | ') ||
          'Delhivery reported a failure during shipment creation.'
        throw new DelhiveryManifestError(502, failureReason, responseData)
      }

      const responseShippingMode =
        responseData?.shipping_mode ??
        successPackage?.shipping_mode ??
        successPackage?.service_mode ??
        successPackage?.service_type ??
        successPackage?.mode ??
        null

      console.log('📤 Delhivery API response service', {
        order: orderNumber,
        requested_shipping_mode: shippingMode,
        response_shipping_mode: responseShippingMode,
        response_package_keys: successPackage ? Object.keys(successPackage) : [],
      })

      let sortCode: string | null = null
      if (successPackage) {
        sortCode =
          (successPackage.sort_code ||
            successPackage.sortCode ||
            successPackage.routing_code ||
            successPackage.routingCode) ??
          null
      }

      if (sortCode && successPackage) {
        successPackage.sort_code = sortCode
      }

      return responseData
    } catch (err: any) {
      console.error('Delhivery shipment error:', err.response?.data || err.message)
      if (err instanceof HttpError) {
        throw err
      }
      throw new Error('Delhivery shipment creation failed')
    }
  }

  // 🔹 6. Cancel Shipment
  async cancelShipment(waybill: string) {
    const normalizedWaybill = String(waybill || '').trim()
    if (!normalizedWaybill) {
      throw new HttpError(400, 'Delhivery AWB number is required for cancellation')
    }

    try {
      await this.ensureCredentials()
      console.log('🚚 Delhivery Cancel Shipment Request:', {
        waybill: normalizedWaybill,
        apiBase: this.apiBase,
      })

      const res = await this.postWithTimeout(
        `${this.apiBase}/api/p/edit`,
        { waybill: normalizedWaybill, cancellation: 'true' },
        {
          headers: {
            Authorization: `Token ${this.token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        },
      )

      console.log('📥 Delhivery Cancel Shipment Response:', {
        status: res.status,
        data: JSON.stringify(res.data, null, 2),
        success: res.data?.success,
        Success: res.data?.Success,
        statusField: res.data?.status,
        message: res.data?.message,
      })

      if (!isDelhiveryCancellationAccepted(res.data)) {
        const providerMessage =
          getDelhiveryCancellationMessage(res.data) ||
          extractProviderErrorMessage(res.data) ||
          'Delhivery cancellation not accepted'
        throw new Error(providerMessage)
      }

      return {
        success: true,
        status: 'success',
        provider: 'delhivery',
        awb_number: normalizedWaybill,
        alreadyCancelled: isDelhiveryAlreadyCancelledResponse(res.data),
        message:
          getDelhiveryCancellationMessage(res.data) ||
          (isDelhiveryAlreadyCancelledResponse(res.data)
            ? 'Delhivery shipment was already cancelled'
            : 'Delhivery cancellation accepted'),
        provider_response: res.data,
      }
    } catch (err: any) {
      console.error('❌ Delhivery cancellation error:', {
        waybill: normalizedWaybill,
        status: err.response?.status,
        data: JSON.stringify(err.response?.data, null, 2),
        message: err.message,
        stack: err.stack,
      })
      const providerMessage =
        extractProviderErrorMessage(err.response?.data) ||
        err.response?.data?.message ||
        err.message ||
        'Delhivery cancellation failed'
      throw new Error(providerMessage)
    }
  }

  // 🔹 7. Track Shipment
  async updateShipment(
    waybill: string,
    payload: {
      name?: string
      phone?: string | string[]
      pt?: 'COD' | 'Prepaid' | 'Pickup' | 'REPL'
      add?: string
      products_desc?: string
      gm?: number
      shipment_height?: number
      shipment_width?: number
      shipment_length?: number
    },
  ) {
    const normalizedWaybill = String(waybill || '').trim()
    if (!normalizedWaybill) {
      throw new HttpError(400, 'Delhivery waybill is required for shipment updates')
    }

    try {
      await this.ensureCredentials()
      const body = {
        waybill: normalizedWaybill,
        ...(payload.name ? { name: String(payload.name).trim() } : {}),
        ...(payload.phone ? { phone: payload.phone } : {}),
        ...(payload.pt ? { pt: payload.pt } : {}),
        ...(payload.add ? { add: String(payload.add).trim() } : {}),
        ...(payload.products_desc ? { products_desc: String(payload.products_desc).trim() } : {}),
        ...(payload.gm !== undefined ? { gm: Number(payload.gm) } : {}),
        ...(payload.shipment_height !== undefined
          ? { shipment_height: Number(payload.shipment_height) }
          : {}),
        ...(payload.shipment_width !== undefined
          ? { shipment_width: Number(payload.shipment_width) }
          : {}),
        ...(payload.shipment_length !== undefined
          ? { shipment_length: Number(payload.shipment_length) }
          : {}),
      }

      const res = await this.postWithTimeout(`${this.apiBase}/api/p/edit`, body, {
        headers: {
          Authorization: `Token ${this.token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      })

      return res.data
    } catch (err: any) {
      console.error('❌ Delhivery shipment update error:', {
        waybill: normalizedWaybill,
        status: err.response?.status,
        data: JSON.stringify(err.response?.data, null, 2),
        message: err.message,
      })

      const error = new Error(
        extractProviderErrorMessage(err.response?.data) || 'Delhivery shipment update failed',
      )
      ;(error as any).statusCode = typeof err.response?.status === 'number' ? err.response.status : 500
      ;(error as any).details = err.response?.data || null
      throw error
    }
  }

  async trackShipment(waybill: string): Promise<any>
  async trackShipment(waybill: string[], refIds?: string | string[]): Promise<any>
  async trackShipment(waybill: string | string[], refIds?: string | string[]) {
    await this.ensureCredentials()

    const normalizedWaybills = this.normalizeWaybillList(waybill)
    if (!normalizedWaybills.length) {
      throw new HttpError(400, 'Waybill number is required for Delhivery tracking')
    }

    if (normalizedWaybills.length > 50) {
      throw new HttpError(400, 'Delhivery tracking supports up to 50 waybills per request')
    }

    const normalizedRefIds = this.normalizeWaybillList(refIds)
    const url = new URL(`${this.apiBase}/api/v1/packages/json/`)
    url.searchParams.set('waybill', normalizedWaybills.join(','))

    if (normalizedRefIds.length) {
      url.searchParams.set('ref_ids', normalizedRefIds.join(','))
    }

    const res = await this.getWithTimeout(url.toString(), {
      headers: this.headers,
    })
    return res.data
  }

  // 🔹 8. NDR Action (RE-ATTEMPT / PICKUP_RESCHEDULE)
  async submitNdrAction(
    actions: Array<{
      waybill: string
      act: 'RE-ATTEMPT' | 'PICKUP_RESCHEDULE' | 'DEFER_DLV' | 'EDIT_DETAILS'
      action_data?: Record<string, any>
    }>,
  ) {
    try {
      await this.ensureCredentials()
      const url = `${this.apiBase}/api/p/update`
      const payload = actions.map((action) => {
        const normalizedAct = action.act === 'DEFER_DLV' ? 'PICKUP_RESCHEDULE' : action.act

        if (normalizedAct === 'EDIT_DETAILS' && action.action_data && Object.keys(action.action_data).length) {
          return {
            waybill: action.waybill,
            act: normalizedAct,
            action_data: action.action_data,
          }
        }

        return {
          waybill: action.waybill,
          act: normalizedAct,
        }
      })
      const res = await this.postWithTimeout(url, { data: payload }, { headers: this.headers })
      return res.data // contains UPL id(s)
    } catch (err: any) {
      console.error('Delhivery NDR action error:', err.response?.data || err.message)
      throw new Error('Failed to submit Delhivery NDR action')
    }
  }

  // 🔹 9. Get NDR UPL Status
  async getNdrStatus(uplId: string, verbose: boolean = true) {
    try {
      await this.ensureCredentials()
      const url = `${this.apiBase}/api/cmu/get_bulk_upl/${encodeURIComponent(uplId)}?verbose=${
        verbose ? 'true' : 'false'
      }`
      const res = await this.getWithTimeout(url, { headers: this.headers })
      return res.data
    } catch (err: any) {
      console.error('Delhivery NDR status error:', err.response?.data || err.message)
      throw new Error('Failed to fetch Delhivery NDR status')
    }
  }

  // 🔹 8. Pickup Request (manual scheduling)
  async requestPickup(pickupData: any) {
    await this.ensureCredentials()
    const res = await this.postWithTimeout(`${this.apiBase}/fm/request/new/`, pickupData, {
      headers: this.headers,
    })
    return res.data
  }

  // services/delhivery.service.ts
  async createWarehouse(warehouse: {
    name: string
    registered_name?: string
    phone: string
    email?: string
    address: string
    city: string
    pin: string
    country?: string
    return_address: string
    return_city?: string
    return_pin?: string
    return_state?: string
    return_country?: string
  }) {
    try {
      await this.ensureCredentials()
      const url = `${this.apiBase}/api/backend/clientwarehouse/create/`
      const headers = {
        Authorization: `Token ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }

      const res = await this.postWithTimeout(url, warehouse, { headers })
      return res.data
    } catch (err: any) {
      console.error('❌ Delhivery warehouse creation error:', err.response?.data || err.message)
      // Re-throw original error so upstream callers can inspect Delhivery's response
      throw err
    }
  }

  async triggerDelhiveryPickupRequest(pickupLocationName: string, packageCount: number) {
    try {
      // 🔹 Current date in YYYY-MM-DD
      const now = new Date()
      const pickup_date = now.toISOString().split('T')[0]

      // 🔹 Pickup time → 1 hour from now (HH:mm:ss)
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)
      const pickup_time = oneHourLater.toTimeString().split(' ')[0] // "HH:mm:ss"

      const payload = {
        pickup_date,
        pickup_time,
        pickup_location: pickupLocationName,
        expected_package_count: packageCount,
      }

      const res = await this.requestPickup(payload)

      if (!res?.success) {
        console.error('❌ Delhivery pickup creation failed:', res)
        throw new Error(res?.message || 'Delhivery pickup request failed')
      }

      console.log(`✅ Pickup request created for ${pickupLocationName} (${packageCount} packages)`)
      return res
    } catch (err: any) {
      console.error('❌ Pickup request creation error:', err.message)
      throw err
    }
  }
  // 🔹 10. Create Reverse Shipment
  // Delhivery reverse shipments are created via the same create.json manifestation API,
  // with `package_type: "Pickup"` and reverse-specific shipment values.
  async createReverseShipment(params: {
    originalAwb: string
    originalOrderId?: string
    consignee: ShipmentParams['consignee']
    pickup: ShipmentParams['pickup']
    rto?: ShipmentParams['rto']
    order_amount?: number
    package_weight?: number
    package_length?: number
    package_breadth?: number
    package_height?: number
    order_items?: ShipmentParams['order_items']
    qc_details?: ShipmentParams['qc_details']
  }) {
    try {
      const reverseDrop = params.rto ?? params.pickup
      const customQcSource =
        Array.isArray((params.qc_details as any)?.custom_qc)
          ? (params.qc_details as any).custom_qc
          : Array.isArray((params.qc_details as any)?.customQc)
            ? (params.qc_details as any).customQc
            : Array.isArray(params.qc_details)
              ? params.qc_details
              : []

      const normalizeList = (value: unknown) =>
        Array.isArray(value)
          ? value
              .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
              .map((entry) => String(entry ?? '').trim())
              .filter(Boolean)
          : typeof value === 'string'
            ? value
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean)
            : []

      const normalizeQuestions = (questions: unknown) =>
        Array.isArray(questions)
          ? questions.map((question: any) => ({
              questions_id: String(question?.questions_id ?? question?.question_id ?? '').trim(),
              options: normalizeList(question?.options),
              value: normalizeList(question?.value),
              required: Boolean(question?.required),
              type: String(question?.type ?? '').trim(),
              ...(question?.ques_images !== undefined
                ? { ques_images: normalizeList(question?.ques_images) }
                : {}),
            }))
          : []

      const normalizedCustomQc = Array.isArray(customQcSource)
        ? customQcSource
            .map((item: any) => ({
              ...(item?.item !== undefined ? { item: String(item.item).trim() } : {}),
              ...(item?.description !== undefined
                ? { description: String(item.description).trim() }
                : {}),
              ...(item?.images !== undefined ? { images: normalizeList(item.images) } : {}),
              ...(item?.return_reason !== undefined
                ? { return_reason: String(item.return_reason).trim() }
                : {}),
              ...(item?.quantity !== undefined ? { quantity: Number(item.quantity) || 1 } : { quantity: 1 }),
              ...(item?.brand !== undefined ? { brand: String(item.brand).trim() } : {}),
              ...(item?.product_category !== undefined
                ? { product_category: String(item.product_category).trim() }
                : {}),
              questions: normalizeQuestions(item?.questions),
            }))
            .filter((item) => {
              const images = Array.isArray(item.images) ? item.images : []
              const questions = Array.isArray(item.questions) ? item.questions : []
              return Boolean(
                item.item ||
                  item.description ||
                  images.length ||
                  item.return_reason ||
                  item.brand ||
                  item.product_category ||
                  questions.length,
              )
            })
        : []

      const reversePayload: any = {
        shipments: [
          {
            client: this.clientName || params.pickup?.name || 'Feather Global',
            order: params.originalOrderId || `REVERSE-${params.originalAwb}`,
            name: params.consignee?.name || '',
            phone: String(params.consignee?.phone || '')
              .replace(/\D/g, '')
              .slice(-10),
            add: params.consignee?.address || '',
            city: params.consignee?.city || '',
            state: params.consignee?.state || '',
            pin: String(params.consignee?.pincode || '')
              .padStart(6, '0')
              .slice(0, 6),
            country: 'India',
            payment_mode: 'Pickup',
            package_type: 'Pickup',
            total_amount: Number(params.order_amount || 0),
            cod_amount: '0',
            products_desc:
              params.order_items?.map((i) => i.name).join(', ') || 'Reverse Pickup Shipment',
            weight: normalizeDelhiveryWeightGrams(params.package_weight),
            shipment_length: Number(params.package_length ?? 10),
            shipment_width: Number(params.package_breadth ?? 10),
            shipment_height: Number(params.package_height ?? 10),
            pickup_location: resolveDelhiveryPickupLocationName(params.pickup) || 'Default Warehouse',
            seller_name: params.pickup?.name ?? 'Feather Global',
            seller_add: params.pickup?.address ?? '',
            order_date: new Date().toISOString().split('T')[0],
            return_name: reverseDrop?.name ?? params.pickup?.name ?? 'Return',
            return_add: reverseDrop?.address ?? '',
            return_city: reverseDrop?.city ?? '',
            return_state: reverseDrop?.state ?? '',
            return_pin: String(reverseDrop?.pincode ?? '')
              .padStart(6, '0')
              .slice(0, 6),
            return_phone: String(reverseDrop?.phone ?? '')
              .replace(/\D/g, '')
              .slice(-10),
            return_country: 'India',
            qc_type: normalizedCustomQc.length > 0 ? 'param' : undefined,
            ...(normalizedCustomQc.length > 0 ? { custom_qc: normalizedCustomQc } : {}),
          },
        ],
      }

      if (params.order_items && params.order_items.length > 0) {
        reversePayload.shipments[0].products_desc = params.order_items
          .map((item) => item?.name || 'Item')
          .join(', ')
      }

      const res = await this.postFormEncoded('/api/cmu/create.json', reversePayload)

      if (!res.data?.packages?.length) {
        throw new Error('Delhivery reverse shipment creation failed - no packages returned')
      }

      const pkg = res.data.packages[0]
      const delhiveryCost =
        pkg?.charge || pkg?.amount || res.data?.charge || res.data?.amount || null

      return {
        success: true,
        packages: res.data.packages,
        upload_wbn: res.data.upload_wbn,
        shipment_id: res.data.upload_wbn,
        awb_number: pkg.waybill,
        courier_name: 'Delhivery',
        courier_cost: delhiveryCost ? Number(delhiveryCost) : null,
        status: 'booked',
      }
    } catch (err: any) {
      console.error('Delhivery reverse shipment error:', err.response?.data || err.message)
      throw new Error(err?.message || 'Delhivery reverse shipment creation failed')
    }
  }

  async updateWarehouse(data: {
    name: string // warehouse name (case-sensitive, cannot be changed)
    address?: string
    pin: string
    phone?: string
  }) {
    try {
      await this.ensureCredentials()
      const url = `${this.apiBase}/api/backend/clientwarehouse/edit/`
      const headers = {
        Authorization: `Token ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }

      const payload = {
        name: String(data.name || '').trim(),
        pin: String(data.pin || '').trim(),
        ...(typeof data.address === 'string' && data.address.trim() ? { address: data.address.trim() } : {}),
        ...(typeof data.phone === 'string' && data.phone.trim() ? { phone: data.phone.trim() } : {}),
      }

      const res = await this.postWithTimeout(url, payload, { headers })
      return res.data
    } catch (err: any) {
      console.error('❌ Delhivery warehouse update error:', err.response?.data || err.message)
      throw new Error('Failed to update Delhivery warehouse')
    }
  }

  async createPickupRequest({
    pickup_date,
    pickup_time,
    pickup_location,
    expected_package_count,
  }: {
    pickup_date: string
    pickup_time: string
    pickup_location: string
    expected_package_count: number
  }) {
    try {
      await this.ensureCredentials()
      const url = `${this.apiBase}/fm/request/new/`
      const payload = {
        pickup_date,
        pickup_time,
        pickup_location, // must exactly match warehouse name in Delhivery
        expected_package_count,
      }

      const headers = {
        Authorization: `Token ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }

      const res = await this.postWithTimeout(url, payload, { headers })
      const responseData = res.data
      const rejected =
        responseData?.success === false ||
        responseData?.status === false ||
        Boolean(responseData?.error) ||
        Boolean(responseData?.errors)

      if (rejected) {
        throw new Error(
          extractProviderErrorMessage(responseData) || 'Delhivery pickup request was rejected',
        )
      }

      return responseData
    } catch (err: any) {
      const providerError = err.response?.data
      const timeoutError = isTimeoutError(err)

      const providerMessage =
        (!timeoutError && extractProviderErrorMessage(providerError?.pickup_date)) ||
        extractProviderErrorMessage(providerError?.message) ||
        extractProviderErrorMessage(providerError?.error) ||
        (!timeoutError && extractProviderErrorMessage(providerError)) ||
        (typeof err.message === 'string' && err.message.trim().length > 0 && !timeoutError
          ? err.message.trim()
          : 'Pickup request is taking longer than expected. Please try again.')

      const existingPickupRequestId = getExistingPickupRequestId(providerMessage)
      if (existingPickupRequestId) {
        console.warn('ℹ️ Delhivery pickup request already exists; treating as accepted', {
          pickup_request_id: existingPickupRequestId,
          pickup_location,
          pickup_date,
          pickup_time,
          expected_package_count,
        })
        return {
          success: true,
          already_exists: true,
          pickup_request_id: existingPickupRequestId,
          message: providerMessage,
          provider_response: providerError || null,
        }
      }

      console.error('❌ Delhivery pickup request error:', providerError || err.message)

      const error = new Error(providerMessage)
      ;(error as any).statusCode = typeof err.response?.status === 'number'
        ? err.response.status
        : timeoutError
          ? 504
          : 500
      ;(error as any).details = providerError || null
      ;(error as any).isPickupRequestError = true
      ;(error as any).providerStatus = err.response?.status ?? null
      ;(error as any).providerStatusText = err.response?.statusText ?? null
      ;(error as any).code = err?.code ?? null
      throw error
    }
  }
  // 🔹 9. Fetch Shipping Label from Delhivery packing_slip API
  // format=json -> metadata (barcodes, sort code, etc.)
  // format=pdf  -> raw PDF bytes (used to ensure provider-side label generation activity)
  async generateLabel(
    awb: string,
    options: { format?: 'json' | 'pdf'; pdfSize?: 'A4' | '4R' | string } = { format: 'json' },
  ) {
    await this.ensureCredentials()
    const format = options.format || 'json'
    const query = qs.stringify({
      wbns: awb,
      pdf: format === 'pdf' ? 'true' : 'false',
      ...(options.pdfSize ? { pdf_size: String(options.pdfSize).trim() } : {}),
    })
    const url = `${this.apiBase}/api/p/packing_slip?${query}`
    const responseType = format === 'pdf' ? 'arraybuffer' : 'json'
    const res = await this.getWithTimeout(
      url,
      {
        headers: this.headers,
        responseType,
      },
      format === 'pdf' ? this.labelTimeoutMs : this.requestTimeoutMs,
    )

    return format === 'pdf' ? Buffer.from(res.data) : res.data
  }

  // 🔹 10. Update E-Waybill
  async updateEwaybill(
    waybill: string,
    payload: {
      dcn: string
      ewbn: string
    },
  ) {
    const normalizedWaybill = String(waybill || '').trim()
    const normalizedDcn = String(payload?.dcn || '').trim()
    const normalizedEwbn = String(payload?.ewbn || '').trim()

    if (!normalizedWaybill) {
      throw new HttpError(400, 'Delhivery waybill is required for E-waybill update')
    }
    if (!normalizedDcn) {
      throw new HttpError(400, 'dcn is required for Delhivery E-waybill update')
    }
    if (!normalizedEwbn) {
      throw new HttpError(400, 'ewbn is required for Delhivery E-waybill update')
    }

    await this.ensureCredentials()

    try {
      const url = `${this.apiBase}/api/rest/ewaybill/${encodeURIComponent(normalizedWaybill)}/`
      const body = {
        data: [
          {
            dcn: normalizedDcn,
            ewbn: normalizedEwbn,
          },
        ],
      }

      const res = await axios.put(url, body, {
        headers: {
          Authorization: `Token ${this.token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: this.requestTimeoutMs,
      })

      return res.data
    } catch (err: any) {
      console.error('Delhivery e-waybill update error:', {
        waybill: normalizedWaybill,
        dcn: normalizedDcn,
        ewbn: normalizedEwbn,
        status: err.response?.status,
        data: JSON.stringify(err.response?.data, null, 2),
        message: err.message,
      })

      const error = new Error(
        extractProviderErrorMessage(err.response?.data) ||
          'Delhivery e-waybill update failed',
      )
      ;(error as any).statusCode = typeof err.response?.status === 'number' ? err.response.status : 500
      ;(error as any).details = err.response?.data || null
      throw error
    }
  }

  // COD Settlement APIs not publicly available
  // Use CSV download from Delhivery dashboard instead:
  // Dashboard → Finances → Remittance → Download Report
}
