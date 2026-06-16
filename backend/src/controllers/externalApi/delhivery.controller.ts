import { Response } from 'express'
import { DelhiveryService } from '../../models/services/couriers/delhivery.service'

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

const toWaybill = (value: unknown) => {
  if (Array.isArray(value)) {
    const first = value.map((entry) => String(entry || '').trim()).find(Boolean)
    return first || ''
  }

  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .find(Boolean) || ''
}

const toPdfSize = (value: unknown) => {
  const normalized = String(value || '').trim().toUpperCase()
  return normalized || undefined
}

export const getDelhiveryLabelController = async (req: any, res: Response) => {
  try {
    const waybill = toWaybill(req.query?.wbns ?? req.query?.waybill ?? req.query?.awb ?? req.body?.wbns ?? req.body?.waybill ?? req.body?.awb)
    const pdf = parseBoolean(req.query?.pdf ?? req.body?.pdf)
    const pdfSize = toPdfSize(req.query?.pdf_size ?? req.body?.pdf_size ?? req.body?.pdfSize)

    if (!waybill) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'wbns (waybill) is required for Delhivery label generation',
      })
    }

    const delhivery = new DelhiveryService()
    const data = await delhivery.generateLabel(waybill, {
      format: pdf ? 'pdf' : 'json',
      pdfSize,
    })

    if (!pdf) {
      return res.status(200).json({
        success: true,
        data,
      })
    }

    const pdfBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
    res.status(200)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="delhivery-label-${waybill}.pdf"`,
    )
    return res.send(pdfBuffer)
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    console.error('Error generating Delhivery label via API:', error)
    return res.status(statusCode).json({
      success: false,
      error: error?.message || 'Failed to generate Delhivery label',
      message: error?.message || 'Internal server error',
    })
  }
}

export const updateDelhiveryEwaybillController = async (req: any, res: Response) => {
  try {
    const waybill = toWaybill(
      req.params?.waybill ?? req.query?.waybill ?? req.query?.wbns ?? req.body?.waybill ?? req.body?.wbns,
    )
    const dcn = String(req.body?.dcn ?? req.body?.invoice_number ?? req.body?.invoiceNumber ?? '').trim()
    const ewbn = String(req.body?.ewbn ?? req.body?.ewaybill_number ?? req.body?.ewb ?? '').trim()

    if (!waybill) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'waybill is required for Delhivery E-waybill update',
      })
    }

    if (!dcn) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'dcn is required for Delhivery E-waybill update',
      })
    }

    if (!ewbn) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'ewbn is required for Delhivery E-waybill update',
      })
    }

    const delhivery = new DelhiveryService()
    const data = await delhivery.updateEwaybill(waybill, { dcn, ewbn })

    return res.status(200).json({
      success: true,
      data,
    })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    console.error('Error updating Delhivery E-waybill via API:', error)
    return res.status(statusCode).json({
      success: false,
      error: error?.message || 'Failed to update Delhivery E-waybill',
      message: error?.message || 'Internal server error',
    })
  }
}
