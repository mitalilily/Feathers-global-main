import { Response } from 'express'
import { EkartService } from '../../models/services/couriers/ekart.service'

const parseBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return false
    return ['true', '1', 'yes', 'y', 'on'].includes(normalized)
  }
  return false
}

const toPositiveNumber = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

const toIntegerOrUndefined = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined
}

const toStringOrNull = (value: unknown) => {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

const normalizeIdList = (ids: unknown) => {
  const values = Array.isArray(ids) ? ids : typeof ids === 'string' ? ids.split(',') : []
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

const toBuffer = (value: any) => {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value))
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  }
  if (typeof value === 'string') return Buffer.from(value, 'utf8')
  return Buffer.from(JSON.stringify(value ?? {}), 'utf8')
}

export const getEkartShippingRatesController = async (req: any, res: Response) => {
  try {
    const payload = req.body || {}
    const pickupPincode = toPositiveNumber(payload.pickupPincode)
    const dropPincode = toPositiveNumber(payload.dropPincode)
    const weight = toPositiveNumber(payload.weight)
    const length = toPositiveNumber(payload.length)
    const height = toPositiveNumber(payload.height)
    const width = toPositiveNumber(payload.width)
    const serviceType = String(payload.serviceType || 'SURFACE').trim().toUpperCase()
    const shippingDirection = String(payload.shippingDirection || 'FORWARD').trim().toUpperCase() || 'FORWARD'

    if (
      pickupPincode === undefined ||
      dropPincode === undefined ||
      weight === undefined ||
      length === undefined ||
      height === undefined ||
      width === undefined
    ) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message:
          'pickupPincode, dropPincode, weight, length, height, and width are required for Ekart pricing',
      })
    }

    if (!['SURFACE', 'EXPRESS'].includes(serviceType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid serviceType',
        message: 'serviceType must be SURFACE or EXPRESS',
      })
    }

    const ekart = new EkartService()
    const data = await ekart.estimateShippingRates({
      pickupPincode,
      dropPincode,
      invoiceAmount: toPositiveNumber(payload.invoiceAmount),
      weight,
      length,
      height,
      width,
      serviceType: serviceType as 'SURFACE' | 'EXPRESS',
      shippingDirection,
      codAmount: toPositiveNumber(payload.codAmount),
      packages: Array.isArray(payload.packages) ? payload.packages : undefined,
    })

    return res.status(200).json({
      success: true,
      data,
    })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    console.error('Error fetching Ekart pricing estimate via API:', error)
    return res.status(statusCode).json({
      success: false,
      error: error?.message || 'Failed to fetch Ekart pricing estimate',
      message: error?.message || 'Internal server error',
    })
  }
}

export const checkEkartPairServiceabilityController = async (req: any, res: Response) => {
  try {
    const body = req.body || {}
    const pickupPincode = String(body.pickupPincode || '').trim()
    const dropPincode = String(body.dropPincode || '').trim()
    const length = String(body.length || '').trim()
    const height = String(body.height || '').trim()
    const width = String(body.width || '').trim()
    const weight = String(body.weight || '').trim()
    const paymentType = String(body.paymentType || '').trim().toUpperCase()
    const serviceType = String(body.serviceType || 'SURFACE').trim().toUpperCase()
    const codAmount = String(body.codAmount || '').trim()
    const invoiceAmount = String(body.invoiceAmount || '').trim()

    if (!/^\d{6}$/.test(pickupPincode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pickupPincode',
        message: 'pickupPincode must be a 6-digit number',
      })
    }

    if (!/^\d{6}$/.test(dropPincode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid dropPincode',
        message: 'dropPincode must be a 6-digit number',
      })
    }

    if (!length || !height || !width || !weight) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'length, height, width, and weight are required for Ekart serviceability',
      })
    }

    if (!['COD', 'PREPAID'].includes(paymentType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid paymentType',
        message: 'paymentType must be COD or Prepaid',
      })
    }

    if (!['SURFACE', 'EXPRESS'].includes(serviceType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid serviceType',
        message: 'serviceType must be SURFACE or EXPRESS',
      })
    }

    if (!invoiceAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'invoiceAmount is required for Ekart serviceability',
      })
    }

    if (paymentType === 'COD' && !codAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'codAmount is required when paymentType is COD',
      })
    }

    const ekart = new EkartService()
    const data = await ekart.checkServiceability({
      pickupPincode,
      dropPincode,
      length,
      height,
      width,
      weight,
      paymentType: paymentType as 'COD' | 'Prepaid',
      serviceType: serviceType as 'SURFACE' | 'EXPRESS',
      ...(codAmount ? { codAmount } : {}),
      invoiceAmount,
    })

    return res.status(200).json({
      success: true,
      data,
    })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    console.error('Error checking Ekart pair serviceability via API:', error)
    return res.status(statusCode).json({
      success: false,
      error: error?.message || 'Failed to check Ekart pair serviceability',
      message: error?.message || 'Internal server error',
    })
  }
}

