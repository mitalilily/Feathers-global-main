import { Request, Response } from 'express'
import { getPaymentOptions, updatePaymentOptions } from '../models/services/paymentOptions.service'

/**
 * Get payment options settings (public endpoint)
 * GET /api/payment-options
 */
export async function getPaymentOptionsController(req: Request, res: Response) {
  try {
    const settings = await getPaymentOptions()

    return res.json({
      codEnabled: settings.codEnabled,
      prepaidEnabled: settings.prepaidEnabled,
      minWalletRecharge: settings.minWalletRecharge ?? 0,
      gstPercent: Number(settings.gstPercent ?? 0),
      razorpayChargeEnabled: settings.razorpayChargeEnabled ?? false,
      razorpayChargePercent: Number(settings.razorpayChargePercent ?? 0),
    })
  } catch (error: any) {
    console.error('Error getting payment options:', error)
    return res.status(500).json({ error: error.message || 'Failed to fetch payment options' })
  }
}

/**
 * Update payment options settings (admin only)
 * PUT /api/admin/payment-options
 */
export async function updatePaymentOptionsController(req: Request, res: Response) {
  try {
    const {
      codEnabled,
      prepaidEnabled,
      minWalletRecharge,
      gstPercent,
      razorpayChargeEnabled,
      razorpayChargePercent,
    } = req.body

    if (
      codEnabled === undefined &&
      prepaidEnabled === undefined &&
      (minWalletRecharge === undefined || minWalletRecharge === null) &&
      (gstPercent === undefined || gstPercent === null) &&
      razorpayChargeEnabled === undefined &&
      (razorpayChargePercent === undefined || razorpayChargePercent === null)
    ) {
      return res
        .status(400)
        .json({
          error:
            'At least one field (codEnabled, prepaidEnabled, minWalletRecharge, gstPercent, razorpayChargeEnabled, razorpayChargePercent) must be provided',
        })
    }

    if (minWalletRecharge !== undefined && minWalletRecharge !== null) {
      const value = Number(minWalletRecharge)
      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({ error: 'minWalletRecharge must be a non-negative number' })
      }
    }
    if (gstPercent !== undefined && gstPercent !== null) {
      const value = Number(gstPercent)
      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({ error: 'gstPercent must be a non-negative number' })
      }
    }
    if (razorpayChargePercent !== undefined && razorpayChargePercent !== null) {
      const value = Number(razorpayChargePercent)
      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({ error: 'razorpayChargePercent must be a non-negative number' })
      }
    }

    const updates: {
      codEnabled?: boolean
      prepaidEnabled?: boolean
      minWalletRecharge?: number
      gstPercent?: number
      razorpayChargeEnabled?: boolean
      razorpayChargePercent?: number
    } = {}
    if (codEnabled !== undefined) {
      updates.codEnabled = Boolean(codEnabled)
    }
    if (prepaidEnabled !== undefined) {
      updates.prepaidEnabled = Boolean(prepaidEnabled)
    }
    if (minWalletRecharge !== undefined && minWalletRecharge !== null) {
      updates.minWalletRecharge = Number(minWalletRecharge)
    }
    if (gstPercent !== undefined && gstPercent !== null) {
      updates.gstPercent = Number(gstPercent)
    }
    if (razorpayChargeEnabled !== undefined) {
      updates.razorpayChargeEnabled = Boolean(razorpayChargeEnabled)
    }
    if (razorpayChargePercent !== undefined && razorpayChargePercent !== null) {
      updates.razorpayChargePercent = Number(razorpayChargePercent)
    }

    const settings = await updatePaymentOptions(updates)

    return res.json({
      success: true,
      settings: {
        codEnabled: settings.codEnabled,
        prepaidEnabled: settings.prepaidEnabled,
        minWalletRecharge: settings.minWalletRecharge ?? 0,
        gstPercent: Number(settings.gstPercent ?? 0),
        razorpayChargeEnabled: settings.razorpayChargeEnabled ?? false,
        razorpayChargePercent: Number(settings.razorpayChargePercent ?? 0),
      },
    })
  } catch (error: any) {
    console.error('Error updating payment options:', error)
    return res.status(500).json({ error: error.message || 'Failed to update payment options' })
  }
}