export const getEkartRawTrackController = async (req: any, res: Response) => {
  try {
    const wbn = String(req.params.wbn || '').trim()
    if (!wbn) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'wbn is required',
      })
    }

    const ekart = new EkartService()
    const data = await ekart.trackWbn(wbn)

    return res.status(200).json({
      success: true,
      data,
    })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    console.error('Error tracking Ekart WBN via API:', error)
    return res.status(statusCode).json({
      success: false,
      error: error?.message || 'Failed to track Ekart shipment',
      message: error?.message || 'Internal server error',
    })
  }
}

export const checkEkartPincodeServiceabilityController = async (req: any, res: Response) => {
  try {
    const pincode = String(req.params.pincode || req.query?.pincode || '').trim()

    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pincode',
        message: 'pincode must be a 6-digit number',
      })
    }

    const ekart = new EkartService()
    const data = await ekart.checkPincodeServiceability(pincode)

    return res.status(200).json({
      success: true,
      data,
    })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    console.error('Error checking Ekart pincode serviceability via API:', error)
    return res.status(statusCode).json({
      success: false,
      error: error?.message || 'Failed to check Ekart pincode serviceability',
      message: error?.message || 'Internal server error',
    })
  }
}

export const getEkartBulkServiceabilityController = async (req: any, res: Response) => {
  try {
    const type = String(req.params.type || '').trim().toUpperCase()
    const format = String(req.query?.format || 'JSON').trim().toUpperCase()

    if (!['NON_LARGE', 'LARGE'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid serviceability type',
        message: 'type must be NON_LARGE or LARGE',
      })
    }

    if (!['JSON', 'EXCEL'].includes(format)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format',
        message: 'format must be JSON or EXCEL',
      })
    }

    const ekart = new EkartService()
    const data = await ekart.getBulkServiceability(type as 'NON_LARGE' | 'LARGE', format as 'JSON' | 'EXCEL')

    return res.status(200).json({
      success: true,
      data,
    })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    console.error('Error fetching Ekart bulk serviceability via API:', error)
    return res.status(statusCode).json({
      success: false,
      error: error?.message || 'Failed to fetch Ekart bulk serviceability',
      message: error?.message || 'Internal server error',
    })
  }
}

export const downloadEkartLabelsController = async (req: any, res: Response) => {
  try {
    const ids = normalizeIdList(req.body?.ids)
    const jsonOnly = parseBoolean(req.query?.json_only ?? req.body?.json_only ?? req.body?.jsonOnly)

    if (!ids.length) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'ids must contain at least one Ekart waybill number',
      })
    }

    if (ids.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Too many ids',
        message: 'Ekart label download supports a maximum of 100 waybill numbers per request',
      })
    }

    const ekart = new EkartService()
    const data = await ekart.downloadLabels(ids, jsonOnly)

    if (jsonOnly) {
      return res.status(200).json({
        success: true,
        data,
      })
    }

    const pdfBuffer = toBuffer(data)
    res.status(200)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="ekart-labels.pdf"')
    return res.send(pdfBuffer)
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    console.error('Error downloading Ekart labels via API:', error)
    return res.status(statusCode).json({
      success: false,
      error: error?.message || 'Failed to download Ekart labels',
      message: error?.message || 'Internal server error',
    })
  }
}

export const generateEkartManifestController = async (req: any, res: Response) => {
  try {
    const ids = normalizeIdList(req.body?.ids)

    if (!ids.length) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'ids must contain at least one Ekart waybill number',
      })
    }

    if (ids.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Too many ids',
        message: 'Ekart manifest download supports a maximum of 100 waybill numbers per request',
      })
    }

    const ekart = new EkartService()
    const data = await ekart.generateManifest(ids)

    return res.status(200).json({
      success: true,
      data,
    })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    console.error('Error generating Ekart manifest via API:', error)
    return res.status(statusCode).json({
      success: false,
      error: error?.message || 'Failed to generate Ekart manifest',
      message: error?.message || 'Internal server error',
    })
  }
}

export const registerEkartAddressController = async (req: any, res: Response) => {
  try {
    const body = req.body || {}
    const alias = String(body.alias || '').trim()
    const phone = toPositiveNumber(body.phone)
    const addressLine1 = String(body.address_line1 || '').trim()
    const addressLine2 = toStringOrNull(body.address_line2)
    const pincode = toPositiveNumber(body.pincode)
    const city = toStringOrNull(body.city)
    const state = String(body.state || '').trim()
    const country = String(body.country || 'India').trim()

    if (!alias || !phone || !addressLine1 || !pincode || !state) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'alias, phone, address_line1, pincode, and state are required',
      })
    }

    if (!['India', 'IN'].includes(country)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid country',
        message: 'country must be India or IN',
      })
    }

    const geo =
      body.geo && typeof body.geo === 'object'
        ? {
            lat: toPositiveNumber(body.geo.lat),
            lon: toPositiveNumber(body.geo.lon),
          }
        : undefined

    const ekart = new EkartService()
    const data = await ekart.addAddress({
      alias,
      phone,
      address_line1: addressLine1,
      address_line2: addressLine2,
      pincode,
      city: city || undefined,
      state,
      country,
      geo: geo?.lat !== undefined && geo?.lon !== undefined ? { lat: geo.lat, lon: geo.lon } : undefined,
    })

    return res.status(200).json({
      success: true,
      data,
    })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    console.error('Error registering Ekart address via API:', error)
    return res.status(statusCode).json({
      success: false,
      error: error?.message || 'Failed to register Ekart address',
      message: error?.message || 'Internal server error',
    })
  }
}

export const listEkartAddressesController = async (req: any, res: Response) => {
  try {
    const ekart = new EkartService()
    const data = await ekart.listAddresses()

    return res.status(200).json({
      success: true,
      data,
    })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    console.error('Error listing Ekart addresses via API:', error)
    return res.status(statusCode).json({
      success: false,
      error: error?.message || 'Failed to list Ekart addresses',
      message: error?.message || 'Internal server error',
    })
  }
}

const getIndiaDayStartMs = (date = new Date()) => {
  const istOffsetMs = 5.5 * 60 * 60 * 1000
  const istNow = new Date(date.getTime() + istOffsetMs)
  const utcMs = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate(),
    0,
    0,
    0,
    0,
  )
  return utcMs - istOffsetMs
}

const isWithinNextSevenDaysExcludingToday = (dateMs: number) => {
  const todayStart = getIndiaDayStartMs()
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000
  const seventhDayStart = todayStart + 7 * 24 * 60 * 60 * 1000
  return dateMs >= tomorrowStart && dateMs <= seventhDayStart
}

export const submitEkartNdrActionController = async (req: any, res: Response) => {
  try {
    const action = String(req.body?.action || '').trim()
    const wbn = String(req.body?.wbn || '').trim()
    const phone = String(req.body?.phone || '').trim()
    const address = String(req.body?.address || '').trim()
    const instructions = String(req.body?.instructions || '').trim()
    const links = Array.isArray(req.body?.links)
      ? req.body.links.map((value: any) => String(value || '').trim()).filter(Boolean)
      : undefined
    const date = toIntegerOrUndefined(req.body?.date)

    if (!['Re-Attempt', 'RTO'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid action',
        message: 'action must be Re-Attempt or RTO',
      })
    }

    if (!wbn) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'wbn is required',
      })
    }

    if (phone && !/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone',
        message: 'phone must be a 10-digit number',
      })
    }

    if (action === 'Re-Attempt') {
      if (date === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field',
          message: 'date is required for Re-Attempt actions',
        })
      }

      if (!isWithinNextSevenDaysExcludingToday(date)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date',
          message: 'date must be within the next seven days, excluding today',
        })
      }
    }

    const ekart = new EkartService()
    const data = await ekart.submitNdrAction({
      action,
      wbn,
      ...(date !== undefined ? { date } : {}),
      ...(phone ? { phone } : {}),
      ...(address ? { address } : {}),
      ...(instructions ? { instructions } : {}),
      ...(links?.length ? { links } : {}),
    })

    return res.status(200).json({
      success: true,
      data,
    })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    console.error('Error submitting Ekart NDR action via API:', error)
    return res.status(statusCode).json({
      success: false,
      error: error?.message || 'Failed to submit Ekart NDR action',
      message: error?.message || 'Internal server error',
    })
  }
}
